# OAuth2 Authorization Code Flow with `authorizationRoute`

This guide demonstrates how to implement an OpenID Connect (OIDC) Authorization Code flow using the `OIDCAuthorizationCodeBuilder` from the [`@kaapi/oauth2-auth-design`](https://www.npmjs.com/package/@kaapi/oauth2-auth-design) package.

The `authorizationRoute()` method defines the full logic for managing login, consent, and authorization code issuance within the authorization process.

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

export default OIDCAuthorizationCodeBuilder
  .create()
  .addClientAuthenticationMethod(new ClientSecretBasic())
  .addClientAuthenticationMethod(new ClientSecretPost())
  .addClientAuthenticationMethod(new NoneAuthMethod())
  .authorizationRoute<object, { Payload: { email?: string, password?: string, step?: string, submit?: string } }>(route =>
    route
      .setPath('/oauth2/authorize')
      .setEmailField('email')
      .setPasswordField('password')

      .setGETResponseRenderer(async (context, params, req, h) => {
        const { clientId } = params

        const isClientValid = true // placeholder: validate your client here
        const isUserLoggedIn = false // placeholder: read from session or cookie

        if (!isClientValid) {
          return h.view('error', {
            error: OAuth2ErrorCode.INVALID_CLIENT,
            errorMessage: 'Invalid client'
          }).code(400)
        }

        if (isUserLoggedIn) {
          return h.view('consent-page', { clientId })
        }

        return h.view('authorization-page', {
          emailField: context.emailField,
          passwordField: context.passwordField
        })
      })

      .setPOSTErrorRenderer(async (context, params, req, h) => {
        return h.view('authorization-page', context).code(context.statusCode)
      })

      .generateCode(async (params, req, h) => {
        const { payload, state } = req

        // Consent step
        if (payload.step === 'consent' && payload.submit === 'allow') {
          const userId = state.session?.user
          if (userId) {
            const generatedCode = 'auth-code-for-user' // generate and persist your code
            return { type: 'code', value: generatedCode }
          }

          return { type: 'deny' }
        }

        // Login step
        const { email, password } = payload
        if (email === 'user@example.com' && password === 'password') {
          h.state('session', { user: 'user-id' }) // store user in session
          return { type: 'continue' }
        }

        return null
      })

      .finalizeAuthorization(async (ctx, params, _req, h) => {
        const matcher = createMatchAuthCodeResult({
          code: async () => h.redirect(ctx.fullRedirectUri),
          continue: async () => h.view('consent-page', { clientId: params.clientId }),
          deny: async () => h.redirect(ctx.fullRedirectUri)
        })

        return matcher(ctx.authorizationResult)
      })
  )
```

---

## `authorizationRoute()` Overview

The `authorizationRoute()` method defines the complete behavior of the **authorization endpoint**, from login to consent and code issuance. It coordinates login handling, user consent, and authorization code generation as required by the OAuth2 Authorization Code flow and OpenID Connect specifications.

The builder supports customization through various lifecycle methods.

---

### 🔧 Configuration Methods

| Method                            | Purpose                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `setPath('/oauth2/authorize')` | Defines the path for the authorization endpoint. Default is `/oauth2/authorize`. |
| `setEmailField(field)`            | Defines the field name used to capture the user’s email during login.            |
| `setPasswordField(field)`         | Defines the field name used to capture the password during login.                |

---

### 🧾 `params` Object

The `params` argument is provided to each handler and contains only a **subset** of parsed query parameters from the authorization request. These are already validated by the package and mapped to specific fields:

| Field           | Description                                      |
| --------------- | ------------------------------------------------ |
| `clientId`      | The client making the request.                   |
| `redirectUri`   | Redirect URI to return the authorization result. |
| `responseType`  | Expected response type (typically `code`).       |
| `scope`         | Space-delimited scopes requested.                |
| `codeChallenge` | PKCE code challenge, if provided.                |
| `nonce`         | Nonce parameter used in OIDC.                    |
| `state`         | Opaque value sent by the client to maintain state between the request and callback.                  |

This object does **not** contain raw query parameters or payloads. You should use the `request` argument to access full query/body details if needed.

---

### 🧾 `context` Object

Each lifecycle method receives a `context` object, but its structure depends on which method you're in:

#### In `setGETResponseRenderer` and `setPOSTErrorRenderer`

| Field           | Description                                       |
| --------------- | ------------------------------------------------- |
| `emailField`    | Name of the field used for email input.           |
| `passwordField` | Name of the field used for password input.        |
| `statusCode`    | (In `setPOSTErrorRenderer`) Response status code. |
| `error`         | (Optional) OAuth2 error code.                     |
| `errorMessage`  | (Optional) Error description.                     |

Used mainly for rendering UI templates (e.g. login form or error display).

---

#### In `finalizeAuthorization`

| Field                 | Description                                        |
| --------------------- | -------------------------------------------------- |
| `authorizationResult` | The result returned by `generateCode()`. One of: `'code'`, `'continue'`, `'deny'`.          |
| `fullRedirectUri`     | Fully constructed URI for client redirection.      |
| `emailField`          | Field name for email (from earlier configuration). |
| `passwordField`       | Field name for password.                           |

This context is used to determine how to finalize the user's decision and redirect appropriately.

---

### 📥 `setGETResponseRenderer()`

This method handles GET requests to the authorization endpoint.

You typically use this to validate the client ID and either show the login form or, if the user is already authenticated (via session or cookies), display a consent page. The `context` provides helper fields like `emailField` and `passwordField` for use in rendering the login UI.

---

### ❌ `setPOSTErrorRenderer()`

Executed when form submissions (POST requests) fail validation or credentials are missing. This renderer displays the login page again, using the same context that failed.

---

### 🔐 `generateCode()`

Processes POST requests to handle user authentication and consent logic, returning the next step in the authorization process. It supports four return types:

| Return Type            | Behavior                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- |
| `{ type: 'code', value: string }`     | Issues a valid authorization code, which the client can exchange for tokens.                     |
| `{ type: 'continue' }` | Indicates the login succeeded and consent step should follow.                 |
| `{ type: 'deny' }`     | Indicates the user denied the request. Redirect will include error `access_denied`.           |
| `null`                 | Indicates an invalid login or bad payload. Triggers `setPOSTErrorRenderer()`. |

This method receives both the parsed `params` and the full request payload. You are free to plug in any storage logic to verify credentials, manage sessions, and issue codes.

---

### 🚪 `finalizeAuthorization()`

This final handler determines how to complete the flow after `generateCode()` has run.

It maps the result using the `createMatchAuthCodeResult()` helper, which defines what to do for each result type (`code`, `continue`, `deny`). The `fullRedirectUri` is already constructed for you with the appropriate query parameters.

---

## 🔐 Sessions

The example demonstrates storing the user in a session using `h.state('session', ...)`. This allows the flow to persist the authenticated user between login and consent steps. How you implement session storage is fully customizable.

---

## 🔁 Flow Recap

1. **GET `/oauth2/authorize`**
   → Validates the client and shows either the login form or the consent page.

2. **POST `/oauth2/authorize` with credentials**
   → Authenticates the user. If successful, proceeds to the consent page.

3. **POST `/oauth2/authorize` with consent**
   → Issues the authorization code and redirects to the client’s `redirect_uri`.

---

## Summary

The `authorizationRoute()` method provides complete control over how the authorization endpoint behaves in the Authorization Code flow. You define how the login and consent steps are rendered and handled, including how the authorization code is issued and returned to the client for token exchange.

This pattern is designed for full extensibility, allowing you to plug in any session, storage, or UI logic while remaining compliant with OAuth2 and OpenID Connect standards.

The `authorizationRoute()` method works the same way for both `OAuth2AuthorizationCodeBuilder` and `OIDCAuthorizationCodeBuilder`.

---

👉 Next: [[Implement the token endpoint|Authorization-‐-OAuth2-‐-Tuto-4-‐-Token-Issuance-with-tokenRoute]] to exchange the authorization code for tokens.

