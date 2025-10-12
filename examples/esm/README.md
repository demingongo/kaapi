# kaapi/examples/esm

Script lineup forged in the fires of ESM chaos and Windows path quirks.

- ⚡ **Fast builds** with `tsup`
- 🧠 **Type safety** with `tsc --noEmit`
- 🔁 **Hot reloads** via `tsx watch`
- 🧼 **Formatting** with `.env`-controlled Prettier
- 🔍 **Linting** with ESLint
- 🚀 **Clean prod start** with `node dist/index.js`
- 🧪 **Mocha tests** running through `ts-node/esm` with specifier resolution magic

## Scripts

### verify
- **Lint + Format**: Catch style and syntax issues first.
- **Type Check (`check`)**: Ensure TypeScript is happy.
- **Dependency Check (`check:deps`)**: Catch architectural violations early.
- **Type Coverage**: Confirm your types are thorough.
- **Tests + Coverage**: Validate behavior and runtime coverage.

This sequence flows from static analysis → architectural integrity → type safety → runtime validation. A full-body scan for your codebase.

---
