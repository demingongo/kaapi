// server.ts
import path from 'node:path';
import logger from './drafts/logger';
import { customAuthDesign } from './plugins/customAuthDesign';
import { Kaapi } from '@kaapi/kaapi';
import { randomBytes } from 'node:crypto';
import { validatorArk } from '@kaapi/validator-arktype';
import { validatorValibot } from '@kaapi/validator-valibot';

export const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    logger: logger,
    loggerOptions: {
        level: 'debug',
    },
    docs: {
        version: '1.0.4-esm',
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

await app.extend([validatorArk, validatorValibot])

await app.base().register(await import('@hapi/vision'));

app.base().views({
    engines: {
        pug: await import('pug')
    },
    relativeTo: path.join(import.meta.dirname, '..'),
    path: 'templates'
});