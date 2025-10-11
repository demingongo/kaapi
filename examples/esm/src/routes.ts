// routes.ts
import { app } from './server';
import Boom from '@hapi/boom';
import Joi from 'joi';

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
            description: 'greet me',
            tags: ['Tests'],
        },
    },
    (req) =>
        'Hello!' +
        (req.auth.credentials.user && 'name' in req.auth.credentials.user ? ` ${req.auth.credentials.user.name}` : '')
);

app.route(
    {
        path: '/info',
        method: 'GET',
    },
    (request) => {
        app.log.debug('request.app.oauth2?.proofThumbprint:', request.app.oauth2?.dpopThumbprint);
        const forwardedProto = request.headers['x-forwarded-proto'];
        const protocol = forwardedProto ? forwardedProto : request.server.info.protocol;
        const url = protocol + '://' + request.info.host + request.path;
        return url;
    }
);
