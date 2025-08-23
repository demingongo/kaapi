import { Kaapi } from '@kaapi/kaapi';
import Boom from '@hapi/boom'
import inert from '@hapi/inert';
import { CustomMessaging } from './CustomMessaging';
import Joi from 'joi'
import fs from 'node:fs/promises'
import Stream from 'node:stream';
import path from 'node:path'

//#region init

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    auth: {
        validate: async (_req, token, h) => {
            //app.log('my token is', token)
            //app.log('route description=', req.route.settings.description)
            //app.log('route tags=', req.route.settings.tags)

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
        }
    },
    loggerOptions: {
        level: 'debug'
    },
    messaging: new CustomMessaging(),
    routes: {
        auth: {
            strategy: 'kaapi',
            mode: 'try'
        }
    },
    docs: {
        disabled: false,
        path: '/docs/api',
        host: {
            url: '', //'http://localhost:3000',
            description: 'An app built with Kaapi'
        },
        license: 'UNLICENSED',
        version: '0.0.2',
        title: 'examples-kaapi-app',
        options: {
            swagger: {
                customCssUrl: '/public/swagger-ui.css',
                customSiteTitle: 'examples-kaapi-app documentation'
            }
        }
    }
})

//#endregion init

//#region config

// server static files
app.base().register(inert).then(
    () => {
        app.listen()
        //app.refreshDocs() // can be used to sort routes by paths and discover routes that were added directly to .base()
    }
)


/*
// commented because it can be set from the init (see above)
// try auth on all routes (mode 'try' = still continue if it fails and auth was not required for the route)
app.idle().server.auth.default({
    strategy: 'kaapi',
    mode: 'try'
})
*/


//#endregion config

//#region routing

// 404
app.route({}, () => Boom.notFound('Nothing here'))

app.route({
    method: 'GET',
    path: '/file',
    //auth: true, // mode 'required' if no mode is defined in the route 
    options: {
        description: 'Profile picture'
    }
}, {
    file: `${process.cwd()}/public/profile-icon.png`
})

// to not insert in documentation, add directly from server
app.route({
    method: 'GET',
    path: '/error',
    options: {
        description: 'Just throwing an error'
    }
}, () => {
    throw Boom.badRequest('An error now?')
})

app.route<{
    Payload: {
        username: string, picture: {
            _data: Stream,
            hapi: {
                filename: string,
                headers: {
                    'content-type': string
                }
            }
        }
    }
}>({
    method: 'POST',
    path: '/upload',
    options: {
        description: 'Upload user pic',
        tags: ['Index'],
        validate: {
            payload: Joi.object({
                username: Joi.string().required(),
                picture: Joi.object().required().tag('files')
            })
        },
        payload: {
            output: 'stream',
            parse: true,
            allow: 'multipart/form-data',
            multipart: { output: 'stream' },
            maxBytes: 1024 * 3_000_000
        }
    }
}, async (req) => {
    app.log.warn(req.payload.username)

    app.log.warn('payload', Object.keys(req.payload))

    app.log.warn('file keys', Object.keys(req.payload.picture.hapi))

    const pic = req.payload.picture

    await fs.writeFile(
        path.join(__dirname, '..', 'uploads', pic.hapi.filename), pic._data)

    return 'ok'
})

app.route<{ Query: { name?: string } }>({
    method: 'GET',
    path: '/',
    options: {
        description: 'greet someone',
        tags: ['Index'],
        validate: {
            query: Joi.object({
                name: Joi.string().description('The name of the person to greet').trim()
            })
        }
    }
}, ({ query: { name } }) => `Hello ${name || 'World'}!`)

/**
 * Not recommended because the documentation does not understand paths with "*"
 */
app.route<{ Params: { filename?: string } }>({
    method: 'GET',
    path: '/public/{filename*}',
    options: {
        description: 'get public file',
        tags: ['Index'],
        validate: {
            params: Joi.object({
                filename: Joi.string().description('The name of the file').required()
            })
        },
        plugins: {
            kaapi: {
                docs: {
                    story: `_Notes:_

- __Not recommended because the documentation does not understand paths with "*".__
                    `
                }
            }
        }
    }
}, ({ params: { filename } }, h) => {
    app.log.info(`file: ${process.cwd()}/public/${filename}`)
    return h.file(`${process.cwd()}/public/${filename}`)
})

//#endregion routing

//#region messaging

app.publish('main', { message: 'coucou' })

app.subscribe('main', (m: { message: string }, sender) => {
    app.log(sender.id, ':', m.message)
}, {

})

//console.log(Joi.object().required().tag('files'))

//#endregion messaging
