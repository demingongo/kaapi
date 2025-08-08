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
})

appReady.then(app => {
    app.log('Kaapi server was already resolved so no 2nd execution of the appReady promise')
})