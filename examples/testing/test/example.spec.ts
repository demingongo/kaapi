// example.spec.ts

import { Kaapi } from '@kaapi/kaapi';
import { expect } from '@hapi/code';
import { init } from '../src/server'

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
            url: '/'
        });
        expect(res.statusCode).to.equal(200);
    });
});

describe('GET /file', () => {
    let app: Kaapi;

    beforeEach(async () => {
        app = await init();
    });

    afterEach(async () => {
        await app.stop();
    });

    it('responds with 404 /file', async () => {
        const res = await app.base().inject({
            method: 'get',
            url: '/file'
        });
        expect(res.statusCode).to.equal(404);
    });
});

describe('GET /socketapp', () => {
    let app: Kaapi;

    beforeEach(async () => {
        app = await init();
    });

    afterEach(async () => {
        await app.stop();
    });

    it('responds with 200', async () => {
        const res = await app.base().inject({
            method: 'get',
            url: '/socketapp'
        });
        expect(res.statusCode).to.equal(200);
    });
});

describe('GET /docs/api', () => {
    let app: Kaapi;

    beforeEach(async () => {
        app = await init();
    });

    afterEach(async () => {
        await app.stop();
    });

    it('responds with 200', async () => {
        const res = await app.base().inject({
            method: 'get',
            url: '/docs/api'
        });
        expect(res.statusCode).to.equal(200);
    });
});

describe('GET /docs/api/schema', () => {
    let app: Kaapi;

    beforeEach(async () => {
        app = await init();
    });

    afterEach(async () => {
        await app.stop();
    });

    it('responds with 200', async () => {
        const res = await app.base().inject({
            method: 'get',
            url: '/docs/api/schema'
        });
        expect(res.statusCode).to.equal(200);

        const payload = JSON.parse(res.payload)
        console.log(payload);
        expect(payload.openapi).to.equal('3.1.1');
        expect(payload.info.version).to.equal('0.0.2');
        expect(payload.info.title).to.equal('examples-testing');
        expect(payload.info.license.name).to.equal('UNLICENSED');
    });
});
