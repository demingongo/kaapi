# 🧪 @kaapi/validator-valibot

![npm](https://img.shields.io/npm/v/@kaapi/validator-valibot?style=flat-square)
![license](https://img.shields.io/npm/l/@kaapi/validator-valibot?style=flat-square)

**Valibot-powered validation plugin for [Kaapi](https://www.npmjs.com/package/@kaapi/kaapi)**. Validate request `params`, `payload`, `query`, `headers`, and `state` using [Valibot](https://www.npmjs.com/package/valibot) schemas. Includes built-in documentation helpers for seamless API docs generation.

---

## 🚀 Installation

```bash
npm install @kaapi/validator-valibot
```

### 📦 Peer Dependency

Requires Valibot:

```bash
npm install valibot@^1.1.0
```

---

## 🛠️ Usage

### 🔌 Register the Plugin

```ts
import { Kaapi } from '@kaapi/kaapi';
import { validatorValibot } from '@kaapi/validator-valibot';

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    docs: {
        disabled: false, // explicitly enables documentation generation
    },
});

await app.extend(validatorValibot); // register the plugin
```

---

### 📐 Define a Schema

```ts
import { ValidatorValibotSchema } from '@kaapi/validator-valibot';
import * as v from 'valibot';

const routeSchema: ValidatorValibotSchema = {
    payload: v.object({
        name: v.string(),
    }),
};
```

---

### 🧭 Create a Route

```ts
app.base()
    .valibot(routeSchema)
    .route(
        {
            method: 'POST',
            path: '/items',
        },
        (req) => ({ id: Date.now(), name: req.payload.name })
    );

// or using inline handler
/*
app.base().valibot(routeSchema).route({
  method: 'POST',
  path: '/items',
  handler: req => ({ id: Date.now(), name: req.payload.name })
})
*/
```

---

### 🧱 Build Routes Separately with `withSchema`

You can use `withSchema` to create validated routes without directly chaining from `app.base()`.
This cleanly separates **route construction** from **app registration**.

```ts
import { withSchema } from '@kaapi/validator-valibot';
import * as v from 'valibot';

const schema = {
    payload: v.object({
        name: v.string(),
    }),
};

const route = withSchema(schema).route({
    method: 'POST',
    path: '/items',
    handler: (req) => ({ id: Date.now(), name: req.payload.name }),
});

// later, during app setup
app.route(route);
```

This is the most flexible and convenient way to use `@kaapi/validator-valibot` when building modular APIs.

---

## ⚙️ Advanced Configuration

### 🔧 `options`

Customize Valibot parsing behavior:

| Property         | Type                   | Default     | Description                            |
| ---------------- | ---------------------- | ----------- | -------------------------------------- |
| `abortEarly`     | `boolean`              | `undefined` | Whether it should be aborted early     |
| `abortPipeEarly` | `boolean`              | `undefined` | Whether a pipe should be aborted early |
| `lang`           | `string`               | `undefined` | The selected language                  |
| `message`        | `ErrorMessage<TIssue>` | `undefined` | The error message                      |

---

### 🚨 `failAction`

Control how validation failures are handled:

| Value      | Behavior                     | Safe?                     | Description                     |
| ---------- | ---------------------------- | ------------------------- | ------------------------------- |
| `'error'`  | Reject with validation error | ✅                        | Default safe behavior           |
| `'log'`    | Log and reject               | ✅                        | Useful for observability        |
| `function` | Custom handler               | ✅ (developer-controlled) | Must return or throw explicitly |
| `'ignore'` | ❌ Not supported             | ❌                        | Unsafe and not implemented      |

---

### 🧪 Example with Overrides

You can override Valibot validation behavior **globally** for all routes, or **per route** as needed.

#### 🔁 Global Override (All Routes)

```ts
const app = new Kaapi({
    // ...
    routes: {
        plugins: {
            valibot: {
                options: {
                    abortEarly: true,
                },
                failAction: 'log',
            },
        },
    },
});

await app.extend(validatorValibot);
```

This sets `abortEarly` to `true` for all Valibot-validated routes, and logs validation errors before throwing them.

#### 🔂 Per-Route Override

```ts
app.base()
    .valibot({
        query: v.object({
            name: v.optional(
                v.pipe(
                    v.string(),
                    v.trim(),
                    v.nonEmpty(),
                    v.maxLength(10),
                    v.description('Optional name to personalize the greeting response')
                ),
                'World'
            ),
            age: v.optional(
                v.pipe(
                    v.string(),
                    v.transform((input) => (typeof input === 'string' ? Number(input) : input)),
                    v.number(),
                    v.integer(),
                    v.minValue(1)
                )
            ),
        }),
        options: {
            abortEarly: false,
        },
        failAction: async (request, h, err) => {
            if (Boom.isBoom(err)) {
                return h
                    .response({
                        ...err.output.payload,
                        details: err.data.validationError.issues,
                    })
                    .code(err.output.statusCode)
                    .takeover();
            }
            return err;
        },
    })
    .route({
        path: '/greetings',
        method: 'GET',
        handler: ({ query: { name } }) => `Hello ${name}!`,
    });
```

---

## 📤 File Upload Example

Multipart file uploads with Valibot validation is supported. Here's how to validate an uploaded image file and stream it back in the response:

```ts
app.base()
    .valibot({
        payload: v.object({
            file: v.pipe(
                v.looseObject({
                    _data: v.instance(Buffer),
                    hapi: v.looseObject({
                        filename: v.string(),
                        headers: v.looseObject({
                            'content-type': v.picklist(['image/jpeg', 'image/jpg', 'image/png'] as const),
                        }),
                    }),
                }),
                v.description('The image to upload')
            ),
        }),
    })
    .route(
        {
            method: 'POST',
            path: '/upload-image',
            options: {
                description: 'Upload an image',
                payload: {
                    output: 'stream',
                    parse: true,
                    allow: 'multipart/form-data',
                    multipart: { output: 'stream' },
                    maxBytes: 1024 * 3_000,
                },
            },
        },
        (req, h) => h.response(req.payload.file._data).type(req.payload.file.hapi.headers['content-type'])
    );
```

### 🧾 Notes

- `looseObject` is used to accommodate the structure of multipart file metadata.
- The `_data: instanceof(Buffer)` field is automatically interpreted as a binary field by the documentation generator.
- This ensures correct OpenAPI and Postman documentation is generated, with the file field shown as a binary upload.
- The route streams the uploaded image back with its original content type.

---

## 🔄 Flexible API Design

Prefer `Joi` or migrating gradually? No problem.

You can still use `app.route(...)` with Joi-based validation while adopting Valibot via `app.base().valibot(...).route(...)`. This dual-mode support ensures **graceful evolution**, allowing traditional and modern routes to coexist without breaking changes.

---

## 📚 License

MIT

> This package is tested as part of the Kaapi monorepo. See the [main Kaapi README](../../README.md) for coverage details.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open a discussion or submit a pull request.
