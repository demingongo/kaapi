import { z } from 'zod/v4'
import inert from '@hapi/inert';
//import Joi from 'joi'
import { BearerUtil } from '@novice1/api-doc-generator';
import { Kaapi } from '@kaapi/kaapi';
import { kaapiZodDocs, kaapiZodValidator } from './extensions/kaapi-zod-plugin';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    auth: {
        tokenType: 'Bearer',
        validate: async (_, token) => {
            const isValid = token == 'alain'
            const credentials = isValid ? { user: { username: 'Alain' } } : undefined
            return {
                isValid,
                credentials,
                message: credentials ? 'ok' : 'Unauthorized!'
            }
        },
    },
    docs: {
        ...kaapiZodDocs,
        security: new BearerUtil('mySecurityScheme')
    },
    routes: {
        auth: {
            strategy: 'kaapi',
            mode: 'try'
        },
        files: {
            relativeTo: path.join(__dirname, '..', 'uploads')
        }
    }
})

const schema = {
    query: z.object({
        name: z.string()
    })
}

async function start() {

    await app.extend([kaapiZodValidator, {
        async integrate(t) {
            await t.server.register(inert)
        },
    }])

    app.route(
        {
            path: '/zod',
            auth: false,
            method: 'GET',
            options: {
                plugins: {
                    zod: schema,
                    kaapi: {
                        docs: false
                    }
                }
            }
        },
        (req) => req.query
    )

    // with handler as argument
    app.base().zod({
        payload: z.object({
            version: z.number().max(5120).meta({
                description: 'version number'
            })
        }).meta({
            description: 'payload'
        }),
        query: z.object({
            name: z.string().optional()
        })
    }).route({
        path: '/oops',
        method: 'POST',
        auth: true,
        options: {
            plugins: {
                kaapi: {
                    docs: {
                        disabled: false
                    }
                }
            },
        }
    }, ({ payload, query: { name } }) => `${name}: ${payload?.version}`)

    // with handler in the route config (Hapi's way)
    app.base().zod({
        query: z.object({
            name: z.string().optional()
        }),
        state: z.looseObject({
            session: z.string().optional()
        }).optional()
    }).route({
        path: '/greetings',
        method: 'GET',
        auth: false,
        options: {
            plugins: {
                kaapi: {
                    docs: {
                        disabled: false
                    }
                }
            },
        },
        handler: ({ query: { name } }) => `Hello mello ${name}`
    })

    // file upload
    app.base().zod({
        payload: z.object({
            username: z.string().meta({
                description: 'The username'
            }),
            picture: z.looseObject({
                _data: z.instanceof(Buffer),
                hapi: z.looseObject({
                    filename: z.string(),
                    headers: z.looseObject({
                        'content-type': z.string()
                    })
                })
            })
        })
    }).route({
        method: 'POST',
        path: '/upload',
        auth: false,
        options: {
            description: 'Upload user pic',
            tags: ['Index'],
            payload: {
                output: 'stream',
                parse: true,
                allow: 'multipart/form-data',
                multipart: { output: 'stream' },
                maxBytes: 1024 * 3_000
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
    });


    app.base().zod({
        params: z.object({
            filename: z.string().meta(
                { description: 'The name of the file' }
            )
        })
    }).route({
        method: 'GET',
        path: '/uploads/{filename}',
        auth: false,
        options: {
            description: 'get uploaded file',
            tags: ['Index'],
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
    }, {
        directory: {
            path: '.',
            redirectToSlash: true,
        }
    })


    app.refreshDocs()

    await app.listen()
}

start()