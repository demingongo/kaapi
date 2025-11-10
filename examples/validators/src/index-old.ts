import { description, instance, integer, literal, looseObject, maxLength, maxValue, metadata, minValue, nonEmpty, number, object, optional, picklist, pipe, string, transform, trim, union } from 'valibot'
import Boom from '@hapi/boom'
import inert from '@hapi/inert';
import Joi from 'joi'
import { BearerUtil } from '@novice1/api-doc-generator';
import { Kaapi } from '@kaapi/kaapi';
import { OpenAPIValibotHelper, validatorValibot } from '@kaapi/validator-valibot';
import { validatorArk } from '@kaapi/validator-arktype';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type } from 'arktype';

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
        disabled: false,
        title: 'Validators (valibot)',
        security: new BearerUtil('mySecurityScheme')
    },
    routes: {
        auth: {
            strategy: 'kaapi',
            mode: 'try'
        },
        files: {
            relativeTo: path.join(__dirname, '..', 'uploads')
        },
        plugins: {
            valibot: {
                options: {},
                failAction: async (_req, _h, err) => {
                    console.log(Boom.isBoom(err) ? err.data.validationError.issues[0] : err)
                    return Boom.isBoom(err) ? Boom.badRequest(err.data.validationError.issues[0].message) : err
                }
            }
        }
    }
})

const schema = {
    query: object({
        name: pipe(string(), maxLength(10))
    })
}

async function start() {

    await app.extend([validatorValibot, validatorArk, {
        async integrate(t) {
            await t.server.register(inert)
        },
    }])

    // with handler as argument
    app.base().valibot({
        payload: pipe(object({
            version: pipe(number(), maxValue(5120), metadata({
                description: 'version number'
            }))
        }), metadata({ description: 'payload' })),
        query: object({
            name: optional(string())
        })
    }).route<{ AuthCredentialsExtra: { extraextra?: string } }>({
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
    }, ({ payload, query: { name }, auth: { credentials: { extraextra } } }) => `${name ?? 'NONAME'}: ${payload?.version} ${extraextra ?? ''}`)

    // with handler in the route config (Hapi's way)
    app.base().valibot({
        query: object({
            user: union([
                literal('authenticated'),
                literal('anonymous')
            ]),
            name: optional(pipe(string(), trim(), nonEmpty(), maxLength(10), description('The name')), 'World'),
            age: optional(pipe(string(), transform((input) => typeof input === 'string' ? Number(input) : input), number(), integer(), minValue(1)))
        }),
        state: optional(looseObject({
            session: optional(string())
        })),
        options: {},
        failAction: async (_req, h, err) => {
            if (Boom.isBoom(err)) {
                return h.response({
                    ...err.output.payload,
                    details: err.data.validationError.issues
                }).code(err.output.statusCode).takeover()
            }
            return err
        }
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
        handler: ({ query: { name, user } }) => `Hello ${user} ${name}`
    })

    // file upload
    app.base().valibot({
        payload: object({
            username: pipe(string(), description('The username')),
            picture: looseObject({
                _data: instance(Buffer),
                hapi: looseObject({
                    filename: string(),
                    headers: looseObject({
                        'content-type': string()
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

    app.base().valibot({
        payload: object({
            file: optional(
                pipe(
                    looseObject({
                        _data: instance(Buffer),
                        hapi: looseObject({
                            filename: string(),
                            headers: looseObject({
                                'content-type': picklist(['image/jpeg', 'image/jpg', 'image/png'] as const)
                            })
                        })
                    }),
                    description('The file itself (image)')
                )
            )
        })
    }).route({
        method: 'POST',
        path: '/upload-image',
        options: {
            description: 'Upload an image',
            payload: {
                output: 'stream',
                parse: true,
                allow: 'multipart/form-data',
                multipart: { output: 'stream' },
                maxBytes: 1024 * 3_000
            }
        }
    }, ({ payload: { file } }, h) => file ? h.response(file._data).type(file.hapi.headers['content-type']) : 'ok');

    // custom handler (inert)
    app.base().valibot({
        params: object({
            filename: pipe(string(), metadata(
                { description: 'The name of the file' }
            ))
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

    // without code typing (ts)
    app.route(
        {
            path: '/validates-and-generates-doc/but-no-typing',
            auth: false,
            method: 'GET',
            options: {
                plugins: {
                    valibot: {
                        ...schema
                    },
                    kaapi: {
                        docs: {
                            helperSchemaProperty: 'valibot',
                            openAPIHelperClass: OpenAPIValibotHelper
                        }
                    }
                }
            }
        },
        (req) => req.query
    )

    // Regular validation (joi):
    // - still works
    // - still generates documentation
    // so easy transition as both validators can coexist in the app
    app.route(
        {
            path: '/joi',
            auth: false,
            method: 'GET',
            options: {
                validate: {
                    query: Joi.object({
                        name: Joi.string().required().max(10)
                    }),
                    failAction: async (_req, _h, err) => {
                        console.log(Boom.isBoom(err) ? err.data.defaultError : err)
                        return err
                    }
                    //failAction: 'log'

                }
            }
        },
        (req) => req.query
    )

    app.base().events.on('request', async (_req, event, tags) => {
        if (tags.validation) {
            console.log(event);
        }
    })

    app.base().ark({
        query: type({
            bbl: 'string = "dreezy"'
        })
    }).route({
        method: 'GET',
        path: '/arktype',
        handler: ({ query: { bbl } }) => `ok ${bbl}`
    })

    //app.refreshDocs()

    await app.listen()
}

start()