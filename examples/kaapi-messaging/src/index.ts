import { IMessagingSender, Kaapi, createLogger } from '@kaapi/kaapi'
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

interface Sender extends IMessagingSender {
    id?: string
}

interface Message {
    text: string
}

app.subscribe<Message>('my-topic', (message, sender: Sender) => {
    app.log.info(`Message received: ${message}`)
    app.log.debug('Sender:', sender)
})

setTimeout(() => {
    app.publish<Message>('my-topic', { text: 'Hello!' })
}, 5000)