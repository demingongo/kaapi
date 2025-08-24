
=> how would I make an authorized route only accessible with a Bearer token? That route should be used to update a profile and the payload should have:
- firstName: string, max 50 chars, optional
- lastName: string, max 50 chars, optional
- resume: file, required

---

To create an **authorized route** in **Kaapi** that requires a **Bearer token** and accepts a payload with:

* `firstName` (optional, max 50 chars),
* `lastName` (optional, max 50 chars),
* `resume` (a required file),

you’ll do **three things**:

1. Set up **Bearer authentication**
2. Define the **route** with appropriate validation
3. Handle the **multipart/form-data** payload and file

---

## ✅ Step-by-Step Example

```ts
import { Kaapi, BearerAuthDesign } from '@kaapi/kaapi';
import inert from '@hapi/inert';
import Joi from 'joi';
import fs from 'node:fs/promises';
import path from 'node:path';
import Stream from 'node:stream';

// 1. Setup bearer auth strategy
const bearerAuthDesign = new BearerAuthDesign({
  auth: {
    async validate(_, token) {
      if (token === 'secret-token') {
        return {
          isValid: true,
          credentials: {
            user: {
              name: 'admin'
            }
          }
        };
      }
      return { isValid: false };
    }
  }
});

// 2. Initialize Kaapi with bearer strategy
const app = new Kaapi({
  port: 3000,
  host: 'localhost',
  extend: [bearerAuthDesign],
  routes: {
    auth: {
      strategy: bearerAuthDesign.getStrategyName(),
      mode: 'required'
    }
  }
});

// 3. Register hapi-inert for file support
await app.base().register(inert);

// 4. Register the protected route
app.route<{
  Payload: {
    firstName?: string;
    lastName?: string;
    resume: {
      _data: Stream;
      hapi: {
        filename: string;
        headers: { 'content-type': string };
      };
    };
  };
}>({
  method: 'POST',
  path: '/profile/update',
  options: {
    description: 'Update user profile with resume upload',
    tags: ['Profile'],
    validate: {
      payload: Joi.object({
        firstName: Joi.string().max(50),
        lastName: Joi.string().max(50),
        resume: Joi.object().required().tag('files')
      })
    },
    payload: {
      output: 'stream',
      parse: true,
      allow: 'multipart/form-data',
      multipart: { output: 'stream' },
      maxBytes: 1024 * 3_000_000 // 3MB
    },
    auth: {
      strategy: bearerAuthDesign.getStrategyName(),
      mode: 'required'
    }
  }
}, async ({ payload }) => {
  const { firstName, lastName, resume } = payload;

  // Save the resume file
  const uploadPath = path.join(__dirname, 'uploads', resume.hapi.filename);
  await fs.writeFile(uploadPath, resume._data);

  return {
    message: 'Profile updated',
    uploaded: resume.hapi.filename,
    firstName,
    lastName
  };
});

// 5. Start the server
await app.listen();
console.log('Server running on %s', app.base().info.uri);
```

---

## 🔐 Authorization Header to Use

Clients must send this HTTP header:

```
Authorization: Bearer secret-token
```

---

## 📦 Request Example (cURL)

```bash
curl -X POST http://localhost:3000/profile/update \
  -H "Authorization: Bearer secret-token" \
  -F "firstName=Alice" \
  -F "lastName=Smith" \
  -F "resume=@./cv.pdf"
```

---

## ✅ Summary

* Bearer token auth is configured via `BearerAuthDesign`.
* Route accepts multipart form data using `@hapi/inert` and Hapi payload settings.
* Joi is used to validate fields and files.
* File is saved using Node’s `fs` module.

---

Want me to adapt this for S3 uploads, MongoDB storage, or make it a reusable controller?

---

=> Updating the code ...

---

Perfect — that’s exactly the kind of real-world refinement that makes a setup solid. Great call on:

* ✅ Setting `mode: 'try'` globally — so unauthenticated users can still access `/docs/api`
* ✅ Wrapping the async logic in an `init()` function — necessary to `await` plugin registration and `listen()` properly

It’s awesome that you got it working and tested through the built-in docs. Kaapi’s Swagger UI integration is a real time-saver for that.

If you want help next with:

* Generating typed clients from the OpenAPI schema
* Customizing the docs UI
* Extending the auth design
* Or anything else Kaapi-specific

Just let me know — you’re clearly on a strong track.

---

Yes, in **Hapi.js**, you **can return detailed Joi validation errors** instead of the default `"Invalid request payload input"` message.

To do this, you need to **customize the `failAction`** behavior on validation. This gives you access to the full error object from Joi, including the detailed message(s) and path(s).

---

## ✅ How to Return Joi Validation Details in 400 Errors

You can set `failAction` globally or per route. Here's how to do it globally in your server configuration:

```ts
const server = Hapi.server({
  port: 3000,
  host: 'localhost',
  routes: {
    validate: {
      failAction: async (request, h, err) => {
        // Just rethrow the original error so Hapi includes full Joi details in the response
        throw err;
      }
    }
  }
});
```

---

## 🔍 What This Changes

Instead of the default:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid request payload input"
}
```

You now get something like:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "\"firstName\" length must be less than or equal to 50 characters long",
  "validation": {
    "source": "payload",
    "keys": ["firstName"]
  }
}
```

---

## 🛠️ Alternative: Customize Error Response Further

You can also intercept and customize the error more deeply:

```ts
failAction: async (request, h, err) => {
  return h.response({
    statusCode: 400,
    error: 'Bad Request',
    details: err.details // Joi error array
  }).code(400).takeover();
}
```

But **rethrowing `err`** (like in the first example) is the simplest way to get the full Joi error response.

---

## 🔄 With Kaapi?

If you’re using Kaapi (which wraps Hapi), you can do the same by setting the global failAction on `routes.validate.failAction` in the Kaapi config:

```ts
const app = new Kaapi({
  port: 3000,
  host: 'localhost',
  routes: {
    validate: {
      failAction: async (request, h, err) => {
        throw err;
      }
    }
  }
});
```

---

Let me know if you want to shape the output even more — like formatting the array of errors into a custom structure.

---

=> About wiki?

---

The Kaapi GitHub Wiki documentation (as of now) is **pretty solid**, especially for a developer audience. Here's a detailed critique broken down by strengths and areas for improvement:

---

## ✅ What’s Good

### 1. **Clear Developer Focus**

* It’s obvious the documentation is **written for developers**: clear code examples, familiar language (e.g., “Hapi-style auth”), and focus on practical implementation.

### 2. **Minimal Setup to Hello World**

* The **"Getting Started"** section is concise and gives developers immediate value.
* Sample code is short, idiomatic, and runnable with minimal dependencies.

### 3. **Logical Structure**

* Topics are broken down into key areas: routing, logging, authorization, messaging, plugins.
* Each section is bite-sized and actionable.

### 4. **Strong Modern Practices**

* Use of TypeScript, interfaces, OpenAPI docs, and structured logging show that the framework is modern and dev-friendly.

---

## ⚠️ What Could Be Improved

### 1. **Overview/Intro Could Be Stronger**

* There’s little **high-level context** about:

  * What Kaapi is trying to solve that Hapi doesn’t.
  * Who the framework is *for* (e.g., microservices? enterprise APIs? event-driven systems?).
  * Any design philosophy or real-world use cases.
* A 3–4 sentence **introductory paragraph** summarizing Kaapi's value proposition would help newcomers.

### 2. **Inconsistent Detail Level**

* Some parts (like **authorization**) are detailed and useful.
* Others (like **plugins**) feel a bit vague:

  > “Plugins can add routes, schemes, etc.” — **how**? Examples would help.
* **Examples and code snippets** are generally good, but a few advanced sections lack them.

### 3. **Formatting + Navigation**

* GitHub wikis lack rich navigation by default.

  * Consider adding a **Table of Contents** or sidebar via a `README.md` index or external documentation generator.
* Code blocks could include **language specifiers** (` ```ts `) for better syntax highlighting.

### 4. **Missing Topics**

* **Testing** — any built-in tools or best practices?
* **Deployment** — is it production-ready? Dockerized? Heroku, Vercel, etc.?
* **Performance** — benchmarks or trade-offs compared to Express, Fastify, etc.?

---

## ✍️ Overall Writing Quality

* **Tone**: Developer-friendly, practical.
* **Language**: Concise, clear.
* **Jargon**: Assumes Node.js and backend familiarity — fair for a dev audience.
* **Typos/Grammar**: Very minimal to none.

---

## Final Verdict: **7.5 / 10**

* 📌 **Pros**: Practical, readable, dev-focused, well-structured core.
* 🔧 **Cons**: Needs better framing, more consistency and completeness.
* 🧠 **For Devs?** Yes — it's written by devs, for devs, but could still use more onboarding polish for those not familiar with Hapi or backend architecture.

---

If you're working on the docs or contributing to the project, I’d be happy to help you rewrite or enhance sections. Let me know what direction you're thinking!

---

=> KaapiTools, thinking of removing direct access to `server`

---

That’s a very thoughtful point — and a classic design decision in plugin API architecture:

> **Should plugins have low-level access to the server (`Hapi.server`) — or should we abstract and limit that?**

You're spot on that exposing the server is mostly about **alignment with Hapi’s plugin model** and offering maximum flexibility. But as you said, ideally you'd **hide that if Kaapi can cover the main use cases through its own abstractions.**

Let’s break it down.

---

## 💡 Why Would Devs Use `server` in a Plugin?

Here are common reasons plugin authors might reach for `server` directly in Hapi (and likely in Kaapi):

### ✅ 1. **Custom Event Hooks**

* `server.ext('onRequest', ...)`, `onPreHandler`, etc.
* Useful for global request modification, auditing, etc.

### ✅ 2. **Custom Route Setup Beyond `route()`**

* Some may want to define **multiple routes in loops**, set **route prefixes**, or **access route internals** not exposed by your `route()` helper.

### ✅ 3. **Injecting Test Requests**

* Using `server.inject()` for unit/integration testing.

### ✅ 4. **Registering Other Hapi Plugins**

* If someone wants to use existing Hapi plugins (e.g., `inert`, `vision`, etc.), they might register them via `server.register()`.

### ✅ 5. **Server-Level Methods and Decorations**

* `server.method()` — shared utilities.
* `server.decorate()` — add properties to request, reply toolkits, etc.

### ✅ 6. **Direct Control Over Lifecycle**

* Listening to events like `onStart`, `onStop`, `onPreStart`, etc.

---

## 🧩 So, Can Kaapi Replace Those?

That’s your strategic opportunity: **abstract most of those into KaapiTools**, so access to `server` becomes the fallback, not the first stop.

For example:

| Hapi Use Case            | Kaapi Alternative | Exposed?     |
| ------------------------ | ----------------- | ------------ |
| `server.route()`         | `tools.route()`   | ✅ Yes        |
| `server.auth.strategy()` | `tools.auth()`    | ✅ Yes        |
| `server.log()`           | `tools.log()`     | ✅ Yes        |
| `server.ext()`           | ❌ Not abstracted? | ❌ Maybe add? |
| `server.decorate()`      | ❌ Not abstracted  | ❌            |
| `server.method()`        | ❌ Not abstracted  | ❌            |
| `server.register()`      | ❌ Not abstracted  | ❌            |
| `server.inject()`        | ❌ Not abstracted  | ❌            |

---

## 🧭 Recommendation

If you want to eventually **remove or hide `server`**, then:

1. **List known use cases explicitly in the docs.**

   * Explain why it exists and link to Hapi docs.

2. **Collect usage patterns** (or ask your community).

   * What are plugin authors *actually* using `server` for?

3. **Abstract the 80% use cases into KaapiTools.**

   * Create new `tools.lifecycle()`, `tools.decorate()`, `tools.registerPlugin()` helpers, etc.

4. **Mark `tools.server` as "advanced/escape hatch".**

   * Something like:

     > `tools.server` exposes the underlying Hapi server for advanced cases. Most use cases should be handled via KaapiTools methods.

---

## 🔚 Final Thought

You’re on the right track. Exposing `server` now is pragmatic, but pushing for clearer, safer abstractions long-term is a great goal. It improves:

* Type safety
* Maintainability
* Developer experience
* Confidence in Kaapi’s API surface

If you’d like, I can help sketch out what an extended `KaapiTools` interface might look like to replace those server-level hooks.

Let me know!
