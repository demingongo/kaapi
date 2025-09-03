import {
    BearerToken,
    NoneAuthMethod,
    OAuth2TokenResponse,
    OIDCDeviceAuthorizationBuilder
} from '@kaapi/oauth2-auth-design'

const tokenType = new BearerToken()

export default OIDCDeviceAuthorizationBuilder
    .create()
    .setTokenType(tokenType)
    .setTokenTTL(36000)
    .addClientAuthenticationMethod(new NoneAuthMethod())
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
        route.generateToken(async ({ clientId, deviceCode, clientSecret, ttl, createJwtAccessToken, createIdToken }, _req) => {

                console.log('clientId', clientId)
                console.log('clientSecret', clientSecret)
                console.log('deviceCode', deviceCode)
                console.log('ttl', ttl)

                const decodedCode = JSON.parse(deviceCode);
                const scope = decodedCode.scope;

                console.log('scope', scope)

                if (clientId != 'testabc') {
                    return { error: 'access_denied', error_description: 'Token Request was missing the \'clientId\' parameter.' }
                }
                if (!ttl) {
                    return { error: 'access_denied', error_description: 'Missing ttl' }
                }
                try {
                    //#region @TODO: validation + token
                    if (createJwtAccessToken) {
                        const accessToken = await createJwtAccessToken({
                            sub: '248289761001',
                            name: 'Jane Doe',
                        })
                        const refreshToken = 'generated_refresh_token_from_dc'
                        return new OAuth2TokenResponse({ access_token: accessToken })
                            .setExpiresIn(ttl)
                            .setRefreshToken((scope?.split(' ').includes('offline_access') || undefined) && refreshToken)
                            .setScope(scope?.split(' '))
                            .setTokenType(tokenType)
                            .setIDToken(
                                (scope?.split(' ').includes('openid') || undefined) && await createIdToken?.({
                                    sub: clientId
                                })
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
                const accessToken = await createJwtAccessToken({
                    sub: '248289761001',
                    name: 'Jane Doe',
                })
                const newRefreshToken = (!scope || scope && scope?.split(' ').includes('offline_access') || undefined) && 'generated_refresh_token_from_ac'
                return new OAuth2TokenResponse({ access_token: accessToken })
                    .setExpiresIn(ttl)
                    .setRefreshToken(newRefreshToken)
                    .setScope(scope?.split(' '))
                    .setTokenType(tokenType)
                    .setIDToken(
                        (scope?.split(' ').includes('openid') || undefined) && await createIdToken?.({
                            sub: clientId
                        })
                    )
            }

            //#endregion @TODO: validation + refresh token

            // invalid so continue
            return h.continue
        }).generateToken(async ({ clientId, clientSecret, scope, ttl, createJwtAccessToken, createIdToken }, _req) => {

                console.log('clientId', clientId)
                console.log('clientSecret', clientSecret)
                console.log('ttl', ttl)
                console.log('scope', scope)

                if (clientId != 'testabc') {
                    return { error: 'access_denied', error_description: 'Token Request was missing the \'clientId\' parameter.' }
                }
                if (!ttl) {
                    return { error: 'access_denied', error_description: 'Missing ttl' }
                }
                try {
                    //#region @TODO: validation + token
                    if (createJwtAccessToken) {
                        const accessToken = await createJwtAccessToken({
                            sub: '248289761001',
                            name: 'Jane Doe',
                        })
                        const refreshToken = 'generated_refresh_token_from_dc'
                        return new OAuth2TokenResponse({ access_token: accessToken })
                            .setExpiresIn(ttl)
                            .setRefreshToken((scope?.split(' ').includes('offline_access') || undefined) && refreshToken)
                            .setScope(scope?.split(' '))
                            .setTokenType(tokenType)
                            .setIDToken(
                                (scope?.split(' ').includes('openid') || undefined) && await createIdToken?.({
                                    sub: clientId
                                })
                            )
                    }
                    //#endregion @TODO: validation + token
                } catch (err) {
                    console.error(err)
                }

                return null
            }))
    .setDescription('This API uses OAuth 2 with the device authorization grant flow. [More info](https://www.oauth.com/oauth2-servers/device-flow/)')
    .setScopes({
        openid: 'Required for OpenID Connect; enables ID token issuance.',
        profile: 'Access to basic profile information such as name and picture.',
        email: 'Access to the user\'s email address and its verification status.',
        offline_access: 'Request a refresh token to access resources when the user is offline.'
    })