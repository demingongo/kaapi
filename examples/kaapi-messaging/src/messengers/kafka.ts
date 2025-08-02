import { Kaapi, createLogger } from '@kaapi/kaapi'
import { KafkaMessaging, KafkaMessagingSender, KafkaMessagingSubscribeConfig } from '@kaapi/kafka-messaging'
import { PartitionAssigners } from 'kafkajs'

/**
 * KafkaMessaging
 */
export const messenger = new KafkaMessaging({
    brokers: [],
    logger: createLogger({
        level: 'debug'
    }),
    name: 'examples-kaapi-messaging'
})

/**
 * message format
 */
interface Message {
    text: string
}

/**
 * topic
 */
const TOPIC = 'my-topic'

/**
 * subscribe configuration
 */
const SUBSCRIBE_CONFIG: KafkaMessagingSubscribeConfig = {
    fromBeginning: false,
    allowAutoTopicCreation: false,
    groupId: 'my-group',
    heartbeatInterval: 3000,
    maxBytes: 10485760,
    maxBytesPerPartition: 1048576,
    maxInFlightRequests: undefined,
    maxWaitTimeInMs: 5000,
    metadataMaxAge: 300000,
    minBytes: 1,
    partitionAssigners: [PartitionAssigners.roundRobin],
    rackId: undefined,
    readUncommitted: true,
    rebalanceTimeout: 60000,
    retry: { retries: 5 },
    sessionTimeout: 30000
}

async function createTopic(app: Kaapi) {

    const admin = messenger.getKafka()?.admin({
        retry: {
            retries: 1,
            maxRetryTime: 10000
        }
    })

    if (admin) {
        await admin.connect()

        const clusterInfo = await admin.describeCluster();
        const availableBrokers = clusterInfo?.brokers.length;

        app.log.info(`Cluster has ${availableBrokers} brokers.`)

        if (availableBrokers) {
            // Replication factor (requires at least 3 brokers)
            const replicationFactor = availableBrokers >= 3 ? 3 : 1
            await admin.createTopics({
                topics: [
                    {
                        topic: TOPIC,
                        numPartitions: 1,
                        replicationFactor
                    },
                ],
            });
            app.log.info(`Topic created with replication factor ${replicationFactor}!`);
        }

        await admin.disconnect()
    } else {
        app.log.error('Could not create topic: No Kafka instance');
    }
}

/**
 * KafkaMessaging
 */
export async function startMessaging(app: Kaapi) {
    // create topic
    await createTopic(app)

    // subscribe
    await app.subscribe<Message>(TOPIC, (message, sender: KafkaMessagingSender) => {
        app.log.info(`Message received: ${message}`)
        app.log.debug('Sender:', sender)
    }, SUBSCRIBE_CONFIG)

    // publish
    await app.publish<Message>(TOPIC, { text: 'Hello!' })
}