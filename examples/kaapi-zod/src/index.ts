import { z } from 'zod/v4'
//import Joi from 'joi'
import { BearerUtil } from '@novice1/api-doc-generator';
import { Kaapi } from '@kaapi/kaapi';
import { kaapiZodDocs, kaapiZodValidator } from './extensions/kaapi-zod-plugin';

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
        }
    }
})

const schema = {
    query: z.object({
        name: z.string()
    })
}

async function start() {

    await app.extend(kaapiZodValidator)

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

    // with handler as 3rd argument
    app.base().routeSafe({
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
    }, {
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
    }, ({ payload, query: { name } }) => `${name}: ${payload?.version}`)

    // with handler in the route config (Hapi's way)
    app.base().routeSafe({
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
    }, {
        query: z.object({
            name: z.string().optional()
        })
    })

    app.refreshDocs()

    await app.listen()
}




start()