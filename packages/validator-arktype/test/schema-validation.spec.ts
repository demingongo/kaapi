// test: Schema validation
import Boom from '@hapi/boom';
import { Kaapi } from '@kaapi/kaapi';
import { validatorArk, withSchema } from '@kaapi/validator-arktype';
import { type } from 'arktype';
import { expect } from 'chai';

describe('ValidatorArk Schema Validation', () => {
    const app = new Kaapi({ port: 0, host: 'localhost' });
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

    it('should validate correct payload, query, and headers', async () => {
        app.base()
            .ark({
                payload: type({ name: 'string >= 3' }),
                query: type({
                    age: type(['string | number', '@', 'my age'])
                        .pipe((val) => {
                            // If it's a string, try to parse
                            if (typeof val === 'string') {
                                const parsed = Number(val);
                                if (!Number.isNaN(parsed)) {
                                    return parsed;
                                }
                            }
                            return val;
                        })
                        .to('number.integer >= 1'),
                }),
                headers: type({ 'x-auth-token': 'string.uuid' }),
            })
            .route({
                method: 'POST',
                path: '/validate',
                handler: ({ payload, query, headers }) => ({
                    name: payload.name,
                    age: query.age,
                    token: headers['x-auth-token'],
                }),
            });

        const res = await app.base().inject({
            method: 'POST',
            url: '/validate?age=25',
            payload: { name: 'Alice' },
            headers: { 'x-auth-token': '123e4567-e89b-12d3-a456-426614174000' },
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.deep.equal({
            name: 'Alice',
            age: 25,
            token: '123e4567-e89b-12d3-a456-426614174000',
        });
    });

    it('should reject malformed input with default failAction', async () => {
        app.base()
            .ark({
                payload: type({ name: 'string >= 3' }),
                query: type({
                    'age?': type(['string | number', '@', 'my age'])
                        .pipe((val) => {
                            // If it's a string, try to parse
                            if (typeof val === 'string') {
                                const parsed = Number(val);
                                if (!Number.isNaN(parsed)) {
                                    return parsed;
                                }
                            }
                            return val;
                        })
                        .to('number.integer >= 1'),
                }),
            })
            .route({
                method: 'POST',
                path: '/fail-default',
                handler: () => 'ok',
            });

        const res = await app.base().inject({
            method: 'POST',
            url: '/fail-default?age=-5',
            payload: { name: 'Al' },
        });

        expect(res.statusCode).to.equal(400);
        expect(res.result).to.have.property('message');
        expect('message' in res.result! ? res.result.message : undefined)
            .to.be.a('string')
            .that.matches(/^payload.name must be at least length 3 \(was 2\)$/i);
    });

    it('should reject malformed input with "log" failAction', async () => {
        app.base()
            .ark({
                payload: type({ name: 'string >= 3' }),
                query: type({
                    age: type(['string | number', '@', 'my age'])
                        .pipe((val) => {
                            // If it's a string, try to parse
                            if (typeof val === 'string') {
                                const parsed = Number(val);
                                if (!Number.isNaN(parsed)) {
                                    return parsed;
                                }
                            }
                            return val;
                        })
                        .to('number.integer >= 1'),
                }),
                failAction: 'log',
            })
            .route({
                method: 'POST',
                path: '/fail-log',
                handler: () => 'ok',
            });

        const res = await app.base().inject({
            method: 'POST',
            url: '/fail-log?age=-5',
            payload: { name: 'Ali' },
        });

        expect(res.statusCode).to.equal(400);
        expect(res.result).to.have.property('message');
        expect('message' in res.result! ? res.result.message : undefined)
            .to.be.a('string')
            .that.matches(/^query.age must be at least 1 \(was -5\)$/i);
    });

    it('should use custom failAction to format error response', async () => {
        app.base()
            .ark({
                payload: type({ name: 'string >= 3' }),
                options: { abortPipeEarly: false },
                failAction: async (_, h, err) => {
                    if (Boom.isBoom(err)) {
                        return h
                            .response({
                                error: 'Custom validation failed',
                                issues: err.data?.validationError?.issues,
                            })
                            .code(422)
                            .takeover();
                    }
                    return err;
                },
            })
            .route({
                method: 'POST',
                path: '/fail-custom',
                handler: () => 'ok',
            });

        const res = await app.base().inject({
            method: 'POST',
            url: '/fail-custom',
            payload: { name: 'Al' },
        });

        expect(res.statusCode).to.equal(422);
        expect(res.result).to.have.property('error', 'Custom validation failed');
        expect('issues' in res.result! ? res.result.issues : undefined)
            .to.be.an('array')
            .with.length.greaterThan(0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((res.result as any).issues[0].path.map((p: any) => p))
            .to.be.an('array')
            .with.ordered.members(['payload', 'name']);
    });

    it('should validate request using withSchema route builder', async () => {
        const schema = {
            payload: type({ name: 'string >= 3' }),
            query: type({
                'age?': type(['string | number', '@', 'my age'])
                    .pipe((val) => {
                        // If it's a string, try to parse
                        if (typeof val === 'string') {
                            const parsed = Number(val);
                            if (!Number.isNaN(parsed)) {
                                return parsed;
                            }
                        }
                        return val;
                    })
                    .to('number.integer >= 1'),
            })
        };

        const route = withSchema(schema).route({
            method: 'POST',
            path: '/with-schema',
            handler: ({ payload, query }) => ({
                name: payload.name,
                age: query.age
            })
        });

        app.route(route);

        // valid request
        const ok = await app.base().inject({
            method: 'POST',
            url: '/with-schema?age=30',
            payload: { name: 'Alice' }
        });

        expect(ok.statusCode).to.equal(200);
        expect(ok.result).to.deep.equal({
            name: 'Alice',
            age: 30
        });

        // invalid request
        const fail = await app.base().inject({
            method: 'POST',
            url: '/with-schema?age=-1',
            payload: { name: 'Al' }
        });

        expect(fail.statusCode).to.equal(400);
        expect(fail.result).to.have.property('message');
        expect('message' in fail.result! ? fail.result.message : undefined)
            .to.be.a('string')
            .that.matches(/^payload.name must be at least length 3 \(was 2\)$/i);
    });
});
