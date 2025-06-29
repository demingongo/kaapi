import { Kavi } from './app';
import Boom from '@hapi/boom'

const app = new Kavi({
    port: 3000,
    host: 'localhost',
    auth: {
        validate: async (req, token, h) => {
            console.log('my token is', token)
            console.log('route description=', req.route.settings.description)
            console.log('route tags=', req.route.settings.tags)

            if (!token) {
                // can call h.authenticated/h.unauthenticated directly
                // if you know what you are doing
                return h.unauthenticated(Boom.unauthorized('Sorry bud, you are NOT authorized', 'Bearer'))
            }

            return {
                isValid: !!token,
                credentials: { user: { username: 'Niko' } },
                message: !token ? 'Sorry buddy, you are UNauthorized' : undefined
            }
        },
    },
    loggerOptions: {
        level: 'debug'
    }
})

app.route<{ Query: { name?: string } }>({
    method: 'GET',
    path: '/',
}, ({ query: { name } }) => `Hello ${name || 'World'}!`)

app.route<{ AuthUser: { username: string } }>({
    method: 'GET',
    path: '/myprofile',
    auth: true,
    options: {
        description: 'Me',
        tags: ['Session']
    }
}, ({ auth: { credentials: { user } } }) => `Hello ${user?.username || 'World'}!`)

app.route({
    method: 'GET',
    path: '/myhtml',
}, (_, h) => h.response(`<!DOCTYPE html>
<html lang="en">
 <head>
  <meta charset="UTF-8">
  <meta name="Generator" content="EditPlus®">
  <meta name="Author" content="">
  <meta name="Keywords" content="">
  <meta name="Description" content="">
  <title>HTML Page</title>
 </head>
 <body>
  <h2>One Good Ol' HTML Page!</h2>
 </body>
</html>`).type('text/html').code(200))