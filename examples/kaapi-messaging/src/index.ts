import { Kaapi } from '@kaapi/kaapi'
import { messenger, startMessaging } from './messengers/kafka'

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    docs: {
        disabled: true
    },
    messaging: messenger
})

// app.listen()

startMessaging(app)