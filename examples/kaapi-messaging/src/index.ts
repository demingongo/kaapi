import { Kaapi } from '@kaapi/kaapi'
import { messenger, startMessaging } from './messengers/kafka'

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    docs: {
        disabled: false
    },
    messaging: messenger
})

startMessaging(app)

app.route({
    method: 'GET',
    path: '/publish',
    handler: async (request, h) => {
        const message = { text: 'Hello, Kaapi Messaging with Kafka!' } as const
        await request.publish('my-topic', message)
        return h.response({ status: 'Message published', message }).code(200)
    }
})

app.listen()

process.on('SIGINT', async () => {
    console.log('(SIGINT) Shutting down...')
    await app.stop()
    process.exit(0)
})

process.on('SIGTERM', async () => {
    console.log('(SIGTERM) Shutting down...')
    await app.stop()
    process.exit(0)
})