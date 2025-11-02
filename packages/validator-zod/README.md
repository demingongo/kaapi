# 🧪 @kaapi/validator-zod

![npm](https://img.shields.io/npm/v/@kaapi/validator-zod)
![license](https://img.shields.io/npm/l/@kaapi/validator-zod)
![bundle size](https://img.shields.io/bundlephobia/min/@kaapi/validator-zod)

**Zod-powered validation plugin for [Kaapi](https://www.npmjs.com/package/@kaapi/kaapi)**. Validate request `params`, `payload`, `query`, `headers`, and `state` using [Zod 4](https://www.npmjs.com/package/zod) schemas. Includes built-in documentation helpers for seamless API docs generation.

---

## 🚀 Installation

```bash
npm install @kaapi/validator-zod
```

### 📦 Peer Dependency

Requires Zod v4:

```bash
npm install zod@^4.0.0
```

---

## 🛠️ Usage

### 🔌 Register the Plugin

```ts
import { z } from 'zod/v4'
import { Kaapi } from '@kaapi/kaapi'
import { validatorZod, zodDocsConfig } from '@kaapi/validator-zod'

const app = new Kaapi({
  port: 3000,
  host: 'localhost',
  docs: {
    ...zodDocsConfig // enables documentation generation
  }
});

await app.extend(validatorZod); // register the plugin
```

---

### 📐 Define a Schema

```ts
import { z } from 'zod/v4'
import { ValidatorZodSchema } from '@kaapi/validator-zod'

const routeSchema: ValidatorZodSchema = {
  payload: z.object({
    name: z.string()
  })
}
```

---

### 🧭 Create a Route

```ts
app.zod(routeSchema).route(
  {
    method: 'POST',
    path: '/items'
  },
  req => ({ id: Date.now(), name: req.payload.name })
)

// or using inline handler
/*
app.zod(routeSchema).route({
  method: 'POST',
  path: '/items',
  handler: req => ({ id: Date.now(), name: req.payload.name })
})
*/
```

---

## ⚙️ Advanced Configuration

### 🔧 `options`

Customize Zod parsing behavior:

| Property      | Type                      | Default     | Description                                                                 |
|---------------|---------------------------|-------------|-----------------------------------------------------------------------------|
| `error`       | `errors.$ZodErrorMap<T>` | `undefined` | Custom error map for localization or formatting                            |
| `reportInput` | `boolean`                | `false`     | When `true`, includes original input in error issues (useful for debugging)             |
| `jitless`     | `boolean`                | `false`     | When `true`, disables JIT optimizations for environments where `eval` is restricted (e.g., Cloudflare Workers). |

---

### 🚨 `failAction`

Control how validation failures are handled:

| Value         | Behavior                     | Safe? | Description                                      |
|---------------|------------------------------|-------|--------------------------------------------------|
| `'error'`     | Reject with validation error | ✅     | Default safe behavior                                 |
| `'log'`       | Log and reject               | ✅     | Useful for observability                         |
| `function`    | Custom handler               | ✅ (developer-controlled)    | Must return or throw explicitly                  |
| `'ignore'`    | ❌ Not supported              | ❌     | Unsafe and not implemented                       |

---

### 🧪 Example with Overrides

You can override Zod validation behavior **globally** for all routes, or **per route** as needed.

#### 🔁 Global Override (All Routes)

```ts
const app = new Kaapi({
  // ...
  routes: {
    plugins: {
      zod: {
        options: {
          reportInput: true
        },
        failAction: 'log'
      }
    }
  }
});

await app.extend(validatorZod);
```

This sets `reportInput` to `true` for all Zod-validated routes, and logs validation errors before throwing them.

#### 🔂 Per-Route Override

```ts
app.base().zod({
  query: z.object({
    name: z.string().trim().nonempty().max(10).meta({
      description: 'Optional name to personalize the greeting response'
    }).optional().default('World')
  }),
  options: {
    reportInput: false
  },
  failAction: async (request, h, err) => {
    if (Boom.isBoom(err)) {
      return h.response({
        ...err.output.payload,
        details: err.data.validationError.issues
      }).code(err.output.statusCode).takeover()
    }
    return err
  }
}).route({
  path: '/greetings',
  method: 'GET',
  handler: ({ query: { name } }) => `Hello ${name}!`
});
```

---

## 🔄 Flexible API Design

Prefer `Joi` or migrating gradually? No problem.

You can still use `app.route(...)` with Joi-based validation while adopting Zod via `app.base().zod(...).route(...)`. This dual-mode support ensures **graceful evolution**, allowing legacy and modern routes to coexist without breaking changes.

---

## 📚 License

MIT

> This package is tested as part of the Kaapi monorepo. See the [main Kaapi README](../../README.md) for coverage details.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open a discussion or submit a pull request.

