Excellent question — let’s break it down clearly 👇

---

### 🧠 What OIDC “claims” are

In **OpenID Connect (OIDC)**, a **claim** is a piece of information about the authenticated user (or subject).
They’re essentially **user attributes** included in an **ID Token** or returned from the **UserInfo endpoint**.

Each claim is a key–value pair that conveys identity-related data — things like name, email, or a unique user ID.

---

### 📦 Example: ID Token with Claims

When a user signs in via OIDC, your auth server issues an **ID Token** (a JWT).
Inside that token, you’ll find **claims**, such as:

```json
{
  "iss": "https://auth.example.com",   // issuer
  "sub": "1234567890",                // subject (user ID)
  "aud": "your-client-id",            // audience (your app)
  "exp": 1735670400,                  // expiration time
  "iat": 1735666800,                  // issued at
  "email": "alice@example.com",
  "name": "Alice Doe",
  "preferred_username": "alice"
}
```

---

### 🧾 Types of Claims

| Category            | Example Claims                                          | Description                            |
| ------------------- | ------------------------------------------------------- | -------------------------------------- |
| **Standard Claims** | `sub`, `name`, `email`, `picture`, `preferred_username` | Defined by the OIDC spec               |
| **Custom Claims**   | `role`, `tenant_id`, `permissions`                      | Defined by your own auth server        |
| **Protocol Claims** | `iss`, `aud`, `exp`, `iat`, `auth_time`                 | Used for token validation and metadata |

---

### 🧰 Why They Matter

* They allow your **client apps** to identify who the user is.
* They provide **user metadata** without needing an extra database call.
* They can carry **authorization context** (e.g. roles, groups, scopes).
* They’re cryptographically **signed** by the identity provider for trust.

---

### 🔐 In Kaapi’s Context

When using `@kaapi/oauth2-auth-design`, OIDC claims are automatically issued and verified as part of the flow — meaning your Kaapi routes can access identity information directly from the validated token’s claims (e.g. `auth.credentials.user` → populated from ID token claims).

---

Excellent and very practical question 👏

In short:

> 🔹 The **UserInfo endpoint** should return **only the standard (and optionally custom) user claims**, **not** the protocol-level claims.

Let’s unpack why 👇

---

### 🧩 What the UserInfo Endpoint Is For

The **UserInfo endpoint** in OpenID Connect is meant to provide **profile and identity data** about the authenticated user — i.e., claims that describe *who* the user is.

It’s **not** meant to return protocol-level metadata (like token audience or expiration), which are already part of the **ID Token**.

---

### ✅ SHOULD Return

These are typically **standard claims** defined in the [OIDC Core spec §5.3](https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponse) plus any custom ones you define:

| Category            | Example Claims                                                    | Description                    |
| ------------------- | ----------------------------------------------------------------- | ------------------------------ |
| **Standard Claims** | `sub`, `name`, `email`, `picture`, `preferred_username`, `locale` | Basic user profile data        |
| **Custom Claims**   | `role`, `organization`, `permissions`                             | Application-specific user data |

> These are the claims your **client app** uses to personalize or authorize user interactions.

---

### ❌ SHOULD NOT Return

You generally **should not** include **protocol claims** like:

| Protocol Claim              | Why Not Return It                                             |
| --------------------------- | ------------------------------------------------------------- |
| `iss`                       | Identifies the issuer — already known from token verification |
| `aud`                       | Audience — tied to the ID Token, not user identity            |
| `exp`, `iat`, `nbf`         | Token metadata, not user info                                 |
| `azp`, `auth_time`, `nonce` | Used internally during token validation                       |

These belong to the **ID Token** or **Access Token** and are not relevant for user identity retrieval.

---

### 🧠 Best Practice

Think of it this way:

* **ID Token** → contains *protocol + identity* claims (for authentication).
* **Access Token** → used to authorize API access (may have scopes, audience, etc.).
* **UserInfo Response** → contains *pure identity claims* (profile info, safe to expose to clients).

If you’re building your own OAuth2/OIDC server with `@kaapi/oauth2-auth-design`, your `userinfo` endpoint should:

* **Require a valid access token**
* **Return only standard and custom user claims**
* **Exclude protocol metadata**

---

Great — let’s walk through **how the `UserInfo` endpoint works** in OpenID Connect, step by step.
It’s one of the most important parts of OIDC, because it’s where your client app actually fetches the **user’s profile data** after authentication.

---

## 🔁 Overview

The **UserInfo endpoint** is an **OAuth 2.0–protected resource** (an API endpoint) provided by your **OpenID Provider (OP)** — e.g., your Kaapi OAuth2 server.

Once the client has obtained an **access token** via a successful OIDC flow (like the **Authorization Code Flow**), it can call the **UserInfo endpoint** to retrieve information about the authenticated user.

---

## 🧩 Flow Summary

Here’s the typical sequence:

1. **User signs in**

   * The client app sends the user to the authorization server’s `/authorize` endpoint.
   * The user authenticates (via password, social login, etc.).

2. **Client receives tokens**

   * The authorization server issues:

     * an **ID Token** (a JWT containing identity info & protocol claims),
     * an **Access Token** (used to call the UserInfo endpoint).

3. **Client requests user info**

   * The client sends a `GET` or `POST` request to the **UserInfo endpoint**,
     passing the **Access Token** in the `Authorization` header:

     ```http
     GET /userinfo HTTP/1.1
     Host: auth.example.com
     Authorization: Bearer eyJhbGciOi...
     ```

4. **Server validates the token**

   * The `UserInfo` endpoint checks:

     * That the token is **valid and not expired**,
     * That it includes the **`openid` scope**,
     * That it belongs to a real user.

5. **Server returns user claims**

   * If valid, it returns a JSON object containing the user’s **standard and/or custom claims**:

     ```json
     {
       "sub": "248289761001",
       "name": "Jane Doe",
       "email": "janedoe@example.com",
       "picture": "https://example.com/janedoe.jpg"
     }
     ```

---

## 🧠 Key Details

| Concept             | Description                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Endpoint URL**    | Usually `https://<issuer>/.well-known/openid-configuration` exposes the `userinfo_endpoint` URL                |
| **Authentication**  | Bearer token (access token) in the header                                                                      |
| **Scopes**          | `openid` is required; additional scopes like `profile`, `email`, `address` determine which claims are returned |
| **Response Format** | JSON object with claims about the user                                                                         |
| **Security**        | Must be served over HTTPS; only accessible with a valid access token                                           |

---

## 🔐 Example with Scopes

If the client requested:

```
scope=openid profile email
```

Then `/userinfo` might return:

```json
{
  "sub": "248289761001",
  "name": "Jane Doe",
  "email": "janedoe@example.com"
}
```

If only `scope=openid` was requested, it might return:

```json
{
  "sub": "248289761001"
}
```

---

## ⚙️ In Kaapi (using `@kaapi/oauth2-auth-design`)

When you use Kaapi’s OAuth2 Auth Design:

* The **UserInfo endpoint** is automatically exposed if you enable OIDC.
* It handles **access token validation** internally.
* You can customize which **claims** to return based on scopes or user attributes.

So the client workflow is identical:

1. Obtain access token via `/authorize` → `/token`
2. Request `/userinfo` with `Authorization: Bearer <token>`
3. Receive user claims in response.

---
