# OAuth2 Authorization Code Flow with `authorizationRoute`

This guide demonstrates how to implement an OpenID Connect (OIDC) Authorization Code flow using the `OIDCAuthorizationCodeBuilder` from the [`@kaapi/oauth2-auth-design`](https://www.npmjs.com/package/@kaapi/oauth2-auth-design) package.

The `authorizationRoute` method defines the core logic for handling both login and consent steps within the authorization process.

---

## Example Implementation

```ts
import {
  ClientSecretBasic,
  ClientSecretPost,
  createMatchAuthCodeResult,
  NoneAuthMethod,
  OAuth2ErrorCode,
  OIDCAuthorizationCodeBuilder
} from '@kaapi/oauth2-auth-design'

import logger from './logger'
import db from './database'
import { encode } from './encoder';

export default OIDCAuthorizationCodeBuilder
  .create({ logger })
  .setTokenTTL(3600)
  .addClientAuthenticationMethod(new ClientSecretBasic())
  .addClientAuthenticationMethod(new ClientSecretPost())
  .addClientAuthenticationMethod(new NoneAuthMethod())
  .useAccessTokenJwks(true)
  .authorizationRoute<object, { Payload: { email?: string, password?: string, step?: string, submit?: string } }>(route =>
    route
      .setPath('/oauth2/v2/authorize')
      .setUsernameField('email')
      .setPasswordField('password')

      .setGETResponseRenderer(async (context, params, req, h) => {
        const client = await db.clients.findById(params.clientId)
        if (!client) {
          return h.view('error', {
            ...context,
            error: OAuth2ErrorCode.INVALID_CLIENT,
            errorMessage: 'Invalid client'
          }).code(400)
        }

        const session = req.state['session']
        if (session?.user) {
          const user = await db.users.findById(session.user)
          if (user) {
            return h.view('consent-page', { clientName: client.name })
          }
        }

        return h.view('authorization-page', context)
      })

      .setPOSTErrorRenderer(async (context, _params, _req, h) => {
        return h.view('authorization-page', context).code(context.statusCode)
      })

      .generateCode(async ({ clientId, codeChallenge, scope, nonce }, { payload, state }, h) => {
        const client = await db.clients.findById(clientId)
        if (!client) return null

        if (payload.step === 'consent' && payload.submit === 'allow') {
          const session = state.session
          if (session?.user) {
            const code = encode({
              clientId, scope, nonce, user: session.user,
              expiresAt: Date.now() + 10_000, createdAt: Date.now()
            })

            await db.authCodes.insertOne({
              id: code,
              clientId,
              codeChallenge,
              scope,
              nonce,
              user: session.user,
              expiresAt: Date.now() + 10_000
            })

            return { type: 'code', value: code }
          }
          return { type: 'deny' }
        }

        if (!payload.email || !payload.password) return null

        const user = await db.users.findByCredentials(payload.email, payload.password)
        if (user) {
          h.state('session', { user: user.id })
          return { type: 'continue' }
        }

        return null
      })

      .finalizeAuthorization(async (ctx, params, _req, h) => {
        const matcher = createMatchAuthCodeResult({
          code: async () => h.redirect(`${ctx.fullRedirectUri}`),
          continue: async () => {
            const client = await db.clients.findById(params.clientId)
            return h.view('consent-page', { clientName: client.name })
          },
          deny: async () => h.redirect(`${ctx.fullRedirectUri}`)
        })

        return matcher(ctx.authorizationResult)
      })
  )
```

---

## `authorizationRoute` Explained

The `authorizationRoute()` method defines the full lifecycle of the **authorization endpoint**, handling login, consent, and code generation for the **Authorization Code Flow**.

---

### 🔧 Configuration Methods

| Method                            | Purpose                                                                    |
| --------------------------------- | -------------------------------------------------------------------------- |
| `setPath('/oauth2/v2/authorize')` | Sets the authorization endpoint path. Default is `/oauth2/authorize`.      |
| `setUsernameField('email')`          | Defines the field name for the user's email input in the login payload.    |
| `setPasswordField('password')`    | Defines the field name for the user's password input in the login payload. |

---

### 📥 `setGETResponseRenderer`

Handles GET requests to the authorization endpoint — typically used to render the login or consent form.

* Validates client by `clientId`.
* If the user is already logged in (via session), renders a consent page.
* Otherwise, shows the login page.

---

### 📤 `setPOSTErrorRenderer`

Handles failed login or invalid payloads submitted to the authorization endpoint.

* Renders the login form again with appropriate error context/status.

---

### 🔐 `generateCode`

Main handler for form submissions (POST):

* **Consent Step**: If `payload.step === 'consent'` and user clicked "allow", a code is generated and stored in the DB.
* **Login Step**: Authenticates user via `email` and `password`.

  * On success: session is created, and flow continues to consent.
  * On failure or invalid input: returns `null` to trigger `setPOSTErrorRenderer`.

**Return Values:**

| Type         | Behavior                                                   |
| ------------ | ---------------------------------------------------------- |
| `'code'`     | Code was successfully generated. Redirect will occur.      |
| `'continue'` | Proceed to the next step (e.g., show consent screen).      |
| `'deny'`     | User denied access. Redirect with error.                   |
| `null`       | Failed login or invalid input. Triggers fallback renderer. |

---

### ✅ `finalizeAuthorization`

Finalizes the authorization flow by mapping the result returned by `generateCode()`.

Uses `createMatchAuthCodeResult` to match the result and define what to return:

| Result       | Action                                          |
| ------------ | ----------------------------------------------- |
| `'code'`     | Redirect to the client with authorization code. |
| `'continue'` | Show the consent page again.                    |
| `'deny'`     | Redirect to client with access denied error.    |

---

## 🧠 Session Management

Sessions are used to persist the authenticated user between login and consent steps. The session is stored using `h.state('session', ...)`.

---

## 🗃️ Data Storage

* **Users**: Fetched by credentials or session ID.
* **Clients**: Verified via `clientId` param.
* **Auth Codes**: Persisted in the DB with related metadata.

---

## 🛡️ Security Features

* **Client Authentication**: Supports `ClientSecretBasic`, `ClientSecretPost`, and `NoneAuthMethod`.
* **JWT Access Token Verification**: Enabled via `.useAccessTokenJwks(true)`.

---

## 🔁 Flow Overview

1. **GET `/oauth2/v2/authorize`**
   → Login form rendered

2. **POST `/oauth2/v2/authorize` with credentials**
   → Authenticated → session created → consent page shown

3. **POST with consent step**
   → Code generated → redirected to client

---

## Summary

The `authorizationRoute()` is a comprehensive and extensible way to handle the OAuth2/OIDC authorization code flow, with clearly defined steps for rendering pages, authenticating users, handling consent, and issuing authorization codes.

The `OAuth2AuthorizationCodeBuilder.authorizationRoute()` is structurally identical to the OIDC version.

---
