import {
    OAuth2TokenResponse,
    //OAuth2AuthorizationCode,
    BearerToken,
    OpenIDAuthDesignBuilder,
    ClientSecretBasic,
    ClientSecretPost,
    getInMemoryJWKSStore,
    //ClientSecretPost,
    //ClientSecretBasic,
    //ClientSecretJwt,
    //PrivateKeyJwt, 
    //DPoPToken 
} from '@kaapi/oauth2-auth-design';

const tokenType = new BearerToken()

export const openIDDesignV1 = OpenIDAuthDesignBuilder
    .create()
    .setTokenType(tokenType)
    .setTokenTTL(36000)
    .addClientAuthenticationMethod(new ClientSecretPost())
    .addClientAuthenticationMethod(new ClientSecretBasic())
    //.withoutPkce() // to remove 'none'
    .additionalConfiguration({
        // to announce the use of dpop in openid-configuration
        ...tokenType.configuration
    })
    .validate(async (req, token) => {
        console.log('validate => req.app.oauth2.proofThumbprint:', req.app.oauth2?.dpopThumbprint)
        console.log('token=', token)
        //#region @TODO: validation
        if (token != 'generated_access_token') {
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
    .setJwksStore(getInMemoryJWKSStore())
    .jwksRoute(route => route.setPath('/oauth2/v1/keys'))
    .authorizationRoute<object, { Payload: { email: string, password: string } }>(route => route
        .setPath('/oauth2/v1/authorization')
        .setClientId('testabc')
        .setEmailField('email')
        .setPasswordField('password')
        .generateCode(async ({ clientId, codeChallenge, scope, nonce }, { payload: { email, password } }) => {
            // validate and generate code
            if (email == 'janed@example.com' && password == '1234') {
                return JSON.stringify({ clientId, codeChallenge, scope, nonce, user: '248289761001' })
            }

            return null
        }))
    .tokenRoute(route => route.setPath('/oauth2/v1/token')
        .generateToken(async ({ clientId, clientSecret, code, codeVerifier, redirectUri, ttl, createIDToken }, _req) => {

            console.log('code', code)
            console.log('codeVerifier', codeVerifier)
            console.log('redirectUri', redirectUri)
            console.log('clientId', clientId)
            console.log('clientSecret', clientSecret)
            console.log('ttl', ttl)

            if (!clientSecret && !codeVerifier) {
                return { error: 'invalid_request', error_description: 'Token Request was missing the \'client_secret\' parameter.' }
            }
            try {
                //#region @TODO: validation + token
                const accessToken = 'generated_access_token'
                const refreshToken = 'generated_refresh_token'
                const scope: string[] = ['openid']
                return new OAuth2TokenResponse({ access_token: accessToken })
                    .setExpiresIn(ttl)
                    .setRefreshToken(refreshToken)
                    .setScope(scope)
                    .setIDToken(
                        await createIDToken?.({
                            sub: '248289761001',
                            name: 'Jane Doe',
                            given_name: 'Jane',
                            family_name: 'Doe',
                            preferred_username: 'janed',
                            email: 'janed@example.com',
                            email_verified: true,
                            picture: 'https://example.com/janed.jpg'
                        })
                    )
                    .setTokenType(tokenType)
                //#endregion @TODO: validation + token
            } catch (err) {
                console.error(err)
            }

            return null
        }))
    .refreshTokenRoute('/oauth2/ac/token',
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
        profile: 'Access to your profile information',
        email: 'Access to your email address',
        offline_access: 'Access to your data when you are not connected'
    })
    .build();