Perfect! This is a full **OIDC Authorization Code flow implementation** in ECMAScript 2022 using `@kaapi/oauth2-auth-design`. Let me break it down and highlight the key points and best practices for clarity:

---

## **1. Builder Initialization**

```ts
const authDesign = OIDCAuthorizationCodeBuilder.create()
  .strategyName('oidc-auth-code')
  .setTokenTTL(3600)
  .setJwksKeyStore(createInMemoryKeyStore())
  .setJwksRotatorOptions({
      intervalMs: 7.862e9,
      timestampStore: createInMemoryKeyStore(),
  })
  .setPublicKeyExpiry(8.64e6)
  .useAccessTokenJwks(true);
```

✅ Key Points:

* **`strategyName`** — Defines the auth strategy for your routes.
* **Token TTL** — Tokens expire in 1 hour (`3600s`).
* **JWKS Key Store** — Uses in-memory storage (good for dev; production should use secure storage).
* **Key rotation** — Rotates keys every ~91 days (`7.862e9 ms`).
* **Public key expiry** — 100-day TTL to keep old keys available for token verification.
* **JWT verification** — `useAccessTokenJwks(true)` enables automatic JWT signature verification.

---

## **2. Client Authentication Methods**

```ts
.addClientAuthenticationMethod(new ClientSecretBasic())
.addClientAuthenticationMethod(new ClientSecretPost())
.addClientAuthenticationMethod(new NoneAuthMethod())
```

Supports:

* **ClientSecretBasic** – HTTP Basic Auth.
* **ClientSecretPost** – Credentials in POST body.
* **NoneAuthMethod** – Public clients without secret.

---

## **3. Authorization Route**

```ts
.authorizationRoute((route) =>
  route
      .setPath('/oauth2/authorize')
      .setUsernameField('username')
      .setPasswordField('password')
      .generateCode(async (_params, req, _h) => {
          const { payload } = req;
          if (payload.username === 'janedoe' && payload.password === 'password') {
              return { type: 'code', value: 'auth-code-for-user' };
          }
          return null;
      })
      .finalizeAuthorization(async (ctx, params, _req, h) => {
          const matcher = createMatchAuthCodeResult({
              code: async () => h.redirect(ctx.fullRedirectUri),
              continue: async () => h.view('consent-page', { clientId: params.clientId }),
              deny: async () => h.redirect(ctx.fullRedirectUri),
          });
          return matcher(ctx.authorizationResult);
      })
)
```

✅ Notes:

* Handles login, consent, and authorization code generation.
* `generateCode()` issues the auth code based on user credentials.
* `finalizeAuthorization()` decides redirect behavior:

  * **code** — successful auth, redirect to `redirect_uri`.
  * **continue** — show consent page.
  * **deny** — user denied authorization.

---

## **4. Token Route**

```ts
.tokenRoute((route) =>
  route
      .setPath('/oauth2/token')
      .generateToken(async ({ clientId, ttl, tokenType, createJwtAccessToken, createIdToken }) => {
          const { token: accessToken } = await createJwtAccessToken({
              sub: 'user-id',
              aud: clientId,
              scope: ['openid', 'email'],
          });

          const { token: idToken } = await createIdToken({
              sub: 'user-id',
              name: 'Jane Doe',
              email: 'jane@example.com',
          });

          return new OAuth2TokenResponse({ access_token: accessToken })
              .setExpiresIn(ttl)
              .setTokenType(tokenType)
              .setScope('openid email')
              .setIdToken(idToken);
      })
)
```

✅ Key Points:

* Issues **JWT access token** and **ID token** for OIDC.
* `createJwtAccessToken()` and `createIdToken()` automatically sign tokens using JWKS private keys.
* Supports `ttl`, `audience`, `scope`, and custom claims.

---

## **5. JWKS Endpoint**

```ts
.jwksRoute((route) => route.setPath('/.well-known/jwks.json'))
```

* Serves public keys for resource servers.
* Resource servers use these keys to verify JWT signatures.

---

## **6. Token Validation**

```ts
.validate(async (_req, { jwtAccessTokenPayload }) => {
    if (!jwtAccessTokenPayload?.sub) return { isValid: false };
    return {
        isValid: true,
        credentials: {
            user: {
                id: jwtAccessTokenPayload.sub,
                email: jwtAccessTokenPayload.email,
            },
        },
    };
})
```

* Validates access tokens automatically if JWT verification is enabled.
* Returns credentials for use in authenticated routes (`request.auth.credentials`).

---

## **7. Kaapi App Setup**

```ts
const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    docs: { host: { url: 'http://localhost:3000' } },
});

await app.extend(authDesign);

app.base().auth.default({
    strategy: authDesign.getStrategyName(),
    mode: 'try',
});

await app.listen();

app.log.info('✅ Kaapi OIDC Auth Server running at http://localhost:3000');
```

* Extends Kaapi app with OIDC auth.
* Sets default auth strategy.
* Starts server on port 3000.

---

### ✅ **Summary**

This example demonstrates:

1. **OIDC Authorization Code flow**.
2. JWT **access tokens** and ID tokens.
3. **JWKS** setup, key rotation, and TTL.
4. Token validation with automatic claims extraction.
5. Support for multiple **client authentication methods**.
6. Integration with Kaapi routes for protected resources.

---

If you want, I can create a **diagram showing the complete flow** for this exact code, including **JWKS rotation, JWT issuance, and validation**—it would be a visual reference for your implementation.

Do you want me to do that?


Absolutely! Here's a clean, structured **wiki page** version based on your OIDC Authorization Code flow example with `@kaapi/oauth2-auth-design`. I’ve formatted it for clarity, with sections, code snippets, and explanations.

---

# Kaapi OIDC Authorization Code Flow Example

## Overview

This page demonstrates how to implement an **OIDC Authorization Code flow** using the `OIDCAuthorizationCodeBuilder` from `@kaapi/oauth2-auth-design` in ECMAScript 2022.
The implementation includes:

* JWT-based **access tokens** and **ID tokens**
* JWKS **public key distribution** and **rotation**
* Multiple **client authentication methods**
* Token **validation** and user credentials extraction
* Integration with **Kaapi app routes**

---

## Table of Contents

1. [Installation](#installation)
2. [Builder Initialization](#builder-initialization)
3. [Client Authentication Methods](#client-authentication-methods)
4. [Authorization Route](#authorization-route)
5. [Token Route](#token-route)
6. [JWKS Endpoint](#jwks-endpoint)
7. [Token Validation](#token-validation)
8. [Kaapi App Setup](#kaapi-app-setup)
9. [Summary](#summary)

---

## Installation

```bash
npm install @kaapi/kaapi @kaapi/oauth2-auth-design
```

---

## Builder Initialization

Initialize the `OIDCAuthorizationCodeBuilder`:

```ts
import { OIDCAuthorizationCodeBuilder, createInMemoryKeyStore } from '@kaapi/oauth2-auth-design';

const authDesign = OIDCAuthorizationCodeBuilder.create()
    .strategyName('oidc-auth-code')
    .setTokenTTL(3600) // Tokens expire in 1 hour
    .setJwksKeyStore(createInMemoryKeyStore()) // In-memory key store
    .setJwksRotatorOptions({
        intervalMs: 7.862e9, // Rotate keys every 91 days
        timestampStore: createInMemoryKeyStore(),
    })
    .setPublicKeyExpiry(8.64e6) // Keep old public keys for 100 days
    .useAccessTokenJwks(true); // Enable automatic JWT verification
```

---

## Client Authentication Methods

Support multiple client authentication strategies:

```ts
import { ClientSecretBasic, ClientSecretPost, NoneAuthMethod } from '@kaapi/oauth2-auth-design';

authDesign
    .addClientAuthenticationMethod(new ClientSecretBasic())
    .addClientAuthenticationMethod(new ClientSecretPost())
    .addClientAuthenticationMethod(new NoneAuthMethod());
```

* **ClientSecretBasic** – HTTP Basic authentication
* **ClientSecretPost** – Credentials in POST body
* **NoneAuthMethod** – Public clients without secret

---

## Authorization Route

Handles user login and authorization code generation:

```ts
import { createMatchAuthCodeResult } from '@kaapi/oauth2-auth-design';

authDesign.authorizationRoute((route) =>
    route
        .setPath('/oauth2/authorize')
        .setUsernameField('username')
        .setPasswordField('password')
        .generateCode(async (_params, req) => {
            const { payload } = req;
            if (payload.username === 'janedoe' && payload.password === 'password') {
                return { type: 'code', value: 'auth-code-for-user' };
            }
            return null;
        })
        .finalizeAuthorization(async (ctx, params, _req, h) => {
            const matcher = createMatchAuthCodeResult({
                code: async () => h.redirect(ctx.fullRedirectUri),
                continue: async () => h.view('consent-page', { clientId: params.clientId }),
                deny: async () => h.redirect(ctx.fullRedirectUri),
            });
            return matcher(ctx.authorizationResult);
        })
);
```

* `generateCode()` validates credentials and issues the auth code.
* `finalizeAuthorization()` manages redirection or consent page display.

---

## Token Route

Issues JWT-based access tokens and ID tokens:

```ts
import { OAuth2TokenResponse } from '@kaapi/oauth2-auth-design';

authDesign.tokenRoute((route) =>
    route
        .setPath('/oauth2/token')
        .generateToken(async ({ clientId, ttl, tokenType, createJwtAccessToken, createIdToken }) => {
            const { token: accessToken } = await createJwtAccessToken({
                sub: 'user-id',
                aud: clientId,
                scope: ['openid', 'email'],
            });

            const { token: idToken } = await createIdToken({
                sub: 'user-id',
                name: 'Jane Doe',
                email: 'jane@example.com',
            });

            return new OAuth2TokenResponse({ access_token: accessToken })
                .setExpiresIn(ttl)
                .setTokenType(tokenType)
                .setScope('openid email')
                .setIdToken(idToken);
        })
);
```

* `createJwtAccessToken()` and `createIdToken()` automatically sign tokens using JWKS private keys.
* Tokens include `sub`, `aud`, `scope`, and optional claims like `name` and `email`.

---

## JWKS Endpoint

Expose public keys for JWT verification:

```ts
authDesign.jwksRoute((route) =>
    route.setPath('/.well-known/jwks.json')
);
```

* Resource servers fetch keys from this endpoint to verify JWT signatures.

---

## Token Validation

Validate incoming access tokens and extract credentials:

```ts
authDesign.validate(async (_req, { jwtAccessTokenPayload }) => {
    if (!jwtAccessTokenPayload?.sub) return { isValid: false };
    return {
        isValid: true,
        credentials: {
            user: {
                id: jwtAccessTokenPayload.sub,
                email: jwtAccessTokenPayload.email,
            },
        },
    };
});
```

* Returns `isValid: true` and attaches user credentials to `request.auth.credentials`.

---

## Kaapi App Setup

Integrate the auth design into a Kaapi app:

```ts
import { Kaapi } from '@kaapi/kaapi';

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    docs: { host: { url: 'http://localhost:3000' } },
});

await app.extend(authDesign);

app.base().auth.default({
    strategy: authDesign.getStrategyName(),
    mode: 'try',
});

await app.listen();

app.log.info('✅ Kaapi OIDC Auth Server running at http://localhost:3000');
```

* Sets default authentication strategy.
* Starts the server on `localhost:3000`.

---

## Summary

This example demonstrates a **complete OIDC Authorization Code flow**:

* Authorization Code generation
* JWT **Access Tokens** and **ID Tokens**
* JWKS **public key rotation** and TTL management
* Multiple client authentication methods
* Token validation and credential extraction
* Integration with Kaapi app routes

This setup can serve as a template for **production-ready OIDC servers**, replacing the in-memory key store with **persistent secure storage**.

---

If you want, I can also create a **diagram-based wiki page** showing the **full request/response flow** between client, authorization server, and resource server for this exact example.

Do you want me to do that?
