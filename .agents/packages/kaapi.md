# `@kaapi/kaapi` — Package Reference

**npm**: `@kaapi/kaapi` · **version**: 0.0.45  
**Source**: `packages/kaapi/src/`  
**Build**: `tsc` → `lib/` · **Format**: CommonJS (`NodeNext`)  
**Dependencies**: `@hapi/boom`, `@hapi/hapi`, `@kaapi/server`, `@novice1/api-doc-generator`, `jsontoxml`, `qs`, `swagger-ui-dist`, `tslib`, `winston`  
**Dev Dependencies**: `@novice1/routing`, `@types/jsontoxml`, `@types/qs`, `@types/swagger-ui-dist`

This is the **primary import** for Kaapi applications. It re-exports everything from `@kaapi/server` and `@hapi/hapi`, so application code only needs to import from `@kaapi/kaapi`.

---

## File Structure

```
src/
  index.ts                              ← all public exports
  abstract-app.ts                       ← AbstractKaapiApp, IKaapiApp, KaapiPluginConfiguration
  app.ts                                ← Kaapi class (main entry point)
  declarations.d.ts                     ← Hapi module augmentation
  services/
    log.ts                              ← ILogger, createLogger
    messaging.ts                        ← IMessaging, IMessagingContext, IPublishMethod, ISubscribeMethod
    docs/
      docs.ts                           ← DocsConfig, createDocsRouter
      generators.ts                     ← KaapiOpenAPI, KaapiPostman, formatRoutes, formatRequestRoute
      modifiers.ts                      ← SchemaModifier, ResponseUtil, ExampleModifier, RequestBodyDocsModifier, etc.
      utils.ts                          ← KaapiGroupAuthUtil
    plugins/
      plugin.ts                         ← KaapiPlugin, KaapiTools, AuthDesign, GroupAuthDesign
      auth-designs/
        api-key-auth-design.ts          ← APIKeyAuthDesign
        basic-auth-design.ts            ← BasicAuthDesign
        bearer-auth-design.ts           ← BearerAuthDesign
```

---

## `Kaapi` Class

The main application class. Extends `AbstractKaapiApp`.

```ts
import { Kaapi, KaapiAppOptions } from '@kaapi/kaapi';

const app = new Kaapi({
    host: 'localhost',
    port: 3000,
    // ILogger override (uses Winston Console by default)
    logger: myLogger,
    // Winston LoggerOptions if not providing a custom logger
    loggerOptions: { level: 'debug' },
    // IMessaging implementation (optional)
    messaging: new KafkaMessaging({ brokers: ['localhost:9092'] }),
    // Built-in auth strategy for the KaapiServer
    auth: {
        tokenType: 'Bearer',
        validate: async (req, token) => ({ isValid: true, credentials: { userId: 'x' } })
    },
    // OpenAPI + Postman docs configuration
    docs: {
        title: 'My API',
        version: '1.0.0',
        host: { url: 'https://api.example.com' },
        path: '/docs/api',     // default: '/docs/api'
        disabled: false,
        consumes: ['application/json'],
    },
    // Plugins to register immediately
    extend: [validatorZod, new BearerAuthDesign({ auth: { validate: ... } })]
});

await app.listen();
```

### `KaapiAppOptions`

Extends `KaapiServerOptions` (from `@kaapi/server`) with:

| Field           | Type                           | Description                                     |
| --------------- | ------------------------------ | ----------------------------------------------- |
| `logger`        | `ILogger`                      | Custom logger (skips Winston setup)             |
| `loggerOptions` | `winston.LoggerOptions`        | Winston config when not providing custom logger |
| `messaging`     | `IMessaging`                   | Messaging backend (Kafka, custom, etc.)         |
| `docs`          | `DocsConfig`                   | OpenAPI + Postman doc configuration             |
| `extend`        | `KaapiPlugin \| KaapiPlugin[]` | Plugins to register at construction time        |

### Instance Members

| Member                             | Type                        | Description                                            |
| ---------------------------------- | --------------------------- | ------------------------------------------------------ |
| `log`                              | `ILogger`                   | Application logger                                     |
| `openapi`                          | `KaapiOpenAPI`              | OpenAPI doc builder                                    |
| `postman`                          | `KaapiPostman`              | Postman collection builder                             |
| `server(opts?)`                    | `() => KaapiServer`         | Returns (creates if needed) the `KaapiServer` instance |
| `base()`                           | alias → `app.server().base` | Raw `Hapi.Server`                                      |
| `route(serverRoute, handler?)`     | method                      | Register a route; returns `this` for chaining          |
| `extend(plugin \| plugin[])`       | `async method`              | Integrate `KaapiPlugin`(s)                             |
| `listen()`                         | `async method`              | Start the Hapi server; registers doc routes            |
| `publish(topic, message)`          | method                      | Delegates to `IMessaging.publish`                      |
| `subscribe(topic, handler, conf?)` | method                      | Delegates to `IMessaging.subscribe`                    |
| `emit(topic, message)`             | alias for `publish`         |                                                        |
| `on(topic, handler, conf?)`        | alias for `subscribe`       |                                                        |

---

## `AbstractKaapiApp` / `IKaapiApp`

```ts
interface IKaapiApp extends IMessaging {
    log: ILogger;
    emit: IPublishMethod;
    on: ISubscribeMethod;
    server(): KaapiServer;
    route<Refs>(serverRoute, handler?): this;
}
```

`AbstractKaapiApp` implements `IKaapiApp`, providing a concrete `route()` that delegates to `server().route()` and a `toString()` / `[Symbol.for('nodejs.util.inspect.custom')]()` for debugging.

### `KaapiPluginConfiguration`

Attached to Hapi route `options.plugins.kaapi` via module augmentation:

```ts
interface KaapiPluginConfiguration {
    docs?:
        | {
              disabled?: boolean;
              openAPIHelperClass?: KaapiOpenAPIHelperClass;
              helperSchemaProperty?: string;
              modifiers?: () => {
                  requestBody?: RequestBodyDocsModifier;
                  responses?: BaseResponseUtil;
              };
          }
        | false;
}
```

---

## `ILogger`

Winston-based logger callable both as a function and via level methods.

```ts
interface ILogger {
    (...args: unknown[]): void; // logs at 'info' level
    silly: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    verbose: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    warning: (...args: unknown[]) => void; // alias for warn
    err: (...args: unknown[]) => void; // alias for error
    error: (...args: unknown[]) => void;
}
```

`createLogger(options?: winston.LoggerOptions): ILogger` — factory function. Arguments are automatically serialized (objects → JSON, Errors → stack trace).

---

## `IMessaging` / Related Interfaces

```ts
interface IMessaging {
    publish<T = unknown>(topic: string, message: T): Promise<void>;
    subscribe<T = unknown>(
        topic: string,
        handler: (message: T, context: IMessagingContext) => void | Promise<void>,
        conf?: IMessagingSubscribeConfig
    ): Promise<void>;
    shutdown?(): Promise<unknown>;
}

interface IMessagingContext {
    id?: string;
    name?: string;
    timestamp?: string;
    [x: string]: string | undefined; // extensible with string fields
}

type IMessagingSubscribeConfig = object; // extended by specific implementations
type IPublishMethod = <T>(topic: string, message: T) => Promise<void>;
type ISubscribeMethod = <T>(topic, handler, conf?) => Promise<void>;
```

---

## Plugin System

See [conventions.md](../conventions.md) for detailed usage. Exported types:

### `KaapiPlugin`

```ts
interface KaapiPlugin {
    integrate(t: KaapiTools): void | Promise<void>;
}
```

### `KaapiTools`

```ts
interface KaapiTools {
    readonly log: ILogger;
    server: Hapi.Server;
    openapi?: KaapiOpenAPI;
    postman?: KaapiPostman;
    route<Refs>(serverRoute, handler?): this;
    scheme<Options>(name: string, scheme: ServerAuthScheme<Options>): void;
    strategy(name, scheme, options?): void;
}
```

### `AuthDesign` (abstract)

Abstract base for authentication plugins:

| Method                 | Must implement | Description                                                                                   |
| ---------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `getStrategyName()`    | yes            | Returns the Hapi strategy name string                                                         |
| `docs()`               | yes            | Returns a `BaseAuthUtil` (e.g. `BearerUtil`) for OpenAPI/Postman docs, or `undefined` to skip |
| `integrateStrategy(t)` | yes            | Register `t.scheme()` + `t.strategy()`                                                        |
| `integrateHook(t)`     | no             | Override to register `onPreAuth` or other hooks                                               |

`integrate(t)` is final: calls `integrateStrategy()` then `integrateHook()` then `docs()`, wiring docs automatically.

### `GroupAuthDesign`

Groups multiple `AuthDesign` instances under one OIDC / multi-scheme security scheme. Used by `@kaapi/oauth2-auth-design`'s `MultipleFlows`.

---

## Built-in Auth Designs

### `BearerAuthDesign`

```ts
import { BearerAuthDesign } from '@kaapi/kaapi';

const auth = new BearerAuthDesign({
    strategyName: 'bearer-auth-design', // default
    auth: {
        validate: async (request, token, h) => {
            const user = await verifyJwt(token);
            if (!user) return { isValid: false };
            return { isValid: true, credentials: { user } };
        },
    },
});
auth.setDescription('JWT Bearer token'); // added to OpenAPI docs
await app.extend(auth);
```

- Reads `Authorization` header, strips `Bearer ` prefix, passes raw token to `validate`.
- Registers its own Hapi scheme + strategy (not the `kaapi-auth` one from `@kaapi/server`).

### `BasicAuthDesign`

```ts
import { BasicAuthDesign } from '@kaapi/kaapi';

const auth = new BasicAuthDesign({
    strategyName: 'basic-auth-design', // default
    auth: {
        validate: async (request, username, password, h) => {
            const ok = await checkCredentials(username, password);
            return { isValid: ok, credentials: { username } };
        },
    },
});
await app.extend(auth);
```

- Reads `Authorization: Basic <base64>` header, decodes, splits on `:`.
- `validate(request, username, password, h)`

### `APIKeyAuthDesign`

```ts
import { APIKeyAuthDesign } from '@kaapi/kaapi';

const auth = new APIKeyAuthDesign({
    strategyName: 'api-key-auth-design', // default
    auth: {
        validate: async (request, apiKey, h) => {
            return { isValid: apiKey === 'secret', credentials: {} };
        },
    },
});

// Location (default: header 'x-api-key'):
auth.inHeader('x-api-key');
// or:
auth.inCookie('api_key');

await app.extend(auth);
```

---

## Doc Generation

### `DocsConfig`

Full OpenAPI/Postman configuration passed via `KaapiAppOptions.docs`:

| Field            | Type                  | Description                                          |
| ---------------- | --------------------- | ---------------------------------------------------- |
| `title`          | `string`              | API title                                            |
| `version`        | `string`              | API version                                          |
| `host`           | `{ url, variables? }` | Server URL                                           |
| `path`           | `string`              | URL path for Swagger UI (default: `'/docs/api'`)     |
| `disabled`       | `boolean`             | Disable all doc routes                               |
| `consumes`       | `string[]`            | Default MIME types (default: `['application/json']`) |
| `license`        | `string \| object`    | License info                                         |
| `openAPIOptions` | `object`              | Passed to `KaapiOpenAPI` constructor                 |
| `postmanOptions` | `object`              | Passed to `KaapiPostman` constructor                 |

### `KaapiOpenAPI` / `KaapiPostman`

Doc builders exposed as `app.openapi` and `app.postman`. Typically you don't call these directly — they are populated automatically as routes are registered with validator schemas.

### `options.id` → operationId

Set `options.id` on any route to control its `operationId` in the generated OpenAPI spec:

```ts
app.route({
    method: 'GET',
    path: '/users/{id}',
    options: { id: 'getUser' }, // operationId in OpenAPI
    handler: async (request) => { ... },
});
```

This uses the standard Hapi `RouteOptions.id` field — no extra Kaapi-specific configuration needed.

### Schema Modifiers

Available from `@kaapi/kaapi` for advanced doc customization:

- `SchemaModifier` — base class for route-level schema modification
- `ExampleModifier` — sets OpenAPI examples on schemas
- `ResponseDocsModifier` / `RequestBodyDocsModifier` — modifies response/request schemas in docs
- `KaapiOpenAPIHelperInterface` / `KaapiOpenAPIHelperClass` — interfaces for custom schema-to-OpenAPI converters

### `RouteModifierObject`

The object returned by the `modifiers()` function in `KaapiPluginConfiguration.docs`:

```ts
interface RouteModifierObject {
    requestBody?: RequestBodyDocsModifier;
    responses?: BaseResponseUtil;
}
```

Provided responses always **replace** any existing responses for the route (override-by-default behaviour).

### `applyModifiers(serverRoute, modifiers)`

Helper that wires a `RouteModifierObject` (or a factory function returning one) onto a `KaapiServerRoute` without manually navigating `options.plugins.kaapi.docs`:

```ts
import { applyModifiers } from '@kaapi/kaapi';

const route = applyModifiers(
    { method: 'POST', path: '/items', handler: () => ({ ok: true }) },
    {
        overrideResponses: true,
        responses: new ResponseDocsModifier(201, { schema: mySchema }),
    }
);

app.route(route);
```

Also accepts a factory function:

```ts
applyModifiers(route, () => ({ responses: myResponseModifier }));
```

---

## Hapi Module Augmentation

`@kaapi/kaapi` augments `@hapi/hapi` types (in `src/declarations.d.ts`):

```ts
// On every Hapi.Request:
declare module '@hapi/hapi' {
    interface Request {
        publish: IPublishMethod; // delegates to app.messaging
    }
    interface PluginSpecificConfiguration {
        kaapi?: KaapiPluginConfiguration;
    }
}
```

---

## Re-exports

`@kaapi/kaapi/src/index.ts` re-exports:

- All of `@hapi/hapi` (Hapi types, decorators, server, etc.)
- All of `@kaapi/server` (`KaapiServer`, `KaapiServerRoute`, `KaapiServerOptions`, `KaapiAuthOptions`)
- Selected Winston types (`LoggerOptions`, `Logger`, `Container`, etc.)
- All doc generators, modifiers, utilities (including `applyModifiers`)
- All plugin interfaces + built-in auth designs
- `ILogger`, `createLogger`
- `IMessaging`, `IMessagingContext`, `IPublishMethod`, `ISubscribeMethod`, `IMessagingSubscribeConfig`
- `AbstractKaapiApp`, `IKaapiApp`, `KaapiPluginConfiguration`
- `Kaapi`, `KaapiAppOptions`
