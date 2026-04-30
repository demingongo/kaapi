# Kaapi Monorepo — Copilot Instructions

This is the **Kaapi** monorepo: a TypeScript framework for building HTTP APIs on top of **Hapi.js v21**. It adds structured logging (Winston), a plugin/auth-design system, pub/sub messaging abstraction, and automatic OpenAPI + Postman doc generation.

**Package manager**: pnpm workspaces. **All packages** live in `packages/`. The `examples/` folder contains usage demos — do not modify it unless asked.

---

## Documentation

Full architecture and API references are in `.agents/`:

- `.agents/AGENTS.md` — monorepo overview, package registry, dependency graph, workspace setup
- `.agents/conventions.md` — plugin system, `withSchema()`, `IMessaging`, auth patterns, module formats, error handling
- `.agents/packages/server.md` — `@kaapi/server`: `KaapiServer`, `KaapiServerRoute`, built-in auth scheme
- `.agents/packages/kaapi.md` — `@kaapi/kaapi`: `Kaapi` class, `ILogger`, `IMessaging`, auth designs, doc generation
- `.agents/packages/kafka-messaging.md` — `@kaapi/kafka-messaging`: `KafkaMessaging`, publish/subscribe, consumer groups
- `.agents/packages/oauth2-auth-design.md` — `@kaapi/oauth2-auth-design`: OAuth2/OIDC flows, JWT authority, token types
- `.agents/packages/cli.md` — `@kaapi/cli`: `FileGenerator`, `kaapi.config.mjs`, CLI scaffolding
- `.agents/packages/validators.md` — `@kaapi/validator-{arktype,valibot,zod}`: request validation plugins

Read the relevant file before making changes to any package.

---

## Key Facts

- All packages are under `@kaapi/` npm scope, currently at version `0.0.42`
- **Import from `@kaapi/kaapi`** — it re-exports everything from `@kaapi/server` and `@hapi/hapi`
- **All packages are CommonJS** (`NodeNext`) except `@kaapi/validator-arktype` which is **ESM-only** (built with `tsup`)
- Extensions implement `KaapiPlugin { integrate(t: KaapiTools) }` and register via `app.extend(plugin)`
- HTTP errors use `@hapi/boom` (`Boom.badRequest()`, `Boom.unauthorized()`, etc.)
- Validation runs in Hapi's `onPreHandler` lifecycle; use `withSchema(schema).route(...)` to define typed routes
- Build output always goes to `lib/`; source is in `src/`
