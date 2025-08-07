import {
    Kaapi
} from '@kaapi/kaapi'
import Boom from '@hapi/boom'
import { customAuthDesign } from './plugins/customAuthDesign'

const app = new Kaapi({
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

// to not set it in all the routes but will be used in routes
// with no auth defined
app.idle().server.auth.default({
    strategies: ['apiKey', 'auth-design-oauth2'],
    mode: 'try'
})



// register plugins
/*
app.extend(authenticationCodeDesign)
app.extend(apiKeyAuthDesign)
*/
//app.extend(customAuthDesign)

console.log('default strategy:', app.idle().server.auth.settings.default)

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