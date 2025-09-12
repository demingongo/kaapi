import {
    //BearerToken,
    ClientSecretBasic,
    ClientSecretPost,
    createInMemoryReplayStore,
    DPoPToken,
    NoneAuthMethod,
    OAuth2TokenResponse,
    OIDCAuthorizationCodeBuilder
} from '@kaapi/oauth2-auth-design'

//const tokenType = new BearerToken()
const tokenType = new DPoPToken()
    .setTTL(300) // default 300s
    .setReplayDetector(createInMemoryReplayStore()) // cache DPoP tokens
    .validateTokenRequest(() => ({ isValid: true })) // for testing without validating dpop

export default OIDCAuthorizationCodeBuilder
    .create()
    .setTokenType(tokenType)
    .setTokenTTL(3600) // 1h
    .addClientAuthenticationMethod(new ClientSecretPost())
    .addClientAuthenticationMethod(new ClientSecretBasic())
    .addClientAuthenticationMethod(new NoneAuthMethod())
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
        route.setPath('/oauth2/v2/authorize')
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
            .generateToken(async ({ clientId, clientSecret, ttl, tokenType, createJwtAccessToken, createIdToken, code, codeVerifier /*, verifyCodeVerifier*/ }, _req) => {

                console.log('clientId', clientId)
                console.log('clientSecret', clientSecret)
                console.log('codeVerifier', codeVerifier)
                console.log('code', code)
                console.log('ttl', ttl)

                const decodedCode = JSON.parse(code);
                const scope = decodedCode.scope;

                console.log('scope', scope)

                if (!clientSecret && !codeVerifier) {
                    return { error: 'invalid_request', error_description: 'Token Request was missing the \'client_secret\' parameter.' }
                }
                if (!ttl) {
                    return { error: 'invalid_request', error_description: 'Missing ttl' }
                }

                //if (codeVerifier) {
                //    verifyCodeVerifier(
                //        codeVerifier, codeChallenge
                //    )
                //}

                try {
                    //#region @TODO: validation + token
                    if (createJwtAccessToken) {
                        const { token: accessToken } = await createJwtAccessToken({
                            sub: '248289761001',
                            name: 'Jane Doe',
                        })
                        const refreshToken = 'generated_refresh_token_from_ac'
                        return new OAuth2TokenResponse({ access_token: accessToken })
                            .setExpiresIn(ttl)
                            .setRefreshToken((scope?.split(' ').includes('offline_access') || undefined) && refreshToken)
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
    .refreshTokenRoute(route => route.generateToken(async ({ clientId, clientSecret, refreshToken, scope, ttl, tokenType, createJwtAccessToken, createIdToken }, _req) => {

        console.log('clientId', clientId)
        console.log('clientSecret', clientSecret)
        console.log('refreshToken', refreshToken)
        console.log('scope', scope)
        console.log('ttl', ttl)

        if (!ttl) {
            return { error: 'invalid_request', error_description: 'Missing ttl' }
        }
        try {
            //#region @TODO: validation + token
            if (refreshToken === 'generated_refresh_token_from_ac' && createJwtAccessToken) {
                const { token: accessToken } = await createJwtAccessToken({
                    sub: '248289761001',
                    name: 'Jane Doe',
                })
                const newRefreshToken = (!scope || (scope && scope?.split(' ').includes('offline_access')) || undefined) && 'generated_refresh_token_from_ac'
                return new OAuth2TokenResponse({ access_token: accessToken })
                    .setExpiresIn(ttl)
                    .setRefreshToken(newRefreshToken)
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