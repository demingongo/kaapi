 **OAuth2 Client Credentials Provider** built with `@kaapi/oauth2-auth-design`.

---

# 📘 OAuth2 Client Credentials Provider – Documentation

This module defines an OAuth2 provider implementing the **Client Credentials Grant** for machine-to-machine (M2M) authentication using **JWT access tokens** verified via **JWKS**.

---

## 🚀 Features Overview

| Feature                         | Description                                 |
| ------------------------------- | ------------------------------------------- |
| **Grant Type**                  | `client_credentials`                        |
| **Token Type**                  | `Bearer` (JWT)                              |
| **Client Authentication**       | `client_secret_basic`, `client_secret_post` |
| **JWKS Support**                | ✅ Enabled (`/.well-known/jwks.json`)        |
| **JWKS Storage**                | In-memory store (dev environment)           |
| **Token Lifetime (TTL)**        | 3600 seconds (1 hour)                       |
| **Scopes**                      | Custom-defined access scopes                |
| **Machine Identity Validation** | DB-based via JWT `machine` claim            |

---

## 📡 Endpoints

### 🔑 `/oauth2/token` — Token Endpoint

Used to request access tokens via the Client Credentials grant.

#### Request

* **Method**: `POST`
* **Content-Type**: `application/x-www-form-urlencoded`
* **Auth**: `Basic` or form-based client credentials

#### Parameters

| Name            | Required | Description                  |
| --------------- | -------- | ---------------------------- |
| `grant_type`    | ✅        | Must be `client_credentials` |
| `client_id`     | ✅        | OAuth2 client ID             |
| `client_secret` | ✅        | OAuth2 client secret         |
| `scope`         | Optional | Space-separated scopes       |

#### Example

```bash
curl -X POST https://your-api.com/oauth2/token \
  -u my-client-id:my-client-secret \
  -d 'grant_type=client_credentials&scope=read:data write:data'
```

#### Successful Response

```json
{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read:data write:data",
  "id_token": "<JWT>" // Only if "openid" scope is present
}
```

---

### 🔐 `/.well-known/jwks.json` — JWKS Endpoint

Exposes public keys for **JWT access token verification** by resource servers.

* Configured via:

  ```ts
  .jwksRoute(route => route.setPath('/.well-known/jwks.json'))
  .setJwksStore(getInMemoryJWKSStore())
  ```
* JWKS format supports key rotation, and clients should always use the `kid` to select the correct key.

---

## 🔑 JWT Access Token

* **Format**: JWT
* **Signed with**: Asymmetric key (exposed via JWKS)
* **Example Claims**:

```json
{
  "machine": "abc-123",
  "name": "Data Pipeline",
  "type": "machine",
  "iat": 1690000000,
  "exp": 1690003600,
  ...
}
```

---

## 🔍 Token Validation Logic

On each request using a JWT, the provider:

1. Verifies the JWT signature using JWKS.

2. Validates the payload:

   ```ts
   const user = jwtAccessTokenPayload?.type === 'machine' &&
       jwtAccessTokenPayload?.machine
       ? await db.users.findById(`${jwtAccessTokenPayload.machine}`)
       : undefined;
   ```

3. If valid, attaches credentials to the session:

   ```ts
   {
     user: {
       machine: string,
       name: string,
       type: 'machine'
     }
   }
   ```

4. If the machine is **not found**, the request is rejected.

---

## 📚 Supported Scopes

Define the access level granted to the client. Pass via the `scope` parameter.

| Scope           | Description                  |
| --------------- | ---------------------------- |
| `read:data`     | Retrieve/query data          |
| `write:data`    | Create/update data           |
| `delete:data`   | Remove data                  |
| `read:config`   | Access configuration         |
| `write:config`  | Modify configuration         |
| `read:logs`     | Retrieve logs/audit trails   |
| `write:logs`    | Send/store logs              |
| `execute:tasks` | Run predefined tasks/jobs    |
| `manage:tokens` | Manage access/refresh tokens |
| `admin:all`     | Full administrative access   |

---

## ⚠️ Error Handling

| Error Type        | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `invalid_request` | Missing required parameters (e.g. `client_secret`, `ttl`)          |
| `invalid_client`  | Credentials do not match any known client                          |
| `invalid_scope`   | Requested scopes not recognized                                    |
| `unauthorized`    | Token payload did not validate (e.g. missing or invalid `machine`) |

---

## 🔐 Security Best Practices

| Area                   | Recommendation                              |
| ---------------------- | ------------------------------------------- |
| JWT `exp` (expiration) | Keep short (e.g. 15–60 minutes)             |
| JWKS Key Rotation      | Rotate every 3–6 months (with grace period) |
| Client Secrets         | Store securely, rotate periodically         |
| Scope Usage            | Enforce least privilege                     |
| Token Logging          | Avoid logging sensitive tokens              |

---

## 📦 Development Notes

* The provider uses **in-memory JWKS** via:

  ```ts
  .setJwksStore(getInMemoryJWKSStore())
  ```

  This is fine for local dev/testing, but should be replaced in production with:

  * A persistent JWKS store (e.g., Redis, DB, Vault)
  * Key rotation mechanisms
  * Secure private key storage

---

## 📘 Reference

* [OAuth2 Client Credentials Grant](https://www.oauth.com/oauth2-servers/access-tokens/client-credentials/)
* [JWT (RFC 7519)](https://datatracker.ietf.org/doc/html/rfc7519)
* [JWKS (RFC 7517)](https://datatracker.ietf.org/doc/html/rfc7517)

---

Perfect — here is the **Markdown version** of the documentation, ready to paste into your internal or public Wiki.

---

# 🛡️ OAuth2 Client Credentials Provider with `@kaapi/oauth2-auth-design`

This example shows how to create and register an **OAuth2 Client Credentials** provider using the [`@kaapi/oauth2-auth-design`](https://www.npmjs.com/package/@kaapi/oauth2-auth-design) module in a [`@kaapi/kaapi`](https://github.com/kaapi/kaapi) application.

---

## 📦 What This Example Does

* Implements **Client Credentials** grant flow.
* Issues JWT access tokens.
* Supports `client_secret_basic` and `client_secret_post` authentication.
* Exposes `.well-known/jwks.json` for JWKS key discovery.
* Uses an in-memory JWKS keystore (for development).
* Defines and validates access token structure.
* Adds custom token generation logic using your database.
* Supports optional `id_token` issuance if the `openid` scope is requested.

---

## ⚙️ Code Example

```ts
import {
  BearerToken,
  ClientSecretBasic,
  ClientSecretPost,
  createInMemoryKeyStore,
  OAuth2TokenResponse,
  OIDCClientCredentialsBuilder
} from '@kaapi/oauth2-auth-design'

import db from './database'

export default OIDCClientCredentialsBuilder
  .create()
  .setTokenType(new BearerToken())                   // Optional, default is Bearer
  .setTokenTTL(3600)                                 // Token TTL in seconds (1h)
  .addClientAuthenticationMethod(new ClientSecretBasic()) // Enable client_secret_basic
  .addClientAuthenticationMethod(new ClientSecretPost())  // Enable client_secret_post
  .useAccessTokenJwks(true)                          // Enable JWT verification with JWKS
  .jwksRoute(route => route.setPath('/.well-known/jwks.json')) // JWKS discovery endpoint
  .setJwksKeyStore(createInMemoryKeyStore())         // In-memory key store (dev only)
  .validate(async (_, { jwtAccessTokenPayload }) => {
    const user = jwtAccessTokenPayload?.type === 'machine' &&
                 jwtAccessTokenPayload?.machine
      ? await db.users.findById(`${jwtAccessTokenPayload.machine}`)
      : undefined

    return user
      ? {
          isValid: true,
          credentials: {
            user: {
              machine: user.id,
              name: user.name,
              type: 'machine'
            }
          }
        }
      : { isValid: false }
  })
  .tokenRoute(route =>
    route
      .setPath('/oauth2/token') // Optional, defaults to /oauth2/token
      .generateToken(async ({
        clientId,
        clientSecret,
        ttl,
        scope,
        tokenType,
        createJwtAccessToken,
        createIdToken
      }) => {
        if (!clientSecret) {
          return {
            error: 'invalid_request',
            error_description: 'Missing client_secret.'
          }
        }

        if (!ttl) {
          return {
            error: 'invalid_request',
            error_description: 'Missing ttl.'
          }
        }

        const client = await db.clients.findByCredentials(clientId, clientSecret)
        if (!client) {
          return { error: 'invalid_client' }
        }

        try {
          if (createJwtAccessToken) {
            const { token: accessToken } = await createJwtAccessToken({
              machine: client.details?.id,
              name: client.details?.name,
              type: 'machine'
            })

            return new OAuth2TokenResponse({ access_token: accessToken })
              .setExpiresIn(ttl)
              .setScope(scope?.split(' '))
              .setTokenType(tokenType)
              .setIdToken(
                scope?.includes('openid') &&
                (await createIdToken?.({ sub: clientId }))?.token
              )
          }
        } catch (err) {
          console.error('Token generation failed:', err)
        }

        return null
      })
  )
  .setDescription('Client credentials grant flow. [More info](https://www.oauth.com/oauth2-servers/access-tokens/client-credentials/)')
  .setScopes({
    'read:data': 'Allows the client to retrieve or query data from the service.',
    'write:data': 'Allows the client to create or update data in the service.',
    'delete:data': 'Allows the client to remove data from the service.',
    'read:config': 'Allows the client to access configuration or metadata settings.',
    'write:config': 'Allows the client to modify configuration or metadata settings.',
    'read:logs': 'Allows the client to retrieve logs or audit trails from the service.',
    'write:logs': 'Allows the client to send or store logs into the system.',
    'execute:tasks': 'Allows the client to trigger or run predefined tasks or jobs.',
    'manage:tokens': 'Allows the client to manage access or refresh tokens for automation.',
    'admin:all': 'Grants full administrative access to all available resources and operations.'
  })
// .build() — Don't forget to call `.build()` before registering in Kaapi!
```

---

## 🛠 How to Register in Kaapi

After building the provider:

```ts
import { Kaapi } from '@kaapi/kaapi'
import authDesign from './auth/client-credentials-provider'

const app = new Kaapi({
    port: 3000,
    host: 'localhost'
})

app.extend(authDesign.build())
```

---

## 📡 Exposed Endpoints

| Endpoint                     | Purpose                        |
| ---------------------------- | ------------------------------ |
| `POST /oauth2/token`         | Token issuance endpoint        |
| `GET /.well-known/jwks.json` | Public JWKS for JWT validation |

---

## 🔐 Requirements

* `client_id` and `client_secret` are required in the request.
* Clients must exist in your database and be validated during `generateToken`.
* Access tokens contain a payload like:

  ```json
  {
    "machine": "client-id",
    "name": "client-name",
    "type": "machine"
  }
  ```
* Optional `id_token` will be added if `openid` is in the requested scope.

---

## ⚠️ Notes

* `createInMemoryKeyStore()` is suitable only for development. In production, use a persistent keystore (e.g. Redis, file, or database).
* Scope configuration is optional but highly recommended to control client capabilities.
* `validate` is a hook to validate the decoded JWT on protected routes.

---

Let me know if you’d like a version with additional formatting (e.g., for GitHub wiki), or to split this into multiple sections!

