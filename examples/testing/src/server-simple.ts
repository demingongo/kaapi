// src/server-simple.ts

import { Kaapi } from '@kaapi/kaapi';
import Boom from '@hapi/boom';

//#region prep

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    docs: {
        title: 'examples-testing'
    }
});

//#endregion prep

//#region routing

// 404
app.route({}, () => Boom.notFound('Nothing here'));

app.route({
    method: 'GET',
    path: '/',
    options: {
        description: 'index'
    }
}, () => 'Hello World!');

//#endregion routing

//#region init

export async function init() {

    await app.base().initialize();
    return app;
};

//#endregion init

//#region start

export async function start() {

    const { base: server } = await app.listen()
    console.log(`Server running at: ${server.info.uri}`);
    return app;
};

//#endregion start
