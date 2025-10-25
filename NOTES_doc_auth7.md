# MultipleFlowsBuilder

`MultipleFlowsBuilder` is a helper class designed to manage **multiple OAuth2/OpenID Connect flows in a single authorization server**. It allows developers to define different flows (e.g., Client Credentials, Device Authorization, Authorization Code) while **reusing common endpoints** such as `/token` and `/jwks.json`.

This ensures spec-compliant behavior: in OpenID Connect and OAuth2, multiple grant types share the same token endpoint and key set endpoint.

---

## Features

* **Unified token endpoint**: All flows share a single token route.
* **Shared JWKS endpoint**: Key rotation and public key retrieval are centralized.
* **Flow-specific logic**: Each flow has its own builder (e.g., `OIDCClientCredentialsBuilder`, `OIDCDeviceAuthorizationBuilder`) to handle its validation, token generation, and scopes.
* **Automatic flow dispatching**: Requests are routed to the appropriate flow handler based on the grant type or request parameters.
* **Key management**: Supports JWKS key rotation, TTL, and expiry options for all flows.

---

## Example Usage

This example demonstrates a single Client Credentials flow, but the same setup allows multiple flows to coexist seamlessly.

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

// Step 1: Define clients
const VALID_CLIENTS = [
    { client_id: 'service-api-client', client_secret: 's3cr3tK3y123!', allowed_scopes: ['read', 'write'] },
    { client_id: 'internal-service', client_secret: 'Int3rnalK3y!', allowed_scopes: ['read', 'write', 'admin'] },
];

// Step 2: Create a flow builder (Client Credentials)
const clientCredentialsBuilder = OIDCClientCredentialsBuilder.create()
    .strategyName('client-credentials')
    .setTokenTTL(3600)
    .useAccessTokenJwks(true)
    .setScopes({ read: 'Read access', write: 'Write access', admin: 'Admin access' })
    .addClientAuthenticationMethod(new ClientSecretBasic())
    .addClientAuthenticationMethod(new ClientSecretPost())
    .tokenRoute((route) =>
        route.generateToken(async ({ clientId, clientSecret, ttl, tokenType, scope, createJwtAccessToken }) => {
            const client = VALID_CLIENTS.find(c => c.client_id === clientId && c.client_secret === clientSecret);
            if (!client) return { error: 'invalid_client', error_description: 'Invalid credentials' };

            const requestedScopes = (scope ?? '').split(/\s+/).filter(Boolean);
            const grantedScopes = requestedScopes.length > 0
                ? requestedScopes.filter(s => client.allowed_scopes.includes(s))
                : client.allowed_scopes;

            if (grantedScopes.length === 0) return { error: 'invalid_scope', error_description: 'No valid scopes' };

            const { token: accessToken } = await createJwtAccessToken({ sub: clientId, scope: grantedScopes.join(' ') });

            return new OAuth2TokenResponse({ access_token: accessToken })
                .setExpiresIn(ttl)
                .setTokenType(tokenType)
                .setScope(grantedScopes.join(' '));
        })
    )
    .validate(async (_req, { jwtAccessTokenPayload }) => ({
        isValid: !!jwtAccessTokenPayload?.sub,
        credentials: {
            client: { id: jwtAccessTokenPayload.sub, scope: jwtAccessTokenPayload.scope },
        },
    }));

// Step 3: Create MultipleFlows instance
const authDesign = MultipleFlowsBuilder.create()
    .setJwksKeyStore(createInMemoryKeyStore())
    .setJwksRotatorOptions({ intervalMs: 7.862e9, timestampStore: createInMemoryKeyStore() })
    .setPublicKeyExpiry(8.64e6)
    .jwksRoute(route => route.setPath('/.well-known/jwks.json'))
    .tokenEndpoint('/oauth2/token')
    .add(clientCredentialsBuilder)
    .build();

// Step 4: Start Kaapi server
const app = new Kaapi({ 
    port: 3000, 
    host: 'localhost',
    docs: { host: { url: 'http://localhost:3000' } } 
});
await app.extend(authDesign);

app.base().auth.default({ strategies: authDesign.getStrategyName(), mode: 'try' });
await app.listen();

app.log.info('✅ Kaapi Auth Server running at http://localhost:3000');
```

---

## Flow Diagram: How MultipleFlowsBuilder Dispatches Requests

The diagram below illustrates how the `MultipleFlows` instance receives requests at unified endpoints and dispatches them to the correct flow builder based on request parameters.

```
                   ┌────────────────────┐
                   │  Client / App      │
                   └─────────┬──────────┘
                             │
        ┌────────────────────┴───────┬──────────────────────────┐
        ▼                            ▼                          ▼
┌───────────────┐              ┌───────────────┐         ┌──────────────────────┐      
│ HTTP Request  │              │ HTTP Request  │         │ HTTP Request         │         
│ /oauth2/token │              │ /.well-known/ │         │ /.well-known/        │
│ (Token)       │              │ jwks.json     │         │ openid-configuration │
└───────┬───────┘              └───────┬───────┘         └──────┬───────────────┘
        │                              │                        │
        ▼                              ▼                        ▼
 ┌───────────────┐             ┌───────────────┐         ┌───────────────┐
 │ MultipleFlows │             │ MultipleFlows │         │ MultipleFlows │
 │ (Dispatcher)  │             │ (JWKS only)   │         │ (OIDC Config) │
 └───────┬───────┘             └───────────────┘         └───────────────┘
         │
         └┬─────────────────┬─────────────────────┐
          ▼                 ▼                     ▼
 ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐
 │ OIDC Client    │  │ OIDC Device    │  │ OIDC Authorization │
 │ Credentials    │  │ Authorization  │  │ Code               │
 │ Builder        │  │ Builder        │  │ Builder            │
 └─────────┬──────┘  └─────────┬──────┘  └─────────┬──────────┘
           │                   │                   │
           ▼                   ▼                   ▼
  Flow-specific token    Flow-specific token  Flow-specific token
  creation logic         creation logic       creation logic
           │                   │                   │
           └───────────────────┼───────────────────┘
                               ▼
                       ┌───────────────┐
                       │ Access Token  │
                       │ Response      │
                       └───────────────┘
```
**Notes:**

* `/oauth2/token` → unified token endpoint, dispatched per flow.
* `/.well-known/jwks.json` → central JWKS for all flows.
* `/.well-known/openid-configuration` → OIDC discovery, includes metadata for all OIDC flows.

**Explanation of the diagram:**

1. All clients hit **`/oauth2/token`** regardless of flow.
2. `MultipleFlows` checks the **grant type / flow parameters** to dispatch the request to the correct OIDC builder.
3. Each builder executes **its flow-specific logic**, including validating scopes, client credentials, device codes, or auth codes.
4. Tokens and JWKS responses are returned via the unified endpoints, keeping your API consistent and modular.

---

## Key Points

1. **Single token endpoint**: No matter how many flows you add, the server exposes only one token endpoint.
2. **Single JWKS endpoint**: Key rotation and public key publishing are centralized for all flows.
3. **Extensible**: Additional flows like `OIDCDeviceAuthorizationBuilder` or `OIDCAuthorizationCodeBuilder` can be added using `.add(flowBuilder)`.
4. **Flow-specific strategy names**: `getStrategyName()` returns an array of all flow names, useful for authentication configuration.
5. **Spec-compliant**: This pattern aligns with OAuth2 and OIDC specifications where multiple grant types share token issuance and JWKS endpoints.

---

## Best Practices / Recommendations

* **Always use OIDC builders with MultipleFlowsBuilder**, even if your server only implements a single flow initially.

  * This keeps the architecture **modular** and **future-proof**.
  * Adding, removing, or updating flows later becomes straightforward, without needing to restructure the token endpoint or JWKS handling.
  * Example: start with a `OIDCClientCredentialsBuilder`, and later add `OIDCDeviceAuthorizationBuilder` or `OIDCAuthorizationCodeBuilder` seamlessly.

* **Centralize token and JWKS endpoints**: Avoid creating separate endpoints per flow; let MultipleFlowsBuilder manage routing internally.

* **Validate scopes and clients per flow**: Each builder is responsible for flow-specific validations while MultipleFlowsBuilder handles endpoint unification.

* **Use in-memory or persistent stores for device codes / client secrets** depending on your deployment needs.

---