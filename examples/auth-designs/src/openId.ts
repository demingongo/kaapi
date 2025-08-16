import Boom from '@hapi/boom'

import {
    OAuth2ACAuthorizationHandler,
    OAuth2ACAuthorizationRoute,
    OAuth2RefreshTokenHandler,
    OAuth2RefreshTokenRoute,
    OAuth2ACTokenHandler,
    OAuth2ACTokenRoute,
    OpenIDAuthDesign,
    OpenIDJWKSRoute,
    OAuth2TokenResponse
} from '@kaapi/oauth2-auth-design';

function buildSignInHTML(options: { title: string, error?: string }) {
    return `<!DOCTYPE html>
<html lang="en">
 <head>
  <meta charset="UTF-8">
  <meta name="Generator" content="EditPlus®">
  <meta name="Author" content="">
  <meta name="Keywords" content="">
  <meta name="Description" content="">
  <title>${options.title}</title>
  <style>
    .error {
      color: red;
      font-weight: bold;
    }
  </style>
 </head>
 <body>
  <form method="POST">
  <div class="error">
    ${options.error || ''}
  </div>
  <div>
  <input type="email" id="email" name="email" placeholder="email" autocomplete="email" />
  <input type="password" id="password" name="password" placeholder="password" />
  </div>
  <div>
  <button type="submit">
    Submit
  </button>
  </div>
  </form>
 </body>
</html>`
}

export const openIDDesign = new OpenIDAuthDesign(
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
        authorizationRoute: new OAuth2ACAuthorizationRoute(
            '/oauth2/ac/login',
            (async ({ clientId, redirectUri, codeChallenge, scope, state }, { query: { nonce } }, h) => {

                console.log('clientId', clientId)
                console.log('codeChallenge', codeChallenge)
                console.log('redirectUri', redirectUri)
                console.log('scope', scope)
                console.log('state', state)
                console.log('nonce', nonce)

                if (clientId) {
                    //#region @TODO: validation

                    //#endregion @TODO: validation
                } else {
                    return h.response({ error: 'Bad \'client_id\' parameter.' }).code(400)
                }

                // render form
                return h.response(
                    buildSignInHTML({
                        title: 'Sign in'
                    })
                ).code(200).type('text/html')
            }) as OAuth2ACAuthorizationHandler<{ Query: { nonce?: string } }>,
            (async ({ clientId, redirectUri, codeChallenge, scope, state }, { query: { nonce }, payload: { email, password } }, h) => {
                console.log('clientId', clientId)
                console.log('codeChallenge', codeChallenge)
                console.log('redirectUri', redirectUri)
                console.log('scope', scope)
                console.log('state', state)
                console.log('nonce', nonce)

                let error = ''

                if (clientId && email && password) {
                    //#region @TODO: validation + code
                    const code = 'generated_code'
                    if (email == 'janed@example.com' && password == '1234') {
                        return h.redirect(`${redirectUri}?code=${code}${state ? `&state=${state}` : ''}`)
                    } else {
                        error = 'wrong credentials'
                    }
                    //#endregion @TODO: validation + code generation
                } else {
                    error = 'invalid request'
                }

                // render form
                return h.response(
                    buildSignInHTML({
                        title: 'Sign in',
                        error: error || 'something went wrong'
                    })
                ).code(200).type('text/html')
            }) as OAuth2ACAuthorizationHandler<{ Query: { nonce?: string }, Payload: { email: string, password: string } }>
        ),
        tokenRoute: new OAuth2ACTokenRoute(
            '/oauth2/ac/token',
            (async ({ clientId, clientSecret, code, codeVerifier, redirectUri, createIDToken }, _req, h) => {

                console.log('code', code)
                console.log('codeVerifier', codeVerifier)
                console.log('redirectUri', redirectUri)
                console.log('clientId', clientId)
                console.log('clientSecret', clientSecret)

                if (!clientSecret && !codeVerifier) {
                    return h.response({ error: 'invalid_request', error_description: 'Token Request was missing the \'client_secret\' parameter.' }).code(400)
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