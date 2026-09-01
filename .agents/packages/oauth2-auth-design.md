# `@kaapi/oauth2-auth-design` — Package Reference

**npm**: `@kaapi/oauth2-auth-design` · **version**: 0.0.51  
**Source**: `packages/oauth2-auth-design/src/`  
**Build**: `tsc` → `lib/` · **Format**: CommonJS (`NodeNext`)  
**Dependencies**: `@hapi/boom`, `@hapi/hoek`, `@kaapi/cli`, `@kaapi/kaapi`, `@novice1/api-doc-generator`, `tslib`  
**Peer Dependencies**: `@saurbit/oauth2 ^0.1.14`, `@saurbit/oauth2-jwt ^0.1.10`

**Entry points**:

- `.` → main index (flow builders, Kaapi adapters, delegate types)
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
  saurbit/
    common.ts                         ← OAuth2AuthDesign, OAuth2MultipleFlowsAuthDesign, OIDCAuthUtil
    types.ts                          ← OAuth2AuthDesignOptions, IOAuth2AuthDesign, KaapiOAuth2StrategyOptions,
                                         KaapiStrategyOptions, FailedAuthorizationAction, AuthSchemeHandler
    utils.ts                          ← createWebStandardRequest, createTokenEndpointHandler, createSchemeAndStrategy
    authorization-code.ts             ← KaapiAuthorizationCodeFlow, KaapiAuthorizationCodeFlowBuilder,
                                         KaapiOIDCAuthorizationCodeFlow, KaapiOIDCAuthorizationCodeFlowBuilder
    client-credentials.ts             ← KaapiClientCredentialsFlow, KaapiClientCredentialsFlowBuilder,
                                         KaapiOIDCClientCredentialsFlow, KaapiOIDCClientCredentialsFlowBuilder
    device-authorization.ts           ← KaapiDeviceAuthorizationFlow, KaapiDeviceAuthorizationFlowBuilder,
                                         KaapiOIDCDeviceAuthorizationFlow, KaapiOIDCDeviceAuthorizationFlowBuilder
    oidc-multiple-flow.ts             ← KaapiOIDCMultipleFlows, KaapiOIDCFlow
  generators/
    oauth2-flow-generator.ts
    oauth2-util-generator.ts
  utils/
    client-resolver.ts                ← OAuth2TokenRequest, resolveClient helpers
```

---

## OAuth2 Flow Classes

Each grant type comes as a Kaapi-adapted class that wraps the corresponding `@saurbit/oauth2` flow. All Kaapi flow classes implement `KaapiAdapted` and expose `.kaapi()` for use inside route handlers. Wrap them with `OAuth2AuthDesign` (or `KaapiOIDCMultipleFlows`) to integrate with `app.extend()`.

### `KaapiAuthorizationCodeFlow` / `KaapiOIDCAuthorizationCodeFlow`

Authorization Code flow (RFC 6749 §4.1), optionally with OIDC. Built via `KaapiAuthorizationCodeFlowBuilder` / `KaapiOIDCAuthorizationCodeFlowBuilder`.

```ts
import { KaapiOIDCAuthorizationCodeFlowBuilder, OAuth2AuthDesign } from '@kaapi/oauth2-auth-design';

const flow = KaapiOIDCAuthorizationCodeFlowBuilder.create()
    .setAuthorizationEndpoint('/oauth2/authorize')
    .setTokenEndpoint('/oauth2/token')
    .clientSecretBasicAuthenticationMethod()
    .getClient(async (req) => lookupClient(req))
    .parseAuthorizationEndpointData(async (req) => parseAuthReq(req))
    .generateAccessToken(async (ctx) => signJwt(ctx))
    .tokenVerifier((request, { token }) => verifyJwt(token))
    .build();

const authDesign = new OAuth2AuthDesign({
    docs: () => flow.docs(),
    integrateStrategy: (t) => flow.integrateStrategy(t),
    getStrategyName: () => flow.getStrategyName(),
    integrateHook: (t) => flow.integrateHook(t),
});

await app.extend(authDesign);
```

### `KaapiClientCredentialsFlow` / `KaapiOIDCClientCredentialsFlow`

Client Credentials flow (RFC 6749 §4.4). Machine-to-machine; built via `KaapiClientCredentialsFlowBuilder` / `KaapiOIDCClientCredentialsFlowBuilder`.

```ts
import { KaapiClientCredentialsFlowBuilder, OAuth2AuthDesign } from '@kaapi/oauth2-auth-design';

const flow = KaapiClientCredentialsFlowBuilder.create()
    .setTokenEndpoint('/oauth2/token')
    .clientSecretBasicAuthenticationMethod()
    .getClient(async (tokenRequest) => lookupClient(tokenRequest))
    .generateAccessToken(async (ctx) => signJwt(ctx))
    .tokenVerifier((request, { token }) => verifyJwt(token))
    .build();

await app.extend(
    new OAuth2AuthDesign({
        docs: () => flow.docs(),
        integrateStrategy: (t) => flow.integrateStrategy(t),
        getStrategyName: () => flow.getStrategyName(),
        integrateHook: (t) => flow.integrateHook(t),
    })
);
```

### `KaapiDeviceAuthorizationFlow` / `KaapiOIDCDeviceAuthorizationFlow`

Device Authorization Grant (RFC 8628). Built via `KaapiDeviceAuthorizationFlowBuilder` / `KaapiOIDCDeviceAuthorizationFlowBuilder`.

### `KaapiOIDCMultipleFlows`

Aggregates multiple OIDC flows under a single auth scheme. Registers a JWKS endpoint and an OIDC discovery document route automatically.

```ts
import { KaapiOIDCMultipleFlows, OAuth2MultipleFlowsAuthDesign } from '@kaapi/oauth2-auth-design';

const multiFlow = new KaapiOIDCMultipleFlows({
    flows: [oidcAuthCodeFlow, oidcClientCredsFlow],
    discoveryUrl: '/.well-known/openid-configuration',
    securitySchemeName: 'oidc',
    jwksEndpoint: '/.well-known/jwks.json',
    tokenEndpoint: '/oauth2/token',
    openidConfiguration: { issuer: 'https://auth.example.com' },
});

await app.extend(
    new OAuth2MultipleFlowsAuthDesign({
        docs: () => multiFlow.docs(),
        integrateStrategy: (t) => multiFlow.integrateStrategy(t),
        getStrategyName: () => multiFlow.getStrategyName(),
        integrateHook: (t) => multiFlow.integrateHook(t),
    })
);
```

### `OAuth2AuthDesign` / `OAuth2MultipleFlowsAuthDesign`

Delegate adapters that wrap any flow's methods into an `AuthDesign` / `KaapiPlugin` for use with `app.extend()`. Take an `OAuth2AuthDesignOptions` / `OAuth2MultipleFlowsAuthDesignOptions` object.

### `OIDCAuthUtil`

Extends `@novice1/api-doc-generator`'s `OAuth2Util` to produce an `openIdConnect` security scheme in OpenAPI output, using the discovery document URL.

---

## Strategy & Integration Types

### `KaapiOAuth2StrategyOptions<Refs>`

Passed to all flow builders as `strategyOptions`. Controls token verification and failed-authorization handling.

```ts
interface KaapiOAuth2StrategyOptions<Refs> {
    verifyToken?: StrategyVerifyTokenFunction<Request<Refs>>; // from @saurbit/oauth2
    failedAuthorizationAction?: FailedAuthorizationAction<Refs>;
}

// FailedAuthorizationAction: custom handler for 401 scenarios
type FailedAuthorizationAction<Refs> = (
    request: Request<Refs>,
    h: ResponseToolkit<Refs>,
    error: StrategyError // from @saurbit/oauth2
) => Lifecycle.ReturnValue<Refs>;
```

### `OAuth2AuthDesignOptions`

Delegate interface for `OAuth2AuthDesign`:

| Field               | Required | Description                                                     |
| ------------------- | -------- | --------------------------------------------------------------- |
| `docs()`            | yes      | Returns the OpenAPI/Postman `BaseAuthUtil` for this auth scheme |
| `integrateStrategy` | yes      | Registers the Hapi auth scheme and strategy via `KaapiTools`    |
| `getStrategyName()` | yes      | Returns the registered strategy name string                     |
| `integrateHook?`    | no       | Registers token-endpoint routes on the server                   |

---

## JWT & Token Utilities (from `@saurbit/oauth2-jwt`)

JWT key management, token signing/verification, token types, and replay detection are **not bundled** in `@kaapi/oauth2-auth-design` directly. Install the `@saurbit/oauth2-jwt` peer dependency and import from there:

```ts
import { JwtAuthority, InMemoryKeyStore, createInMemoryKeyStore, JwksRotator } from '@saurbit/oauth2-jwt';
import { BearerToken, DPoPToken, InMemoryReplayStore } from '@saurbit/oauth2-jwt';

// Create a key store and authority
const keyStore = createInMemoryKeyStore();
const authority = new JwtAuthority({ keyStore });

await authority.generateKey();

// Sign a JWT
const token = await authority.sign({ sub: 'user123', scope: 'read:orders' }, { expiresIn: '1h' });

// Verify
const payload = await authority.verify(token);

// Automatic key rotation
const rotator = new JwksRotator(authority, { intervalMs: 24 * 60 * 60 * 1000 });
rotator.start();
```

Pass the authority's `.getJwks()` result to your OIDC flow builder's JWKS handler.

---

## Token Types & Client Auth Methods (from `@saurbit/oauth2`)

`BearerToken`, `DPoPToken`, `TokenType`, `ClientSecretBasic`, `ClientSecretPost`, `NoneAuthMethod`, `DPoPAuthMethod`, and error classes (`AccessDeniedError`, `InvalidRequestError`, etc.) all come from the `@saurbit/oauth2` peer dependency. Import directly from `@saurbit/oauth2`.

```ts
import { ClientSecretBasic, ClientSecretPost } from '@saurbit/oauth2';
import { BearerToken, DPoPToken, InMemoryReplayStore } from '@saurbit/oauth2-jwt';
```

Flow builders expose convenience methods for client auth — e.g. `.clientSecretBasicAuthenticationMethod()` on `KaapiClientCredentialsFlowBuilder` — so you usually don't need to import these directly.

---

## Client Authentication Methods (from `@saurbit/oauth2`)

Client authentication classes come from the `@saurbit/oauth2` peer dependency. Flow builders expose convenience methods (e.g. `.clientSecretBasicAuthenticationMethod()`) so direct imports are rarely needed.

| Class               | Method                | Description                                          |
| ------------------- | --------------------- | ---------------------------------------------------- |
| `ClientSecretBasic` | `client_secret_basic` | `Authorization: Basic base64(clientId:clientSecret)` |
| `ClientSecretPost`  | `client_secret_post`  | `client_id` + `client_secret` in request body        |
| `NoneAuthMethod`    | `none`                | No client auth (PKCE public clients)                 |
| `DPoPAuthMethod`    | custom                | DPoP-bound client authentication                     |

```ts
import { ClientSecretBasic, ClientSecretPost } from '@saurbit/oauth2';
```

---

## Error Codes (from `@saurbit/oauth2`)

OAuth2 error code constants and error classes (`OAuth2ErrorCode`, `StandardOAuth2ErrorCode`, `ExtendedOAuth2ErrorCode`, `OAuth2TokenErrorCode`, `DeviceFlowOAuth2ErrorCode`, `AllOAuth2ErrorCode`, `AccessDeniedError`, `InvalidRequestError`, etc.) come from the `@saurbit/oauth2` peer dependency.

```ts
import { OAuth2ErrorCode, StandardOAuth2ErrorCode } from '@saurbit/oauth2';

throw Boom.badRequest(OAuth2ErrorCode.INVALID_REQUEST);
```

---

## JWT Utilities (from `@saurbit/oauth2-jwt`)

`createJwtAccessToken`, `createIdToken`, `verifyJwt` and related utilities have moved to the `@saurbit/oauth2-jwt` peer dependency. See the [JWT & Token Utilities](#jwt--token-utilities-from-saurbitjwt) section above.

---

## PKCE Utilities

`verifyCodeVerifier` is exported directly from `@kaapi/oauth2-auth-design`.

```ts
import { verifyCodeVerifier } from '@kaapi/oauth2-auth-design';

// Verify PKCE code verifier against code challenge (SHA-256)
const isValid = verifyCodeVerifier(codeVerifier, codeChallenge);
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
