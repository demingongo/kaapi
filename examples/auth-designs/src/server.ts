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
        disabled: false
    },
    routes: {
        // to forcefully set it in all the routes (route.settings.auth)
        /*
        auth: {
            strategies: ['apiKey', 'auth-design-oauth2', 'exceptions'],
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
app.idle().server.auth.default({
    strategies: customAuthDesign.getStrategies(),//['My bearer is your bearer', 'apiKey', 'oauth2-authorization-code'],
    mode: 'try'
})
app.log('default strategy:', app.idle().server.auth.settings.default)

/**
 * Export a promise for readiness
 */
export const appReady = app.idle().server.register({
    name: 'myplugin',
    register(_server) {
        // register "myplugin" plugin
    },
}).then(async () => {
    app.log.info('"myplugin" plugin registered')
    await app.listen()
    return app
})