# `@kaapi/server` — Package Reference

**npm**: `@kaapi/server` · **version**: 0.0.45  
**Source**: `packages/server/src/index.ts` (single file)  
**Build**: `tsc` → `lib/` · **Format**: CommonJS (`NodeNext`)  
**Dependencies**: `@hapi/boom`, `@hapi/hapi`, `@hapi/hoek`, `tslib`

---

## Purpose

Low-level Hapi.js server wrapper. The **only** thing it adds over a raw `Hapi.server()` is:

1. A built-in `kaapi-auth` authentication **scheme** (Bearer token validator)
2. A registered `kaapi` **strategy** using that scheme
3. The `auth: boolean` shorthand on routes

Everything else is standard Hapi. `@kaapi/kaapi` depends on this package and re-exports it in full — most application code should import from `@kaapi/kaapi`, not directly from `@kaapi/server`.

---

## Exports

### `KaapiServer<A>`

Wraps a `Hapi.Server<A>` instance. The constructor automatically registers the `kaapi-auth` scheme and the `kaapi` strategy.

```ts
import { KaapiServer, KaapiServerOptions } from '@kaapi/server';

const server = new KaapiServer({
    host: 'localhost',
    port: 3000,
    auth: {
        tokenType: 'Bearer', // default
        validate: async (request, token, h) => {
            const user = await verifyToken(token);
            if (!user) return { isValid: false };
            return { isValid: true, credentials: { user } };
        },
    },
});

await server.base.start();
```

| Member                         | Type             | Description                                |
| ------------------------------ | ---------------- | ------------------------------------------ |
| `get base`                     | `Hapi.Server<A>` | The underlying Hapi server instance        |
| `route(serverRoute, handler?)` | method           | Register a route; applies `auth` shorthand |

### `route(serverRoute, handler?)`

Registers a route on the Hapi server. Applies defaults (`method: '*'`, `path: '/{any*}'`) if omitted. If `serverRoute.auth === true`, sets `options.auth.strategy = 'kaapi'`.

```ts
server.route({
    method: 'GET',
    path: '/protected',
    auth: true, // shorthand for options.auth.strategy = 'kaapi'
    handler: async (request) => {
        return request.auth.credentials;
    },
});

// handler can also be passed as second arg
server.route({ method: 'GET', path: '/hello' }, () => 'Hello!');
```

---

### `KaapiServerRoute<Refs>`

Extends `Partial<Hapi.ServerRoute<Refs>>` with one extra field:

```ts
interface KaapiServerRoute<Refs extends Hapi.ReqRef = Hapi.ReqRefDefaults> extends Partial<Hapi.ServerRoute<Refs>> {
    /** If true, sets options.auth.strategy = 'kaapi' */
    auth?: boolean;
}
```

`Refs` is the Hapi request refs generic — used by validator packages to attach typed `Query`, `Params`, `Payload`, `Headers` to the request object.

---

### `KaapiServerOptions`

```ts
interface KaapiServerOptions extends Hapi.ServerOptions {
    auth?: KaapiAuthOptions;
}
```

All standard Hapi server options apply. `auth` configures the built-in `kaapi-auth` scheme.

---

### `KaapiAuthOptions`

```ts
type KaapiAuthOptions = {
    tokenType?: string; // default: 'Bearer'
    validate?: (
        request: Hapi.Request,
        token: string,
        h: Hapi.ResponseToolkit
    ) =>
        | Promise<
              | {
                    isValid?: boolean;
                    artifacts?: unknown;
                    credentials?: Hapi.AuthCredentials;
                    message?: string;
                    scheme?: string;
                }
              | Hapi.Auth
          >
        | undefined;
};
```

The `validate` function receives the raw token string (after stripping the token type prefix). Return `{ isValid: true, credentials }` to authenticate, or `{ isValid: false }` / `{ message: '...' }` to reject.

---

## Built-in `kaapi-auth` Scheme Behavior

1. Reads `Authorization` header from the raw request
2. Splits on whitespace: `[tokenType, token]`
3. Compares `tokenType` case-insensitively against `options.tokenType` (default `'Bearer'`)
4. If mismatch → `Boom.unauthorized(null, tokenType)`
5. If match and `validate` is defined → calls `validate(request, token, h)`
6. If `validate` returns `{ isValid: true, credentials }` → `h.authenticated({ credentials, artifacts })`
7. If `validate` returns `{ message }` → `h.unauthenticated(Boom.unauthorized(message, scheme), ...)`
8. Otherwise → `Boom.unauthorized(null, tokenType)`

The strategy is always registered as `'kaapi'` — the `auth: true` route shorthand targets this strategy.

---

## Re-exported by `@kaapi/kaapi`

`@kaapi/kaapi` does `export * from '@kaapi/server'`, so all types and classes above are available from `@kaapi/kaapi` directly.
