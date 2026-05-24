# `@kaapi/oauth2-auth-design` — Package Reference

**npm**: `@kaapi/oauth2-auth-design` · **version**: 0.0.45  
**Source**: `packages/oauth2-auth-design/src/`  
**Build**: `tsc` → `lib/` · **Format**: CommonJS (`NodeNext`)  
**Dependencies**: `@hapi/boom`, `@hapi/hoek`, `@kaapi/cli`, `@kaapi/kaapi`, `@novice1/api-doc-generator`, `html-entities`, `jose`, `node-jose`, `tslib`

**Entry points**:

- `.` → main index (flows, utils, token types, error codes)
- `./cli` → `OAuth2FlowGenerator`, `OAuth2UtilGenerator` (CLI code generators for `@kaapi/cli`)

---

## Purpose

Full OAuth2/OIDC authentication flows as Kaapi plugins. Each flow is an `AuthDesign` subclass that integrates with Hapi's auth system and auto-generates OpenAPI/Postman security documentation.

**Supported flows**:

- Authorization Code (with optional PKCE)
- Client Credentials
- Device Authorization
- OIDC (multiple flows combined)

---

## File Structure

```
src/
  index.ts
  cli.ts                              ← OAuth2FlowGenerator, OAuth2UtilGenerator (for @kaapi/cli)
  flows/
    common.ts                         ← error codes, base types, OAuth2AuthDesign abstract
    authorization-code.ts             ← OAuth2AuthorizationCode
    client-credentials.ts             ← OAuth2ClientCredentials
    device-authorization.ts           ← OAuth2DeviceAuthorization
    oidc-multiple-flows.ts            ← MultipleFlows
    auth-code/
      authorization-route.ts          ← IOAuth2ACAuthorizationRoute and friends
      token-route.ts                  ← IOAuth2ACTokenRoute and friends
      authorization-utils.ts          ← PKCE helpers
    client-creds/
      token-route.ts                  ← IOAuth2ClientCredentialsTokenRoute and friends
    device-auth/
      authorization-route.ts          ← IOAuth2DeviceAuthorizationRoute and friends
      token-route.ts                  ← IOAuth2DeviceAuthTokenRoute and friends
  generators/
    oauth2-flow-generator.ts
    oauth2-util-generator.ts
  utils/
    client-auth-methods.ts            ← ClientAuthMethod, ClientSecretBasic, ClientSecretPost, NoneAuthMethod, DPoPAuthMethod
    in-memory-key-store.ts            ← InMemoryKeyStore, createInMemoryKeyStore
    jwt-authority.ts                  ← JwtAuthority, JwksRotator, JwksKeyStore
    jwt-utils.ts                      ← createJwtAccessToken, createIdToken, verifyJwt
    replay-store.ts                   ← InMemoryReplayStore, ReplayDetector
    token-types.ts                    ← BearerToken, DPoPToken, TokenType
    verify-code-verifier.ts           ← PKCE code verifier
```

---

## OAuth2 Flow Classes

All four flow classes extend `AuthDesign` from `@kaapi/kaapi` and therefore implement `KaapiPlugin`.

### `OAuth2AuthorizationCode`

Authorization Code flow (RFC 6749 §4.1). Optionally with PKCE (RFC 7636).

```ts
import { OAuth2AuthorizationCode } from '@kaapi/oauth2-auth-design';

const flow = new OAuth2AuthorizationCode({
    authorizationRoute: new MyAuthorizationRoute(),
    tokenRoute: new MyTokenRoute(),
    refreshTokenRoute: new MyRefreshRoute(), // optional
});

// Enable/disable PKCE:
flow.withPkce(); // PKCE required (default)
flow.withoutPkce(); // PKCE optional

await app.extend(flow);
```

### `OAuth2ClientCredentials`

Client Credentials flow (RFC 6749 §4.4). Machine-to-machine, no user involved.

```ts
import { OAuth2ClientCredentials } from '@kaapi/oauth2-auth-design';

const flow = new OAuth2ClientCredentials({
    tokenRoute: new MyTokenRoute(),
});
await app.extend(flow);
```

### `OAuth2DeviceAuthorization`

Device Authorization Grant (RFC 8628). For devices without browsers.

```ts
import { OAuth2DeviceAuthorization } from '@kaapi/oauth2-auth-design';

const flow = new OAuth2DeviceAuthorization({
    authorizationRoute: new MyDeviceAuthRoute(),
    tokenRoute: new MyDeviceTokenRoute(),
    refreshTokenRoute: new MyRefreshRoute(), // optional
});
await app.extend(flow);
```

### `MultipleFlows`

Groups multiple OAuth2 flows under one OIDC security scheme. Shares a JWKS endpoint and key store. Produces an OIDC discovery document route automatically.

```ts
import { MultipleFlows } from '@kaapi/oauth2-auth-design';

const oidc = new MultipleFlows({
    flows: [authCodeFlow, clientCredsFlow, deviceFlow],
    tokenEndpoint: '/oauth2/token',
    jwksOptions: { keyStore: new InMemoryKeyStore() },
    openidConfiguration: { issuer: 'https://auth.example.com' },
});
await app.extend(oidc);
```

---

## Route Interfaces

Each flow requires you to implement route interfaces that contain your business logic. The flow class wires them to Hapi routes, handles the OAuth2 protocol logic, and auto-generates docs.

### Authorization Code Routes

#### `IOAuth2ACAuthorizationRoute`

The `/authorize` endpoint — shows the login/consent page.

- `handle(request, h)` → redirects to client with `code`, or shows error

Default implementation: `DefaultOAuth2ACAuthorizationRoute`  
Abstract base: `OAuth2ACAuthorizationRoute`

#### `IOAuth2ACTokenRoute`

The `/token` endpoint for Authorization Code flow.

- `handle(request, h, context)` → returns access token, refresh token, optionally ID token

Default implementation: `DefaultOAuth2ACTokenRoute`  
Abstract base: `OAuth2ACTokenRoute`

#### `IOAuth2RefreshTokenRoute`

Shared refresh token endpoint.

- `handle(request, h, context)` → returns new access + refresh tokens

Default implementation: `DefaultOAuth2RefreshTokenRoute`

### Client Credentials Routes

#### `IOAuth2ClientCredentialsTokenRoute`

The `/token` endpoint for Client Credentials flow.

- `handle(request, h, context)` → validates client, returns access token

Default implementation: `DefaultOAuth2ClientCredentialsTokenRoute`

### Device Authorization Routes

#### `IOAuth2DeviceAuthorizationRoute`

The device authorization endpoint.

- `handle(request, h)` → returns `device_code`, `user_code`, `verification_uri`, `interval`, `expires_in`

Default implementation: `DefaultOAuth2DeviceAuthorizationRoute`  
Abstract base: (implements `IOAuth2DeviceAuthorizationRoute`)

#### `IOAuth2DeviceAuthTokenRoute`

The token polling endpoint for Device flow.

- `handle(request, h, context)` → returns tokens when device is authorized, or `authorization_pending` / `slow_down`

Default implementation: `DefaultOAuth2DeviceAuthTokenRoute`

### JWKS Routes

#### `IJWKSRoute`

Exposes the public JWKS endpoint (`/.well-known/jwks.json`).

Default implementation: `DefaultJWKSRoute`

---

## JWT Authority

### `JwtAuthority`

Generates RSA-2048 key pairs, signs JWTs (RS256), verifies JWTs, and serves JWKS.

```ts
import { JwtAuthority, InMemoryKeyStore, createInMemoryKeyStore } from '@kaapi/oauth2-auth-design';

const keyStore = createInMemoryKeyStore();
const authority = new JwtAuthority({ keyStore });

// Generate a new key pair
await authority.generateKey();

// Sign a JWT
const token = await authority.sign({ sub: 'user123', scope: 'read:orders' }, { expiresIn: '1h' });

// Verify
const payload = await authority.verify(token);

// Get JWKS for the public endpoint
const jwks = await authority.getJwks();
```

### `JwksRotator`

Automatic key rotation:

```ts
import { JwksRotator } from '@kaapi/oauth2-auth-design';

const rotator = new JwksRotator(authority, {
    intervalMs: 24 * 60 * 60 * 1000, // rotate every 24h
});
rotator.start();
rotator.stop();
```

### `JwksKeyStore` (interface)

Pluggable key store interface. Implement for Redis, database, etc.:

```ts
interface JwksKeyStore {
    getKeys(): Promise<JWK.Key[]>;
    addKey(key: JWK.Key): Promise<void>;
    removeKey(kid: string): Promise<void>;
}
```

### `InMemoryKeyStore` / `createInMemoryKeyStore()`

Default in-memory implementation. Not suitable for multi-instance deployments.

```ts
import { createInMemoryKeyStore } from '@kaapi/oauth2-auth-design';

const keyStore = createInMemoryKeyStore();
```

---

## Token Types

### `BearerToken`

Standard OAuth2 Bearer token (RFC 6750). Validates `Authorization: Bearer <token>` header.

```ts
import { BearerToken } from '@kaapi/oauth2-auth-design';

const bearerToken = new BearerToken({ authority });
// Use as the TokenType in your flow's token route
```

### `DPoPToken`

DPoP (Demonstrating Proof of Possession, RFC 9449) token. Validates both Bearer JWT and the DPoP proof JWT in the `DPoP` header.

```ts
import { DPoPToken } from '@kaapi/oauth2-auth-design';

const dpopToken = new DPoPToken({ authority, replayStore: new InMemoryReplayStore() });
```

### `TokenType` (interface)

Interface both `BearerToken` and `DPoPToken` implement. Implement for custom token validation.

### `InMemoryReplayStore` / `ReplayDetector`

DPoP replay attack detection. `InMemoryReplayStore` tracks seen DPoP proof JTIs.

---

## Client Authentication Methods

Used by token endpoints to authenticate the client (application requesting tokens).

| Class               | Method                | Description                                          |
| ------------------- | --------------------- | ---------------------------------------------------- |
| `ClientSecretBasic` | `client_secret_basic` | `Authorization: Basic base64(clientId:clientSecret)` |
| `ClientSecretPost`  | `client_secret_post`  | `client_id` + `client_secret` in request body        |
| `NoneAuthMethod`    | `none`                | No client auth (PKCE public clients)                 |
| `DPoPAuthMethod`    | custom                | DPoP-bound client authentication                     |

```ts
import { ClientSecretBasic, ClientSecretPost } from '@kaapi/oauth2-auth-design';

// Pass to flow constructor to restrict allowed auth methods:
const flow = new OAuth2ClientCredentials({
    tokenRoute: myTokenRoute,
    authMethods: [new ClientSecretBasic(), new ClientSecretPost()],
});
```

---

## Error Codes

Frozen constant objects for OAuth2 error codes. Use these instead of string literals.

```ts
import {
    OAuth2ErrorCode,
    // Standard + extended OIDC errors
    StandardOAuth2ErrorCode,
    // RFC 6749 standard errors
    ExtendedOAuth2ErrorCode,
    // OIDC-specific: login_required, consent_required, etc.
    OAuth2TokenErrorCode,
    // invalid_token, insufficient_scope
    DeviceFlowOAuth2ErrorCode,
    // authorization_pending, slow_down, expired_token
    AllOAuth2ErrorCode, // All of the above combined
} from '@kaapi/oauth2-auth-design';

// Usage:
throw Boom.badRequest(OAuth2ErrorCode.INVALID_REQUEST);
```

`StandardOAuth2ErrorCode` values: `INVALID_REQUEST`, `UNAUTHORIZED_CLIENT`, `ACCESS_DENIED`, `UNSUPPORTED_RESPONSE_TYPE`, `INVALID_SCOPE`, `SERVER_ERROR`, `TEMPORARILY_UNAVAILABLE`, `INVALID_CLIENT`, `INVALID_GRANT`, `UNSUPPORTED_GRANT_TYPE`

`ExtendedOAuth2ErrorCode` values: `LOGIN_REQUIRED`, `INTERACTION_REQUIRED`, `CONSENT_REQUIRED`, `ACCOUNT_LOCKED`, `PASSWORD_EXPIRED`

`DeviceFlowOAuth2ErrorCode` values: `ACCESS_DENIED`, `AUTHORIZATION_PENDING`, `SLOW_DOWN`, `EXPIRED_TOKEN`

---

## JWT Utilities

```ts
import { createJwtAccessToken, createIdToken, verifyJwt } from '@kaapi/oauth2-auth-design';

// Create a signed access token
const accessToken = await createJwtAccessToken(authority, {
    sub: 'user123',
    scope: 'read:orders write:orders',
    aud: 'my-api',
});

// Create an OIDC ID token
const idToken = await createIdToken(authority, {
    sub: 'user123',
    email: 'user@example.com',
    nonce: 'abc123',
});

// Verify any JWT
const payload = await verifyJwt(authority, token);
```

---

## PKCE Utilities

```ts
import { verifyCodeVerifier } from '@kaapi/oauth2-auth-design';

// Verify PKCE code verifier against code challenge
const isValid = await verifyCodeVerifier(codeVerifier, codeChallenge, codeChallengeMethod);
```

---

## CLI Entry Point (`./cli`)

```ts
import { OAuth2FlowGenerator, OAuth2UtilGenerator } from '@kaapi/oauth2-auth-design/cli';
```

These are `FileGenerator` implementations for `@kaapi/cli`. Register them in `kaapi.config.mjs` to scaffold OAuth2 flow boilerplate:

```js
// kaapi.config.mjs
import { OAuth2FlowGenerator } from '@kaapi/oauth2-auth-design/cli';

export default {
    generators: [new OAuth2FlowGenerator()],
};
```
