// index.ts
import { appReady } from './server';
import Boom from '@hapi/boom';
import Joi from 'joi';
import { jwksRotator } from './plugins/jwks';
import { deviceVerificationRoute } from './drafts/oidc-device-auth-flow-draft';
// import oidcAuthCodeFlowDraft from './drafts/oidc-auth-code-flow-draft';

appReady.then((app) => {
    app.log(`Kaapi server is ready: ${app}`);

    // 404
    app.route(
        {
            auth: false,
        },
        () => Boom.notFound('Nothing here')
    );

    app.route(
        {
            method: 'GET',
            path: '/',
            auth: true,
            options: {
                validate: {
                    headers: Joi.object({
                        dpop: Joi.string().required(),
                    }).unknown(),
                },

                /*
            // override the default auth strategy
            auth: {
                strategies: ['apiKey'],
                //mode: 'optional'
            },
            */

                //auth: false,

                description: 'greet me',
                tags: ['Tests'],
            },
        },
        (req) =>
            'Hello!' +
            (req.auth.credentials.user && 'name' in req.auth.credentials.user
                ? ` ${req.auth.credentials.user.name}`
                : '')
    );

    app.route(
        {
            path: '/info',
            method: 'GET',
        },
        (request) => {
            /*
            // Demonstrate the use of the Kaapi methods for the auth code flow
            oidcAuthCodeFlowDraft.kaapi().initiateAuthorization(request);
            oidcAuthCodeFlowDraft.kaapi().processAuthorization(request);
            oidcAuthCodeFlowDraft.kaapi().token(request);
            oidcAuthCodeFlowDraft.kaapi().verifyToken(request);
            */

            app.log.debug('request.app.oauth2?.proofThumbprint:', request.app.oauth2?.dpopThumbprint);
            const forwardedProto = request.headers['x-forwarded-proto'];
            const protocol = forwardedProto ? forwardedProto : request.server.info.protocol;
            const url = protocol + '://' + request.info.host + request.path;
            return url;
        }
    );

    app.route(deviceVerificationRoute);
});

appReady.then((app) => {
    app.log('Kaapi server was already resolved so no 2nd execution of the appReady promise');
});

jwksRotator.checkAndRotateKeys().catch(console.error);

setInterval(() => {
    jwksRotator.checkAndRotateKeys().catch(console.error);
}, 3600 * 1000); // 1h
