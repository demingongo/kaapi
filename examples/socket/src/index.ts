import { Kaapi } from '@kaapi/kaapi';
import Boom from '@hapi/boom'
import inert from '@hapi/inert';
import Joi from 'joi'
import fs from 'node:fs/promises'
import Stream from 'node:stream';
import path from 'node:path'
import { createServerApp, ListenerBuilder, NspBuilder } from '@novice1/socket'
import errorHandler from '@novice1/socket/lib/utils/errorHandler';
import { explodeData } from '@novice1/socket/lib/utils/explodeData';

//#region init

const socketApp = createServerApp()
    .link(
        new NspBuilder('/app')
            .add(new ListenerBuilder(
                'message',
                errorHandler(explodeData(function (data) {
                    console.log('Received message:', data);
                    this.res('reply', `Echo: ${data}`)
                }))
            ))
            .add('disconnect',
                (req) => {
                    console.log('Socket disconnected:', req.socket.id);
                }
            )
    )
    .onConnection((socket) => {
        console.log('Socket connected:', socket.id);
    });

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
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
app.server().server.register(inert)

app.server().server.auth.default({
    strategy: 'kaapi',
    mode: 'try'
})

//#endregion config

//#region routing

// 404
app.route({}, () => Boom.notFound('Nothing here'))

app.route({
    method: 'GET',
    path: '/socketapp',
    options: {
        description: 'socketapp'
    }
}, {
    file: `${process.cwd()}/public/socketapp.html`
})

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
app.server().route({
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
                name: Joi.string().description('The name of the person to greet')
            })
        }
    }
}, ({ query: { name } }) => `Hello ${name || 'World'}!`)

app.server().route<{ Params: { filename?: string } }>({
    method: 'GET',
    path: '/public/{filename*}',
    options: {
        description: 'get public file',
        tags: ['Index'],
        validate: {
            params: Joi.object({
                filename: Joi.string().description('The name of the file').required()
            })
        }
    }
}, ({ params: { filename } }, h) => h.file(`${process.cwd()}/public/${filename}`))

//#endregion routing

//#region start

app.listen().then(ks => {
    socketApp.build(ks.server.listener, {cors: {
        origin: '*', // Or specify allowed origin(s) like 'http://localhost:3001'
        methods: ['GET', 'POST'],
        credentials: true
    }})
})

//#endregion start
