# Kaapi — Cross-Cutting Conventions & Patterns

---

## 1. Plugin System

All framework extensions implement the `KaapiPlugin` interface and are registered via `app.extend()`.

```ts
import { KaapiPlugin, KaapiTools } from '@kaapi/kaapi';

class MyPlugin implements KaapiPlugin {
    async integrate(t: KaapiTools): Promise<void> {
        // register routes, schemes, strategies, docs, etc.
        t.route({ method: 'GET', path: '/ping', handler: () => 'pong' });
        t.log.info('MyPlugin integrated');
    }
}

// Registration (at construction or later)
const app = new Kaapi({ extend: [new MyPlugin()] });
// or lazily:
await app.extend(new MyPlugin());
```

**`KaapiTools`** — the toolbox passed to `integrate()`:

| Property                           | Type                        | Description                              |
| ---------------------------------- | --------------------------- | ---------------------------------------- |
| `log`                              | `ILogger`                   | Framework logger                         |
| `server`                           | `Hapi.Server`               | Raw Hapi server instance                 |
| `openapi`                          | `KaapiOpenAPI \| undefined` | OpenAPI doc builder                      |
| `postman`                          | `KaapiPostman \| undefined` | Postman doc builder                      |
| `route(serverRoute, handler?)`     | method                      | Register a route (same as `app.route()`) |
| `scheme(name, scheme)`             | method                      | Register a Hapi auth scheme              |
| `strategy(name, scheme, options?)` | method                      | Register a Hapi auth strategy            |

---

## 2. `AuthDesign` — Auth Plugin Pattern

For authentication, extend the abstract `AuthDesign` class (which implements `KaapiPlugin`).

```ts
import { AuthDesign, KaapiTools } from '@kaapi/kaapi';
import { BearerUtil } from '@novice1/api-doc-generator';

class MyBearerAuth extends AuthDesign {
    getStrategyName() {
        return 'my-bearer';
    }

    docs() {
        return new BearerUtil(this.getStrategyName());
    }

    integrateStrategy(t: KaapiTools) {
        t.scheme('my-bearer', (_server, _options) => ({
            authenticate: async (request, h) => {
                // validate token, return h.authenticated(...) or Boom.unauthorized(...)
            },
        }));
        t.strategy('my-bearer', 'my-bearer');
    }
}
```

`AuthDesign.integrate()` automatically calls `integrateStrategy()` then `docs()`, wiring the security scheme into both `KaapiOpenAPI` and `KaapiPostman`.

To group multiple auth designs sharing the same security scheme, use `GroupAuthDesign`.

---

## 3. `onPreHandler` Validation Hook Pattern

All three validator packages (`validator-arktype`, `validator-valibot`, `validator-zod`) follow an identical pattern:

1. Register a Hapi `server.ext('onPreHandler', ...)` extension inside `integrate(t)`
2. Read the schema from `request.route.settings.plugins.<schemaKey>` (e.g. `plugins.ark`)
3. Validate `request.payload`, `request.query`, `request.params`, `request.headers`, `request.state` concurrently
4. On failure, throw `Boom.badRequest(message)` with field-level error detail
5. On success, mutate the request fields in-place with the parsed/coerced values

```ts
// Example: how a validator plugin is registered
const validatorZod: KaapiPlugin = {
    async integrate(t) {
        t.server.ext('onPreHandler', async (request, h) => {
            const schema = request.route.settings.plugins?.zod;
            if (!schema) return h.continue;
            // ... validate and throw Boom.badRequest on error
            return h.continue;
        });
    },
};
```

---

## 4. `withSchema()` — Typed Route Builder Pattern

Each validator exports `withSchema(schema)` as a **standalone** typed route builder — no app instance needed. Use this to split route definitions into separate files.

```ts
// arktype
import { withSchema } from '@kaapi/validator-arktype';
import { type } from 'arktype';

const schema = { payload: type({ name: 'string', age: 'number' }) };
export const createUserRoute = withSchema(schema).route({
    method: 'POST',
    path: '/users',
    handler: async (request) => {
        const { name, age } = request.payload; // fully typed
        return { name, age };
    },
});

// Register in app
app.route(createUserRoute);
```

All three validators (`withSchema` from `@kaapi/validator-arktype`, `@kaapi/validator-valibot`, `@kaapi/validator-zod`) return `ValidatorXRouteBuilder<V>` with a `.route()` method that produces a `KaapiServerRoute` with inferred types.

---

## 5. Doc Auto-Generation

Routes automatically appear in OpenAPI and Postman docs. Validator plugins inject metadata into each route's `plugins.kaapi.docs`:

```ts
// Injected automatically by validator plugins:
plugins: {
    kaapi: {
        docs: {
            helperSchemaProperty: 'zod', // or 'ark', 'valibot'
            openAPIHelperClass: ZodDocHelper,
        }
    },
    zod: myZodSchema  // the actual schema, keyed by helperSchemaProperty
}
```

`KaapiOpenAPI` reads `helperSchemaProperty` to locate the schema on the route's `plugins` object, then delegates JSON Schema conversion to `openAPIHelperClass`.

To disable docs for a specific route:

```ts
plugins: {
    kaapi: {
        docs: false;
    }
}
// or
plugins: {
    kaapi: {
        docs: {
            disabled: true;
        }
    }
}
```

---

## 6. `IMessaging` — Swappable Messaging Backend

The `Kaapi` class accepts any `IMessaging` implementation. Swap backends without changing application code.

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
```

- **Built-in**: `@kaapi/kafka-messaging` → `KafkaMessaging`
- **App-level aliases**: `app.emit(topic, msg)` = `app.publish(topic, msg)`, `app.on(topic, handler)` = `app.subscribe(topic, handler)`
- **Hapi request-level**: `request.publish(topic, msg)` (available via module augmentation in `@kaapi/kaapi`)

---

## 7. Route Typing with `KaapiServerRoute<Refs>`

`KaapiServerRoute<Refs>` extends `Partial<Hapi.ServerRoute<Refs>>` and adds:

- `auth?: boolean` — if `true`, sets `options.auth.strategy = 'kaapi'` automatically (shorthand for the default auth strategy)

Type-safe routes infer request types from `Refs`:

```ts
import { KaapiServerRoute } from '@kaapi/kaapi';
import { type } from 'arktype';

const schema = { query: type({ page: 'string.integer.parse' }) };
const route = withSchema(schema).route<{ Params: { id: string } }>({
    method: 'GET',
    path: '/items/{id}',
    handler: (request) => {
        request.params.id; // string
        request.query.page; // number (parsed by ArkType)
    },
});
```

---

## 8. Module Format Rules

| Package                     | Format       | Build tool | Notes                                              |
| --------------------------- | ------------ | ---------- | -------------------------------------------------- |
| `@kaapi/server`             | CJS          | `tsc`      | `module: NodeNext`                                 |
| `@kaapi/kaapi`              | CJS          | `tsc`      | `module: NodeNext`                                 |
| `@kaapi/kafka-messaging`    | CJS          | `tsc`      | `module: NodeNext`                                 |
| `@kaapi/oauth2-auth-design` | CJS          | `tsc`      | Two entry points: `.` and `./cli`                  |
| `@kaapi/cli`                | CJS          | `tsc`      | Two sub-exports: `/definitions`, `/utils`          |
| `@kaapi/validator-valibot`  | CJS          | `tsc`      | `module: NodeNext`                                 |
| `@kaapi/validator-zod`      | CJS          | `tsc`      | `module: NodeNext`                                 |
| `@kaapi/validator-arktype`  | **ESM only** | `tsup`     | Requires ESM consumer; `.js` extensions in imports |

---

## 9. Error Handling

- All HTTP errors use `@hapi/boom`: `Boom.badRequest()`, `Boom.unauthorized()`, `Boom.internal()`, etc.
- `@hapi/boom` is a dependency of most packages and is re-exported through `@kaapi/kaapi`.
- Validators throw `Boom.badRequest(message)` on validation failure — the message contains field-level detail.
- Auth designs return `Boom.unauthorized(null, scheme)` for missing/invalid credentials.

---

## 10. Hapi Module Augmentation

`@kaapi/kaapi` augments Hapi's built-in types in `src/declarations.d.ts`:

```ts
// On every Hapi Request:
request.publish(topic, message)  // delegates to app.messaging

// On every route's plugin config:
route.options.plugins.kaapi = {
    docs?: KaapiPluginConfiguration['docs']
}
```

Validator packages each augment `PluginSpecificConfiguration` to add their schema key:

- `plugins.ark` — `@kaapi/validator-arktype`
- `plugins.valibot` — `@kaapi/validator-valibot`
- `plugins.zod` — `@kaapi/validator-zod`
