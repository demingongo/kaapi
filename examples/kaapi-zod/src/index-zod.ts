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

    app.endpoint({
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
        payload: z.object({
            version: z.number().max(5120)
        })
    }, ({ payload: { version } }) => `${version}`)

    app.refreshDocs()

    app.listen()
}




start()