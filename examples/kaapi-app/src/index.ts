import { Kaapi } from '@kaapi/kaapi';
import Boom from '@hapi/boom'
import inert from '@hapi/inert';
import { CustomMessaging } from './CustomMessaging';

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    auth: {
        validate: async (req, token, h) => {
            console.log('my token is', token)
            console.log('route description=', req.route.settings.description)
            console.log('route tags=', req.route.settings.tags)

            if (!token) {
                // can call h.authenticated/h.unauthenticated directly
                // if you know what you are doing
                return h.unauthenticated(Boom.unauthorized('Sorry bud, you are NOT authorized', 'Bearer'))
            }

            return {
                isValid: !!token,
                credentials: { user: { username: 'Niko' } },
                message: !token ? 'Sorry buddy, you are UNauthorized' : undefined
            }
        },
    },
    loggerOptions: {
        level: 'debug'
    },
    messaging: new CustomMessaging()
})

app.server().server.register(inert)

//#region routing

// 404
app.route({}, () => Boom.notFound('Nothing here'))

app.route({
    method: 'GET',
    path: '/file',
    options: {
        description: 'Profile picture'
    }
}, {
    file: `${process.cwd()}/public/profile-icon.png`
})

app.route({
    method: 'GET',
    path: '/error',
    options: {
        description: 'Profile picture'
    }
}, () => {
    throw Boom.badRequest('An error now?')
})

//#endregion routing

//#region messaging

app.publish('main', { message: 'coucou' })

app.subscribe('main', (m: { message: string }, sender) => {
    console.log(sender.id, ':', m.message)
}, {
    
})

//#endregion messaging