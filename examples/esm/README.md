# kaapi/examples/esm

Script lineup forged in the fires of ESM chaos and Windows path quirks.

## 🧰 Core Strengths of Your Script Suite

- ⚡ **Fast builds** with `tsup`  
  Efficient bundling with ESM output, ideal for modern Node and browser environments.

- 🧠 **Type safety** with `tsc --noEmit`  
  Ensures your TypeScript code is structurally sound without generating files.

- 🧭 **Architectural integrity** with `depcruise`  
  Detects circular dependencies and enforces clean module boundaries.

- 🧼 **Cross-platform cleanup** with `shx`  
  Removes build and coverage artifacts reliably on Windows, macOS, and Linux.

- 🧪 **Runtime coverage** with `c8`  
  Tracks which lines of code are actually executed during tests — no fluff.

- 🔁 **Hot-reloading dev server** with `tsx watch`  
  Instant feedback loop for development, with `.env` support baked in.

- 🎨 **Consistent formatting** with Prettier + `dotenvx`  
  Environment-specific formatting rules, great for multi-team or multi-project setups.

- 🔍 **Linting** with ESLint  
  Catches bugs, enforces style, and supports TypeScript and import rules.

- 🚀 **Production-ready start** with `node dist/index.js`  
  Clean separation between dev and runtime environments.

- 🧪 **Flexible testing** with Mocha and Kaukau  
  Supports both standard and custom test runners, giving you options.

- 📊 **Type coverage enforcement** with `type-coverage`  
  Keeps your types tight and transparent, with detailed output for gaps.

- ✅ **Comprehensive validation** with `verify`  
  Runs lint, format check, type check, dependency check, type coverage, tests, and runtime coverage — all in one go.

- 🤖 **CI-ready alias** with `ci`  
  Mirrors `verify`, making it easy to plug into GitHub Actions or other CI tools.

---

### verify

- **Lint + Format**: Catch style and syntax issues first.
- **Type Check (`check`)**: Ensure TypeScript is happy.
- **Dependency Check (`check:deps`)**: Catch architectural violations early.
- **Type Coverage**: Confirm your types are thorough.
- **Tests + Coverage**: Validate behavior and runtime coverage.

This sequence flows from static analysis → architectural integrity → type safety → runtime validation. A full-body scan for your codebase.

---
