// example-simple.test.ts
import '../src/routes';
import { app } from '../src/server';
import { expect } from 'chai';

describe('GET /', () => {
    beforeEach(async () => {
        await app.base().initialize();
    });

    afterEach(async () => {
        await app.stop({
            timeout: 1000,
        });
    });

    it('responds with 200 /', async () => {
        const res = await app.base().inject({
            method: 'get',
            url: '/info',
        });
        expect(res.statusCode).to.equal(200);
    });
});
