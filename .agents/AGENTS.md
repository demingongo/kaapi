# Kaapi Monorepo — AI Agent Overview

Kaapi is a **TypeScript framework for building HTTP APIs on top of [Hapi.js](https://hapi.dev)** (v21). It adds opinionated layers: structured logging (Winston), a plugin/auth-design system, pub/sub messaging abstraction, and automatic OpenAPI + Postman doc generation.

This monorepo uses **pnpm workspaces**. Focus on `packages/` — `examples/` contains usage demos only.

---

## Package Registry

| Package                       | npm name                    | Version | Description                                                                           |
| ----------------------------- | --------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `packages/server`             | `@kaapi/server`             | 0.0.45  | Low-level Hapi.js wrapper with built-in `kaapi-auth` Bearer scheme                    |
| `packages/kaapi`              | `@kaapi/kaapi`              | 0.0.45  | **Main framework** — wraps server, adds logging, messaging, plugins, docs             |
| `packages/kafka-messaging`    | `@kaapi/kafka-messaging`    | 0.0.45  | KafkaJS-based `IMessaging` implementation                                             |
| `packages/oauth2-auth-design` | `@kaapi/oauth2-auth-design` | 0.0.45  | OAuth2/OIDC auth flows as Kaapi plugins (Auth Code, Client Credentials, Device, OIDC) |
| `packages/cli`                | `@kaapi/cli`                | 0.0.45  | Interactive `kaapi` CLI for scaffolding plugins, auth designs, etc.                   |
| `packages/validator-arktype`  | `@kaapi/validator-arktype`  | 0.0.45  | ArkType-based request validation plugin (ESM-only)                                    |
| `packages/validator-valibot`  | `@kaapi/validator-valibot`  | 0.0.45  | Valibot-based request validation plugin                                               |
| `packages/validator-zod`      | `@kaapi/validator-zod`      | 0.0.45  | Zod v4-based request validation plugin                                                |
| `packages/logger`             | `@kaapi/logger`             | 0.0.45  | Logger utilities for Kaapi                                                            |

---

## Dependency Graph

```
@kaapi/server           ← foundation, no internal deps
      ↑
@kaapi/kaapi            ← main framework (re-exports @kaapi/server + @hapi/hapi)
      ↑
      ├── @kaapi/kafka-messaging   (IMessaging backend)
      ├── @kaapi/validator-arktype (validation plugin)
      ├── @kaapi/validator-valibot (validation plugin)
      ├── @kaapi/validator-zod     (validation plugin)
      └── @kaapi/oauth2-auth-design
              ↑ also depends on
          @kaapi/cli               (for code generation)

@kaapi/logger           ← standalone logger utilities, no internal deps
```

All user-facing code imports from `@kaapi/kaapi`, which fully re-exports `@kaapi/server` and `@hapi/hapi`.

---

## Workspace Setup

- **Package manager**: pnpm (`pnpm-workspace.yaml` declares `packages/*` and `examples/*`)
- **TypeScript**: all packages; base config at `tsconfig.base.json`
    - `module: NodeNext`, `moduleResolution: NodeNext`, `strict: true`, `target: ES6`
- **Module format**: CommonJS by default (`NodeNext` = CJS when `package.json` has no `"type"`)
    - **Exception**: `@kaapi/validator-arktype` is **ESM-only** (built with `tsup`, requires consumers to use ESM)
- **Build**: `tsc` for most packages; `tsup` for `validator-arktype`; output always to `lib/`
- **Tests**: `kaukau` runner (Mocha-based), test files in `test/`
- **Linting**: ESLint with `eslint.config.mjs` per package

---

## Common Commands

```bash
# Install all dependencies
pnpm install

# Build a specific package
pnpm --filter @kaapi/kaapi build

# Run tests for a package
pnpm --filter @kaapi/kafka-messaging test

# Run the CLI
pnpm --filter @kaapi/cli kaapi generate
```

---

## Navigation Guide

| Topic                                                        | File                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Plugin system, coding conventions, cross-cutting patterns    | [conventions.md](./conventions.md)                                 |
| `KaapiServer`, `KaapiServerRoute`, auth scheme               | [packages/server.md](./packages/server.md)                         |
| `Kaapi` class, `ILogger`, `IMessaging`, auth designs, docs   | [packages/kaapi.md](./packages/kaapi.md)                           |
| Kafka messaging backend                                      | [packages/kafka-messaging.md](./packages/kafka-messaging.md)       |
| OAuth2/OIDC flows, flow builders, `@saurbit/oauth2` adapters | [packages/oauth2-auth-design.md](./packages/oauth2-auth-design.md) |
| `kaapi` CLI, `FileGenerator`, `kaapi.config.mjs`             | [packages/cli.md](./packages/cli.md)                               |
| Request validation (ArkType / Valibot / Zod)                 | [packages/validators.md](./packages/validators.md)                 |
| Logger utilities                                             | [packages/logger.md](./packages/logger.md)                         |

---

## Key Design Principles

1. **Hapi.js is the runtime** — all HTTP features (lifecycle, auth schemes, route options, plugins) are standard Hapi constructs. Kaapi wraps but does not hide them.
2. **Plugins are the extension mechanism** — anything that extends Kaapi implements `KaapiPlugin { integrate(t: KaapiTools) }` and is registered via `app.extend(plugin)`.
3. **Validators are route-level** — validation (ArkType/Valibot/Zod) runs in Hapi's `onPreHandler` lifecycle and is attached per-route via `plugins.kaapi.docs` and the schema property.
4. **Docs are auto-generated** — defining a route with schema automatically feeds `KaapiOpenAPI` and `KaapiPostman`; no separate doc configuration needed per route.
5. **Messaging is swappable** — the `IMessaging` interface decouples transport from the framework; swap Kafka for any other backend without changing application code.
