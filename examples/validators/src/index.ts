
//import Boom from '@hapi/boom'
import inert from '@hapi/inert';
import Joi from 'joi'
import { BearerUtil } from '@novice1/api-doc-generator';
import { groupResponses, Kaapi, MediaTypeModifier, RequestBodyDocsModifier, ResponseDocsModifier, SchemaModifier } from '@kaapi/kaapi';
import path from 'node:path';
import { type } from 'arktype';
import * as v from 'valibot';
import { z } from 'zod'
import { validatorArk } from '@kaapi/validator-arktype';
import { validatorValibot } from '@kaapi/validator-valibot';
import { validatorZod } from '@kaapi/validator-zod';
import Stream from 'node:stream';
import busboy from 'busboy'
import fs from 'node:fs';

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
        security: new BearerUtil('mySecurityScheme'),
    },
    routes: {
        auth: {
            strategy: 'kaapi',
            mode: 'try'
        },
        files: {
            relativeTo: path.join(__dirname, '..', 'uploads')
        },
        /*
        plugins: {
            valibot: {
                options: {},
                failAction: async (_req, _h, err) => {
                    console.log(Boom.isBoom(err) ? err.data.validationError.issues[0] : err)
                    return Boom.isBoom(err) ? Boom.badRequest(err.data.validationError.issues[0].message) : err
                }
            }
        }
        */
    }
})

async function start() {

    await app.extend([validatorArk])
    await app.extend([validatorValibot])
    await app.extend([validatorZod])

    await app.extend([{
        async integrate(t) {
            await t.server.register(inert)
        },
    }])

    // ArkType validation
    app.base()
        .ark({
            payload: type({
                file: type({
                    _data: type.instanceOf(Buffer),
                    hapi: type({
                        filename: 'string',
                        headers: {
                            'content-type': '\'image/jpeg\' | \'image/jpg\' | \'image/png\'',
                        },
                    }),
                }, '@', 'The file if nothing else'),
            }),
        })
        .route(
            {
                method: 'POST',
                path: '/upload-image-ark',
                options: {
                    tags: ['ark'],
                    description: 'Upload an image',
                    payload: {
                        output: 'stream',
                        parse: true,
                        allow: 'multipart/form-data',
                        multipart: { output: 'stream' },
                        maxBytes: 1024 * 3_000,
                    },
                },
            },
            (req, h) => h.response(req.payload.file._data).type(req.payload.file.hapi.headers['content-type'])
        );


    // Valibot validation
    app.base().valibot({
        payload: v.object({
            file: v.pipe(
                v.looseObject({
                    _data: v.instance(Buffer),
                    hapi: v.looseObject({
                        filename: v.string(),
                        headers: v.looseObject({
                            'content-type': v.picklist(['image/jpeg', 'image/jpg', 'image/png'] as const)
                        })
                    })
                }),
                v.description('The file itself (image)')
            )
        })
    }).route({
        method: 'POST',
        path: '/upload-image-valibot',
        options: {
            tags: ['valibot'],
            description: 'Upload an image',
            payload: {
                output: 'stream',
                parse: true,
                allow: 'multipart/form-data',
                multipart: { output: 'stream' },
                maxBytes: 1024 * 3_000
            }
        }
    }, ({ payload: { file } }, h) => h.response(file._data).type(file.hapi.headers['content-type']));

    // Zod validation
    app.base().zod({
        payload: z.object({
            file: z.looseObject({
                _data: z.instanceof(Buffer),
                hapi: z.looseObject({
                    filename: z.string(),
                    headers: z.looseObject({
                        'content-type': z.enum(['image/jpeg', 'image/jpg', 'image/png'])
                    })
                })
            })
        })
    }).route({
        method: 'POST',
        path: '/upload-image-zod',
        options: {
            tags: ['zod'],
            description: 'Upload an image',
            payload: {
                output: 'stream',
                parse: true,
                allow: 'multipart/form-data',
                multipart: { output: 'stream' },
                maxBytes: 1024 * 3_000
            }
        }
    }, (req, h) =>
        h.response(req.payload.file._data)
            .type(req.payload.file.hapi.headers['content-type'])
    );


    // Regular validation (joi)
    app.route<{
        Payload: {
            file: {
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
        path: '/upload-image-joi',
        options: {
            tags: ['joi'],
            description: 'Upload an image',
            validate: {
                payload: Joi.object({
                    file: Joi.object({
                        _data: Joi.object().instance(Buffer),
                        hapi: Joi.object({
                            filename: Joi.string(),
                            headers: Joi.object({
                                'content-type': Joi.string().valid('image/jpeg', 'image/jpg', 'image/png')
                            }).unknown(true)
                        }).unknown(true)
                    }).unknown(true).required().tag('files') // 👈 tag required for docs
                }).required()
            },
            payload: {
                output: 'stream',
                parse: true,
                allow: 'multipart/form-data',
                multipart: { output: 'stream' },
                maxBytes: 1024 * 3000 // 3MB
            }
        }
    }, ({ payload: { file } }, h) => h.response(file._data).type(file.hapi.headers['content-type']));

    /*
const fileFieldSchema: SchemaObject3_1 = {
    type: 'object',
    properties: {
        username: {
            type: 'string',
            description: 'The name of the user',
            format: 'email'
        },
        file: {
            type: 'string',
            description: 'The image to upload',
            contentMediaType: 'application/octet-stream'
        }
    },
    required: [
        'file'
    ],
}
*/
    app.route(
        {
            method: 'POST',
            path: '/upload-image-busboy',
            options: {
                tags: ['busboy'],
                description: 'Upload an image',
                notes: '**Real stream handling with busboy**',
                payload: {
                    output: 'stream',
                    parse: false,
                    allow: 'multipart/form-data',
                    multipart: { output: 'stream' },
                    maxBytes: 1024 * 3000, // 3MB
                },
                plugins: {
                    kaapi: {
                        docs: {
                            // it definitly looks ugly but it is necessary for the sake of the documentation while fine graining the the control with no validator
                            /*
                            openApiSchemaExtension: {
                                requestBody: {
                                    content: {
                                        'multipart/form-data': {
                                            schema: {
                                                type: 'object',
                                                properties: {
                                                    username: {
                                                        type: 'string',
                                                        description: 'The name of the user',
                                                        format: 'email'
                                                    },
                                                    file: {
                                                        type: 'string',
                                                        description: 'The image to upload',
                                                        contentMediaType: 'application/octet-stream'
                                                    }
                                                },
                                                required: [
                                                    'file'
                                                ],
                                            }
                                        }
                                    },
                                    required: true
                                }
                            },
                            */
                            modifiers: {
                                requestBody: new RequestBodyDocsModifier()
                                    .setRequired(true)
                                    .addMediaType('multipart/form-data', new MediaTypeModifier(
                                        {
                                            schema: new SchemaModifier('UploadImageBusboy', {
                                                type: 'object',
                                                properties: {
                                                    username: {
                                                        type: 'string',
                                                        description: 'The name of the user',
                                                        format: 'email'
                                                    },
                                                    file: {
                                                        type: 'string',
                                                        description: 'The image to upload',
                                                        contentMediaType: 'application/octet-stream'
                                                    }
                                                },
                                                required: [
                                                    'file'
                                                ],
                                            }).toObject()
                                        }
                                    )),
                                responses: groupResponses(
                                    new ResponseDocsModifier()
                                        .setCode(200)
                                        .setDefault(true)
                                        .setDescription('The file itself'),
                                    new ResponseDocsModifier()
                                        .setCode(400)
                                        .setDescription('Bad Request')
                                )
                            }
                        }
                    }
                }
            },
        },
        async (request, h) => {
            const bb = busboy({ headers: request.headers });

            let savedFilename = ''

            const promise = new Promise<void>((resolve, _reject) => {
                bb.on('file', (fieldname, file, info) => {
                    const { filename, encoding, mimeType } = info;
                    console.log(`File [${fieldname}]: filename: %j, encoding: %j, mimeType: %j`, filename, encoding, mimeType);
                    savedFilename = filename
                    file.pipe(fs.createWriteStream(`./uploads/${filename}`));
                });
                bb.on('field', (name, val, _info) => {
                    console.log(`Field [${name}]: value: %j`, val);
                });
                bb.on('close', () => {
                    console.log('Done parsing form!');
                    resolve()
                });
            })

            request.raw.req.pipe(bb);

            await promise;

            return h.file(savedFilename)
        }
    );

    //app.refreshDocs()

    await app.listen()
}

start()