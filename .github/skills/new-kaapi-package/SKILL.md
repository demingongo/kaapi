---
name: new-kaapi-package
description: 'Scaffold a new @kaapi/* package in the monorepo. Use when adding a new package to packages/. Creates package.json, tsconfig.json, eslint.config.mjs, src/index.ts, and optionally tests and a buildDT script. Triggers on: new package, scaffold package, create package, add package.'
argument-hint: 'Package short name (e.g. "my-plugin", without @kaapi/ prefix)'
---

# New Kaapi Package Scaffold

Scaffold a new package in `packages/` following the established monorepo conventions. All files must match the patterns used by existing packages.

## Questions to ask first

Before creating any files, ask the user (or infer from the argument hint):

1. **Package short name** — the part after `@kaapi/` (e.g. `my-plugin`). Must be lowercase kebab-case. The npm name will be `@kaapi/<name>` and the folder will be `packages/<name>/`.
2. **Description** — one-line description for `package.json`.
3. **Keywords** — comma-separated keywords for `package.json` (always include `"kaapi"` and `"typescript"`).
4. **Depends on `@kaapi/kaapi`?** — yes/no. If yes, adds `"@kaapi/kaapi": "workspace:^"` to dependencies.
5. **Has declarations.d.ts (Hapi module augmentation)?** — yes/no. If yes, the build script must include `&& node ./scripts/buildDT.mjs` and the `scripts/` folder must be created with a `buildDT.mjs`.
6. **Include test setup?** — yes/no. If yes, creates `kaukau.config.mjs` and a `test/` folder stub.

## Files to create

Use the templates in `./assets/`. Replace all `{{PLACEHOLDER}}` values before writing.

### Always create

| File                                  | Template                                                          | Notes                                                        |
| ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/{{NAME}}/package.json`      | [package.json.template](./assets/package.json.template)           | Set name, version, description, keywords, build script, deps |
| `packages/{{NAME}}/tsconfig.json`     | [tsconfig.json.template](./assets/tsconfig.json.template)         | No changes needed                                            |
| `packages/{{NAME}}/eslint.config.mjs` | [eslint.config.mjs.template](./assets/eslint.config.mjs.template) | No changes needed                                            |
| `packages/{{NAME}}/src/index.ts`      | [src-index.ts.template](./assets/src-index.ts.template)           | Add a comment with the package purpose                       |

### If "Has declarations.d.ts" → yes

| File                                    | Template                                              | Notes                            |
| --------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| `packages/{{NAME}}/scripts/buildDT.mjs` | [buildDT.mjs.template](./assets/buildDT.mjs.template) | No changes needed — it's generic |

Also set the build script in `package.json` to:

```
"build": "tsc && node ./scripts/buildDT.mjs"
```

### If "Include test setup" → yes

| File                                  | Template                                                          | Notes             |
| ------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| `packages/{{NAME}}/kaukau.config.mjs` | [kaukau.config.mjs.template](./assets/kaukau.config.mjs.template) | No changes needed |
| `packages/{{NAME}}/test/.gitkeep`     | (empty file)                                                      |                   |

Also add to `package.json` scripts:

```json
"test": "kaukau --require ts-node/register --config kaukau.config.mjs"
```

And add to `devDependencies`:

```json
"@types/mocha": "^10.0.10"
```

## Version number

Read the current version from any existing package — e.g. `packages/kaapi/package.json` → `version` field. Use that exact version for the new package.

## After creating files

1. Remind the user to run `pnpm install` to link the new workspace package.
2. If the package depends on `@kaapi/kaapi`, remind them to add its `KaapiPlugin` export in `src/index.ts`.
3. Suggest running `/sync-docs` to add the new package to `.agents/AGENTS.md` and create `.agents/packages/<name>.md`.
