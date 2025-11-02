# @kaapi/validator-zod

Zod validator for kaapi.

It provides validation of `req.params`, `req.payload`, `req.query`, `req.headers`, `req.state` with a [Zod 4](https://www.npmjs.com/package/zod) schema and documentation generator helpers.

## Installation

```bash
npm install @kaapi/validator-zod
```

### Requirements

Zod 4

```bash
npm install zod@^4.0.0
```

## Usage

### Set validator

```ts
import { z } from 'zod/v4'
import Boom from '@hapi/boom'
import { Kaapi } from '@kaapi/kaapi'
import { validatorZod, zodDocsConfig } from '@kaapi/validator-zod'

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    docs: {
        // config to generate documentation based on zod schemas
        ...zodDocsConfig
    }
});

// register the plugin
await app.extend(validatorZod);
```

### Create schema

```ts
import { z } from 'zod/v4'
import { ValidatorZodSchema } from '@kaapi/validator-zod'

// ...

const routeSchema: ValidatorZodSchema = {
    payload: z.object({                
        name: z.string()
    })
}
```

### Create route

```ts
import { z } from 'zod/v4'
import { ValidatorZodSchema } from '@kaapi/validator-zod'

// ...

app.zod(routeSchema).route(
  {
    method: 'POST',
    path: '/items'
  },
  req => ({ id: Date.now(), name: req.payload.name })
)

// or
/*
app.zod(routeSchema).route(
  {
    method: 'POST',
    path: '/items',
    handler: req => ({ id: Date.now(), name: req.payload.name })
  }
)
*/
```

### Overrides

Override the parsing **`options`** and the **`failAction`**.


#### options

| **Property**  | **Type**                 | **Default** | **Description**                                                                                                                                  |
| ------------- | ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error`       | `errors.$ZodErrorMap<T>` | `undefined` | A custom error map function to override default Zod error messages. Useful for localization or custom formatting.                                |
| `reportInput` | `boolean`                | `false`     | When `true`, includes the original `input` value in each issue object within the error. Helpful for debugging.                                   |
| `jitless`     | `boolean`                | `false`     | When `true`, disables Zod’s eval-based fast path (JIT optimizations). Use in environments where `eval` is restricted (e.g., Cloudflare Workers). |


#### failAction

| failAction | Behavior                     | Safe?                    | Description                                   |
| ---------- | ---------------------------- | ------------------------ | --------------------------------------------- |
| `'error'`  | Reject with validation error | ✅                        | Default safe behavior                         |
| `'log'`    | Log + reject                 | ✅                        | For observability without accepting bad input |
| `function` | Custom handler               | ✅ (developer-controlled) | Must return or throw explicitly               |
| `'ignore'` | ❌ Not supported              | ❌                        | Unsafe, not implemented                       |


#### Example
```ts
import { z } from 'zod/v4'
import Boom from '@hapi/boom'
import { Kaapi } from '@kaapi/kaapi'
import { validatorZod } from '@kaapi/validator-zod'

const app = new Kaapi({
    // ...
    routes: {
        plugins: {
            // override for all routes
            zod: {
                options: {},
                failAction: 'log'
            }
        }
    }
})

await app.extend(validatorZod);

app.base().zod({
    query: z.object({
        name: z.string().optional()
    }),

    // override per route
    options: {
        reportInput: true // includes the input in the issue
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
    handler: ({ query: { name } }) => `Hello ${name || 'World'}!`
})
```
