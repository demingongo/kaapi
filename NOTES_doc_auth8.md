# 🧑‍💼 OIDC Authorization Code Flow with User Info Endpoint

This page explains how to implement a **User Info Endpoint** in a Kaapi server using `OIDCAuthorizationCodeBuilder` from [`@kaapi/oauth2-auth-design`](https://www.npmjs.com/package/@kaapi/oauth2-auth-design). The endpoint is exposed in the OpenID Connect discovery metadata and serves user claims based on the access token.

---

## 📘 What Is the User Info Endpoint?

The **User Info Endpoint** is part of the OpenID Connect specification. It allows clients to retrieve user profile information after obtaining an access token with the `openid` scope.

When using `@kaapi/oauth2-auth-design`, this endpoint is:
- **Documented** via `.additionalConfiguration({ userinfo_endpoint: '/userinfo' })`
- **Protected** via Kaapi/Hapi's built-in auth system
- **Validated** using the access token and scopes

---

## 🛠 Step-by-Step Setup

### 1. Add the Endpoint to OIDC Discovery

Use `.additionalConfiguration()` to expose the endpoint in the OpenID metadata:

```ts
OIDCAuthorizationCodeBuilder
  .create()
  .additionalConfiguration({
    userinfo_endpoint: '/userinfo'
  });
```

> ℹ️ If the path starts with `/`, it will be automatically prefixed with the host in the discovery document.

---

### 2. Validate Access Tokens

Use `.validate()` to decode and verify JWT access tokens. This ensures the token is valid and attaches user credentials to the request:

```ts
.validate(async (_req, { jwtAccessTokenPayload }) => {
  if (!jwtAccessTokenPayload?.sub) return { isValid: false };

  return {
    isValid: true,
    credentials: {
      user: {
        id: jwtAccessTokenPayload.sub,
        clientId: jwtAccessTokenPayload.client_id,
      },
      scope: Array.isArray(jwtAccessTokenPayload.scope)
        ? jwtAccessTokenPayload.scope
        : [],
    },
  };
});
```

---

### 3. Create the `/userinfo` Route

This route returns user claims based on the access token and requested scopes:

```ts
app.route(
  {
    method: 'GET',
    path: '/userinfo',
    auth: true,
    options: {
      auth: {
        access: {
          entity: 'user',         // Ensures token belongs to a user
          scope: ['openid'],      // Requires 'openid' scope
        },
      },
    },
  },
  async ({ auth: { credentials } }, h) => {
    const user = REGISTERED_USERS.find((u) => u.id === credentials.user.id);
    if (!user) {
      return h.response({
        error: OAuth2ErrorCode.INVALID_REQUEST,
        error_description: 'Invalid or unknown user claims.',
      }).code(403);
    }

    return {
      sub: credentials.user.id,
      name: credentials.scope.includes('profile') ? user.username : undefined,
      email: credentials.scope.includes('email') ? user.email : undefined,
    };
  }
);
```

---

## 🔐 Access Control

| Field        | Purpose                                                                 |
|--------------|-------------------------------------------------------------------------|
| `entity: 'user'` | Ensures the token represents a user (not a client or app)           |
| `scope: ['openid']` | Requires the access token to include the `openid` scope         |

You can extend this logic to support additional scopes like `profile`, `email`, or custom claims.

---

## 🧪 Example Response

```json
{
  "sub": "user-1234",
  "name": "user",
  "email": "user@example.com"
}
```

Returned fields depend on the scopes granted during authorization.

---

## ✅ Summary

- The User Info Endpoint is exposed via `.additionalConfiguration()`
- It is protected by Kaapi's auth system and validated using JWT access tokens
- Claims are returned based on scopes like `openid`, `profile`, and `email`
- This setup is fully spec-compliant and ready for production with persistent storage

---

### 📝 Additional Note: `registration_endpoint` Support

Just like the `userinfo_endpoint`, you can expose a **`registration_endpoint`** in the OpenID Connect discovery document using the `.additionalConfiguration()` method:

```ts
.additionalConfiguration({
  registration_endpoint: '/register'
})
```

This only documents the endpoint in the OIDC metadata. You must define the actual route separately using Kaapi’s `app.route()` method, just like you would for `/userinfo`.

This approach ensures full flexibility while maintaining spec compliance and discoverability for dynamic client registration flows.
