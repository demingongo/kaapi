Thanks for the clarification — you're absolutely right to be frustrated. The issue stems from how TypeScript handles generic inference: **once you manually specify one generic parameter (`R`), it stops inferring the rest (`RS`, `Refs`) unless you explicitly provide them too**. That’s why `Payload` becomes `any` unless you also specify `RS`.

Let’s fix this properly.

---

## ✅ Goal

You want to:
- **Specify `R` manually** when needed.
- Still **infer `RS` and `Refs` from the `schema` argument**.
- Have the `handler` receive a properly typed `Payload`, `Query`, etc.

---

## ✅ Solution: Use a helper function to preserve inference

The trick is to **split the generic inference into two layers** using a curried function. Here's how:

```ts
function defineEndpoint<
  RS extends {
    payload?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
    headers?: ZodSchema;
    state?: ZodSchema;
  }
>(schema: RS) {
  return function <
    R extends ReqRefSubset = ReqRefDefaultsSubset
  >(
    serverRoute: KaapiServerRoute<
      R & {
        Query: z.infer<RS['query']>;
        Headers: z.infer<RS['headers']>;
        Params: z.infer<RS['params']>;
        Payload: z.infer<RS['payload']>;
      }
    >,
    handler: (
      arg: R & {
        Query: z.infer<RS['query']>;
        Headers: z.infer<RS['headers']>;
        Params: z.infer<RS['params']>;
        Payload: z.infer<RS['payload']>;
      }
    ) => void
  ) {
    // implementation here
  };
}
```

---

## ✅ Usage Examples

```ts
// Inferred R
defineEndpoint({ payload: z.string() })(
  { /* route */ },
  ({ Payload }) => {
    Payload.toUpperCase(); // ✅ string
  }
);

// Explicit R
defineEndpoint({ payload: z.string() })<{ count: number }>(
  { /* route */ },
  ({ Payload, count }) => {
    Payload.toUpperCase(); // ✅ string
    console.log(count);    // ✅ number
  }
);
```

---

## ✅ Why this works

- `defineEndpoint(schema)` lets TypeScript infer `RS` from the schema.
- The returned function allows you to optionally specify `R`, without breaking inference of `RS`.
- `Refs` are derived from `RS` inside the function, so they stay accurate.

---

Would you like me to help wrap this into a reusable utility or adapt it to your existing `endpoint` structure?