// index.ts

import Boom from '@hapi/boom'
import { appReady } from './server'

appReady.then(app => {
    app.log(`Kaapi server is ready: ${app}`)

    // 404
    app.route({
        auth: false
    }, () => Boom.notFound('Nothing here'))

    app.route({
        method: 'GET',
        path: '/',
        auth: true,
        options: {

            /*
            // override the default auth strategy
            auth: {
                strategies: ['apiKey'],
                //mode: 'optional'
            },
            */

            //auth: false,

            description: 'greet me',
            tags: ['Tests']
        }
    }, () => 'Hello!')

    app.route({
        path: '/info'
    }, (request) => {
        app.log.debug('request.app.oauth2?.proofThumbprint:', request.app.oauth2?.proofThumbprint)
        const forwardedProto = request.headers['x-forwarded-proto'];
        const protocol = forwardedProto ? forwardedProto : request.server.info.protocol;
        const url = protocol
            + '://'
            + request.info.host
            + request.path
        return url
    })
})

appReady.then(app => {
    app.log('Kaapi server was already resolved so no 2nd execution of the appReady promise')
})