import { Admin, AdminConfig, Consumer, ConsumerConfig, IHeaders, ITopicConfig, Kafka, KafkaConfig, Producer, ProducerConfig, logLevel } from 'kafkajs'
import { ILogger, IMessaging, IMessagingSender } from '@kaapi/kaapi'
import { randomBytes } from 'crypto'

export interface KafkaMessagingSender extends IMessagingSender {
    offset?: string
}

export interface KafkaMessagingConfig extends KafkaConfig {
    logger?: ILogger
    address?: string
    name?: string
    producer?: ProducerConfig
}

export interface KafkaMessagingSubscribeConfig extends Partial<ConsumerConfig> {
    fromBeginning?: boolean
    onReady?(consumer: Consumer): void
}

export class KafkaMessaging implements IMessaging {

    #config: KafkaConfig
    #producerConfig?: ProducerConfig

    #address?: string
    #name?: string

    #consumers: Set<Consumer> = new Set();
    #producers: Set<Producer> = new Set();
    #admins: Set<Admin> = new Set();

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

    protected getKafka() {
        if (!this.kafka) {
            this.kafka = this._createInstance()
        }
        return this.kafka
    }

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
     * Create a new consumer with optional configuration overrides
     * @param groupId Consumer group id
     * @param config Consumer configuration overrides
     * @returns 
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
     * Create a new producer with optional configuration overrides
     * @param config Producer configuration overrides
     * @returns 
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
     * Get the producer
     */
    async getProducer() {
        if (!this.producer) {
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
        }

        return this.producer;
    }

    /**
     * Disconnect the producer
     */
    async disconnectProducer(): Promise<void> {
        if (this.producer) {
            await this.producer.disconnect();
            this.producer = undefined;
            this.currentProducerId = undefined;
        }
    }

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

        // Listen to the topic
        const res = await producer.send({
            topic,
            messages: [{
                value: JSON.stringify(message),
                timestamp: `${Date.now()}`,
                headers
            }],
        });

        this.logger?.verbose(`📤  Sent to KAFKA topic "${topic}" (offset ${res[0].baseOffset})`);
    }

    /**
     * Listen to a topic
     */
    async subscribe<T = unknown>(topic: string, handler: (message: T, sender: KafkaMessagingSender) => Promise<void> | void, config?: KafkaMessagingSubscribeConfig) {
        this.logger?.info(`👂  Subscribing KAFKA topic "${topic}"`);

        let consumerConfig: Partial<ConsumerConfig> | undefined;
        let fromBeginning: boolean | undefined;
        let onReady: ((consumer: Consumer) => void) | undefined;

        if (config) {
            const { fromBeginning: tmpFromBeginning, onReady: tmpOnReady, ...tmpConsumerConfig } = config
            fromBeginning = tmpFromBeginning
            onReady = tmpOnReady
            consumerConfig = tmpConsumerConfig
        }

        // Get kafka consumer
        const consumer = await this.createConsumer(`${this.#name || 'group'}---${topic}`, consumerConfig);

        // If we don't have a consumer, abort
        if (!consumer) return this.logger?.error('❌  Could not get consumer');

        // Listen to the topic
        await consumer.subscribe({
            topic,
            fromBeginning
        });

        const admin = await this.createAdmin();
        if (admin) {
            try {
                const partitions = await admin.fetchTopicOffsets(topic);
                if (partitions) {
                    partitions.forEach((partition) => {
                        this.logger?.info(`👂  Start "${topic}" partition: ${partition.partition} | offset: ${partition.offset} | high: ${partition.high} | low: ${partition.low}`);
                    })
                }
            } catch (error) {
                this.logger?.error(error)
            }

            await admin.disconnect();
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
                    try {
                        const sender: KafkaMessagingSender = {};

                        try {
                            // unbufferize header values
                            Object.keys((message.headers || {})).forEach(key => {
                                if (typeof message.headers?.[key]?.toString === 'function') {
                                    sender[key] = message.headers?.[key]?.toString('utf8');
                                }
                            });
                            sender.timestamp = message.timestamp;
                            sender.offset = message.offset;
                        } catch (e) {
                            this.logger?.error(`KafkaMessaging.subscribe('${topic}', …) error:`, e);
                        }
                        const res = handler(
                            JSON.parse(message.value?.toString?.() || ''),
                            sender
                        );

                        if (res) await res;
                        resolveOffset(message.offset);
                        this.logger?.debug(`✔️  Resolved offset ${message.offset} from KAFKA topic "${topic}"`);
                    } catch (e) {
                        this.logger?.error(`KafkaMessaging.subscribe('${topic}', …) handler throwed an error:`, e);
                    }
                    await heartbeat();
                }
            },
        });

        onReady?.(consumer);
    }

    async safeDisconnect(client: Producer | Consumer | Admin, timeoutMs = 5000): Promise<unknown> {
        return safeDisconnect(client, timeoutMs)
    }

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

export async function safeDisconnect(client: Producer | Consumer | Admin, timeoutMs = 5000): Promise<unknown> {
    return Promise.race([
        client.disconnect(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Disconnect timed out')), timeoutMs)
        ),
    ]);
}