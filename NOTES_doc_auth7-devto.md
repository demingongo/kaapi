![Kaapi](https://img.shields.io/badge/Kaapi-v1.0-blue) ![OAuth2](https://img.shields.io/badge/OAuth2-✅-green) ![OIDC](https://img.shields.io/badge/OIDC-✅-green) !

# 🚀 Manage Multiple OAuth2/OIDC Flows with Kaapi

Building an **authorization server**? You might need **multiple flows**—Client Credentials, Device Authorization, Authorization Code—all in one place. Instead of creating separate endpoints, `MultipleFlowsBuilder` in **Kaapi** lets you **unify token issuance & JWKS endpoints**, while keeping flow-specific logic modular. 🛠️

---

## 🌟 Key Benefits

* 🔹 **Single token endpoint** (`/oauth2/token`) for all flows
* 🔹 **Central JWKS** (`/.well-known/jwks.json`)
* 🔹 **Automatic dispatching** by grant type
* 🔹 **Flow-specific validation & token generation**
* 🔹 Fully **spec-compliant** with OAuth2 & OIDC

---

## ⚡ Quick Example: Client Credentials Flow

```javascript
import { Kaapi } from '@kaapi/kaapi';
import {
  createInMemoryKeyStore,
  OAuth2TokenResponse,
  ClientSecretBasic,
  ClientSecretPost,
  OIDCClientCredentialsBuilder,
  MultipleFlowsBuilder,
} from '@kaapi/oauth2-auth-design';

const VALID_CLIENTS = [
  { client_id: 'service-api-client', client_secret: 's3cr3tK3y123!', allowed_scopes: ['read', 'write'] },
  { client_id: 'internal-service', client_secret: 'Int3rnalK3y!', allowed_scopes: ['read', 'write', 'admin'] },
];

const clientCredentialsBuilder = OIDCClientCredentialsBuilder.create()
  .strategyName('client-credentials')
  .setTokenTTL(3600)
  .useAccessTokenJwks(true)
  .setScopes({ read: 'Read', write: 'Write', admin: 'Admin' })
  .addClientAuthenticationMethod(new ClientSecretBasic())
  .addClientAuthenticationMethod(new ClientSecretPost())
  .tokenRoute(route =>
    route.generateToken(async ({ clientId, clientSecret, ttl, tokenType, scope, createJwtAccessToken }) => {
      const client = VALID_CLIENTS.find(c => c.client_id === clientId && c.client_secret === clientSecret);
      if (!client) return { error: 'invalid_client', error_description: 'Invalid credentials' };
      const requestedScopes = (scope ?? '').split(/\s+/).filter(Boolean);
      const grantedScopes = requestedScopes.length
        ? requestedScopes.filter(s => client.allowed_scopes.includes(s))
        : client.allowed_scopes;
      if (!grantedScopes.length) return { error: 'invalid_scope', error_description: 'No valid scopes' };
      const { token: accessToken } = await createJwtAccessToken({ sub: clientId, scope: grantedScopes.join(' ') });
      return new OAuth2TokenResponse({ access_token: accessToken })
        .setExpiresIn(ttl)
        .setTokenType(tokenType)
        .setScope(grantedScopes.join(' '));
    })
  )
  .validate(async (_req, { jwtAccessTokenPayload }) => ({
    isValid: !!jwtAccessTokenPayload?.sub,
    credentials: { client: { id: jwtAccessTokenPayload.sub, scope: jwtAccessTokenPayload.scope } },
  }));

const authDesign = MultipleFlowsBuilder.create()
  .setJwksKeyStore(createInMemoryKeyStore())
  .setJwksRotatorOptions({ intervalMs: 7.862e9, timestampStore: createInMemoryKeyStore() })
  .setPublicKeyExpiry(8.64e6)
  .jwksRoute(r => r.setPath('/.well-known/jwks.json'))
  .tokenEndpoint('/oauth2/token')
  .add(clientCredentialsBuilder)
  .build();

const app = new Kaapi({ 
    port: 3000, 
    host: 'localhost',
    docs: { host: { url: 'http://localhost:3000' }, path: '/docs/api' } 
});
await app.extend(authDesign);
app.base().auth.default({ strategies: authDesign.getStrategyName(), mode: 'try' });
await app.listen();
app.log.info('✅ Kaapi Auth Server running at http://localhost:3000');
```

---

## 🔄 Request Dispatching

```
        ┌─────────────┐
        │ Client/App  │
        └─────┬───────┘
              │
 ┌────────────┴─────────────┐
 ▼                          ▼
/oauth2/token             /.well-known/jwks.json
  │                             │
  ▼                             ▼
MultipleFlows (dispatcher)      MultipleFlows
  │
  ├─ OIDC Client Credentials
  ├─ OIDC Device Authorization
  └─ OIDC Authorization Code
```

---

## 💡 Best Practices

* Start with **one flow**, add more later seamlessly.
* Centralize **token & JWKS endpoints**.
* Keep **flow-specific validation** inside the builder.
* Choose **in-memory or persistent stores** as needed.
* Always use **OIDC builders** for modularity, even with a single flow.

---

`MultipleFlowsBuilder` keeps your Kaapi OAuth2/OIDC server **modular, scalable, and spec-compliant**. 🎉

---