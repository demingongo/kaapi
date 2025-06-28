import { KaviServer } from '@kavi/server'

const kaviServer = new KaviServer({
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

kaviServer.route<{ Query: { name?: string }  }>({
    method: 'GET',
    path: '/',
}, ({ query: { name } }) => `Hello ${name || 'World'}!`)

kaviServer.route<{ AuthUser: { username: string }  }>({
    method: 'GET',
    path: '/myprofile',
    auth: true
}, ({ auth: { credentials: { user } } }) => `Hello ${user?.username || 'World'}!`)

kaviServer.server.start().then(
    () => console.log('Server running on %s', kaviServer.server.info.uri),
    console.error
)