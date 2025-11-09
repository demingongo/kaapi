# 🧪 @kaapi/validator-arktype

![ESM Only](https://img.shields.io/badge/ESM-only-blue?style=flat-square)
![npm](https://img.shields.io/npm/v/@kaapi/validator-arktype?style=flat-square)
![license](https://img.shields.io/npm/l/@kaapi/validator-arktype?style=flat-square)

**ArkType-powered validation plugin for [Kaapi](https://www.npmjs.com/package/@kaapi/kaapi)**. Validate request `params`, `payload`, `query`, `headers`, and `state` using [ArkType](https://www.npmjs.com/package/arktype) schemas. Includes built-in documentation helpers for seamless API docs generation.

> ⚠️ This library is ESM‑only. It requires an environment that supports ESM imports.

---

## 🚀 Installation

```bash
npm install @kaapi/validator-arktype
```

### 📦 Peer Dependency

Requires ArkType:

```bash
npm install arktype@^2.1.25
```

---

## 🛠️ Usage

### 🔌 Register the Plugin

```ts
import { Kaapi } from '@kaapi/kaapi';
import { validatorArk } from '@kaapi/validator-arktype';
import { type } from 'arktype';

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    docs: {
        disabled: false, // explicitly enables documentation generation
    },
});

await app.extend(validatorArk); // register the plugin
```

---

### 📐 Define a Schema

```ts
import { ValidatorArkSchema } from '@kaapi/validator-arktype';
import { type } from 'arktype';

const routeSchema: ValidatorArkSchema = {
    payload: type({
        name: 'string',
    }),
};
```

---

### 🧭 Create a Route

```ts
app.base()
    .ark(routeSchema)
    .route(
        {
            method: 'POST',
            path: '/items',
        },
        (req) => ({ id: Date.now(), name: req.payload.name })
    );

// or using inline handler
/*
app.base().ark(routeSchema).route({
  method: 'POST',
  path: '/items',
  handler: req => ({ id: Date.now(), name: req.payload.name })
})
*/
```

---

## ⚙️ Advanced Configuration

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

You can override ArkType validation behavior **globally** for all routes, or **per route** as needed.

#### 🔁 Global Override (All Routes)

```ts
const app = new Kaapi({
    // ...
    routes: {
        plugins: {
            ark: {
                failAction: 'log',
            },
        },
    },
});

await app.extend(validatorArk);
```

This logs validation errors before throwing them for all ArkType-validated routes.

#### 🔂 Per-Route Override

```ts
app.base()
    .ark({
        query: z.object({
            name: z
                .string()
                .trim()
                .nonempty()
                .max(10)
                .meta({
                    description: 'Optional name to personalize the greeting response',
                })
                .optional()
                .default('World'),
        }),
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

Multipart file uploads with ArkType validation is supported. Here's how to validate an uploaded image file and stream it back in the response:

```ts
app.base()
    .ark({
        payload: type({
            file: type({
                _data: type.instanceOf(Buffer),
                hapi: type({
                    filename: 'string',
                    headers: {
                        'content-type': "'image/jpeg' | 'image/jpg' | 'image/png'",
                    },
                }),
            }),
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

- `type({ ... })` is used to accommodate the structure of multipart file metadata.
- The `_data: type.instanceOf(Buffer)` field is automatically interpreted as a binary field by the documentation generator.
- This ensures correct OpenAPI and Postman documentation is generated, with the file field shown as a binary upload.
- The route streams the uploaded image back with its original content type.

---

## 🔄 Flexible API Design

Prefer `Joi` or migrating gradually? No problem.

You can still use `app.route(...)` with Joi-based validation while adopting ArkType via `app.base().ark(...).route(...)`. This dual-mode support ensures **graceful evolution**, allowing traditional and modern routes to coexist without breaking changes.

---

## 📚 License

MIT

> This package is tested as part of the Kaapi monorepo. See the [main Kaapi README](../../README.md) for coverage details.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open a discussion or submit a pull request.
