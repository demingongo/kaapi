# 🔐 Access Token and JWKS

OAuth2 and OIDC rely on **access tokens** to securely represent authentication and authorization.
Access tokens can be either **opaque** (random strings stored and validated server-side) or **JWTs** (self-contained tokens signed with cryptographic keys).

When tokens are **JWT-based**, signing ensures they are **authentic** and **tamper-proof**.
**JWKS (JSON Web Key Set)** provides a standardized way to publish the **public keys** used to verify those signed tokens.

The `@kaapi/oauth2-auth-design` package supports **both opaque and JWT access tokens**, offering flexible JWKS integration for projects that choose to sign tokens.

---

## 📘 Overview

All OAuth2/OIDC flow builders provide JWKS and token verification features:

* ✅ **Authorization Code Flow**
* ✅ **Client Credentials Flow**
* ✅ **Device Authorization Flow**

Each builder implements the same JWKS and validation capabilities, so you can apply the examples below to any flow.

---

## 🌐 JWKS Endpoint

The JWKS endpoint exposes your application’s **public keys**, allowing resource servers to verify JWT signatures.
By default, this endpoint is available at `/oauth2/keys`, but you can customize its path or response.

### Example

```ts
import { OAuth2AuthorizationCodeBuilder } from '@kaapi/oauth2-auth-design';

OAuth2AuthorizationCodeBuilder
  .create()
  .jwksRoute(route => route.setPath('/.well-known/jwks.json'));
```

The above creates a JWKS endpoint accessible at `/.well-known/jwks.json`.
It will automatically return the public keys currently active in your JWKS store.

You can also override the default JWKS controller to customize the returned payload or add extra validation logic:

```ts
OAuth2AuthorizationCodeBuilder
  .create()
  .jwksRoute(route => route
    .setPath('/.well-known/jwks.json')
    .validate(({ jwks }, request, h) => jwks)
  );
```

---

## 🗝️ JWKS Key Store

The key store is where signing keys are managed.
By default, Kaapi uses an **in-memory key store**, suitable for development and testing but not for production.

You can configure it explicitly like this:

```ts
import { OAuth2AuthorizationCodeBuilder, createInMemoryKeyStore } from '@kaapi/oauth2-auth-design';

OAuth2AuthorizationCodeBuilder
  .create()
  .setJwksKeyStore(createInMemoryKeyStore());
```

For production environments, you can provide your own implementation of `JwksKeyStore` to persist keys in a database or secure vault:

```ts
interface JwksKeyStore {
  storeKeyPair(kid: string, privateKey: object, publicKey: object, ttl: number): void | Promise<void>;
  getPrivateKey(): Promise<object | undefined>;
  getPublicKeys(): Promise<object[]>;
}
```

This flexibility allows integration with secure storage mechanisms like Redis, PostgreSQL, AWS KMS, or HashiCorp Vault.

---

## 🔁 Key Rotation

To improve long-term security, it’s recommended to **rotate signing keys periodically**.
Key rotation limits the impact of a compromised key and helps ensure cryptographic freshness over time.

You can enable automatic rotation using `setJwksRotatorOptions`, which defines how often new key pairs are generated.

### Example

```ts
import { OAuth2AuthorizationCodeBuilder, createInMemoryKeyStore } from '@kaapi/oauth2-auth-design';

const authCodeFlow = OAuth2AuthorizationCodeBuilder
  .create()
  .setJwksRotatorOptions({
    intervalMs: 7.862e+9, // every 91 days
    timestampStore: createInMemoryKeyStore()
  })
  .build();

authCodeFlow.checkAndRotateKeys();
```

This checks whether a rotation is due and generates a new key pair if needed.
You can schedule periodic checks in your app, for example every hour:

```ts
setInterval(() => {
  authCodeFlow.checkAndRotateKeys().catch(console.error);
}, 3600 * 1000);
```

If you ever need to rotate keys **immediately**, without waiting for the next scheduled interval, you can call:

```ts
await authCodeFlow.generateKeyPair();
```

This forces a new key pair to be generated and stored right away, bypassing the rotation timing logic.
It’s useful for emergency key replacement or manual rotation in controlled environments.

### Rotation Timestamp Store

The `JwksRotationTimestampStore` interface defines how the last rotation timestamp is stored and retrieved.
This allows consistent rotation intervals even if the application restarts:

```ts
interface JwksRotationTimestampStore {
  getLastRotationTimestamp(): Promise<number>;
  setLastRotationTimestamp(rotationTimestamp: number): Promise<void>;
}
```

---

## ⏳ Public Key Expiry

To prevent old keys from lingering indefinitely, you can set a **time-to-live (TTL)** for public keys.
When used with key rotation, this ensures that expired keys are automatically removed from your JWKS after their TTL elapses.

```ts
.setPublicKeyExpiry(8.64e+6) // 100 days
```

For example:

```ts
.setJwksRotatorOptions({
  intervalMs: 7.862e+9,
  timestampStore: createInMemoryKeyStore()
})
.setPublicKeyExpiry(8.64e+6);
```

This configuration rotates signing keys every **91 days** and keeps the **previous public keys available for 9 additional days** (100 − 91) before they expire and are removed.
This overlap ensures that tokens signed with an old key shortly before rotation remain verifiable for a short transition period, which is especially important in distributed systems.

The expiry value defined in `setPublicKeyExpiry()` is passed as the `ttl` argument to the `storeKeyPair` method of the configured `JwksKeyStore`.
Your custom store can use this TTL to automatically remove expired keys.

---

## ✅ Token Validation with `validate`

Each flow builder lets you define custom logic for validating access tokens through the `validate()` method.
This function determines whether a token is valid and what credentials should be attached to the authenticated request.

### Example

```ts
import { OAuth2AuthorizationCodeBuilder } from '@kaapi/oauth2-auth-design';

OAuth2AuthorizationCodeBuilder
  .create()
  .validate(async (request, { token }) => {
    // Verify that the token is known, valid, and not expired
    // (for example by checking a database, cache, or JWT claims)

    const isValidToken = Boolean(token); // replace with your actual validation logic

    if (!isValidToken) {
      return { isValid: false };
    }

    // Attach credentials that will be available in request.auth.credentials
    return {
      isValid: true,
      credentials: {
        user: {
          sub: '12345',
          name: 'John Doe',
          email: 'john@example.com'
        }
      }
    };
  });
```

Within your Kaapi routes, validated credentials are available via `request.auth.credentials`:

```ts
app.route(
  { method: 'GET', path: '/', auth: true },
  (request) => `Hello ${request.auth.credentials.user.name}`
);
```

---

## 🔐 JWT Access Token Verification

When using JWT-based access tokens, the library can automatically **verify** them using your JWKS public keys.
However, **signing tokens is still a deliberate action** — you must generate them using `createJwtAccessToken()` (and `createIdToken()` for OIDC).

### Example

```ts
import { OIDCAuthorizationCodeBuilder, OAuth2TokenResponse } from '@kaapi/oauth2-auth-design';

OIDCAuthorizationCodeBuilder
  .create()
  .setTokenTTL(3600)
  .useAccessTokenJwks(true)
  .tokenRoute(route =>
    route.generateToken(async ({ createJwtAccessToken, createIdToken, ttl, tokenType }) => {
      // Create and sign JWT-based access token
      const { token: accessToken } = await createJwtAccessToken({
        sub: '12345',
        scope: 'openid email',
        aud: 'https://api.example.com'
      });

      // Create and sign ID token for OIDC
      const { token: idToken } = await createIdToken({
        sub: '12345',
        name: 'John Doe',
        email: 'john@example.com'
      });

      return new OAuth2TokenResponse({ access_token: accessToken })
        .setExpiresIn(ttl)
        .setTokenType(tokenType)
        .setIdToken(idToken);
    })
  )
  .validate(async (request, { jwtAccessTokenPayload }) => {
    if (!jwtAccessTokenPayload?.sub) return { isValid: false };

    return {
      isValid: true,
      credentials: {
        user: {
          id: jwtAccessTokenPayload.sub,
          email: jwtAccessTokenPayload.email
        }
      }
    };
  });
```

In this example:

* `createJwtAccessToken()` signs the access token with the **JWKS private key**.
* `createIdToken()` does the same for OIDC ID tokens.
* `createJwtAccessToken()` and `createIdToken()` **automatically use the TTL value defined via `setTokenTTL()`** for the token expiration.
* The `exp` claim can be **overridden** if a custom expiration is needed.
* `useAccessTokenJwks(true)` enables **automatic verification** of JWT access tokens using the JWKS **public keys**.
* `jwtAccessTokenPayload` contains the verified and decoded claims from the incoming access token.

If you prefer **opaque tokens**, skip `useAccessTokenJwks(true)` and validate tokens using your own logic within `validate()`.

---

## 📌 Summary

* Access tokens can be **opaque** or **JWT-based**.
* JWKS enables public key distribution for verifying signed tokens.
* The `@kaapi/oauth2-auth-design` package provides:

  * `jwksRoute()` — serve JWKS public keys
  * `setJwksKeyStore()` — define key storage strategy
  * `setJwksRotatorOptions()` — handle key rotation
  * `setPublicKeyExpiry()` — control key TTL
  * `useAccessTokenJwks(true)` — verify JWTs automatically
  * `validate()` — define custom validation for opaque or JWT tokens
* Supported across all flows: **Authorization Code**, **Client Credentials**, and **Device Authorization**.

---

## 📊 Token Flow Overview

Below is a diagram summarizing JWT access token behavior:

```
        +-------------------+
        |   OAuth2/OIDC     |
        |  Authorization    |
        |    Server         |
        +-------------------+
                 |
                 | Generates JWT access token using
                 | createJwtAccessToken() / createIdToken()
                 |  (signed with JWKS private key)
                 v
        +-------------------+
        |  Access Token     |
        |  (JWT signed)     |
        +-------------------+
                 |
                 | Sent to Client
                 v
        +-------------------+
        |      Client       |
        +-------------------+
                 |
                 | Uses token to access
                 | protected resource
                 v
        +-------------------+
        |  Resource Server  |
        |                   |
        |  useAccessTokenJwks(true)
        |  - Verify signature using JWKS public key
        |  - Extract claims
        |  - Validate via validate() method
        |                   |
        +-------------------+
                 ^
                 | JWKS Endpoint exposes public keys
                 | (/oauth2/keys or custom path)
                 |
        +-------------------+
        |   JWKS Key Store  |
        |  (private + public|
        |   keys, rotation) |
        +-------------------+
                 |
                 | Periodic rotation / TTL management
                 v
        +-------------------+
        |  Rotated Keys     |
        +-------------------+
```