import { Admin, AdminConfig, Consumer, ConsumerConfig, IHeaders, ITopicConfig, Kafka, KafkaConfig, Producer, ProducerConfig, logLevel } from 'kafkajs'
import { ILogger, IMessaging, IMessagingContext } from '@kaapi/kaapi'
import { randomBytes } from 'crypto'

/**
 * Extended messaging context with Kafka-specific metadata.
 */
export interface KafkaMessagingContext extends IMessagingContext {
    /** The Kafka message offset */
    offset?: string
    address?: string
}

/**
 * Configuration options for KafkaMessaging.
 * Extends KafkaJS's KafkaConfig with additional Kaapi-specific options.
 */
export interface KafkaMessagingConfig extends KafkaConfig {
    /** Optional logger implementing Kaapi's ILogger interface */
    logger?: ILogger
    /** Optional unique service address for routing and identification */
    address?: string
    /** Optional human-readable name for service tracking/monitoring */
    name?: string
    /** Optional default KafkaJS producer configuration */
    producer?: ProducerConfig
}

/**
 * Configuration options for subscribing to a Kafka topic.
 * Extends KafkaJS's ConsumerConfig with additional options.
 */
export interface KafkaMessagingSubscribeConfig extends Partial<ConsumerConfig> {
    /** Whether to start consuming from the beginning of the topic */
    fromBeginning?: boolean
    /** Callback invoked when the consumer is ready */
    onReady?(consumer: Consumer): void
    /** 
     * Custom consumer group ID. If not provided, defaults to `{name}.{topic}` 
     * where `name` is the service name from KafkaMessagingConfig.
     */
    groupId?: string
    /**
     * Prefix for the auto-generated group ID. Only used when `groupId` is not provided.
     * Defaults to the service `name` or 'group' if name is not set.
     */
    groupIdPrefix?: string
    /**
     * Whether to log partition offsets on subscribe. 
     * Requires an admin client connection, adding some overhead.
     * @default false
     */
    logOffsets?: boolean
    /**
     * Called when a message handler throws an error.
     * Allows custom error handling (e.g., alerting, metrics, logging to external service).
     * 
     * @param error - The error thrown by the handler
     * @param message - The parsed message that failed
     * @param context - The message context (offset, headers, etc.)
     */
    onError?(error: unknown, message: unknown, context: KafkaMessagingContext): void | Promise<void>
}

/**
 * A message to be published in a batch.
 */
export interface KafkaMessagingBatchMessage<T = unknown> {
    /** The message payload */
    value: T
    /** Optional message key for partitioning */
    key?: string
    /** Optional partition to send to */
    partition?: number
    /** Optional custom headers (merged with default headers) */
    headers?: Record<string, string>
}

/**
 * A lightweight wrapper around KafkaJS that integrates with the Kaapi framework
 * to provide a clean and consistent message publishing and consuming interface.
 * 
 * @example
 * ```ts
 * const messaging = new KafkaMessaging({
 *     clientId: 'my-app',
 *     brokers: ['localhost:9092'],
 *     name: 'my-service',
 *     address: 'service-1'
 * });
 * 
 * await messaging.publish('my-topic', { event: 'user.created' });
 * await messaging.subscribe('my-topic', (msg, ctx) => console.log(msg));
 * ```
 */
export class KafkaMessaging implements IMessaging {

    #config: KafkaConfig
    #producerConfig?: ProducerConfig

    #address?: string
    #name?: string

    #consumers: Set<Consumer> = new Set();
    #producers: Set<Producer> = new Set();
    #admins: Set<Admin> = new Set();

    #producerPromise?: Promise<Producer | undefined>;

    /** Shared admin instance for internal operations (lazy initialized) */
    #sharedAdmin?: Admin;
    #sharedAdminPromise?: Promise<Admin | undefined>;

    protected kafka?: Kafka;
    protected logger?: ILogger;
    protected producer?: Producer;
    protected currentProducerId?: string;

    get activeConsumers(): ReadonlySet<Consumer> {
        return this.#consumers;
    }

    get activeProducers(): ReadonlySet<Producer> {
        return this.#producers;
    }

    /**
     * Creates a new KafkaMessaging instance.
     * 
     * @param arg - Configuration options for the Kafka client
     */
    constructor(arg: KafkaMessagingConfig) {

        const { logger, address, name, producer, ...kafkaConfig } = arg;

        this.#config = kafkaConfig;
        this.#producerConfig = producer;

        this.#name = name
        this.#address = address
        this.logger = logger
    }

    private _createInstance() {
        this.logger?.info(`clientId=${this.#config.clientId}, address=${this.#address}`)
        if (!this.#config.brokers) return;

        return new Kafka({
            logCreator: () => ({ namespace, level, label, log }) => {
                let lvl: logLevel | null = level
                if (!log[level]) lvl = null;
                switch (lvl) {
                    case logLevel.ERROR:
                    case logLevel.NOTHING:
                        this.logger?.error('KAFKA', label, namespace, log.message);
                        break;
                    case logLevel.WARN:
                        this.logger?.warn('KAFKA', label, namespace, log.message);
                        break;
                    case logLevel.INFO:
                        this.logger?.info('KAFKA', label, namespace, log.message);
                        break
                    case logLevel.DEBUG:
                        this.logger?.debug('KAFKA', label, namespace, log.message);
                        break;
                    default:
                        this.logger?.silly('KAFKA', label, namespace, log.message);
                }
            },
            ...this.#config,
        });
    }

    /**
     * Internal method to initialize the shared admin.
     * @private
     */
    private async _initializeSharedAdmin(): Promise<Admin | undefined> {
        if (this.#sharedAdmin) {
            return this.#sharedAdmin;
        }

        const admin = await this.createAdmin();

        if (!admin) return;

        this.#sharedAdmin = admin;

        admin.on(admin.events.DISCONNECT, () => {
            if (this.#sharedAdmin === admin) {
                this.#sharedAdmin = undefined;
            }
        });

        this.logger?.debug('✔️  Shared admin connected');

        return admin;
    }

    /**
     * Internal method to initialize the producer.
     * @private
     */
    private async _initializeProducer(): Promise<Producer | undefined> {
        // Double-check in case producer was created while waiting
        if (this.producer) {
            return this.producer;
        }

        const producer = await this.createProducer(this.#producerConfig);
        if (!producer) return;

        const producerId = randomBytes(16).toString('hex')
        this.producer = producer;
        this.currentProducerId = producerId;

        this.logger?.debug('✔️  Producer connected');

        producer.on(producer.events.DISCONNECT, () => {
            if (this.currentProducerId === producerId) {
                this.logger?.warn('⚠️  Producer disconnected');
                this.producer = undefined;
                this.currentProducerId = undefined;
            }
        });

        return producer;
    }

    protected getKafka() {
        if (!this.kafka) {
            this.kafka = this._createInstance()
        }
        return this.kafka
    }

    /**
     * Gets or creates a shared admin instance for internal operations.
     * Uses lazy initialization to avoid unnecessary connections.
     * 
     * @returns A promise that resolves to the shared admin instance
     */
    protected async getSharedAdmin(): Promise<Admin | undefined> {
        // Return existing admin if available and connected
        if (this.#sharedAdmin) {
            return this.#sharedAdmin;
        }

        // If an admin is already being created, wait for it
        if (this.#sharedAdminPromise) {
            return this.#sharedAdminPromise;
        }

        // Create the admin with a lock
        this.#sharedAdminPromise = this._initializeSharedAdmin();

        try {
            const admin = await this.#sharedAdminPromise;
            return admin;
        } finally {
            this.#sharedAdminPromise = undefined;
        }
    }

    /**
     * Creates and connects a Kafka admin client.
     * The admin client is automatically tracked and will be disconnected during shutdown.
     * 
     * @param config - Optional admin client configuration
     * @returns A promise that resolves to the connected admin client, or undefined if Kafka is unavailable
     * 
     * @example
     * ```ts
     * const admin = await messaging.createAdmin();
     * const topics = await admin?.listTopics();
     * await admin?.disconnect();
     * ```
     */
    async createAdmin(config?: AdminConfig): Promise<Admin | undefined> {
        // Get kafka instance
        const kafka = this.getKafka();

        // If we don't have a connection, abort
        if (!kafka) return;

        const admin = kafka.admin(config);
        await admin.connect();
        this.#admins.add(admin);
        admin.on(admin.events.DISCONNECT, () => {
            this.#admins.delete(admin);
        });
        return admin;
    }

    /**
     * Creates a new Kafka topic with the specified configuration.
     * 
     * @param topic - The topic configuration including name, partitions, and replication factor
     * @param config - Optional creation options
     * @param config.validateOnly - If true, only validates the request without creating the topic
     * @param config.waitForLeaders - If true, waits for partition leaders to be elected
     * @param config.timeout - Timeout in milliseconds for the operation
     * 
     * @throws {Error} If the admin client cannot be created
     * 
     * @example
     * ```ts
     * await messaging.createTopic({
     *     topic: 'my-topic',
     *     numPartitions: 3,
     *     replicationFactor: 1
     * }, { waitForLeaders: true });
     * ```
     */
    async createTopic(topic: ITopicConfig, config?: { validateOnly?: boolean; waitForLeaders?: boolean; timeout?: number }) {
        const admin = await this.createAdmin();
        if (!admin) throw new Error('Admin client unavailable');
        await admin.createTopics({
            topics: [topic],
            ...(config || {})
        });

        await admin.disconnect();
    }


    /**
     * Waits for a Kafka topic to become ready (i.e., it exists and has partitions).
     *
     * @param {string} topic - The name of the Kafka topic to check.
     * @param {number} [timeoutMs=10000] - Maximum time (in milliseconds) to wait for the topic to be ready.
     * @param {number} [checkIntervalMs=200] - Interval (in milliseconds) between readiness checks. Must be ≥ 200ms.
     * 
     * @throws {Error} If `checkIntervalMs` is less than 200ms.
     * @throws {Error} If `timeoutMs` is less than or equal to `checkIntervalMs`.
     * @throws {Error} If the admin client cannot be created.
     * @throws {Error} If the topic is not ready within the given timeout.
     * 
     * @returns {Promise<void>} Resolves when the topic is ready.
     */
    async waitForTopicReady(topic: string, timeoutMs: number = 10000, checkIntervalMs: number = 200): Promise<void> {
        if (checkIntervalMs < 200) {
            throw new Error(`Invalid checkIntervalMs: ${checkIntervalMs}. It must be at least 200ms to avoid overwhelming the broker.`);
        }

        if (timeoutMs <= checkIntervalMs) {
            throw new Error(`Invalid configuration: timeoutMs (${timeoutMs}) must be greater than checkIntervalMs (${checkIntervalMs}).`);
        }

        const start = Date.now();
        const admin = await this.createAdmin();
        if (!admin) throw new Error('Admin client unavailable');

        while (Date.now() - start < timeoutMs) {
            const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
            const topicMeta = metadata.topics.find(t => t.name === topic);
            if (topicMeta && topicMeta.partitions.length > 0) {
                await admin.disconnect();
                return;
            }
            await new Promise(res => setTimeout(res, checkIntervalMs)); // wait 200ms before retry
        }

        await admin.disconnect();
        throw new Error(`Timeout: Topic "${topic}" did not become ready within ${timeoutMs}ms.`);
    }

    /**
     * Fetches and logs partition offsets for a topic.
     * Uses the shared admin instance to minimize connections.
     * 
     * @param topic - The topic to fetch offsets for
     * @returns The partition offset information, or undefined if unavailable
     */
    async fetchTopicOffsets(topic: string): Promise<Array<{
        partition: number;
        offset: string;
        high: string;
        low: string;
    }> | undefined> {
        const admin = await this.getSharedAdmin();
        if (!admin) return;

        try {
            const partitions = await admin.fetchTopicOffsets(topic);
            return partitions;
        } catch (error) {
            this.logger?.error(`Failed to fetch offsets for topic "${topic}":`, error);
            return undefined;
        }
    }

    /**
     * Creates and connects a new Kafka consumer.
     * The consumer is automatically tracked and will be disconnected during shutdown.
     * 
     * @param groupId - The consumer group ID
     * @param config - Optional consumer configuration overrides
     * @returns A promise that resolves to the connected consumer, or undefined if Kafka is unavailable
     * 
     * @example
     * ```ts
     * const consumer = await messaging.createConsumer('my-group', {
     *     sessionTimeout: 30000
     * });
     * ```
     */
    async createConsumer(groupId: string, config?: Partial<ConsumerConfig>): Promise<Consumer | undefined> {

        // Get kafka instance
        const kafka = this.getKafka();

        // If we don't have an instance, abort
        if (!kafka) return;

        let overridenConfig: ConsumerConfig = {
            groupId: `${groupId}`,
            readUncommitted: true
        }

        if (config && typeof config == 'object') {
            overridenConfig = { ...overridenConfig, ...config }
        }

        const consumer = kafka.consumer(overridenConfig);
        await consumer.connect();

        // track consumers to disconnect them later
        this.#consumers.add(consumer);
        consumer.on(consumer.events.DISCONNECT, () => {
            this.#consumers.delete(consumer);
        });

        return consumer;
    }

    /**
     * Creates and connects a new Kafka producer.
     * The producer is automatically tracked and will be disconnected during shutdown.
     * 
     * @param config - Optional producer configuration overrides
     * @returns A promise that resolves to the connected producer, or undefined if Kafka is unavailable
     * 
     * @example
     * ```ts
     * const producer = await messaging.createProducer({
     *     idempotent: true
     * });
     * ```
     */
    async createProducer(config?: Partial<ProducerConfig>): Promise<Producer | undefined> {
        // Get kafka instance
        const kafka = this.getKafka();

        // If we don't have an instance, abort
        if (!kafka) return;

        let overridenConfig: ProducerConfig = {
            /*
            idempotent: true,
            retry: {
                retries: 5,
                initialRetryTime: 300,
            }
            */
        }

        if (config && typeof config == 'object') {
            overridenConfig = { ...overridenConfig, ...config }
        }

        const producer = kafka.producer(overridenConfig);
        await producer.connect();

        // track producers to disconnect them later
        this.#producers.add(producer);
        producer.on(producer.events.DISCONNECT, () => {
            this.#producers.delete(producer);
        });

        return producer;
    }

    /**
     * Gets or creates the singleton producer instance.
     * Uses a promise-based lock to prevent race conditions when called concurrently.
     * 
     * @returns A promise that resolves to the producer instance, or undefined if unavailable.
     */
    async getProducer() {
        // Return existing producer if available
        if (this.producer) {
            return this.producer;
        }

        // If a producer is already being created, wait for it
        if (this.#producerPromise) {
            return this.#producerPromise;
        }

        // Create the producer with a lock
        this.#producerPromise = this._initializeProducer();

        try {
            const producer = await this.#producerPromise;
            return producer;
        } finally {
            // Clear the promise after resolution (success or failure)
            this.#producerPromise = undefined;
        }
    }

    /**
     * Disconnects the singleton producer instance.
     * 
     * @returns A promise that resolves when the producer is disconnected
     */
    async disconnectProducer(): Promise<void> {
        if (this.producer) {
            await this.producer.disconnect();
            this.producer = undefined;
            this.currentProducerId = undefined;
        }
    }

    /**
     * Publishes multiple messages to a Kafka topic in a single batch.
     * More efficient than multiple `publish()` calls for high-throughput scenarios.
     * 
     * @typeParam T - The type of the message payload
     * @param topic - The Kafka topic to publish to
     * @param messages - Array of messages to publish
     * 
     * @throws {Error} If the batch fails to send
     * 
     * @example
     * ```ts
     * await messaging.publishBatch('user-events', [
     *     { value: { event: 'user.created', userId: '1' } },
     *     { value: { event: 'user.created', userId: '2' } },
     *     { value: { event: 'user.updated', userId: '3' }, key: 'user-3' },
     * ]);
     * ```
     */
    async publishBatch<T = unknown>(topic: string, messages: KafkaMessagingBatchMessage<T>[]): Promise<void> {
        if (!messages.length) return;

        const producer = await this.getProducer();

        // If we don't have a producer, abort
        if (!producer) return this.logger?.error('❌  Could not get producer');

        const baseHeaders: IHeaders = {};
        if (this.#name) baseHeaders.name = this.#name;
        if (this.#address) baseHeaders.address = this.#address;

        const kafkaMessages = messages.map((msg) => ({
            value: JSON.stringify(msg.value),
            key: msg.key,
            partition: msg.partition,
            timestamp: `${Date.now()}`,
            headers: { ...baseHeaders, ...(msg.headers ?? {}) },
        }));

        try {
            const res = await producer.send({
                topic,
                messages: kafkaMessages,
            });
            this.logger?.verbose(`📤  Sent batch to KAFKA topic "${topic}" (${messages.length} messages, offset ${res[0].baseOffset})`);
        } catch (error) {
            this.logger?.error(`❌  Failed to publish batch to "${topic}":`, error);
            throw error;
        }
    }

    /**
     * Publishes a message to the specified Kafka topic.
     * Automatically manages the producer lifecycle and includes service metadata in headers.
     * 
     * @typeParam T - The type of the message payload
     * @param topic - The Kafka topic to publish to
     * @param message - The message payload (will be JSON serialized)
     * 
     * @throws {Error} If the message fails to send
     * 
     * @example
     * ```ts
     * await messaging.publish('user-events', {
     *     event: 'user.created',
     *     userId: '123',
     *     timestamp: Date.now()
     * });
     * ```
     */
    async publish<T = unknown>(topic: string, message: T): Promise<void> {
        // Get kafka producer
        const producer = await this.getProducer();

        // If we don't have a producer, abort
        if (!producer) return this.logger?.error('❌  Could not get producer');

        const headers: IHeaders = {}

        if (this.#name) {
            headers.name = this.#name
        }
        if (this.#address) {
            headers.address = this.#address
        }

        try {
            // Send message to the topic
            const res = await producer.send({
                topic,
                messages: [{
                    value: JSON.stringify(message),
                    timestamp: `${Date.now()}`,
                    headers
                }],
            });
            this.logger?.verbose(`📤  Sent to KAFKA topic "${topic}" (offset ${res[0].baseOffset})`);
        } catch (error) {
            this.logger?.error(`❌  Failed to publish to "${topic}":`, error);
            throw error;
        }
    }

    /**
     * Subscribes to a Kafka topic and processes messages with the provided handler.
     * Creates a new consumer for each subscription with an auto-generated group ID.
     * 
     * @typeParam T - The expected type of incoming messages
     * @param topic - The Kafka topic to subscribe to
     * @param handler - Callback function invoked for each message. Can be async.
     * @param config - Optional subscription configuration
     * @param config.fromBeginning - Start consuming from the beginning of the topic
     * @param config.onReady - Callback invoked when the consumer is ready
     * @param config.groupId - Override the auto-generated consumer group ID
     * @param config.groupIdPrefix - Prefix for auto-generated group ID (default: service name)
     * 
     * @example
     * ```ts
     * // Using auto-generated group ID (e.g., "my-service.user-events")
     * await messaging.subscribe('user-events', handler);
     * 
     * // Using custom group ID
     * await messaging.subscribe('user-events', handler, { 
     *     groupId: 'my-custom-consumer-group' 
     * });
     * 
     * // Using custom prefix (e.g., "analytics.user-events")
     * await messaging.subscribe('user-events', handler, { 
     *     groupIdPrefix: 'analytics' 
     * });
     * 
     * // With offset logging enabled
     * await messaging.subscribe('user-events', handler, { 
     *     logOffsets: true 
     * });
     * ```
     */
    async subscribe<T = unknown>(topic: string, handler: (message: T, context: KafkaMessagingContext) => Promise<void> | void, config?: KafkaMessagingSubscribeConfig) {
        this.logger?.info(`👂  Subscribing KAFKA topic "${topic}"`);

        let consumerConfig: Partial<ConsumerConfig> | undefined;
        let fromBeginning: boolean | undefined;
        let onReady: ((consumer: Consumer) => void) | undefined;
        let groupId: string | undefined;
        let groupIdPrefix: string | undefined;
        let logOffsets = false;
        let onError: ((error: unknown, message: unknown, context: KafkaMessagingContext) => void | Promise<void>) | undefined;

        if (config) {
            const { fromBeginning: tmpFromBeginning, onReady: tmpOnReady, groupId: tmpGroupId, groupIdPrefix: tmpGroupIdPrefix, logOffsets: tmpLogOffsets, onError: tmpOnError, ...tmpConsumerConfig } = config
            fromBeginning = tmpFromBeginning;
            onReady = tmpOnReady;
            groupId = tmpGroupId;
            groupIdPrefix = tmpGroupIdPrefix;
            logOffsets = tmpLogOffsets ?? false;
            onError = tmpOnError;
            consumerConfig = tmpConsumerConfig;
        }

        // Determine the consumer group ID
        const resolvedGroupId = groupId ?? `${groupIdPrefix ?? this.#name ?? 'group'}.${topic}`;

        // Get kafka consumer
        const consumer = await this.createConsumer(resolvedGroupId, consumerConfig);

        // If we don't have a consumer, abort
        if (!consumer) return this.logger?.error('❌  Could not get consumer');

        // Listen to the topic
        await consumer.subscribe({
            topic,
            fromBeginning
        });

        // Only fetch offsets if explicitly requested (avoids admin overhead)
        if (logOffsets) {
            const partitions = await this.fetchTopicOffsets(topic);
            if (partitions) {
                partitions.forEach((partition) => {
                    this.logger?.info(`👂  Start "${topic}" partition: ${partition.partition} | offset: ${partition.offset} | high: ${partition.high} | low: ${partition.low}`);
                });
            }
        }

        await consumer.run({
            eachBatchAutoResolve: false,
            eachBatch: async ({
                batch,
                resolveOffset,
                heartbeat,
            }) => {
                this.logger?.verbose(`📥  Received from KAFKA topic "${topic}" (${batch.messages.length} messages)`);
                for (const message of batch.messages) {
                    const context: KafkaMessagingContext = {};
                    try {
                        try {
                            // unbufferize header values
                            Object.keys((message.headers || {})).forEach(key => {
                                if (typeof message.headers?.[key]?.toString === 'function') {
                                    context[key] = message.headers?.[key]?.toString('utf8');
                                }
                            });
                            context.timestamp = message.timestamp;
                            context.offset = message.offset;
                        } catch (e) {
                            this.logger?.error(`KafkaMessaging.subscribe('${topic}', …) error:`, e);
                        }
                        const res = handler(
                            JSON.parse(message.value?.toString?.() || ''),
                            context
                        );

                        if (res) await res;
                        resolveOffset(message.offset);
                        this.logger?.debug(`✔️  Resolved offset ${message.offset} from KAFKA topic "${topic}"`);
                    } catch (e) {
                        this.logger?.error(`KafkaMessaging.subscribe('${topic}', …) handler throwed an error:`, e);

                        // Call custom error handler if provided
                        if (onError) {
                            try {
                                const errorResult = onError(e, JSON.parse(message.value?.toString?.() || ''), context);
                                if (errorResult) await errorResult;
                            } catch (onErrorError) {
                                this.logger?.error(`KafkaMessaging.subscribe('${topic}', …) onError callback failed:`, onErrorError);
                            }
                        }
                    }
                    await heartbeat();
                }
            },
        });

        onReady?.(consumer);
    }

    /**
     * Safely disconnects a Kafka client with timeout protection.
     * Prevents hanging if the client fails to disconnect gracefully.
     * 
     * @param client - The Kafka client (producer, consumer, or admin) to disconnect
     * @param timeoutMs - Maximum time to wait for disconnection (default: 5000ms)
     * @returns A promise that resolves when disconnected or rejects on timeout
     * 
     * @throws {Error} If the disconnect times out
     */
    async safeDisconnect(client: Producer | Consumer | Admin, timeoutMs = 5000): Promise<unknown> {
        return safeDisconnect(client, timeoutMs)
    }

    /**
     * Gracefully shuts down all tracked Kafka clients (producers, consumers, and admins).
     * Should be called during application teardown to release resources.
     * 
     * @returns A summary of the shutdown operation including success and error counts
     * 
     * @example
     * ```ts
     * process.on('SIGTERM', async () => {
     *     const result = await messaging.shutdown();
     *     console.log(`Shutdown complete: ${result.successProducers} producers, ${result.errorCount} errors`);
     *     process.exit(0);
     * });
     * ```
     */
    async shutdown(): Promise<{
        successProducers: number;
        successConsumers: number;
        successAdmins: number;
        errorCount: number;
    }> {
        let errorCount = 0;
        let successProducers = 0;
        let successConsumers = 0;
        let successAdmins = 0;
        this.logger?.info('🛑  Shutting down KafkaMessaging...');
        for (const producer of this.#producers) {
            try {
                await this.safeDisconnect(producer);
                successProducers++;
            } catch (e) {
                this.logger?.error('Error disconnecting producer:', e);
                errorCount++;
            }
        }
        for (const consumer of this.#consumers) {
            try {
                await consumer.stop(); // Gracefully stop consuming
                await this.safeDisconnect(consumer);
                successConsumers++;
            } catch (e) {
                this.logger?.error('Error disconnecting consumer:', e);
                errorCount++;
            }
        }
        for (const admin of this.#admins) {
            try {
                await this.safeDisconnect(admin);
                this.#admins.delete(admin);
                successAdmins++;
            } catch (e) {
                this.logger?.error('Error disconnecting admin:', e);
                errorCount++;
            }
        }
        this.logger?.info('KafkaMessaging shutdown complete');
        this.logger?.info(`Disconnected ${successProducers} producers, ${successConsumers} consumers and ${successAdmins} admins with ${errorCount} errors.`);

        return {
            successProducers,
            successConsumers,
            successAdmins,
            errorCount,
        };
    }
}

/**
 * Safely disconnects a Kafka client with timeout protection.
 * Standalone utility function.
 * 
 * @param client - The Kafka client to disconnect
 * @param timeoutMs - Maximum time to wait (default: 5000ms)
 * @returns A promise that resolves when disconnected or rejects on timeout
 */
export async function safeDisconnect(client: Producer | Consumer | Admin, timeoutMs = 5000): Promise<unknown> {
    return Promise.race([
        client.disconnect(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Disconnect timed out')), timeoutMs)
        ),
    ]);
}