import { z } from 'zod/v4'
//import Joi from 'joi'
import { BearerUtil } from '@novice1/api-doc-generator';
import { KaapiZod } from './kaapi-zod';

const app = new KaapiZod({
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
    await app.init()

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

    const pschema = z.object({
        version: z.number().max(5120)
    })

    app.endpoint<{ AuthCredentialsExtra: { cot: string } }>({
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

            //validate: {
            //    payload: Joi.object({
            //        version: Joi.number()
            //    })
            //}
        }
    }, {
        payload: pschema
    }, ({ payload: { version }, auth: { credentials: { cot } } }) => `${version} -> ${cot}`)

    app.zod({
        payload: pschema
    }).route<{ AuthCredentialsExtra: { cot: string } }>({
        path: '/oops2',
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
    }, ({ payload: { version }, auth: { credentials: { cot } } }) => `${version} -> ${cot}`)

    app.refreshDocs()

    app.listen()
}




start()

