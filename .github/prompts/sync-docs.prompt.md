---
description: 'Sync .agents/ docs and copilot-instructions.md with the current state of packages/'
agent: 'agent'
---

Audit and update the AI documentation for the Kaapi monorepo. Follow these steps in order:

## 1. Collect current state from source

Read the following files in parallel:

- `packages/server/package.json`
- `packages/kaapi/package.json`
- `packages/kafka-messaging/package.json`
- `packages/oauth2-auth-design/package.json`
- `packages/cli/package.json`
- `packages/validator-arktype/package.json`
- `packages/validator-valibot/package.json`
- `packages/validator-zod/package.json`

Also check `packages/` for any directories not in the list above (new packages).

## 2. Detect what changed

For each package, note:

- Version number (compare against what's in `.agents/AGENTS.md`)
- New or removed dependencies
- New or removed entry points (`exports` field in `package.json`)
- Module format changes (`"type": "module"` added/removed)

Also check each package's `src/` for new exported files or renamed exports.

## 3. Update `.agents/` files

Only edit sections that are actually out of date. Do **not** rewrite files wholesale.

| Changed item                                             | File to update                                            |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Version numbers                                          | `.agents/AGENTS.md` (Package Registry table)              |
| New package                                              | `.agents/AGENTS.md` + create `.agents/packages/<name>.md` |
| Removed package                                          | `.agents/AGENTS.md` + delete `.agents/packages/<name>.md` |
| Dependency/export changes in `@kaapi/server`             | `.agents/packages/server.md`                              |
| Dependency/export changes in `@kaapi/kaapi`              | `.agents/packages/kaapi.md`                               |
| Dependency/export changes in `@kaapi/kafka-messaging`    | `.agents/packages/kafka-messaging.md`                     |
| Dependency/export changes in `@kaapi/oauth2-auth-design` | `.agents/packages/oauth2-auth-design.md`                  |
| Dependency/export changes in `@kaapi/cli`                | `.agents/packages/cli.md`                                 |
| Dependency/export changes in any validator               | `.agents/packages/validators.md`                          |
| New cross-cutting pattern or convention change           | `.agents/conventions.md`                                  |

## 4. Update `.github/copilot-instructions.md`

If the version number changed, update the "Key Facts" section line that reads:

> All packages are under `@kaapi/` npm scope, currently at version `x.x.x`

If a package was added or removed, update the bullet list under "Documentation".

## 5. Report

After all edits, output a brief summary:

- Which files were changed and why
- Which files were checked but needed no changes
- Any new packages or removed packages found
