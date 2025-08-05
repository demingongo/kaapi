
import {
    Kaapi
} from '@kaapi/kaapi'
import Boom from '@hapi/boom'
import { authenticationCodeDesign } from './oauth2Plugins'
import { apiKeyAuthDesign } from './plugins/apiKeyDesign'

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    docs: {
        disabled: false
    }
})

// register plugins
app.plug(authenticationCodeDesign)
app.plug(apiKeyAuthDesign)

// 404
app.route({}, () => Boom.notFound('Nothing here'))

app.route({
    method: 'GET',
    path: '/',
    auth: true,
    options: {
        auth: {
            strategies: ['auth-design-oauth2', 'apiKey']
        },
        description: 'greet me',
        tags: ['Tests']
    }
}, () => 'Hello!')
