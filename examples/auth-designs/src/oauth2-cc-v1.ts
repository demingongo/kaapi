import {
    OAuth2TokenResponse,
    BearerToken,
    //DPoPToken,
    ClientSecretBasic,
    ClientSecretPost,
    getInMemoryJWKSStore,
    OAuth2ClientCredentialsBuilder,
    //ClientSecretPost,
    //ClientSecretBasic,
    //ClientSecretJwt,
    //PrivateKeyJwt
} from '@kaapi/oauth2-auth-design';

const tokenType = new BearerToken()
//const tokenType = new DPoPToken()
//    .setTTL(300)
//    .validateTokenRequest(() => ({ isValid: true })) // for testing without validating dpop

export const clientCredentialsDesignV1 = OAuth2ClientCredentialsBuilder
    .create()
    .setTokenType(tokenType)
    .setTokenTTL(36000)
    .addClientAuthenticationMethod(new ClientSecretPost())
    .addClientAuthenticationMethod(new ClientSecretBasic())
    .setJwksStore(getInMemoryJWKSStore(36000 / 2)) // store for JWKS
    .jwksRoute(route => route.setPath('/oauth2/m2m/keys')) // activates jwks uri
    .useAccessTokenJwks(true) // activates JWT access token verification with JWKS
    .validate(async (_, { token, jwtAccessTokenPayload }) => {
        console.log('jwtAccessTokenPayload=', jwtAccessTokenPayload)
        //#region @TODO: validation
        if (jwtAccessTokenPayload?.machine != '248289761001') {
            return { isValid: false }
        }

        //#endregion @TODO: validation

        // authorized to go further
        return {
            isValid: !!token,
            credentials: {
                user: {
                    sub: '248289761001',
                    name: 'Jane Doe',
                    given_name: 'Jane',
                }
            }
        }
    })
    .tokenRoute(route => route.setPath('/oauth2/m2m/token')
        .generateToken(async ({ clientId, clientSecret, ttl, scope, createJwtAccessToken }, _req) => {

            console.log('clientId', clientId)
            console.log('clientSecret', clientSecret)
            console.log('ttl', ttl)

            if (!clientSecret) {
                return { error: 'invalid_request', error_description: 'Token Request was missing the \'client_secret\' parameter.' }
            }
            if (!ttl) {
                return { error: 'invalid_request', error_description: 'Missing ttl' }
            }
            try {
                //#region @TODO: validation + token
                if (createJwtAccessToken) {
                    const accessToken = await createJwtAccessToken({
                        machine: '248289761001',
                        name: 'Jane Doe',
                    })
                    const refreshToken = await createJwtAccessToken({
                        machine: '248289761001',
                        name: 'Jane Doe',
                        exp: ttl * 2
                    })
                    return new OAuth2TokenResponse({ access_token: accessToken })
                        .setExpiresIn(ttl)
                        .setRefreshToken(refreshToken)
                        .setScope(scope)
                        .setTokenType(tokenType)
                }
                //#endregion @TODO: validation + token
            } catch (err) {
                console.error(err)
            }

            return null
        }))
    .refreshTokenRoute('/oauth2/m2m/token',
        (async ({ clientId, clientSecret, refreshToken, scope, ttl }, _req, h) => {

            console.log('clientId', clientId)
            console.log('clientSecret', clientSecret)
            console.log('refreshToken', refreshToken)
            console.log('scope', scope)
            console.log('ttl', ttl)

            //#region @TODO: validation + refresh token

            //#endregion @TODO: validation + refresh token

            return h.response({ error: 'invalid_token' }).code(400)
        }))
    .setDescription('This API uses OAuth 2 with the authentication code grant flow. [More info](https://oauth.net/2/grant-types/authorization-code/)')
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
    .build();