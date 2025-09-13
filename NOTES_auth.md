`prompt=none` is a parameter you can add to the **OpenID Connect (OIDC)** authorization request to perform a **silent login** — i.e., re-authenticate the user **without showing a login UI**.

---

## 🧠 In simple terms:

> `prompt=none` tells the authorization server:
> **"Try to authenticate the user silently. If they’re not logged in, just fail — don’t show the login screen."**

---

## ✅ Use Case: Silent Reauthentication (e.g. to refresh `id_token`)

This is commonly used when:

* You want to **get a new `id_token`** without user interaction.
* The user is already logged in (has a session cookie).
* You want to check if the session is still valid.
* You want to re-fetch updated user claims.

---

## 📦 Example Authorization Request with `prompt=none`

```http
GET https://auth.example.com/authorize?
  response_type=id_token
  &client_id=your-client-id
  &redirect_uri=https://yourapp.com/callback
  &scope=openid
  &nonce=abc123
  &state=xyz456
  &prompt=none
```

If the user has an active session:

* ✅ The server returns a new `id_token` (without showing a login screen).

If the user **is not logged in** or needs to re-consent:

* ❌ The server returns an **error** like `login_required`.

---

## 💡 Common Use: Single Sign-On (SSO)

You use `prompt=none` to:

* Check if the user is still logged in (via an invisible iframe).
* Automatically log them in again (if possible).
* Refresh their `id_token` and user claims without interrupting the UX.

---

## 🚨 Important Notes

* **It must be called in a browser context** where session cookies are available.
* Usually done in a **hidden iframe** to avoid user interruption.
* Won’t work in **native/mobile apps** unless using browser sessions (via embedded browser or system browser).

---

## ❗ Example Failure Response (when not logged in)

```json
{
  "error": "login_required",
  "error_description": "The user is not logged in."
}
```

This allows your app to gracefully fall back to showing a login prompt if needed.

---

## ✅ Summary

| Feature          | `prompt=none` Behavior      |
| ---------------- | --------------------------- |
| UI Shown         | ❌ No UI shown               |
| User interaction | ❌ Not allowed               |
| Used for         | Silent auth / refresh       |
| Works if         | User has active session     |
| Fails if         | No session / consent needed |

---

Exactly — you've got it 💯

When you send a request with `prompt=none`:

> **If the user is already authenticated** (typically via an active session stored in a browser cookie),
> 👉 the Identity Provider (IdP) will skip the login UI and **immediately redirect** back to the `redirect_uri`,
> ✅ including a fresh `id_token` (and possibly `access_token`), just like in a normal login.

---

## ✅ What happens (step-by-step):

### 🔁 Request:

```http
GET https://auth.example.com/authorize?
  response_type=id_token
  &client_id=your-client-id
  &redirect_uri=https://yourapp.com/callback
  &scope=openid
  &nonce=random_nonce
  &state=random_state
  &prompt=none
```

### 🧠 Internally:

1. The user’s browser **includes cookies** (if they exist) for `auth.example.com`.
2. The IdP checks:

   * Are the session cookies valid?
   * Is the user still authenticated?
3. If yes:

   * ✅ The IdP creates a new `id_token`.
   * ✅ Redirects back to your app via `redirect_uri` with the token.
4. If no:

   * ❌ Redirects back to your app with an error, like `login_required`.

---

## ✅ Example Success Redirect

```http
https://yourapp.com/callback#
  id_token=eyJ...<jwt>...
  &state=random_state
```

---

## ❌ Example Failure Redirect

```http
https://yourapp.com/callback#
  error=login_required
  &state=random_state
```

You can detect this and fall back to showing the login screen.

---

## 🔐 Why this matters

* Enables **Single Sign-On (SSO)** experience.
* Lets you **refresh ID tokens** without using refresh tokens (in SPAs, for example).
* Keeps user experience **seamless** — no login screen flashes.
* **Avoids unnecessary logins** if the session is still active.

---

## 🧪 Common implementation: in-browser apps

In SPAs, this is usually done via a **hidden `<iframe>`**, like:

```html
<iframe
  src="https://auth.example.com/authorize?prompt=none&..."
  style="display:none"
  id="silent-auth-frame">
</iframe>
```

Your frontend listens for the redirect in that iframe and parses the response.

---

Exactly — with `prompt=none`, the redirect **can include either**:

1. An **`id_token` directly** (if you're using `response_type=id_token` or `id_token token`), or
2. An **authorization `code`** (if you're using `response_type=code`), which your app then exchanges for tokens — **just like in normal login**.

---

## ✅ Two options, based on `response_type`

| `response_type`  | What you get on redirect    | Requires token request?                   |
| ---------------- | --------------------------- | ----------------------------------------- |
| `id_token`       | Just the `id_token`         | ❌ No                                      |
| `id_token token` | `id_token` + `access_token` | ❌ No                                      |
| `code`           | Authorization `code`        | ✅ Yes (use `/token`)                      |
| `code id_token`  | Both `code` and `id_token`  | ✅ Yes (optional, if you want full tokens) |

---

### 🧪 Common in modern apps: `response_type=code` + `prompt=none`

This is the **preferred way in production** because:

* You use **PKCE** (Proof Key for Code Exchange) — which is secure even without a client secret.
* The ID token and access token are returned **only after exchanging the code** (safer).
* You get a full token response: `access_token`, `id_token`, `refresh_token`.

---

## 🔁 Example Flow with `prompt=none` and `response_type=code`

### 🔸 Step 1: Your app silently redirects to the Auth Server

```http
GET https://auth.example.com/authorize?
  response_type=code
  &client_id=your-client-id
  &redirect_uri=https://yourapp.com/callback
  &scope=openid profile email
  &code_challenge=abc123
  &code_challenge_method=S256
  &state=xyz
  &nonce=12345
  &prompt=none
```

---

### 🔸 Step 2: If session is valid → Redirect with `code`

```http
https://yourapp.com/callback?code=xyz789&state=xyz
```

---

### 🔸 Step 3: Your app exchanges the code for tokens

```http
POST https://auth.example.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=xyz789
&client_id=your-client-id
&redirect_uri=https://yourapp.com/callback
&code_verifier=original-code-verifier
```

---

### 🔸 Response:

```json
{
  "access_token": "abc...",
  "id_token": "eyJ...",
  "refresh_token": "def...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

---

## 🔐 Best Practices

* Always use `response_type=code` with **PKCE** in frontend/browser apps.
* Use `prompt=none` only when trying to **refresh a session** silently.
* Handle `error=login_required` to fall back to interactive login.

---

Great question — and you're right to be curious, because **Device Authorization Flow** (as defined in [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)) works **very differently** from standard OAuth flows like the Authorization Code Flow.

---

## ✅ **Short answer:**

> In the **Device Authorization Flow**, the `response_type` parameter is **not used at all** — it's not part of the spec.

---

## 🔍 Why?

Because the Device Flow is a **two-step, out-of-band flow**:

1. **Device starts the flow** by POSTing to the `/device_authorization` endpoint to get a `device_code` and `user_code`.
2. **User logs in on a separate device** (e.g., phone or browser), using the `user_code`.
3. **Device polls the `/token` endpoint** with the `device_code` until it gets tokens (or an error).

---

### 🛠️ So what is sent?

#### 🔹 Device Authorization Request (`/device_authorization`):

```http
POST /device_authorization
Content-Type: application/x-www-form-urlencoded

client_id=your-client-id
&scope=openid profile email
```

No `response_type` here.

#### 🔹 Device then polls the token endpoint (`/token`):

```http
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=xyz123
&client_id=your-client-id
```

No `response_type` here either — instead, it uses `grant_type=device_code`.

---

## 🧠 Important: Tokens returned

Once the user authorizes, the token response can include:

* `access_token` ✅
* `id_token` (if scope included `openid`) ✅
* `refresh_token` (if scope included `offline_access` and the provider allows it) ✅

So your device **can receive an `id_token`**, **but only based on the scopes**, not `response_type`.

---

## 📦 Summary

| Parameter       | Supported in Device Flow? | Notes                                     |
| --------------- | ------------------------- | ----------------------------------------- |
| `response_type` | ❌ No                      | Not used at all                           |
| `grant_type`    | ✅ Yes                     | Must be `device_code` during polling      |
| `scope`         | ✅ Yes                     | Needed to request `openid`, `email`, etc. |
| `client_id`     | ✅ Yes                     | Required                                  |
| `device_code`   | ✅ Yes (in token request)  | Returned from `/device_authorization`     |

---

## 🚨 Pro tip

If you're building or debugging a device flow client:

* ✅ Make sure you're sending correct `scope` to get `id_token`.
* ❌ Don’t send `response_type` — it may break or be ignored.
* 🔁 Implement the polling logic with proper backoff and error handling (`authorization_pending`, `slow_down`, `access_denied`, etc.).

---

Excellent question — you're diving into the fine details of OpenID Connect discovery configuration, and the answer is nuanced but clear:

---

## ✅ TL;DR:

> **Yes, you still need to include `response_types_supported`** in your OpenID Provider configuration,
> even if you're only supporting the `device_code` grant — **but** you can provide a **minimal or empty value** if no interactive flows are supported.

---

## 📜 Official spec reference:

From the OpenID Connect Discovery Spec ([OIDC Discovery 1.0, §3](https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata)):

> `response_types_supported`
>
> > REQUIRED. JSON array containing a list of the OAuth 2.0 `response_type` values that this OP supports.

So:

* ✅ It's **required** in the metadata.
* ❌ It **cannot be omitted**.

---

## 🧩 But here's the nuance for **device-only** flows:

Since the **Device Authorization Flow doesn't use any `response_type`**, this field is:

* Semantically **not useful** for your actual flow, but
* **Required syntactically** by the spec.

---

## 🔧 Your options

### ✅ Option 1: Minimal safe default

```json
"response_types_supported": ["code"]
```

This is the most common approach even for providers that **only support `device_code`**. Why?

* `"code"` is a valid standard response type.
* Some libraries or clients expect at least one valid entry.
* It keeps your metadata technically valid without misleading values.

### ⚠️ Option 2: Empty array

```json
"response_types_supported": []
```

* Technically **valid** per spec.
* But may **break some OIDC clients** or SDKs that assume at least one response type is supported.
* Not widely seen in production metadata.

---

## ✅ Recommended practice

Even if you only support the Device Authorization Grant, set:

```json
"response_types_supported": ["code"]
```

Because:

* It's **required** by the discovery spec.
* It avoids issues with parsers or client libraries.
* It’s semantically aligned with "authorization code" even if unused.

(Think of it like a stub — it's there to satisfy spec + interoperability.)

---

## 🧪 Real-world examples

Here’s what providers like Microsoft or Auth0 show, even though they support device flow:

```json
"response_types_supported": [
  "code",
  "id_token",
  "token id_token"
]
```

Even if your actual usage doesn’t use those — the field is required.

---

## ✅ Summary

| Question                                | Answer                      |
| --------------------------------------- | --------------------------- |
| Is `response_types_supported` required? | ✅ Yes (by OIDC spec)        |
| Should I include it for device flow?    | ✅ Yes                       |
| Can it be empty?                        | ⚠️ Yes, but not recommended |
| Best practice value?                    | `["code"]`                  |

---

## ✅ Why it's okay **not to support `response_type=id_token` by default**

### 1. **It's an optional feature** in most real-world providers

* The `response_type=id_token` (aka **implicit flow**) is primarily used in older or specific browser-based flows.
* It's **deprecated** in modern security guidance (e.g. [OAuth 2.1 draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)).

### 2. **Less secure and harder to implement properly**

* Tokens are returned in the URL fragment `#`, which:

  * Exposes them to browser history, logs, referrers, etc.
  * Requires special handling by SPAs (JavaScript parsing).
* Requires **special handling of signing, claims, and client validation** that varies case by case.

### 3. **Most modern apps use `response_type=code`**

* When paired with **PKCE**, it's the secure, preferred method for:

  * Browser apps
  * Mobile apps
  * Public clients

### 4. **Delegating this to the app developer makes sense**

* If a developer really wants `response_type=id_token`, they probably:

  * Know why they want it
  * Have a specific use case (e.g. SSO login without access token)
  * Need to customize the **ID token content** (claims, signing, etc.)

---

## 🔧 Best practice for your provider library

You can safely default to:

```json
"response_types_supported": ["code"]
```

And document:

> To support other response types like `id_token` or `id_token token`, you must implement appropriate logic (e.g. token generation, signing, audience validation) in your own handler.

---

## 📦 Optional bonus idea

In your provider lib, expose an API like:

```ts
provider.registerResponseType("id_token", (context) => {
  // Dev implements their own custom logic
  return {
    id_token: generateCustomIDToken(context)
  }
})
```

This:

* Keeps your core lib clean
* Makes advanced use cases possible
* Encourages best practices by default

---

## ✅ TL;DR

* You're absolutely right not to support `response_type=id_token` by default.
* Stick with `"code"` (with PKCE) as your baseline.
* Let devs opt into other response types **only when needed**.

---

`response_mode=form_post` is an **OAuth 2.0 / OpenID Connect feature** that controls **how authorization responses** (like the authorization code or error) are delivered to the client’s `redirect_uri`.

---

## 🔍 What is `response_mode`?

In OAuth2 / OIDC, after a user authenticates and authorizes, the Authorization Server **redirects the user back** to the Client’s `redirect_uri`, along with:

* an **authorization code** (on success), or
* an **error** (on failure)

The `response_mode` parameter tells the server **how** to deliver this information.

---

## ✳️ Common `response_mode` values

| Mode        | How the response is returned                    | Use Case                                       |
| ----------- | ----------------------------------------------- | ---------------------------------------------- |
| `query`     | As query params in the redirect URI             | Default for most `code` flows                  |
| `fragment`  | As URI fragment (`#`)                           | Used with `implicit` flow                      |
| `form_post` | As `POST` parameters in an HTML form submission | Useful for large payloads or enhanced security |

---

## 🧪 Example: `response_mode=form_post`

### 🔁 Flow

1. The client redirects the user to the Authorization Server:

```
GET /authorize?
  response_type=code&
  client_id=abc123&
  redirect_uri=https://client.example.com/cb&
  response_mode=form_post&
  state=xyz
```

2. After successful auth, instead of redirecting with query params:

```
302 Found
Location: https://client.example.com/cb?code=AUTH_CODE&state=xyz
```

...the server returns an **HTML page with an auto-submitting form**:

```html
<!DOCTYPE html>
<html>
  <body onload="document.forms[0].submit()">
    <form method="POST" action="https://client.example.com/cb">
      <input type="hidden" name="code" value="AUTH_CODE"/>
      <input type="hidden" name="state" value="xyz"/>
    </form>
  </body>
</html>
```

3. The user's browser submits the form → the client receives the code **in the request body**, not the URL.

---

## ✅ Benefits of `form_post`

| Advantage                           | Description                                            |
| ----------------------------------- | ------------------------------------------------------ |
| **Avoids long URLs**                | POST allows larger payloads (e.g., long `id_token`s)   |
| **No sensitive data in URL**        | Prevents leaks via browser history or referrer headers |
| **Cleaner redirect URIs**           | The URI isn't cluttered with query params              |
| **Required for some SSO scenarios** | Often used with OpenID Connect `id_token` responses    |

---

## ⚠️ Considerations

* Your **client’s redirect endpoint must accept POST requests**.
* Some older clients (or misconfigured ones) may only expect GET with query params.
* CSRF protection may be needed if you're processing POSTs from browsers.

---

## 📌 TL;DR

`response_mode=form_post` tells the auth server:

> “Instead of putting the authorization `code` in the redirect URI, return it in an HTML form that POSTs to my `redirect_uri`.”

✅ It's more secure and flexible than using query parameters.
📦 Especially helpful when returning large tokens or sensitive data.

Let me know if you want a working implementation sketch of this inside your `DefaultOAuth2ACAuthorizationRoute`.

---

Perfect — that’s a clean and flexible place to handle it. ✅

Letting the `finalizeAuthorization()` hook manage the `response_mode` behavior allows you to:

* Keep your core route logic agnostic of transport details,
* Support future modes like `query`, `fragment`, or `form_post` without clutter,
* And let developers cleanly inject custom behavior based on `params.response_mode`.

If you ever standardize it later, you could support `response_mode` via a utility:

```ts
function sendAuthorizationResponse(mode: 'query' | 'form_post', data: Record<string, string>, redirectUri: string, h: ResponseToolkit) {
    if (mode === 'form_post') {
        const inputs = Object.entries(data)
            .map(([k, v]) => `<input type="hidden" name="${k}" value="${encode(v)}" />`)
            .join('')
        const html = `<!DOCTYPE html><html><body onload="document.forms[0].submit()"><form method="POST" action="${redirectUri}">${inputs}</form></body></html>`
        return h.response(html).type('text/html')
    } else {
        const url = new URL(redirectUri)
        Object.entries(data).forEach(([k, v]) => url.searchParams.set(k, v))
        return h.redirect(url.toString())
    }
}
```

But for now — leaving it to the `finalizeAuthorization()` method is a solid design. No action needed.

---

Here's a compact ✅ **OAuth 2.0 Error Cheat Sheet** — ideal for implementing or validating OAuth flows like **Authorization Code**, **Implicit**, **Client Credentials**, etc.

---

## 📄 OAuth 2.0 Error Cheat Sheet

| **Error Code**              | **When to Use**                                                                                                                      | **Relevant To**     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `invalid_request`           | The request is missing a required parameter, includes an unsupported parameter or value, or is malformed.                            | All flows           |
| `unauthorized_client`       | The client is **not authorized** to use this authorization grant type.                                                               | Auth Code, Implicit |
| `access_denied`             | The resource owner or authorization server **denied the request**.                                                                   | Auth Code, Implicit |
| `unsupported_response_type` | The `response_type` is not supported by the server (e.g. `token`, `code`).                                                           | Auth Code, Implicit |
| `invalid_scope`             | The requested scope is invalid, unknown, or malformed.                                                                               | All flows           |
| `server_error`              | Unexpected server error (e.g., DB failure). Should be used **only when something unexpected fails**, and not due to client mistakes. | All flows           |
| `temporarily_unavailable`   | The server is temporarily too busy or down. Retry later.                                                                             | All flows           |
| `invalid_client`            | The client authentication **failed** (e.g., wrong client secret or unknown client ID). Usually returned with `401 Unauthorized`.     | Token endpoint only |
| `invalid_grant`             | The provided `authorization_code`, `refresh_token`, or other grant is **invalid**, expired, revoked, or doesn't match the client.    | Token exchange      |
| `unsupported_grant_type`    | The `grant_type` provided is not supported by the authorization server.                                                              | Token exchange      |

---

## 🧾 Example OAuth Error Response (Authorization Endpoint)

```http
HTTP/1.1 302 Found
Location: https://client.example.com/callback?
  error=access_denied
  &error_description=User+denied+access
  &state=xyz
```

---

## 🧾 Example OAuth Error Response (Token Endpoint)

```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_grant",
  "error_description": "The authorization code is expired"
}
```

---

## 🧠 Notes

* `error_description` is optional but **very useful** for debugging.
* Always include the original `state` in error responses from the **authorization endpoint** (if it was included in the request).
* These errors are defined in [RFC 6749, Section 4.1.2.1](https://tools.ietf.org/html/rfc6749#section-4.1.2.1) and [5.2](https://tools.ietf.org/html/rfc6749#section-5.2).

---
