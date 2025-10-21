
# Token Issuance with `tokenRoute`

The `tokenRoute()` method is used to define the behavior of the token endpoint (`/oauth2/token`) in any OAuth2/OIDC flow using the [`@kaapi/oauth2-auth-design`](https://www.npmjs.com/package/@kaapi/oauth2-auth-design) package.

It is available in **all** flow builders (Authorization Code, Client Credentials, Device Authorization) and allows you to configure the token issuing logic and endpoint path.

---

## 🔧 Route Configuration

Within `tokenRoute()`, you can configure the route with the following methods:

| Method             | Description                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| `setPath(path)`    | Changes the default token endpoint path. Default: `/oauth2/token`.          |
| `generateToken(fn)`| Implements the core logic for validating requests and issuing tokens.       |

---

## 🧩 `generateToken()` Overview

The `generateToken()` function is the core of the token exchange process. It receives:

- **Input context**: An object containing validated and parsed parameters (such as grant type, client ID, secrets, codes, helper functions, etc.).
- **Request object**: The original HTTP request, if additional inspection is needed.
  
You must return one of the following:

- An `OAuth2TokenResponse` to issue a token.
- An error object with an `OAuth2ErrorCode`.
- `null` to return a generic `invalid_request` error.

---

## ✅ Example: Authorization Code Flow

```ts
import {
    ClientSecretBasic,
    NoneAuthMethod,
    OAuth2ErrorCode,
    OAuth2TokenResponse,
    OIDCAuthorizationCodeBuilder
} from '@kaapi/oauth2-auth-design'

export default OIDCAuthorizationCodeBuilder
    .create()
    .setTokenTTL(3600) // 1 hour
    .addClientAuthenticationMethod(new ClientSecretBasic())
    .addClientAuthenticationMethod(new NoneAuthMethod())
    .useAccessTokenJwks(true)
    .setScopes({
        openid: 'User identity',
        email: 'Access to user email',
    })
    .tokenRoute(route =>
        route
            .setPath('/oauth2/token')
            .generateToken(async ({
                grantType,
                clientId,
                ttl,
                tokenType,
                code,
                codeVerifier,
                clientSecret,
                createJwtAccessToken,
                createIdToken,
                verifyCodeVerifier
            }, request) => {

                // Example error
                // return { error: OAuth2ErrorCode.INVALID_CLIENT, error_description: 'Client not found' }

                // Example success
                return new OAuth2TokenResponse({ access_token: 'generated-access-token' })
                    .setExpiresIn(ttl)
                    .setTokenType(tokenType)
                    .setScope('openid email')
                    .setRefreshToken('optional-refresh-token')
                    .setIdToken('optional-id-token')
            })
    )
```

### Handler Notes – Authorization Code Flow

* `code` and `codeVerifier` are used for PKCE validation.
* `verifyCodeVerifier()` should be used to validate the `code_challenge`.
* Use `createJwtAccessToken()` and `createIdToken()` to generate signed tokens when using JWKS.

---

## ✅ Example: Client Credentials Flow

```ts
import {
    ClientSecretBasic,
    OAuth2ClientCredentialsBuilder,
    OAuth2ErrorCode,
    OAuth2TokenResponse
} from '@kaapi/oauth2-auth-design'

export default OAuth2ClientCredentialsBuilder
    .create()
    .setTokenTTL(600) // 10 minutes
    .addClientAuthenticationMethod(new ClientSecretBasic())
    .useAccessTokenJwks(true)
    .tokenRoute(route =>
        route
            .setPath('/oauth2/token')
            .generateToken(async ({
                grantType,
                clientId,
                ttl,
                tokenType,
                clientSecret,
                scope,
                createJwtAccessToken,
                createIdToken
            }, request) => {

                // Example success
                return new OAuth2TokenResponse({ access_token: 'generated-access-token' })
                    .setExpiresIn(ttl)
                    .setTokenType(tokenType)
                    .setScope(scope ?? '')
            })
    )
```

### Handler Notes – Client Credentials Flow

* No user interaction or authorization code is involved.
* `scope` is optional and typically predefined for the client.
* Ideal for server-to-server authentication.

---

## ✅ Example: Device Authorization Flow

```ts
import {
    NoneAuthMethod,
    OAuth2DeviceAuthorizationBuilder,
    OAuth2ErrorCode,
    OAuth2TokenResponse
} from '@kaapi/oauth2-auth-design'

export default OAuth2DeviceAuthorizationBuilder
    .create()
    .setTokenTTL(600) // 10 minutes
    .addClientAuthenticationMethod(new NoneAuthMethod())
    .tokenRoute(route =>
        route
            .setPath('/oauth2/token')
            .generateToken(async ({
                grantType,
                clientId,
                ttl,
                tokenType,
                deviceCode,
                clientSecret,
                createJwtAccessToken,
                createIdToken
            }, request) => {

                // Example polling check
                const deviceValidated = checkDeviceCode(deviceCode); // your logic

                if (!deviceValidated) {
                    return { error: OAuth2ErrorCode.AUTHORIZATION_PENDING }
                }

                return new OAuth2TokenResponse({ access_token: 'generated-access-token' })
                    .setExpiresIn(ttl)
                    .setTokenType(tokenType)
            })
    )
```

### Handler Notes – Device Authorization Flow

* `deviceCode` identifies the device/user code pair.
* Can return specific polling errors like `authorization_pending` or `slow_down`.
* Commonly used in devices without a browser or limited input.

---

## 🧾 Return Values

You can return one of the following from `generateToken()`:

### ✅ Successful Token Response

```ts
return new OAuth2TokenResponse({ access_token: '...' })
    .setExpiresIn(ttl)
    .setTokenType(tokenType)
    .setScope('scope1 scope2')
    .setRefreshToken('...')
    .setIdToken('...')
```

### ❌ Error Response

```ts
return {
    error: OAuth2ErrorCode.INVALID_CLIENT,
    error_description: 'Client credentials are invalid'
}
```

### ❌ Generic Error (invalid_request)

```ts
return null
```

---

## 🔐 Security Note

Always validate the client, credentials, and any user-facing inputs (e.g., `code`, `deviceCode`, `scope`). Avoid issuing tokens without proper verification. Use `verifyCodeVerifier`, `createJwtAccessToken`, and related helpers to enforce security best practices.

---

## 📌 Summary

* `tokenRoute()` defines how the token endpoint works.
* Used in all OAuth2/OIDC flows.
* `generateToken()` gives full control over token issuance logic.
* Ensure validation and security checks for all flows.

