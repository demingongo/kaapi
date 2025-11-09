// test: Overrides

import { expect } from 'chai';
import { Kaapi } from '@kaapi/kaapi';
import { validatorArk } from '@kaapi/validator-arktype';
import { type } from 'arktype';
import Boom from '@hapi/boom';

describe('ValidatorArk Overrides', () => {
    const app = new Kaapi({
        port: 0,
        host: 'localhost',
        routes: {
            plugins: {
                ark: {
                    failAction: async (_, h, err) => {
                        if (Boom.isBoom(err)) {
                            return h.response({
                                error: 'Global failAction triggered',
                                issues: err.data?.validationError?.issues
                            }).code(400).takeover();
                        }
                        return err;
                    }
                }
            }
        }
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

    it('should respect global options and failAction', async () => {
        app.base().ark({
            payload: type({ name: 'string >= 3' })
        }).route({
            method: 'POST',
            path: '/global-fail',
            handler: () => 'ok'
        });

        const res = await app.base().inject({
            method: 'POST',
            url: '/global-fail',
            payload: { name: 'Al' }
        });

        expect(res.statusCode).to.equal(400);
        expect(res.result).to.have.property('error', 'Global failAction triggered');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((res.result as any).issues).to.be.an('array').with.length.greaterThan(0);
    });

    it('should override global options and failAction per route', async () => {
        app.base().ark({
            payload: type({ name: 'string >= 3' }),
            options: { abortEarly: false },
            failAction: async (_, h, err) => {
                if (Boom.isBoom(err)) {
                    return h.response({
                        error: 'Per-route failAction triggered',
                        details: err.data?.validationError?.issues
                    }).code(422).takeover();
                }
                return err;
            }
        }).route({
            method: 'POST',
            path: '/route-fail',
            handler: () => 'ok'
        });

        const res = await app.base().inject({
            method: 'POST',
            url: '/route-fail',
            payload: { name: 'Al' }
        });

        expect(res.statusCode).to.equal(422);
        expect(res.result).to.have.property('error', 'Per-route failAction triggered');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((res.result as any).details).to.be.an('array').with.length.greaterThan(0);
    });
});
