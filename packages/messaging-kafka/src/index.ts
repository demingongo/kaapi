import { Consumer, ConsumerConfig, IHeaders, Kafka, KafkaConfig, Producer, logLevel } from 'kafkajs'
import { ILogger, IMessaging, IMessagingSender } from '@kaapi/kaapi'

export interface KafkaMessagingConfig extends KafkaConfig {
    logger?: ILogger
    address?: string
    name?: string
}

export class KafkaMessaging implements IMessaging {

    #config: KafkaConfig

    #address?: string
    #name?: string

    protected kafka?: Kafka;
    protected logger?: ILogger;
    protected producer?: Producer;

    constructor(arg: KafkaMessagingConfig) {

        const { logger, address, name, ...kafkaConfig } = arg;

        this.#config = kafkaConfig;

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

    protected async getAdmin() {
        // Get kafka instance
        const kafka = this.getKafka();

        // If we don't have a connection, abort
        if (!kafka) return;

        const admin = kafka.admin();
        await admin.connect();
        return admin;
    }

    getKafka() {
        if (!this.kafka) {
            this.kafka = this._createInstance()
        }
        return this.kafka
    }

    // Get the consumer
    async getConsumer(topic: string, config?: Partial<ConsumerConfig>): Promise<Consumer | undefined> {

        // Get kafka instance
        const kafka = this.getKafka();

        // If we don't have an instance, abort
        if (!kafka) return;

        let overridenConfig: ConsumerConfig = {
            groupId: `${this.#name || 'group'}---${topic}`,
            readUncommitted: true
        }

        if (config && typeof config == 'object') {
            overridenConfig = { ...overridenConfig, ...config }
        }

        const consumer = kafka.consumer(overridenConfig);
        await consumer.connect();

        return consumer;
    }

    // Get the producer
    async getProducer() {
        if (!this.producer) {
            // Get kafka instance
            const kafka = this.getKafka();

            // If we don't have an instance, abort
            if (!kafka) return;

            const producer = kafka.producer();

            await producer.connect();
            this.producer = producer;

            this.logger?.debug('📥 Producer connected');
        }

        return this.producer;
    }

    async publish<T = unknown>(topic: string, message: T): Promise<void> {
        // Get kafka producer
        const producer = await this.getProducer();

        // If we don't have a producer, abort
        if (!producer) return this.logger?.error('📥 Could not get producer');

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

        this.logger?.verbose(`📥  Sent to KAFKA topic "${topic}" (offset ${res[0].baseOffset})`);
    }

    /**
     * Listen to a topic
     */
    async subscribe<T = unknown>(topic: string, handler: (message: T, sender: IMessagingSender) => Promise<void> | void, conf?: Partial<ConsumerConfig>) {
        this.logger?.info(`👂  Subscribing KAFKA topic "${topic}"`);

        // Get kafka consumer
        const consumer = await this.getConsumer(topic, conf);

        // If we don't have a consumer, abort
        if (!consumer) return this.logger?.error('📥 Could not get consumer');

        // Listen to the topic
        await consumer.subscribe({
            topic,
        });

        const admin = await this.getAdmin();
        if (admin) {
            try {
                const partitions = await admin.fetchTopicOffsets(topic);
                if (partitions) {
                    partitions.forEach((partition) => {
                        this.logger?.info(`👂 Start "${topic}" offset: ${partition.offset} | high: ${partition.high} | low: ${partition.low}`);
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
                        const sender: IMessagingSender = {};
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
                        this.logger?.debug(`📥  Resolved offset ${message.offset} from KAFKA topic "${topic}"`);
                    } catch (e) {
                        this.logger?.error(`KafkaMessaging.subscribe('${topic}', …) handler throwed an error:`, e);
                    }
                    await heartbeat();
                }
            },
        });
    }
}