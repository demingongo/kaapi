/*
import {
    OIDCAuthorizationCodeBuilder,
    OAuth2TokenResponse,
    OAuth2ErrorCode,
    ClientSecretBasic,
    NoneAuthMethod
} from '@kaapi/oauth2-auth-design';

export default OIDCAuthorizationCodeBuilder
    .create()
    .setTokenTTL(3600)
    .addClientAuthenticationMethod(new ClientSecretBasic())
    .addClientAuthenticationMethod(new NoneAuthMethod())
    .setScopes({
        openid: 'User identity',
        profile: 'Basic profile info'
    })
    .authorizationRoute(route =>
        route
            .setPath('/oauth2/authorize')

            // Render the authorization page for GET requests (e.g. login & consent UI)
            .setGETResponseRenderer(async ({ clientId, scope, state, responseType }, request, response) => {
                // Render your login or consent UI here
                return `<html><body><h1>Authorize ${clientId}</h1></body></html>`;
            })

            // Handle the form POST submission from the authorization page
            .setPOSTErrorRenderer(async ({ clientId, scope, state, responseType, user }, request, response) => {
                // For example, confirm consent here
                return { redirectTo: `/oauth2/authorize/consent?client_id=${clientId}&state=${state}` };
            })

            // Generate the authorization code after successful consent/authentication
            .generateCode(async ({ clientId, user, scope, codeChallenge }) => {
                // Save authorization code with user and scope info, PKCE challenge, etc.
                // Return the authorization code string
                return { type: 'code', value: 'generated-authorization-code' };
            })

            // Finalize authorization response (redirect with code and state)
            .finalizeAuthorization(async ({ code, state, redirectUri }) => {
                // Return the redirect URL with code and state
                return `${redirectUri}?code=${code}&state=${state}`;
            })
    )
    .tokenRoute(route =>
        route
            .setPath('/oauth2/token')
            .generateToken(async ({ grantType, clientId, tokenType, code, codeVerifier, ttl, createIdToken }, request) => {
                // Validate code and codeVerifier here
                const isValid = true; // Replace with actual validation

                if (!isValid) {
                    return { error: OAuth2ErrorCode.INVALID_GRANT, error_description: 'Invalid code or verifier' };
                }

                const accessToken = 'opaque-access-token';
                const idToken = await createIdToken({ sub: 'user-id', aud: clientId });

                return new OAuth2TokenResponse({ access_token: accessToken })
                    .setTokenType(tokenType)
                    .setExpiresIn(ttl)
                    .setScope('openid profile')
                    .setIdToken(idToken);
            })
    );
*/

/*
import {
    ClientSecretBasic,
    ClientSecretPost,
    createMatchAuthCodeResult,
    NoneAuthMethod,
    OAuth2ErrorCode,
    OIDCAuthorizationCodeBuilder
} from '@kaapi/oauth2-auth-design'

export default OIDCAuthorizationCodeBuilder
    .create()
    .setTokenTTL(3600)
    .addClientAuthenticationMethod(new ClientSecretBasic())
    .addClientAuthenticationMethod(new ClientSecretPost())
    .addClientAuthenticationMethod(new NoneAuthMethod())
    .useAccessTokenJwks(true)
    .authorizationRoute<object, { Payload: { email?: string, password?: string, step?: string, submit?: string } }>(route =>
        route
            .setPath('/oauth2/v2/authorize')
            .setEmailField('email') // used to validate request
            .setPasswordField('password') // used to validate request

            .setGETResponseRenderer(async (
                // context
                {
                    emailField, // value of setEmailField
                    passwordField, // value of setPasswordField
                },
                // params
                {
                    clientId, // string
                    redirectUri, // string
                    responseType, // string
                    codeChallenge, // string | undefined
                    scope, // string | undefined
                    nonce, // string | undefined
                    state // string | undefined
                },
                // request 
                request,
                h
            ) => {
                // Example: Validate the client
                const isValid = true; // Replace with actual logic

                if (!isValid) {
                    return h.view('error', {
                        error: OAuth2ErrorCode.INVALID_CLIENT,
                        errorMessage: 'Invalid client'
                    }).code(400)
                }

                // Example: Check if user is already logged in (e.g: valid session cookie)
                const isAlreadyLoggedIn = false; // Replace with actual logic

                if (isAlreadyLoggedIn) {
                    return h.view('consent-page', { clientId })
                }

                return h.view('authorization-page', {
                    emailField, passwordField
                })
            })

            .setPOSTErrorRenderer(async (context, params, request, h) => {
                return h.view('authorization-page', context).code(context.statusCode)
            })

            .generateCode(async (
                // params
                {
                    clientId, // string
                    redirectUri, // string
                    responseType, // string
                    codeChallenge, // string | undefined
                    scope, // string | undefined
                    nonce, // string | undefined
                    state // string | undefined
                },
                // request with the payload ('email', 'password', ...)
                request,
                h
            ) => {

                // return `null` to trigger `setPOSTErrorRenderer`
                return null;

                // return 'continue' to trigger `finalizeAuthorization` that will send to consent page
                return { type: 'continue' };


                // return 'deny' to trigger `finalizeAuthorization` that will have a fullRedirectUri with error=access_denied
                return { type: 'deny' };

                // return code with generated code to trigger `finalizeAuthorization`
                return {
                    type: 'code',
                    value: 'generated-code'
                };
            })

            .finalizeAuthorization(async (
                // context
                {
                    authorizationResult,
                    fullRedirectUri,
                    emailField,
                    passwordField
                },
                // params (same as generateCode)
                {
                    clientId
                },
                request,
                h
            ) => {
                const matcher = createMatchAuthCodeResult({
                    code: async () => h.redirect(`${fullRedirectUri}`), // using the full redirect uri already formed by the package
                    continue: async () => h.view('consent-page', { clientId }),
                    deny: async () => h.redirect(`${fullRedirectUri}`) // using the full redirect uri already formed by the package (with error=access_denied)
                })

                return matcher(authorizationResult)
            })
    )

    */

/*
import {
NoneAuthMethod,
OIDCDeviceAuthorizationBuilder
} from '@kaapi/oauth2-auth-design'

export default OIDCDeviceAuthorizationBuilder
.create()
.addClientAuthenticationMethod(new NoneAuthMethod())
.authorizationRoute(route =>
    route
        .setPath('/oauth2/devicecode')
        .generateCode(async (
            // params (contains only 1 or 2 properties: clientId and scope)
            {
                clientId, // string
                scope // string | undefined
            },
            request
        ) => {

            // return `null` to respond `invalid_client`
            return null;

            // DeviceCodeResponse as according to Device authorization flow (need to shortly define each prop for the doc)
            return {
                device_code: '...',
                expires_in: 900,
                interval: 5,
                user_code: '...',
                verification_uri: '...',
                verification_uri_complete: '...'
            }
        })
)

*/