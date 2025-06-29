import { KaapiServer } from '@kaapi/server'

const kaapiServer = new KaapiServer({
    port: 3000,
    host: 'localhost',
    routes: {
        cors: true
    },
    auth: {
        validate: async (_request, token, _h) => {
            console.log('my token is', token)
            return {
                isValid: !!token,
                credentials: { user: { username: 'Niko' } }
            }
        },
    }
})

kaapiServer.route<{ Query: { name?: string } }>({
    method: 'GET',
    path: '/',
}, ({ query: { name } }) => `Hello ${name || 'World'}!`)

kaapiServer.route<{ AuthUser: { username: string } }>({
    method: 'GET',
    path: '/myprofile',
    auth: true
}, ({ auth: { credentials: { user } } }) => `Hello ${user?.username || 'World'}!`)

kaapiServer.route({
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

kaapiServer.server.start().then(
    () => console.log('Server running on %s', kaapiServer.server.info.uri),
    console.error
)