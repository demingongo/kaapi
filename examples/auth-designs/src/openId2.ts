import Boom from '@hapi/boom'

import {
    OAuth2ACAuthorizationRoute,
    OAuth2RefreshTokenHandler,
    OAuth2RefreshTokenRoute,
    OAuth2ACTokenHandler,
    OAuth2ACTokenRoute,
    OpenIDAuthDesign,
    OpenIDJWKSRoute,
    OAuth2TokenResponse
} from '@kaapi/oauth2-auth-design';


export const openIDDesign2 = new OpenIDAuthDesign(
    {
        jwksRoute: new OpenIDJWKSRoute('/openid/jwks'),
        /*
        userInfoRoute: new OpenIDUserInfoRoute('/openid/session', async () => {
            return {
                sub: '248289761001',
                name: 'Jane Doe',
                given_name: 'Jane',
                family_name: 'Doe',
                preferred_username: 'janed',
                email: 'janed@example.com',
                email_verified: true,
                picture: 'https://example.com/janed.jpg'
            }
        }),
        */
        authorizationRoute: OAuth2ACAuthorizationRoute.buildDefault<object, { Payload: { user: string, pass: string } }>()
            .setPath('/oauth2/ac/login')
            .setClientId('testabc')
            .setEmailField('user')
            .setPasswordField('pass')
            .generateCode(async ({ clientId, codeChallenge, scope, nonce }, { payload: { user, pass } }) => {
                // validate and generate code
                if (user == 'janed@example.com' && pass == '1234') {
                    return JSON.stringify({ clientId, codeChallenge, scope, nonce, user: '248289761001' })
                }

                return null
            }),
        tokenRoute: new OAuth2ACTokenRoute(
            '/oauth2/ac/token',
            (async ({ clientId, clientSecret, code, codeVerifier, redirectUri, createIDToken }, _req, h) => {

                console.log('code', code)
                console.log('codeVerifier', codeVerifier)
                console.log('redirectUri', redirectUri)
                console.log('clientId', clientId)
                console.log('clientSecret', clientSecret)

                if (!clientSecret && !codeVerifier) {
                    return h.response({ error: 'invalid_client', error_description: 'Request was missing the \'client_secret\' parameter.' }).code(400)
                }
                try {
                    //#region @TODO: validation + token
                    const accessToken = 'generated_access_token'
                    const refreshToken = 'generated_refresh_token'
                    const scope: string[] = ['openid']
                    return h.response(
                        new OAuth2TokenResponse({access_token: accessToken})
                            .setExpiresIn(36000)
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
                            )).code(200)
                    //#endregion @TODO: validation + token
                } catch (err) {
                    console.error(err)
                }

                return h.response({ error: 'invalid_request' }).code(400)
            }) as OAuth2ACTokenHandler,
        ),
        refreshTokenRoute: new OAuth2RefreshTokenRoute(
            '/oauth2/ac/token',
            (async ({ clientId, clientSecret, refreshToken, scope }, _req, h) => {

                console.log('clientId', clientId)
                console.log('clientSecret', clientSecret)
                console.log('refreshToken', refreshToken)
                console.log('scope', scope)

                //#region @TODO: validation + refresh token

                //#endregion @TODO: validation + refresh token

                return h.response({ error: 'invalid_token' }).code(400)
            }) as OAuth2RefreshTokenHandler,
        ),
        options: {
            validate: async (_req, token, h) => {
                if (token) {
                    //#region @TODO: validation
                    if (token != 'generated_access_token') {
                        return {}
                    }

                    //#endregion @TODO: validation

                    // authorized to go further
                    return {
                        isValid: !!token,
                        credentials: {}
                    }
                }

                return h.unauthenticated(Boom.unauthorized('unauthorized', 'Bearer'))
            },
        }
    }
)
    .setDescription('This API uses OAuth 2 with the authentication code grant flow. [More info](https://oauth.net/2/grant-types/authorization-code/)')
    .setScopes({
        profile: 'Access to your profile information',
        email: 'Access to your email address',
        offline_access: 'Access to your data when you are not connected'
    })
    .setTokenTTL(36000)