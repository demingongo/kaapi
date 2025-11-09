// test: Edge cases
import { Kaapi } from '@kaapi/kaapi';
import { validatorArk } from '@kaapi/validator-arktype';
import { type } from 'arktype';
import { expect } from 'chai';

describe('ValidatorArk Edge Cases', () => {
    const app = new Kaapi({
        port: 0,
        host: 'localhost',
        docs: {
            title: 'Edge Case API',
        },
    });

    let pluginRegistered = false;

    beforeEach(async () => {
        if (!pluginRegistered) {
            await app.extend(validatorArk);
            pluginRegistered = true;
        }
        await app.base().initialize();
    });

    afterEach(async () => {
        await app.stop();
    });

    it('should handle optional and default fields correctly', async () => {
        app.base()
            .ark({
                query: type({
                    name: type(['string', '@', 'The name'])
                        .pipe((v) => v?.trim() ?? '')
                        .to('0 < string <= 10')
                        .default('World'),
                    'emoji?': 'string',
                }),
            })
            .route({
                method: 'GET',
                path: '/hello',
                handler: ({ query }) => `Hello ${query.name}${query.emoji ? ' ' + query.emoji : ''}!`,
            });

        const res = await app.base().inject({
            method: 'GET',
            url: '/hello',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.equal('Hello World!');
    });

    it('should validate nested schemas', async () => {
        app.base()
            .ark({
                payload: type({
                    user: type({
                        id: 'string.uuid',
                        profile: type({
                            age: 'number.integer >= 18',
                            'bio?': 'string <= 100',
                        }),
                    }),
                }),
            })
            .route({
                method: 'POST',
                path: '/nested',
                handler: ({ payload }) => payload.user,
            });

        const res = await app.base().inject({
            method: 'POST',
            url: '/nested',
            payload: {
                user: {
                    id: '123e4567-e89b-12d3-a456-426614174000',
                    profile: {
                        age: 30,
                        bio: 'Loves testing edge cases.',
                    },
                },
            },
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.deep.equal({
            id: '123e4567-e89b-12d3-a456-426614174000',
            profile: {
                age: 30,
                bio: 'Loves testing edge cases.',
            },
        });
    });

    it('should include meta descriptions in OpenAPI docs', async () => {
        app.base()
            .ark({
                query: type({
                    lang: type('0 <= string <= 5', '@', 'Language code for localization').default('en'),
                }),
            })
            .route({
                method: 'GET',
                path: '/docs-meta',
                handler: ({ query }) => `Language: ${query.lang}`,
            });

        const openapi = app.openapi.result();

        expect(openapi.paths['/docs-meta']).to.be.an('object');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getRoute = openapi.paths['/docs-meta'].get as any;
        expect(getRoute).to.be.an('object');
        expect(getRoute.parameters).to.deep.include({
            name: 'lang',
            in: 'query',
            required: false,
            schema: {
                type: 'string',
                default: 'en',
                //minLength: 0,
                maxLength: 5,
                description: 'Language code for localization',
            },
            description: 'Language code for localization',
        });
    });

    it('should validate union types', async () => {
        app.base()
            .ark({
                query: type({
                    user: "'authenticated' | 'anonymous'",
                }),
            })
            .route({
                method: 'GET',
                path: '/union',
                handler: ({ query }) => `User: ${query.user}`,
            });

        const res = await app.base().inject({
            method: 'GET',
            url: '/union?user=anonymous',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.equal('User: anonymous');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((app.openapi.result().paths['/union'] as any).get.parameters[0].schema).to.have.deep.property('enum', [
            'anonymous',
            'authenticated',
        ]);
    });

    it('should apply transformations', async () => {
        app.base()
            .ark({
                query: type({
                    tag: type('string.trim').pipe((val) => val.trim().toLowerCase()),
                }),
            })
            .route({
                method: 'GET',
                path: '/transform',
                handler: ({ query }) => `Tag: ${query.tag}`,
            });

        const res = await app.base().inject({
            method: 'GET',
            url: '/transform?tag=  HeLLo  ',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.equal('Tag: hello');
    });

    it('should normalize boolean in query', async () => {
        app.base()
            .ark({
                query: type({
                    tic: 'boolean',
                    'tac?': 'boolean',
                    'toe?': 'boolean[]',
                }),
            })
            .route({
                method: 'GET',
                path: '/normalize-boolean',
                handler: ({ query }) => query.tic,
            });

        const res = await app.base().inject({
            method: 'GET',
            url: '/normalize-boolean?tic=true&tac=false&toe=false&toe=false&toe=true',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.be.a('boolean').that.is.true;
    });

    it('should include file field in body of OpenAPI docs', async () => {
        app.base()
            .ark({
                payload: type({
                    username: type('string', '@', 'The username'),
                    picture: type({
                        '+': 'ignore',
                        _data: type.instanceOf(Buffer),
                        hapi: type({
                            '+': 'ignore',
                            filename: 'string',
                            headers: type({
                                '+': 'ignore',
                                'content-type': 'string',
                            }),
                        }),
                    }),
                }),
            })
            .route(
                {
                    method: 'POST',
                    path: '/upload',
                    options: {
                        description: "Upload user's picture",
                        payload: {
                            output: 'stream',
                            parse: true,
                            allow: 'multipart/form-data',
                            multipart: { output: 'stream' },
                            maxBytes: 1024 * 3_000,
                        },
                    },
                },
                () => 'ok'
            );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((app.openapi.result().paths['/upload'] as any).post.requestBody).to.deep.include({
            content: {
                'multipart/form-data': {
                    schema: {
                        type: 'object',
                        properties: {
                            username: {
                                type: 'string',
                                description: 'The username',
                            },
                            picture: {
                                type: 'string',
                                format: 'binary',
                            },
                        },
                        required: ['picture', 'username'],
                    },
                },
            },
            required: true,
        });
    });
});
