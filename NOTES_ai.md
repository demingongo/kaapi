
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

