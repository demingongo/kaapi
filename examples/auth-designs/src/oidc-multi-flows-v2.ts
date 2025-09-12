import {
    OAuth2TokenResponse,
    BearerToken,
    //DPoPToken,
    //createInMemoryReplayStore,
    //OAuth2ClientCredentialsBuilder,
    OIDCClientCredentialsBuilder,
    MultipleFlowsBuilder,
    ClientSecretPost,
    ClientSecretBasic,
    OIDCAuthorizationCodeBuilder,
    NoneAuthMethod,
    OIDCDeviceAuthorizationBuilder,
    createInMemoryKeyStore,
    //ClientSecretJwt,
    //PrivateKeyJwt
} from '@kaapi/oauth2-auth-design';

const tokenType = new BearerToken()
//const tokenType = new DPoPToken()
//    .setTTL(300) // default 300s
//    .setReplayDetector(createInMemoryReplayStore()) // cache DPoP tokens
//    .validateTokenRequest(() => ({ isValid: true })) // for testing without validating dpop

export const OIDCMultiFlowsDesignV2 = MultipleFlowsBuilder
    .create()
    .tokenEndpoint('/oauth2/v2/token')
    .setPublicKeyExpiry(36000 * 2)
    .setJwksKeyStore(createInMemoryKeyStore()) // store for JWKS
    .jwksRoute(route => route.setPath('/oauth2/v2/keys')) // activates jwks uri
    .add(
        OIDCClientCredentialsBuilder
            .create()
            .setTokenType(tokenType)
            .setTokenTTL(36000)
            .addClientAuthenticationMethod(new ClientSecretPost())
            .addClientAuthenticationMethod(new ClientSecretBasic())
            //.jwksRoute(route => route.setPath('/oauth2/m2m/keys')) // activates jwks uri
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
                    .generateToken(async ({ clientId, clientSecret, ttl, scope, createJwtAccessToken, createIdToken }, _req) => {

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
                                const idToken = (scope?.split(' ').includes('openid') || undefined) && await createIdToken?.({
                                    sub: clientId
                                })
                                return new OAuth2TokenResponse({ access_token: accessToken })
                                    .setExpiresIn(ttl)
                                    .setRefreshToken(refreshToken)
                                    .setScope(scope?.split(' '))
                                    .setTokenType(tokenType)
                                    .setIdToken(
                                        idToken?.token
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
    )
    .add(
        OIDCAuthorizationCodeBuilder
            .create()
            .setTokenType(tokenType)
            .setTokenTTL(36000)
            .addClientAuthenticationMethod(new ClientSecretPost())
            .addClientAuthenticationMethod(new ClientSecretBasic())
            .addClientAuthenticationMethod(new NoneAuthMethod())
            //.jwksRoute(route => route.setPath('/oauth2/m2m/keys')) // activates jwks uri
            .useAccessTokenJwks(true) // activates JWT access token verification with JWKS
            .validate(async (_, { token, jwtAccessTokenPayload }) => {
                console.log('Auth Code jwtAccessTokenPayload=', jwtAccessTokenPayload)
                //#region @TODO: validation
                if (jwtAccessTokenPayload?.sub != '248289761001') {
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
            .authorizationRoute<object, { Payload: { email: string, password: string } }>(route =>
                route.setPath('/oauth2/v2/authorization')
                    .setClientId('testabc')
                    .setEmailField('email')
                    .setPasswordField('password')
                    .generateCode(async ({ clientId, codeChallenge, scope, nonce }, { payload: { email, password } }) => {
                        // validate and generate code
                        if (email == 'janed@example.com' && password == '1234') {
                            return { type: 'code', value: JSON.stringify({ clientId, codeChallenge, scope, nonce, user: '248289761001' })}
                        }

                        return null
                    }))
            .tokenRoute(route =>
                route//.setPath('/oauth2/m2m/token')
                    .generateToken(async ({ clientId, clientSecret, ttl, createJwtAccessToken, createIdToken, code, codeVerifier }, _req) => {

                        console.log('clientId', clientId)
                        console.log('clientSecret', clientSecret)
                        console.log('codeVerifier', codeVerifier)
                        console.log('code', code)
                        console.log('ttl', ttl)

                        const decodedCode = JSON.parse(code);
                        const scope: string = decodedCode.scope;

                        console.log('scope', scope)

                        if (!clientSecret) {
                            return { error: 'invalid_request', error_description: 'Token Request was missing the \'client_secret\' parameter.' }
                        }
                        if (!ttl) {
                            return { error: 'invalid_request', error_description: 'Missing ttl' }
                        }
                        try {
                            //#region @TODO: validation + token
                            if (createJwtAccessToken) {
                                const { token: accessToken } = await createJwtAccessToken({
                                    sub: '248289761001',
                                    name: 'Jane Doe',
                                })
                                const refreshToken = 'generated_refresh_token_from_ac'
                                const idToken = (scope?.split(' ').includes('openid') || undefined) && await createIdToken?.({
                                    sub: clientId
                                })
                                return new OAuth2TokenResponse({ access_token: accessToken })
                                    .setExpiresIn(ttl)
                                    .setRefreshToken((scope?.split(' ').includes('offline_access') || undefined) && refreshToken)
                                    .setScope(scope?.split(' '))
                                    .setTokenType(tokenType)
                                    .setIdToken(
                                        idToken?.token
                                    )
                            }
                            //#endregion @TODO: validation + token
                        } catch (err) {
                            console.error(err)
                        }

                        return null
                    }))
            .refreshTokenRoute(route => route.validate(
                async ({ clientId, clientSecret, refreshToken, scope, ttl, createJwtAccessToken, createIdToken }, _req, h) => {

                    console.log('clientId', clientId)
                    console.log('clientSecret', clientSecret)
                    console.log('refreshToken', refreshToken)
                    console.log('scope', scope)
                    console.log('ttl', ttl)

                    //#region @TODO: validation + refresh token
                    if (refreshToken === 'generated_refresh_token_from_ac' && createJwtAccessToken) {
                        const { token: accessToken } = await createJwtAccessToken({
                            sub: '248289761001',
                            name: 'Jane Doe',
                        })
                        const idToken = (scope?.split(' ').includes('openid') || undefined) && await createIdToken?.({
                            sub: clientId
                        })
                        return new OAuth2TokenResponse({ access_token: accessToken })
                            .setExpiresIn(ttl)
                            .setRefreshToken(refreshToken)
                            .setScope(scope?.split(' '))
                            .setTokenType(tokenType)
                            .setIdToken(
                                idToken?.token
                            )
                    }

                    //#endregion @TODO: validation + refresh token

                    // invalid so continue
                    return h.continue
                }))
            .setDescription('This API uses OAuth 2 with the authorization code grant flow. [More info](https://oauth.net/2/grant-types/authorization-code/)')
            .setScopes({
                openid: 'Required for OpenID Connect; enables ID token issuance.',
                profile: 'Access to basic profile information such as name and picture.',
                email: 'Access to the user\'s email address and its verification status.',
                offline_access: 'Request a refresh token to access resources when the user is offline.',
                read: 'Read access to protected resources.',
                write: 'Write access to protected resources.',
                admin: 'Grants administrative or elevated privileges.',
                'api:read': 'Read access to a specific API or resource group.'
            })
    )
    .add(
        OIDCDeviceAuthorizationBuilder
            .create()
            .setTokenType(tokenType)
            .setTokenTTL(36000)
            .addClientAuthenticationMethod(new NoneAuthMethod())
            //.jwksRoute(route => route.setPath('/oauth2/m2m/keys')) // activates jwks uri
            .useAccessTokenJwks(true) // activates JWT access token verification with JWKS
            .validate(async (_, { token, jwtAccessTokenPayload }) => {
                console.log('Device Code jwtAccessTokenPayload=', jwtAccessTokenPayload)
                //#region @TODO: validation
                if (jwtAccessTokenPayload?.sub != '248289761001') {
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
            .authorizationRoute<{ Payload: { email: string, password: string } }>(route =>
                route.setPath('/oauth2/v2/devicecode')
                    //.setClientId('testabc')
                    .generateCode(async ({ clientId, scope }) => {
                        // validate and generate code
                        if (clientId == 'testabc') {
                            const userCode = 'XYZ-789'
                            return {
                                device_code: JSON.stringify({ clientId, scope }),
                                expires_in: 900, // 15min
                                interval: 5, // 5s
                                user_code: userCode,
                                verification_uri: 'http://localhost:3000/oauth2/v2/activate',
                                verification_uri_complete: `http://localhost:3000/oauth2/v2/activate?user_code=${userCode}`
                            }
                        }

                        return null
                    }))
            .tokenRoute(route =>
                route//.setPath('/oauth2/m2m/token')
                    .generateToken(async ({ clientId, deviceCode, clientSecret, ttl, createJwtAccessToken, createIdToken }, _req) => {

                        console.log('clientId', clientId)
                        console.log('clientSecret', clientSecret)
                        console.log('deviceCode', deviceCode)
                        console.log('ttl', ttl)

                        const decodedCode = JSON.parse(deviceCode);
                        const scope: string = decodedCode.scope;

                        console.log('scope', scope)

                        if (clientId != 'testabc') {
                            return { error: 'access_denied', error_description: 'Token Request was missing the \'client_secret\' parameter.' }
                        }
                        if (!ttl) {
                            return { error: 'access_denied', error_description: 'Missing ttl' }
                        }
                        try {
                            //#region @TODO: validation + token
                            if (createJwtAccessToken) {
                                const { token: accessToken } = await createJwtAccessToken({
                                    sub: '248289761001',
                                    name: 'Jane Doe',
                                })
                                const refreshToken = 'generated_refresh_token_from_dc'

                                const idToken = (scope?.split(' ').includes('openid') || undefined) && await createIdToken?.({
                                    sub: clientId
                                })
                                return new OAuth2TokenResponse({ access_token: accessToken })
                                    .setExpiresIn(ttl)
                                    .setRefreshToken((scope?.split(' ').includes('offline_access') || undefined) && refreshToken)
                                    .setScope(scope?.split(' '))
                                    .setTokenType(tokenType)
                                    .setIdToken(
                                        idToken?.token
                                    )
                            }
                            //#endregion @TODO: validation + token
                        } catch (err) {
                            console.error(err)
                        }

                        return null
                    }))
            .refreshTokenRoute(route => route.validate(
                async ({ clientId, clientSecret, refreshToken, scope, ttl, createJwtAccessToken, createIdToken }, _req, h) => {

                    console.log('clientId', clientId)
                    console.log('clientSecret', clientSecret)
                    console.log('refreshToken', refreshToken)
                    console.log('scope', scope)
                    console.log('ttl', ttl)

                    //#region @TODO: validation + refresh token
                    if (refreshToken === 'generated_refresh_token_from_dc' && createJwtAccessToken) {
                        const { token: accessToken } = await createJwtAccessToken({
                            sub: '248289761001',
                            name: 'Jane Doe',
                        })
                        const idToken = (scope?.split(' ').includes('openid') || undefined) && await createIdToken?.({
                            sub: clientId
                        })
                        return new OAuth2TokenResponse({ access_token: accessToken })
                            .setExpiresIn(ttl)
                            .setRefreshToken(refreshToken)
                            .setScope(scope?.split(' '))
                            .setTokenType(tokenType)
                            .setIdToken(
                                idToken?.token
                            )
                    }

                    //#endregion @TODO: validation + refresh token

                    // invalid so continue
                    return h.continue
                }))
            .setDescription('This API uses OAuth 2 with the device authorization grant flow. [More info](https://www.oauth.com/oauth2-servers/device-flow/)')
            .setScopes({
                openid: 'Required for OpenID Connect; enables ID token issuance.',
                profile: 'Access to basic profile information such as name and picture.',
                email: 'Access to the user\'s email address and its verification status.',
                offline_access: 'Request a refresh token to access resources when the user is offline.'
            })
    )
    .build()