import { description, instance, integer, looseObject, maxLength, maxValue, metadata, minValue, nonEmpty, number, object, optional, picklist, pipe, string, transform, trim } from 'valibot'
//import { toJsonSchema } from '@valibot/to-json-schema';
import Boom from '@hapi/boom'
import inert from '@hapi/inert';
import Joi from 'joi'
import { BearerUtil } from '@novice1/api-doc-generator';
import { Kaapi } from '@kaapi/kaapi';
import { OpenAPIValibotHelper, validatorValibot } from '@kaapi/validator-valibot';
//import fs from 'node:fs/promises';
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
        disabled: false,
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

    await app.extend([validatorValibot, {
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
        handler: ({ query: { name } }) => `Hello mello ${name}`
    })

    // file upload
    /*
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
    */

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
    }, () => 'ok')//(req, h) => h.response(req.payload.file._data).type(req.payload.file.hapi.headers['content-type']));

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

    //app.refreshDocs()

    await app.listen()
}

start()

/*
app.log(toJsonSchema(schema.query))
app.log(instance(Buffer))
app.log(toJsonSchema(object({
    filename: pipe(string(), description('The name of the file'), metadata({
        unit: '°C',
        deprecated: true
    }))
})))

console.log(
    toJsonSchema(
        pipe(string(), description('The name of the file'), metadata({
            unit: '°C',
            deprecated: true,
            examples: ['user@example.com', 'admin@site.com']
        }))
    )
)
*/
/*
console.log(
    object({
        name: optional(pipe(string(), trim(), nonEmpty(), maxLength(10), description('The name')), 'World')
    })
)
*/
/*
console.log(optional(pipe(looseObject({
    _data: instance(Buffer),
    hapi: looseObject({
        filename: string(),
        headers: looseObject({
            'content-type': picklist(['image/jpeg', 'image/jpg', 'image/png'] as const)
        })
    })
}))))
*/
/*
console.log(
    toJsonSchema(
        object({
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
        , { errorMode: 'ignore' })
)
*/