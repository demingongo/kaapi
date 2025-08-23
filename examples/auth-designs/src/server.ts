// server.ts

import {
    Kaapi
} from '@kaapi/kaapi'
import { customAuthDesign } from './plugins/customAuthDesign'

export const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    docs: {
        disabled: false,
        host: { url: 'http://localhost:3000' }
    },
    routes: {
        // to forcefully set it in all the routes (route.settings.auth)
        /*
        auth: {
            strategies: ['apiKey', 'oauth2-auth-design', 'exceptions'],
            mode: 'try'
        }
        */
    },
    extend: customAuthDesign
})

// register plugins
/*
app.extend(authenticationCodeDesign)
app.extend(apiKeyAuthDesign)
*/
//app.extend(customAuthDesign)


// to not set it in all the routes but will be used in routes
// with no auth defined
app.base().auth.default({
    strategies: customAuthDesign.getStrategies(),//['oauth2-authorization-code'],
    mode: 'try'
})
app.log('default strategy:', app.base().auth.settings.default)

/**
 * Export a promise for readiness
 */
export const appReady = app.base().register({
    name: 'myplugin',
    register(_server) {
        // register "myplugin" plugin
    },
}).then(async () => {
    app.log.info('"myplugin" plugin registered')
    await app.listen()
    return app
})