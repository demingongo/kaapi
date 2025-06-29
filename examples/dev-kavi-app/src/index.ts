import { Kavi } from './app';

const app = new Kavi({
    port: 3000,
    host: 'localhost',
    auth: {
        validate: async (_request, token, _h) => {
            console.log('my token is', token)
            return {
                isValid: !!token,
                credentials: { user: { username: 'Niko' } }
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
    auth: true
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