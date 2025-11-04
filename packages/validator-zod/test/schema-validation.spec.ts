// test: Schema validation

import { expect } from 'chai';
import { Kaapi } from '@kaapi/kaapi';
import { validatorZod } from '@kaapi/validator-zod';
import { z } from 'zod';
import Boom from '@hapi/boom';

describe('ValidatorZod Schema Validation', () => {
    const app = new Kaapi({ port: 0, host: 'localhost' });
    let pluginRegistered = false

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

    it('should validate correct payload, query, and headers', async () => {
        app.base().zod({
            payload: z.object({ name: z.string().min(3) }),
            query: z.object({ age: z.coerce.number().int().positive() }),
            headers: z.object({ 'x-auth-token': z.uuid() })
        }).route({
            method: 'POST',
            path: '/validate',
            handler: ({ payload, query, headers }) => ({
                name: payload.name,
                age: query.age,
                token: headers['x-auth-token']
            })
        });

        const res = await app.base().inject({
            method: 'POST',
            url: '/validate?age=25',
            payload: { name: 'Alice' },
            headers: { 'x-auth-token': '123e4567-e89b-12d3-a456-426614174000' }
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.deep.equal({
            name: 'Alice',
            age: 25,
            token: '123e4567-e89b-12d3-a456-426614174000'
        });
    });

    it('should reject malformed input with default failAction', async () => {
        app.base().zod({
            payload: z.object({ name: z.string().min(3) }),
            query: z.object({ age: z.coerce.number().int().positive() })
        }).route({
            method: 'POST',
            path: '/fail-default',
            handler: () => 'ok'
        });

        const res = await app.base().inject({
            method: 'POST',
            url: '/fail-default?age=-5',
            payload: { name: 'Al' }
        });

        expect(res.statusCode).to.equal(400);
        expect(res.result).to.have.property('message');
        expect('message' in res.result! ? res.result.message : undefined)
            .to.be.a('string')
            .that.matches(/^Too small.*"query.age"$/i);
    });

    it('should reject malformed input with "log" failAction', async () => {
        app.base().zod({
            payload: z.object({ name: z.string().min(3) }),
            query: z.object({ age: z.coerce.number().int().positive() }),
            failAction: 'log'
        }).route({
            method: 'POST',
            path: '/fail-log',
            handler: () => 'ok'
        });

        const res = await app.base().inject({
            method: 'POST',
            url: '/fail-log?age=-5',
            payload: { name: 'Al' }
        });

        expect(res.statusCode).to.equal(400);
        expect(res.result).to.have.property('message');
        expect('message' in res.result! ? res.result.message : undefined)
            .to.be.a('string')
            .that.matches(/^Too small.*"query.age"$/i);
    });

    it('should use custom failAction to format error response', async () => {
        app.base().zod({
            payload: z.object({ name: z.string().min(3) }),
            options: { reportInput: true },
            failAction: async (_, h, err) => {
                if (Boom.isBoom(err)) {
                    return h.response({
                        error: 'Custom validation failed',
                        issues: err.data?.validationError?.issues
                    }).code(422).takeover();
                }
                return err;
            }
        }).route({
            method: 'POST',
            path: '/fail-custom',
            handler: () => 'ok'
        });

        const res = await app.base().inject({
            method: 'POST',
            url: '/fail-custom',
            payload: { name: 'Al' }
        });

        expect(res.statusCode).to.equal(422);
        expect(res.result).to.have.property('error', 'Custom validation failed');
        expect('issues' in res.result! ? res.result.issues : undefined).to.be.an('array').with.length.greaterThan(0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((res.result as any).issues[0].path).to.be.an('array').with.ordered.members(['payload', 'name']);
    });
});
