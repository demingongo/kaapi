# Core Builder Methods in `@kaapi/oauth2-auth-design`

This section introduces the core methods shared across all builders in `@kaapi/oauth2-auth-design`. These methods are the foundation for defining, customizing, and composing OAuth2 and OpenID Connect (OIDC) authentication flows.

### 🔧 Supported Builders

The following grant types and their corresponding builders are currently supported:

| Grant Type             | OAuth2 Builder                        | OIDC Builder                         |
|------------------------|----------------------------------------|--------------------------------------|
| Authorization Code     | `OAuth2AuthorizationCodeBuilder`       | `OIDCAuthorizationCodeBuilder`       |
| Client Credentials     | `OAuth2ClientCredentialsBuilder`       | `OIDCClientCredentialsBuilder`       |
| Device Authorization   | `OAuth2DeviceAuthorizationBuilder`     | `OIDCDeviceAuthorizationBuilder`     |

---

## `create`

Every builder is instantiated using the static `create` method. It accepts an options object, including a `logger`, the only option that can only be set at creation time.

The logger must implement the `ILogger` interface from `@kaapi/kaapi`.

```ts
import { createLogger } from '@kaapi/kaapi';
import { OAuth2AuthorizationCodeBuilder } from '@kaapi/oauth2-auth-design';

const logger = createLogger();

const builder = OAuth2AuthorizationCodeBuilder.create({ logger });
```

---

## `strategyName`

Defines the name of the strategy. If omitted, a default name is automatically assigned based on the builder type.

```ts
const authDesign = OAuth2AuthorizationCodeBuilder
  .create()
  .strategyName('oauth2-auth-code')
  .build();

console.log(authDesign.getStrategyName()); // oauth2-auth-code
```

### Default Strategy Names

| Builder                          | Default Name               |
|----------------------------------|----------------------------|
| `OAuth2AuthorizationCodeBuilder` | `oauth2-authorization-code` |
| `OIDCAuthorizationCodeBuilder`   | `oauth2-authorization-code` |
| `OAuth2ClientCredentialsBuilder` | `oauth2-client-credentials` |
| `OIDCClientCredentialsBuilder`   | `oauth2-client-credentials` |
| `OAuth2DeviceAuthorizationBuilder` | `oauth2-device-authorization` |
| `OIDCDeviceAuthorizationBuilder`   | `oauth2-device-authorization` |

---

## `setDescription`

Sets a description for the strategy for documentation purposes.

```ts
OAuth2ClientCredentialsBuilder
  .create()
  .setDescription('Client credentials grant flow');
```

---

## `setScopes`

Defines the available scopes and their descriptions for documentation purposes.

```ts
OAuth2ClientCredentialsBuilder.create().setScopes({
  'read:data': 'Allows the client to retrieve or query data from the service.',
  'write:data': 'Allows the client to create or update data in the service.'
});
```

---

## `addClientAuthenticationMethod`

Adds one or more client authentication methods to the strategy. These are used to validate incoming token requests.

### Supported Methods

- `ClientSecretPost`
- `ClientSecretBasic`
- `ClientSecretJwt`
- `PrivateKeyJwt`
- `NoneAuthMethod`

```ts
.addClientAuthenticationMethod(new ClientSecretBasic())
.addClientAuthenticationMethod(new ClientSecretPost())
.addClientAuthenticationMethod(new NoneAuthMethod())
```

---

### `ClientSecretJwt`

Authenticates clients using a JWT signed with a shared secret.

#### Supported Algorithms

- `HS256` (default)
- `HS384`
- `HS512`

#### Example

```ts
import { ClientSecretJwt } from '@kaapi/oauth2-auth-design';

const clientAuthMethod = new ClientSecretJwt()
  .addAlgorithm(ClientSecretJwt.algo.HS256)
  .addAlgorithm(ClientSecretJwt.algo.HS384)
  .addAlgorithm(ClientSecretJwt.algo.HS512)
  .getClientSecret(async (clientId, decoded, clientAssertion) => {
    return 'super-secret-value';
  });
```

---

### `PrivateKeyJwt`

Authenticates clients using a JWT signed with a private key.

#### Supported Algorithms

- RSA: `RS256`, `RS384`, `RS512`
- RSA-PSS: `PS256`, `PS384`, `PS512`
- EC: `ES256`, `ES384`, `ES512`
- EdDSA: `Ed25519`

#### Example

```ts
import { PrivateKeyJwt } from '@kaapi/oauth2-auth-design';

const clientAuthMethod = new PrivateKeyJwt()
  .addAlgorithm(PrivateKeyJwt.algo.RS256)
  .addAlgorithm(PrivateKeyJwt.algo.PS256)
  .addAlgorithm(PrivateKeyJwt.algo.ES256)
  .getPublicKeyForClient(async (clientId, decoded, clientAssertion) => {
    return {
      kty: 'RSA',
      kid: 'client-key-1',
      use: 'sig',
      alg: 'RS256',
      n: '...',
      e: '...'
    };
  });
```

---

## `setTokenType`

Defines the type of access token to issue. Two types are supported:

- `BearerToken` – Default; requires no additional proof.
- `DPoPToken` – Requires cryptographic proof with each use.

```ts
.setTokenType(new BearerToken())
```

---

### `DPoPToken`

A proof-of-possession token that mitigates token replay attacks.

#### Example with TTL and Replay Detection

```ts
import { DPoPToken, createInMemoryReplayStore } from '@kaapi/oauth2-auth-design';

const tokenType = new DPoPToken()
  .setTTL(300)
  .setReplayDetector(createInMemoryReplayStore());
```

#### Example with Custom Validation

```ts
const tokenType = new DPoPToken()
  .validateTokenRequest(async (req, ttl) => {
    return {
      isValid: false,
      message: 'Invalid DPoP token'
    };
  });
```

---

## `jwksRoute`

Customizes the JWKS endpoint. You can change the path and/or provide a custom handler.

```ts
.jwksRoute(route => route
  .setPath('/.well-known/jwks.json')
  .validate((params, request, h) => {
    return params.jwks;
  })
)
```

Default path: `/oauth2/keys`

---

## `tokenRoute`

Defines the token endpoint behavior, including path and token generation logic.

```ts
import { OAuth2ErrorCode, OAuth2TokenResponse } from '@kaapi/oauth2-auth-design';

.tokenRoute(route => route
  .setPath('/oauth2/token')
  .generateToken(async (params, request) => {
    if (!params.clientSecret) {
      return {
        error: OAuth2ErrorCode.INVALID_REQUEST,
        error_description: 'Missing client_secret'
      };
    }

    return new OAuth2TokenResponse({ access_token: 'generated-access-token' })
      .setExpiresIn(params.ttl)
      .setScope([])
      .setTokenType(params.tokenType);
  })
)
```

Default path: `/oauth2/token`

---

## `setTokenTTL`

Sets the default time-to-live (TTL) for issued tokens, in seconds.

```ts
.setTokenTTL(3600)
```

This value is passed to the `generateToken` handler in `tokenRoute`.

---

## `setJwksKeyStore`

Defines the JWKS key store implementing the `JwksKeyStore` interface. This store is responsible for:

- Retrieving the active private key
- Accessing public keys
- Persisting new key pairs

For development and testing, use the in-memory store provided by `createInMemoryKeyStore`.

```ts
import { OAuth2AuthorizationCodeBuilder, createInMemoryKeyStore } from '@kaapi/oauth2-auth-design';

OAuth2AuthorizationCodeBuilder
  .create()
  .setJwksKeyStore(createInMemoryKeyStore());
```

---

## `setJwksRotatorOptions`

Configures automatic key rotation. Accepts:

- `intervalMs`: rotation interval in milliseconds
- `timestampStore`: an implementation of `JwksRotationTimestampStore` to track the last rotation

Example with in-memory stores:

```ts
import { OAuth2AuthorizationCodeBuilder, createInMemoryKeyStore } from '@kaapi/oauth2-auth-design';

const authCodeFlow = OAuth2AuthorizationCodeBuilder
  .create()
  .setJwksKeyStore(createInMemoryKeyStore())
  .setJwksRotatorOptions({
    intervalMs: 7.862e+9, // 91 days
    timestampStore: createInMemoryKeyStore()
  })
  .build();

// Initial rotation check
authCodeFlow.checkAndRotateKeys().catch(console.error);

// Periodic rotation check (every hour)
setInterval(() => {
  authCodeFlow.checkAndRotateKeys().catch(console.error);
}, 3600 * 1000);
```

The `checkAndRotateKeys` method evaluates whether a new key pair should be generated and updates the key store accordingly.

---

## `setPublicKeyExpiry`

Sets the time-to-live (TTL) for public keys in seconds. Useful when combined with key rotation to ensure old keys expire.

```ts
.setPublicKeyExpiry(8.64e+6) // 100 days
```

Example with rotation:

```ts
.setJwksRotatorOptions({
  intervalMs: 7.862e+9, // 91 days
  timestampStore: createInMemoryKeyStore()
})
.setPublicKeyExpiry(8.64e+6); // 100 days
```

---

## `useAccessTokenJwks`

Enables signing and verification of access tokens using the JWKS private key.

```ts
.useAccessTokenJwks(true)
.tokenRoute(route =>
  route.generateToken(async (params, _req) => {
    const { token } = await params.createJwtAccessToken({
      sub: 'user-id',
      // additional claims...
    });

    return { access_token: token };
  })
)
.validate(async (request, { jwtAccessTokenPayload, token }) => {
  // custom validation logic
});
```

---

## `validate`

Defines the logic to validate incoming access tokens. Typically used to fetch and verify user credentials.

```ts
.validate(async (request, { token }) => {
  // Use the access token to look up the user in your database
  const user = await db.users.findByAccessToken(token);

  if (!user) {
    return { isValid: false };
  }

  return {
    isValid: true,
    credentials: {
      user: {
        sub: user.id,
        name: user.name,
        given_name: user.given_name,
        email: user.email
      }
    }
  };
});
```

---

## `build`

Finalizes the builder configuration and returns a plugin that can be registered with your Kaapi app.

```ts
import { Kaapi } from '@kaapi/kaapi';
import { OAuth2AuthorizationCodeBuilder } from '@kaapi/oauth2-auth-design';

const authCodeFlow = OAuth2AuthorizationCodeBuilder
  .create()
  // additional configuration...
  .build();

const app = new Kaapi({
  port: 3000,
  host: 'localhost',
  docs: {
    host: { url: 'http://localhost:3000' }
  }
});

await app.extend(authCodeFlow);
```

---

## `additionalConfiguration`

This method is specific to OIDC builders and allows you to override the OpenID metadata served at `/.well-known/openid-configuration`. It's useful for customizing supported scopes, claims, endpoints, and token types.

### Example: Overriding Metadata

```ts
OIDCAuthorizationCodeBuilder
  .create()
  .additionalConfiguration({
    claims_supported: ['sub', 'name', 'email']
  });
```

### Example: Adding DPoP Token Metadata

If you're using the DPoP token type, you can inject its metadata directly:

```ts
import { DPoPToken, OIDCAuthorizationCodeBuilder } from '@kaapi/oauth2-auth-design';

const tokenType = new DPoPToken().setTTL(300);

OIDCAuthorizationCodeBuilder
  .create()
  .additionalConfiguration({
    ...tokenType.configuration
  });
```

This ensures your OpenID configuration reflects support for DPoP tokens.

---