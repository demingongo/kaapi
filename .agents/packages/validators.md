# Validator Packages — Reference

Three interchangeable request validation plugins for Kaapi, each backed by a different schema library. They follow an identical integration pattern but differ in the schema library, module format, and doc helper details.

| Package                      | npm name                   | Schema library                    | Module format | peerDependency    |
| ---------------------------- | -------------------------- | --------------------------------- | ------------- | ----------------- |
| `packages/validator-arktype` | `@kaapi/validator-arktype` | [ArkType](https://arktype.io) v2  | **ESM-only**  | `arktype ^2.1.25` |
| `packages/validator-valibot` | `@kaapi/validator-valibot` | [Valibot](https://valibot.dev) v1 | CJS           | `valibot ^1.1.0`  |
| `packages/validator-zod`     | `@kaapi/validator-zod`     | [Zod](https://zod.dev) v4         | CJS           | `zod ^4.0.0`      |

---

## Common Integration Pattern

All three validators work the same way:

1. **Import** the plugin and schema-builder functions from the respective package
2. **Register** the plugin with `app.extend(validatorX)` — this wires the `onPreHandler` hook
3. **Define routes** using either `withSchema(schema).route(...)` or `server.base.X(schema).route(...)`

The `onPreHandler` hook runs before each handler, reads the schema from `request.route.settings.plugins.<key>`, and validates `payload`, `query`, `params`, `headers`, `state`. On failure it throws `Boom.badRequest`. On success the request fields are replaced with the parsed/coerced values.

---

## `@kaapi/validator-arktype`

> **ESM-only**. Your project (or the file importing this) must use ESM (`"type": "module"` in `package.json`, or `.mjs` extension). Built with `tsup`.

### Setup

```ts
// app.ts (ESM)
import { Kaapi } from '@kaapi/kaapi';
import { validatorArk } from '@kaapi/validator-arktype';

const app = new Kaapi();
await app.extend(validatorArk);
```

### Route Definition

```ts
import { withSchema } from '@kaapi/validator-arktype';
import { type } from 'arktype';

const schema = {
    payload: type({ name: 'string', age: 'number > 0' }),
    query: type({ page: 'string.integer.parse' }), // auto-parses string → number
};

// Standalone builder (recommended for modular route files):
const route = withSchema(schema).route({
    method: 'POST',
    path: '/users',
    handler: async (request) => {
        request.payload.name; // string ✓
        request.payload.age; // number ✓
        request.query.page; // number ✓ (parsed from string)
        return { ok: true };
    },
});

app.route(route);
```

### Types

```ts
// ValidatorArkSchema — all fields optional
type ValidatorArkSchema = {
    payload?: Type<any, any> | null;
    query?: Type<any, any> | null;
    params?: Type<any, any> | null;
    headers?: Type<any, any> | null;
    state?: Type<any, any> | null;
    failAction?: 'error' | 'log' | Lifecycle.Method;
};

// Request refs with inferred types
interface ValidatorArkReqRef<RS extends ValidatorArkSchema> {
    Query: output<RS['query']>;
    Headers: output<RS['headers']>;
    Params: output<RS['params']>;
    Payload: output<RS['payload']>;
}

// Type utilities
type Infer<T extends Type<any, any>> = T['infer'];
type output<T, D = unknown> = T extends Type<any, any> ? Infer<T> : D;

// Route builder returned by withSchema()
interface ValidatorArkRouteBuilder<V extends ValidatorArkSchema> {
    route<R extends ArklessReqRef = ArklessReqRefDefaults>(
        serverRoute: KaapiServerRoute<ValidatorArkReqRef<V> & R>,
        handler?: ...
    ): KaapiServerRoute<ValidatorArkReqRef<V> & R>;
}
```

### Doc Helpers

```ts
import { OpenAPIArkHelper, PostmanArkHelper } from '@kaapi/validator-arktype';
```

These are injected automatically by `validatorArk`. They use ArkType's `toJsonSchema()` to convert ArkType schemas to JSON Schema / OpenAPI definitions.

### Boolean String Normalization

Query parameters coming from HTTP are always strings. The ArkType validator automatically normalizes `'true'` → `true` and `'false'` → `false` in query and headers before validation.

### Hapi Augmentation

```ts
// Adds to PluginSpecificConfiguration:
plugins.ark = ValidatorArkSchema;
```

### Constants

```ts
export const supportedProps = ['payload', 'query', 'params', 'headers', 'state'] as const;
```

---

## `@kaapi/validator-valibot`

### Setup

```ts
import { Kaapi } from '@kaapi/kaapi';
import { validatorValibot } from '@kaapi/validator-valibot';

const app = new Kaapi();
await app.extend(validatorValibot);
```

### Route Definition

```ts
import { withSchema } from '@kaapi/validator-valibot';
import * as v from 'valibot';

const schema = {
    payload: v.object({ name: v.string(), age: v.number() }),
    query: v.object({ page: v.optional(v.pipe(v.string(), v.transform(Number))) }),
};

const route = withSchema(schema).route({
    method: 'POST',
    path: '/users',
    handler: async (request) => {
        request.payload.name; // string ✓
        request.payload.age; // number ✓
        return { ok: true };
    },
});

app.route(route);
```

### Types

```ts
type ValidatorValibotSchema = {
    payload?: ObjectEntriesAsync[string] | null;
    query?: ObjectEntriesAsync[string] | null;
    params?: ObjectEntriesAsync[string] | null;
    headers?: ObjectEntriesAsync[string] | null;
    state?: ObjectEntriesAsync[string] | null;
    options?: Config<InferIssue<NonEmptyValibotSchema>>;  // valibot parse options
    failAction?: 'error' | 'log' | Lifecycle.Method;
};

interface ValidatorValibotReqRef<RS extends ValidatorValibotSchema> {
    Query: InferOutput<RS['query']> | default;
    Headers: InferOutput<RS['headers']> | default;
    Params: InferOutput<RS['params']> | default;
    Payload: InferOutput<RS['payload']> | default;
}
```

### Validation Behavior

Uses `valibot.objectAsync({ ...schemaFields })` wrapping all defined fields, then calls `parseAsync`. On `ValiError`, throws `Boom.badRequest` with the error issues.

### Doc Helpers

```ts
import { OpenAPIValibotHelper, PostmanValibotHelper } from '@kaapi/validator-valibot';
```

Uses `@valibot/to-json-schema` for schema conversion. Handles:

- File fields (`isFile()`, `getFilesChildren()`)
- All OpenAPI metadata: `description`, `examples`, `format`, `nullable`, `enum`, `minimum`, `maximum`, etc.

### Hapi Augmentation

```ts
// Adds to PluginSpecificConfiguration:
plugins.valibot = ValidatorValibotSchema;
```

---

## `@kaapi/validator-zod`

### Setup

```ts
import { Kaapi } from '@kaapi/kaapi';
import { validatorZod } from '@kaapi/validator-zod';

const app = new Kaapi();
await app.extend(validatorZod);
```

### Route Definition

```ts
import { withSchema } from '@kaapi/validator-zod';
import { z } from 'zod';

const schema = {
    payload: z.object({ name: z.string(), age: z.number().positive() }),
    params: z.object({ id: z.string().uuid() }),
};

const route = withSchema(schema).route({
    method: 'PUT',
    path: '/users/{id}',
    handler: async (request) => {
        request.payload.name; // string ✓
        request.params.id; // string (UUID) ✓
        return { ok: true };
    },
});

app.route(route);
```

### Types

```ts
type ValidatorZodSchema = {
    payload?: ZodType<any, any> | null;
    query?: ZodType<any, any> | null;
    params?: ZodType<any, any> | null;
    headers?: ZodType<any, any> | null;
    state?: ZodType<any, any> | null;
    options?: ParseContext<$ZodIssue>;  // Zod parse options
    failAction?: 'error' | 'log' | Lifecycle.Method;
};

interface ValidatorZodReqRef<RS extends ValidatorZodSchema> {
    Query: z.infer<RS['query']> | default;
    Headers: z.infer<RS['headers']> | default;
    Params: z.infer<RS['params']> | default;
    Payload: z.infer<RS['payload']> | default;
}
```

### Validation Behavior

Uses `z.object({ ...schemaFields }).parseAsync(data, options)`. On `ZodError`, maps issues to human-readable strings via `mapIssue()` and throws `Boom.badRequest(messages.join(', '))`.

### Doc Helpers & Doc Config

```ts
import { ZodDocHelper, zodDocsConfig } from '@kaapi/validator-zod';

// zodDocsConfig is ready-to-use KaapiAppOptions.docs sub-config:
const app = new Kaapi({
    docs: {
        ...zodDocsConfig,
        title: 'My API',
    },
});
```

`zodDocsConfig` sets:

```ts
{
    openAPIOptions: { helperClass: OpenAPIZodHelper },
    postmanOptions: { helperClass: PostmanZodHelper }
}
```

`ZodDocHelper` extends `OpenAPIZodHelper` from `@novice1/api-doc-zod-helper`, adding:

- `isFile()` — detects Zod `custom` type used for file uploads
- `getFilesChildren()` — extracts file schema children for multipart docs
- `getRawSchema()` — returns the raw Zod schema

### `mapIssue(issue: $ZodIssue): string`

Converts a single Zod issue to a human-readable string: `"field.path: message"`.

### `supportedProps`

```ts
export const supportedProps = ['payload', 'query', 'params', 'headers', 'state'] as const;
```

### Hapi Augmentation

```ts
// Adds to PluginSpecificConfiguration:
plugins.zod = ValidatorZodSchema;
```

---

## Choosing a Validator

| Concern                      | ArkType                           | Valibot                | Zod                              |
| ---------------------------- | --------------------------------- | ---------------------- | -------------------------------- |
| Module format                | **ESM-only**                      | CJS                    | CJS                              |
| Bundle size                  | Smallest (type-level definitions) | Small                  | Larger                           |
| Zod v4 compatible            | No                                | No                     | Yes                              |
| Boolean string normalization | Auto (query/headers)              | Manual                 | Manual                           |
| File upload support          | No                                | Yes (`isFile()`)       | Yes (`isFile()`)                 |
| Doc helper                   | `OpenAPIArkHelper`                | `OpenAPIValibotHelper` | `ZodDocHelper` / `zodDocsConfig` |
| peerDep                      | `arktype ^2.1.25`                 | `valibot ^1.1.0`       | `zod ^4.0.0`                     |

All three validators are **mutually compatible** — you can register multiple validators in a single app and use different schemas per route.
