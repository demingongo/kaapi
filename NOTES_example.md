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
