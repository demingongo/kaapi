// routes.ts
import { app } from './server';
import Boom from '@hapi/boom';
import { RequestBodyDocsModifier } from '@kaapi/kaapi';
import Joi from 'joi';

// 404
app.route(
    {
        auth: false,
    },
    () => Boom.notFound('Nothing here')
);

app.route(
    {
        method: 'GET',
        path: '/',
        auth: true,
        options: {
            validate: {
                headers: Joi.object({
                    dpop: Joi.string(),
                }).unknown(),
            },
            description: 'greet me',
            tags: ['Tests'],
        },
    },
    (req) =>
        'Hello!' +
        (req.auth.credentials.user && 'name' in req.auth.credentials.user ? ` ${req.auth.credentials.user.name}` : '')
);

app.route(
    {
        path: '/info',
        method: 'GET',
    },
    (request) => {
        app.log.debug('request.app.oauth2?.proofThumbprint:', request.app.oauth2?.dpopThumbprint);
        const forwardedProto = request.headers['x-forwarded-proto'];
        const protocol = forwardedProto ? forwardedProto : request.server.info.protocol;
        const url = protocol + '://' + request.info.host + request.path;
        return url;
    }
);

app.route({
    path: '/xml',
    method: 'POST',
    options: {
        description: 'Post xml',
        plugins: {
            kaapi: {
                docs: {
                    modifiers: {
                        requestBody: new RequestBodyDocsModifier()
                            .addMediaType(
                                'application/xml',
                                {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            id: {
                                                type: 'integer',
                                                format: 'int32'
                                            },
                                            name: {
                                                type: 'string',
                                                xml: {
                                                    namespace: 'http://example.com/schema/sample',
                                                    prefix: 'sample'
                                                }
                                            },
                                            animals: {
                                                type: 'array',
                                                uniqueItems: false,
                                                items: {
                                                    type: 'string',
                                                    xml: {
                                                        name: 'animal'
                                                    }
                                                }
                                            },

                                            safe: {
                                                type: 'boolean'
                                            },
                                        },
                                        xml: {
                                            name: 'element'
                                        }
                                    }
                                }
                            )
                    }
                }
            }
        }
    },
    handler: () => 'ok'
})

app.route({
    path: '/json',
    method: 'POST',
    options: {
        description: 'Post json',
        plugins: {
            kaapi: {
                docs: {
                    modifiers: {
                        requestBody: new RequestBodyDocsModifier()
                            .addMediaType(
                                'application/json',
                                {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            id: {
                                                type: 'integer',
                                                format: 'int32'
                                            },
                                            name: {
                                                type: 'string',
                                                xml: {
                                                    namespace: 'http://example.com/schema/sample',
                                                    prefix: 'sample'
                                                }
                                            },
                                            animals: {
                                                type: 'array',
                                                uniqueItems: false,
                                                items: {
                                                    type: 'string',
                                                    xml: {
                                                        name: 'animal'
                                                    }
                                                }
                                            },

                                            safe: {
                                                type: 'boolean'
                                            },
                                        },
                                        xml: {
                                            name: 'element'
                                        }
                                    }
                                }
                            )
                    }
                }
            }
        }
    },
    handler: () => 'ok'
})