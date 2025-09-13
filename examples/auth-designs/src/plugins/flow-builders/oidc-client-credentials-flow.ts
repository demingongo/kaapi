import {
    BearerToken,
    ClientSecretBasic,
    ClientSecretPost,
    OAuth2ErrorCode,
    OAuth2TokenResponse,
    OIDCClientCredentialsBuilder
} from '@kaapi/oauth2-auth-design'

const tokenType = new BearerToken()

export default OIDCClientCredentialsBuilder
    .create()
    .setTokenType(tokenType)
    .setTokenTTL(600) // 10m
    .addClientAuthenticationMethod(new ClientSecretPost())
    .addClientAuthenticationMethod(new ClientSecretBasic())
    .useAccessTokenJwks(true) // activates JWT access token verification with JWKS
    .validate(async (_, { token, jwtAccessTokenPayload }) => {
        console.log('Client Credentials jwtAccessTokenPayload=', jwtAccessTokenPayload)
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
    .tokenRoute(route =>
        route//.setPath('/oauth2/m2m/token')
            .generateToken(async ({ clientId, clientSecret, ttl, scope, tokenType, createJwtAccessToken, createIdToken }, _req) => {

                console.log('clientId', clientId)
                console.log('clientSecret', clientSecret)
                console.log('ttl', ttl)

                if (!clientSecret) {
                    return { error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Token Request was missing the \'client_secret\' parameter.' }
                }
                if (!ttl) {
                    return { error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Missing ttl' }
                }
                try {
                    //#region @TODO: validation + token
                    if (createJwtAccessToken) {
                        const { token: accessToken } = await createJwtAccessToken({
                            machine: '248289761001',
                            name: 'Jane Doe',
                        })
                        const refreshToken = 'generated_refresh_token'/*await createJwtAccessToken({
                                machine: '248289761001',
                                name: 'Jane Doe',
                                refresh: true,
                                exp: ttl * 2
                            })*/
                        return new OAuth2TokenResponse({ access_token: accessToken })
                            .setExpiresIn(ttl)
                            .setRefreshToken(refreshToken)
                            .setScope(scope?.split(' '))
                            .setTokenType(tokenType)
                            .setIdToken(
                                (scope?.split(' ').includes('openid') || undefined) && (await createIdToken?.({
                                    sub: clientId
                                }))?.token
                            )
                    }
                    //#endregion @TODO: validation + token
                } catch (err) {
                    console.error(err)
                }

                return null
            }))
    .setDescription('This API uses OAuth 2 with the client credentials grant flow. [More info](https://www.oauth.com/oauth2-servers/access-tokens/client-credentials/)')
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