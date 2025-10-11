// server.ts
import logger from './drafts/logger';
import { customAuthDesign } from './plugins/customAuthDesign';
import { Kaapi } from '@kaapi/kaapi';
import { randomBytes } from 'node:crypto';

export const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    logger: logger,
    loggerOptions: {
        level: 'debug',
    },
    docs: {
        disabled: false,
        host: { url: 'http://localhost:3000' },
    },
    routes: {
        // parse cookies
        state: {
            parse: true,
            failAction: 'log',
        },
    },
    extend: customAuthDesign,
});

// cookies
app.base().state('kaapisession', {
    ttl: 60000 * 2, // 2 min
    isHttpOnly: true,
    //encoding: 'base64json'
    encoding: 'iron',
    password: randomBytes(32).toString('base64url'),
});

// to not set it in all the routes but will be used in routes
// with no auth defined
app.base().auth.default({
    strategies: customAuthDesign.getStrategies(), //['oauth2-authorization-code'],
    mode: 'try',
});
app.log('default strategy:', app.base().auth.settings.default);

app.base().ext('onPreHandler', (request, h) => {
    app.log.warn('onPreHandler -', request.method.toUpperCase(), request.path, request.payload);

    return h.continue;
});

await app.base().register({
    name: 'myplugin',
    register(_server) {
        // register "myplugin" plugin
    },
});

app.log.info('"myplugin" plugin registered');
