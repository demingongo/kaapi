
# Token Issuance with `refreshTokenRoute`

The `refreshTokenRoute()` method is used to define the behavior of the token endpoint (`/oauth2/token`) in any OAuth2/OIDC flow using the [`@kaapi/oauth2-auth-design`](https://www.npmjs.com/package/@kaapi/oauth2-auth-design) package.

It is available in **all** flow builders (Authorization Code, Client Credentials, Device Authorization) and allows you to configure the token issuing logic and endpoint path.

---

## 🔧 Route Configuration

Within `refreshTokenRoute()`, you can configure the route with the following methods:

| Method             | Description                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| `setPath(path)`    | Changes the default token endpoint path. It should be the same as the one defined in `tokenRoute()` to follow conventions. Default: `/oauth2/token`.          |
| `generateToken(fn)`| Implements the core logic for validating requests and issuing tokens.       |

---

## 🧩 `generateToken()` Overview

The `generateToken()` function is the core of the token exchange process. It receives:

- **Input context**: An object containing validated and parsed parameters (such as grant type, refresh token, client ID, secrets, codes, helper functions, etc.).
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
    .refreshTokenRoute(route =>
        route
            .setPath('/oauth2/token')
            .generateToken(async ({
                grantType, // string
                clientId, // string
                ttl, // value of setTokenTTL
                tokenType, // string
                refreshToken, // string
                clientSecret, // string or undefined
                createJwtAccessToken, // function available if using JWKS
                createIdToken, // function available if using JWKS
                verifyJwt // function available if 'useAccessTokenJwks(true)'. We could use it to verify the refresh token if it was created with the function 'createJwtAccessToken' at tokenRoute method.
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
    //...
```

### Handler Notes – Authorization Code Flow

* Use `createJwtAccessToken()` and `createIdToken()` to generate signed tokens when using JWKS.
<!-- explain more parameters of generateToken: refreshToken, verifyJwt -->

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

## 📌 Summary

* `refreshTokenRoute()` defines how the refresh token grant flow works.
* Used in all OAuth2/OIDC flows except for Client Credentials.
* `generateToken()` gives full control over token issuance logic.

