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