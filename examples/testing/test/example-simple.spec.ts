// example-simple.spec.ts
import { init } from '../src/server-simple';
import { expect } from '@hapi/code';
import { Kaapi } from '@kaapi/kaapi';

describe('GET /', () => {
    let app: Kaapi;

    beforeEach(async () => {
        app = await init();
    });

    afterEach(async () => {
        await app.stop();
    });

    it('responds with 200 /', async () => {
        const res = await app.base().inject({
            method: 'get',
            url: '/',
        });
        expect(res.statusCode).to.equal(200);
    });
});
