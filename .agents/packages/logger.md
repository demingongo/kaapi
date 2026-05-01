# `@kaapi/logger` — Logger Utilities

Standalone logger utilities package for Kaapi. No dependency on `@kaapi/kaapi` or `@kaapi/server`.

---

## Package Info

| Field       | Value                 |
| ----------- | --------------------- |
| npm name    | `@kaapi/logger`       |
| Version     | 0.0.42                |
| Format      | CommonJS (`NodeNext`) |
| Entry point | `lib/index.js`        |
| Source      | `src/index.ts`        |

**Dependencies:** `tslib` only — no internal workspace dependencies.

---

## Purpose

Provides logger utilities (streams, transports, helpers) that can be used independently of the main Kaapi framework. Intended to be consumed directly or by other `@kaapi/*` packages.

---

## Build & Test

```bash
# Build
pnpm --filter @kaapi/logger build

# Test
pnpm --filter @kaapi/logger test
```

Tests use the `kaukau` runner (Mocha-based). Test files go in `test/` with `*.spec.ts` naming.

---

## Exports

| Export | Description                                    |
| ------ | ---------------------------------------------- |
| `.`    | Main entry — `lib/index.js` / `lib/index.d.ts` |
