# @kaapi/oauth2-auth-design

OAuth2 Auth design in kaapi.

[Kaapi](https://github.com/demingongo/kaapi/wiki) adapter for `@saurbit/oauth2`. Provides flow builders, token endpoints,
and authorization middleware for your Kaapi application.

📖 [Documentation](https://github.com/demingongo/kaapi/wiki#authorization)

## Supported Flows

This package adapts all OAuth 2.0 flows supported by `@saurbit/oauth2`:

| Kaapi Builder                             | Grant Type                             |
| ----------------------------------------- | -------------------------------------- |
| `KaapiAuthorizationCodeFlowBuilder`       | Authorization Code (with PKCE support) |
| `KaapiClientCredentialsFlowBuilder`       | Client Credentials                     |
| `KaapiDeviceAuthorizationFlowBuilder`     | Device Authorization                   |
| `KaapiOIDCAuthorizationCodeFlowBuilder`   | OIDC Authorization Code                |
| `KaapiOIDCClientCredentialsFlowBuilder`   | OIDC Client Credentials                |
| `KaapiOIDCDeviceAuthorizationFlowBuilder` | OIDC Device Authorization              |

### Multiple flows

`KaapiOIDCMultipleFlows` lets you combine several OIDC flows behind a single interface. It tries each
registered flow in order and returns the first successful result, making it straightforward to
support multiple grant types on the same server.

### The `kaapi()` method

Every flow class exposes a `kaapi()` method that returns a frozen set of Kaapi-adapted helpers:

| Method                         | Description                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token(request)`               | Handles a token endpoint request using the Kaapi request.                                                                                                                                    |
| `verifyToken(request)`         | Extracts and verifies the bearer token, returning a typed result.                                                                                                                            |
| `authorizeMiddleware(scopes?)` | Returns a middleware that enforces token validity and optional scope requirements on a route. On success it authenticates the request with the verified credentials for downstream handlers. |
| `toAuthDesign()`               | Returns an `IOAuth2AuthDesign` instance. It is used to register the flow and its endpoints on the Kaapi server and generate OpenAPI/Postman documentation.                                   |

## Installation

```bash
npm install @kaapi/oauth2-auth-design @saurbit/oauth2
```

## Quick Start

### 1. Configure a flow

```ts
import Boom from '@hapi/boom';
import { KaapiClientCredentialsFlowBuilder } from '@kaapi/oauth2-auth-design';

export const flow = KaapiClientCredentialsFlowBuilder.create()
    .setSecuritySchemeName('clientCredentials')
    .setScopes({
        'content:read': 'Read content',
        'content:write': 'Write content',
    })
    .setTokenEndpoint('/token')
    .setAccessTokenLifetime(3600)
    .clientSecretBasicAuthenticationMethod()
    .getClient(async (tokenRequest) => {
        // Look up and return the client, or undefined if not found
        return undefined;
    })
    .generateAccessToken(async (grantContext) => {
        // Return an access token string
        return undefined;
    })
    .tokenVerifier((req, { token }) => {
        if (token === 'valid-token') {
            return { isValid: true, credentials: { app: { clientId: 'example-client' }, scope: ['content:read'] } };
        }
        return { isValid: false };
    })
    .failedAuthorizationAction((_, error) => {
        if (error instanceof StrategyInternalError) throw Boom.internal('Internal Server Error');

        throw Boom.unauthorized('Unauthorized');
    })
    .build();
```

### 2. Register the endpoints, documentation and middleware

```ts
import { Kaapi } from '@kaapi/kaapi';
import { UnauthorizedClientError, UnsupportedGrantTypeError } from '@saurbit/oauth2';

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
});

// register the endpoints, strategy and documentation for the flow
await app.extend(flow.toAuthDesign());

// set the default authentication strategy for all routes to the flow's security scheme
app.base().auth.default({
    strategies: [flow.getSecuritySchemeName()],
    mode: 'try',
});
```

### 3. Protect your routes with the flow's middleware

```ts
app.route<{
    AuthCredentialsExtra: {
        app: {
            clientId: string;
        };
        scope: string[];
    };
}>({
    method: 'GET',
    path: '/protected-resource',
    options: {
        description: 'Protected Resource',
        notes: "An example endpoint that requires a valid access token with the 'content:read' scope to access.",
        auth: {
            strategies: [flow.getSecuritySchemeName()],
            access: {
                entity: 'app',
                scope: ['content:read'],
            },
        },
    },
    handler: (req) => `Hello, ${req.auth.credentials.app.clientId}!`,
});
```

## License

[MIT](./LICENSE)
