import { Kaapi, createLogger } from '@kaapi/kaapi'
import { KafkaMessaging } from '@kaapi/messaging-kafka'

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    docs: {
        disabled: true
    },
    messaging: new KafkaMessaging({
        brokers: [],
        logger: createLogger({
            level: 'debug'
        }),
        name: 'examples-kaapi-messaging'
    })
})

app.listen()