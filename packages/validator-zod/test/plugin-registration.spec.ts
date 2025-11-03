// test: Plugin registration

import { expect } from 'chai';
import { Kaapi } from '@kaapi/kaapi';
import { validatorZod, zodDocsConfig } from '@kaapi/validator-zod';
import { z } from 'zod';

describe('ValidatorZod Plugin Registration', () => {
    it('should integrate validatorZod plugin with Kaapi', async () => {
        const app = new Kaapi({ port: 0, host: 'localhost' });

        await app.extend(validatorZod);

        // Check that plugin was registered
        expect(app.base()).to.have.property('zod');
        expect(app.base().zod).to.be.a('function');
    });

    it('should apply zodDocsConfig when docs are enabled', async () => {
        const app = new Kaapi({
            port: 0,
            host: 'localhost',
            docs: {
                title: 'API test',
                ...zodDocsConfig
            }
        });

        await app.extend(validatorZod);

        app.base().zod({
            query: z.object({
                number: z.number().max(100),
                entity: z.string().trim().nonempty().max(10).meta({
                    description: 'Some description'
                }).optional().default('punch')
            })
        }).route({
            method: 'GET',
            path: '/test',
            handler: ({ query: { entity, number } }) => `${number} ${entity}`
        })

        const openapi = app.openapi.result()

        // Check that docs includes route parameters
        expect(openapi.info.title).to.be.a('string').that.equals('API test')
        expect(openapi.paths['/test']).to.be.an('object');
        expect(openapi.paths['/test']).to.not.be.null;
        if (openapi.paths['/test'] && typeof openapi.paths['/test'] === 'object') {
            expect(openapi.paths['/test'].get).to.be.an('object');
            expect(openapi.paths['/test'].get).to.not.be.null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const testGetPath = openapi.paths['/test'].get as any
            expect(testGetPath.parameters).to.be.an('array')
                .that.has.lengthOf(2, 'number of parameters')
                .that.deep.includes({
                    name: 'number',
                    in: 'query',
                    required: true,
                    schema: { type: 'number', maximum: 100 }
                }, 'first parameter')
                .and.deep.includes({
                    name: 'entity',
                    in: 'query',
                    required: false,
                    schema: {
                        type: 'string',
                        description: 'Some description',
                        default: 'punch',
                        minLength: 1,
                        maxLength: 10
                    },
                    description: 'Some description'
                }, 'second parameter');
        }
    });
});
