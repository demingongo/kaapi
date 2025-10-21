# Token Refresh Flow with `refreshTokenRoute`

The `refreshTokenRoute()` method defines the behavior of the token endpoint for the [Refresh Token Grant](https://datatracker.ietf.org/doc/html/rfc6749#section-6) in OAuth2 and OpenID Connect flows using the [`@kaapi/oauth2-auth-design`](https://www.npmjs.com/package/@kaapi/oauth2-auth-design) package.

It is available in all flow builders that support refresh tokens, namely:

* ✅ **Authorization Code Flow**
* ✅ **Device Authorization Flow**
* ❌ *Not available for Client Credentials Flow (refresh tokens are not supported)*

---

## 🔧 Route Configuration

The route can be customized using the following methods:

| Method              | Description                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `setPath(path)`     | Defines the token endpoint path. Should match the one used in `tokenRoute()` for consistency. Default: `/oauth2/token` |
| `generateToken(fn)` | Core method where you implement the logic for validating the refresh token and issuing a new access token.             |

---

## 🧩 `generateToken()` Overview

The `generateToken()` handler is responsible for processing the `refresh_token` grant. It receives two arguments:

* A **context object** with validated parameters and available helper functions.
* The original **HTTP request**, allowing deeper inspection if needed.

The context includes:

* `grantType`: `"refresh_token"`
* `clientId`: Client ID associated with the request
* `refreshToken`: The received refresh token
* `ttl`: Access token TTL (as defined via `setTokenTTL`)
* `tokenType`: Typically `"Bearer"`
* Optional: `clientSecret`, `scope`
* Helpers:

  * `createJwtAccessToken()` – if JWT access token support is enabled
  * `createIdToken()` – if `openid` is in scope and ID token support is active
  * `verifyJwt()` – available if the provider uses JWKS-based token verification

The handler must return:

* An `OAuth2TokenResponse` instance, or
* An error object using `OAuth2ErrorCode`, or
* `null` to return a generic `invalid_request` error.

---

## ✅ Example: Authorization Code Flow

```ts
import {
  NoneAuthMethod,
  OAuth2ErrorCode,
  OAuth2TokenResponse,
  OIDCAuthorizationCodeBuilder
} from '@kaapi/oauth2-auth-design';

export default OIDCAuthorizationCodeBuilder
  .create()
  .setTokenTTL(3600)
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
        grantType,
        clientId,
        refreshToken,
        ttl,
        tokenType,
        clientSecret,
        scope,
        createJwtAccessToken,
        createIdToken,
        verifyJwt
      }, request) => {
        // Example: Validate the refresh token and client
        const isValid = true; // Replace with actual logic

        if (!isValid) {
          return {
            error: OAuth2ErrorCode.INVALID_GRANT,
            error_description: 'Invalid or expired refresh token'
          };
        }

        return new OAuth2TokenResponse({ access_token: 'generated-access-token' })
          .setExpiresIn(ttl)
          .setTokenType(tokenType)
          .setScope('openid email')
          .setRefreshToken('new-optional-refresh-token')
          .setIdToken('optional-id-token');
      })
  );
```

---

### 🧾 Handler Notes

* Use `verifyJwt()` to validate JWT-based refresh tokens if they were originally created with `createJwtAccessToken()`.
* If issuing a new refresh token (rotation), include it via `.setRefreshToken()`.
* If `openid` is part of the requested scope, and `createIdToken()` is available, include a new ID token.
* A refresh request may include a new or narrower `scope`; validate this if necessary.

---

## 🧾 Return Types

### ✅ Successful Response

```ts
return new OAuth2TokenResponse({ access_token: '...' })
  .setExpiresIn(ttl)
  .setTokenType(tokenType)
  .setScope('openid email')
  .setRefreshToken('...')
  .setIdToken('...');
```

### ❌ Specific Error

```ts
return {
  error: OAuth2ErrorCode.INVALID_CLIENT,
  error_description: 'Invalid client credentials'
};
```

### ❌ Generic Error

```ts
return null; // Returns "invalid_request"
```

---

## 📌 Note on Device Authorization Flow

The `refreshTokenRoute()` configuration is **identical** for the Device Authorization Flow.
You can reuse the same logic and structure shown above.

Refresh tokens are not available for the Client Credentials Flow and therefore `refreshTokenRoute()` is **not supported** in that context.

---

## 📌 Summary

* `refreshTokenRoute()` defines how your server handles refresh token grants.
* Only applicable for flows that issue refresh tokens (Authorization Code, Device Authorization).
* Offers full control over how refresh tokens are verified and how new tokens are issued.
* Works in tandem with `tokenRoute()` and shares the same endpoint path by default (`/oauth2/token`).

---
