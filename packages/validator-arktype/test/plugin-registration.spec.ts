// test: Plugin registration
import { Kaapi } from '@kaapi/kaapi';
import { validatorArk } from '@kaapi/validator-arktype';
import { type } from 'arktype';
import { expect } from 'chai';

describe('ValidatorArk Plugin Registration', () => {
    it('should integrate validatorArk plugin with Kaapi', async () => {
        const app = new Kaapi({ port: 0, host: 'localhost' });

        await app.extend(validatorArk);

        // Check that plugin was registered
        expect(app.base()).to.have.property('ark');
        expect(app.base().ark).to.be.a('function');
    });

    it('should apply OpenAPIArkHelper when docs are enabled', async () => {
        const app = new Kaapi({
            port: 0,
            host: 'localhost',
            docs: {
                title: 'API test',
            },
        });

        await app.extend(validatorArk);

        app.base()
            .ark({
                query: type({
                    number: 'number <= 100',
                    entity: type(['string', '@', 'Some description'])
                        .pipe((v) => v?.trim() ?? '')
                        .to('0 < string <= 10')
                        .default('punch'),
                    //type(['string | undefined', '@', 'Some description']).pipe(v => v?.trim() ?? 'punch').to('0 < string <= 10')
                }).onUndeclaredKey('delete'),
            })
            .route({
                method: 'GET',
                path: '/test',
                handler: ({ query: { entity, number } }) => `${number} ${entity}`,
            });

        const openapi = app.openapi.result();

        // Check that docs includes route parameters
        expect(openapi.info.title).to.be.a('string').that.equals('API test');

        expect(openapi.paths['/test']).to.be.an('object');

        expect(openapi.paths['/test']).to.not.be.null;
        if (openapi.paths['/test'] && typeof openapi.paths['/test'] === 'object') {
            expect(openapi.paths['/test'].get).to.be.an('object');
            expect(openapi.paths['/test'].get).to.not.be.null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const testGetPath: any = openapi.paths['/test'].get;
            expect(testGetPath.parameters)
                .to.be.an('array')
                .that.has.lengthOf(2, 'number of parameters')
                .that.deep.includes(
                    {
                        name: 'number',
                        in: 'query',
                        required: true,
                        schema: { type: 'number', maximum: 100 },
                    },
                    'first parameter'
                )
                .and.deep.includes(
                    {
                        name: 'entity',
                        in: 'query',
                        required: false,
                        schema: {
                            type: 'string',
                            description: 'Some description',
                            default: 'punch',
                            minLength: 1,
                            maxLength: 10,
                        },
                        description: 'Some description',
                    },
                    'second parameter'
                );
        }
    });
});
