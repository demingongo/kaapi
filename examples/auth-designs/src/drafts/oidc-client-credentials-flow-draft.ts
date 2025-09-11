import {
    BearerToken,
    ClientSecretBasic,
    ClientSecretPost,
    createInMemoryKeyStore,
    OAuth2TokenResponse,
    OIDCClientCredentialsBuilder
} from '@kaapi/oauth2-auth-design'

import logger from './logger'
import db from './database'

export default OIDCClientCredentialsBuilder
    .create({ logger })
    .setTokenType(new BearerToken())                                // optional, default BearerToken
    .setTokenTTL(600)                                               // 10m
    .addClientAuthenticationMethod(new ClientSecretBasic())         // client authentication methods
    .addClientAuthenticationMethod(new ClientSecretPost())          // client authentication methods
    .useAccessTokenJwks(true)                                       // activates JWT access token verification with JWKS
    .jwksRoute(route => route.setPath('/.well-known/jwks.json'))    // optional, default '/oauth2/keys'
    .setJwksKeyStore(createInMemoryKeyStore())                      // store for jwks, in-memory for dev
    .validate(async (_, { jwtAccessTokenPayload }) => {             // auth scheme
        // db query
        const user = jwtAccessTokenPayload?.type === 'machine' &&
            jwtAccessTokenPayload?.machine
            ? await db.users.findById(`${jwtAccessTokenPayload.machine}`)
            : undefined;

        // not found
        if (!user) {
            return { isValid: false }
        }

        // authorized
        return {
            isValid: true,
            credentials: {
                user: {
                    machine: user.id,
                    name: user.name,
                    type: 'machine'
                }
            }
        }
    })
    .tokenRoute(route =>
        route
            .setPath('/oauth2/token') // optional, default '/oauth2/token'
            .generateToken(async ({ clientId, clientSecret, ttl, scope, tokenType, createJwtAccessToken, createIdToken }, _req) => {

                // no secret
                if (!clientSecret) {
                    return { error: 'invalid_request', error_description: 'Token Request was missing the \'client_secret\' parameter.' }
                }

                // no token ttl
                if (!ttl) {
                    return { error: 'invalid_request', error_description: 'Missing ttl' }
                }

                // db query + secret validation
                const client = await db.clients.findByCredentials(clientId, clientSecret)

                // client not found
                if (!client) {
                    return { error: 'invalid_client' }
                }

                try {
                    if (createJwtAccessToken) {
                        const { token: accessToken } = await createJwtAccessToken({
                            machine: client.details?.id,
                            name: client.details?.name,
                            type: 'machine'
                        })
                        return new OAuth2TokenResponse({ access_token: accessToken })
                            .setExpiresIn(ttl)
                            .setScope(scope?.split(' '))
                            .setTokenType(tokenType)
                            .setIdToken(
                                (scope?.split(' ').includes('openid') || undefined) && (await createIdToken?.({
                                    sub: clientId
                                }))?.token
                            ) // add id_token if scope has 'openid'
                    }
                } catch (err) {
                    console.error(err)
                }

                return null
            }))
    .setDescription('Client credentials grant flow. [More info](https://www.oauth.com/oauth2-servers/access-tokens/client-credentials/)')
    .setScopes({
        'read:data': 'Allows the client to retrieve or query data from the service.',
        'write:data': 'Allows the client to create or update data in the service.',
        'delete:data': 'Allows the client to remove data from the service.',
        'read:config': 'Allows the client to access configuration or metadata settings.',
        'write:config': 'Allows the client to modify configuration or metadata settings.',
        'read:logs': 'Allows the client to retrieve logs or audit trails from the service.',
        'write:logs': 'Allows the client to send or store logs into the system.',
        'execute:tasks': 'Allows the client to trigger or run predefined tasks or jobs.',
        'manage:tokens': 'Allows the client to manage access or refresh tokens for automation.',
        'admin:all': 'Grants full administrative access to all available resources and operations.'
    })
//.build()