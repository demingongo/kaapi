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

kaapiServer.base.auth.default({
    strategy: 'kaapi',
    mode: 'try'
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
}, (_) => `<!DOCTYPE html>
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
</html>`)

kaapiServer.base.start().then(
    () => console.log('Server running on %s', kaapiServer.base.info.uri),
    console.error
)