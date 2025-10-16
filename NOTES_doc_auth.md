# Getting Started with `@kaapi/oauth2-auth-design`

The `@kaapi/oauth2-auth-design` package provides a flexible and modular way to implement OAuth2 and OIDC authentication flows within a [Kaapi](https://github.com/demingongo/kaapi) application. It uses a builder-based architecture to configure flows and can easily integrate with multiple strategies or existing auth designs.

## 🔐 Supported OAuth2/OIDC Flows

This package currently supports the following flows out of the box:

* **Authorization Code Flow**
  `OAuth2AuthorizationCodeBuilder`, `OIDCAuthorizationCodeBuilder`

* **Client Credentials Flow**
  `OAuth2ClientCredentialsBuilder`, `OIDCClientCredentialsBuilder`

* **Device Authorization Flow**
  `OAuth2DeviceAuthorizationBuilder`, `OIDCDeviceAuthorizationBuilder`

Each flow is built using a fluent builder pattern that results in a plug-and-play *auth design*.

---

## 🚀 Basic Usage

Here's how to configure a single flow (e.g., OAuth2 Authorization Code) and register it in your Kaapi app:

```ts
import { Kaapi } from '@kaapi/kaapi';
import { OAuth2AuthorizationCodeBuilder } from '@kaapi/oauth2-auth-design';

const authCodeFlow = OAuth2AuthorizationCodeBuilder
  .create()
  .strategyName('oauth2-auth-code')
  // configure additional settings here
  .build();

const app = new Kaapi({
  port: 3000,
  host: 'localhost',
  docs: {
    host: { url: 'http://localhost:3000' }
  }
});

// Register the auth flow
await app.extend(authCodeFlow);

// Set it as the default auth strategy
app.base().auth.default({
  strategy: authCodeFlow.getStrategyName(),
  mode: 'try'
});
```

---

## ⚙️ Using Multiple Flows Together

If your application requires support for multiple OAuth2/OIDC flows, you can compose them using `MultipleFlowsBuilder`. This also allows you to configure shared settings like the token endpoint, JWKS URI, and key storage.

```ts
import { 
    createInMemoryKeyStore,
    MultipleFlowsBuilder,
    OIDCAuthorizationCodeBuilder,
    OIDCClientCredentialsBuilder
} from '@kaapi/oauth2-auth-design';

const authCodeFlowBuilder = OIDCAuthorizationCodeBuilder.create();
// configure settings...

const clientCredentialsFlowBuilder = OIDCClientCredentialsBuilder.create();
// configure settings...

const multipleFlows = MultipleFlowsBuilder
  .create()
  .tokenEndpoint('/oauth2/token') // default: '/oauth2/token'
  .jwksRoute(route => route.setPath('/.well-known/jwks.json')) // default: '/oauth2/keys'
  .setPublicKeyExpiry(86400) // in seconds (24h)
  .setJwksKeyStore(createInMemoryKeyStore()) // in-memory JWKS storage
  .add(authCodeFlowBuilder)
  .add(clientCredentialsFlowBuilder)
  .build();
```

Then plug the composed flows into your Kaapi app:

```ts
await app.extend(multipleFlows);

app.base().auth.default({
  strategies: multipleFlows.getStrategyName(), // returns array of strategies
  mode: 'try'
});
```

---

## 🧩 Grouping with Other Auth Designs

You can also combine multiple auth designs using `GroupAuthDesign`:

```ts
import {
  APIKeyAuthDesign,
  GroupAuthDesign
} from '@kaapi/kaapi';

const customAuthDesign = new GroupAuthDesign([
  new APIKeyAuthDesign({ /* options */ }),
  multipleFlows
]);

await app.extend(customAuthDesign);

app.base().auth.default({
  strategies: customAuthDesign.getStrategies(),
  mode: 'try'
});
```

---

This overview gives you the foundation to start integrating OAuth2 flows into your Kaapi app. In the following sections, we’ll dive deeper into each builder, configuration option, and how to customize the flows to fit your needs.

---

Methods:

create

strategyName
setDescription
setScopes

addClientAuthenticationMethod
setTokenType

jwksRoute
tokenRoute

setTokenTTL
setJwksKeyStore
setJwksRotatorOptions
setPublicKeyExpiry
useAccessTokenJwks

validate

---

Authorization code methods:

authorizationRoute
refreshTokenRoute

---

Client credentials methods:

---

Device authorization methods:

authorizationRoute
refreshTokenRoute

---

OIDC methods:

additionalConfiguration
