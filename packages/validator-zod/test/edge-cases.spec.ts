// test: Edge cases

import { expect } from 'chai';
import { Kaapi } from '@kaapi/kaapi';
import { validatorZod, zodDocsConfig } from '@kaapi/validator-zod';
import { z } from 'zod';

describe('ValidatorZod Edge Cases', () => {
    const app = new Kaapi({
        port: 0,
        host: 'localhost',
        docs: {
            title: 'Edge Case API',
            ...zodDocsConfig
        }
    });

    let pluginRegistered = false;

    beforeEach(async () => {
        if (!pluginRegistered) {
            await app.extend(validatorZod);
            pluginRegistered = true;
        }
        await app.base().initialize();
    });

    afterEach(async () => {
        await app.stop();
    });

    it('should handle optional and default fields correctly', async () => {
        app.base().zod({
            query: z.object({
                name: z.string().optional().default('World'),
                emoji: z.string().optional()
            })
        }).route({
            method: 'GET',
            path: '/hello',
            handler: ({ query }) => `Hello ${query.name}${query.emoji ? ' ' + query.emoji : ''}!`
        });

        const res = await app.base().inject({
            method: 'GET',
            url: '/hello'
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.equal('Hello World!');
    });

    it('should validate nested schemas', async () => {
        app.base().zod({
            payload: z.object({
                user: z.object({
                    id: z.string().uuid(),
                    profile: z.object({
                        age: z.number().int().min(18),
                        bio: z.string().max(100).optional()
                    })
                })
            })
        }).route({
            method: 'POST',
            path: '/nested',
            handler: ({ payload }) => payload.user
        });

        const res = await app.base().inject({
            method: 'POST',
            url: '/nested',
            payload: {
                user: {
                    id: '123e4567-e89b-12d3-a456-426614174000',
                    profile: {
                        age: 30,
                        bio: 'Loves testing edge cases.'
                    }
                }
            }
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.deep.equal({
            id: '123e4567-e89b-12d3-a456-426614174000',
            profile: {
                age: 30,
                bio: 'Loves testing edge cases.'
            }
        });
    });

    it('should include meta descriptions in OpenAPI docs', async () => {
        app.base().zod({
            query: z.object({
                lang: z.string().max(5).meta({
                    description: 'Language code for localization'
                }).optional().default('en')
            })
        }).route({
            method: 'GET',
            path: '/docs-meta',
            handler: ({ query }) => `Language: ${query.lang}`
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
                maxLength: 5,
                description: 'Language code for localization'
            },
            description: 'Language code for localization',
            allowEmptyValue: true
        });
    });
});
