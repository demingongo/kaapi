# kaapi/examples/esm

![Lint](https://img.shields.io/badge/lint-eslint-blue)
![Format](https://img.shields.io/badge/format-prettier-blue)
![Type Check](https://img.shields.io/badge/typescript-checked-blue)
![Dependency Check](https://img.shields.io/badge/dependencies-validated-blue)
![Type Coverage](https://img.shields.io/badge/type--coverage-90%25%2B-brightgreen)
![Tests](https://img.shields.io/badge/tests-kaukau%20%26%20mocha-blue)
![Coverage](https://img.shields.io/badge/coverage-c8-yellowgreen)
![CI](https://img.shields.io/badge/CI-pipeline-green)

Script lineup forged in the fires of ESM chaos and Windows path quirks.

## 🛠 Development Scripts

This project includes a robust and modular set of npm scripts designed to streamline development, enforce code quality, and support cross-platform workflows.

### 🔧 Core Scripts

| Script  | Description                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------- |
| `build` | Bundles the source code using `tsup` with ESM output, cleans previous builds, and generates a metafile. |
| `start` | Runs the compiled output from the `dist` directory.                                                     |
| `dev`   | Starts a hot-reloading development server using `tsx`, with `.env` support.                             |
| `clean` | Removes build and coverage artifacts using `shx` for cross-platform compatibility.                      |

---

### ✅ Code Quality & Validation

| Script          | Description                                                                               |
| --------------- | ----------------------------------------------------------------------------------------- |
| `lint`          | Runs ESLint across the codebase to catch syntax and style issues.                         |
| `format`        | Formats code using Prettier, with environment-specific config via `dotenvx`.              |
| `format:check`  | Verifies formatting without making changes — useful for CI.                               |
| `check`         | Runs TypeScript type checking without emitting files.                                     |
| `check:deps`    | Uses Dependency Cruiser to validate architectural rules and detect circular dependencies. |
| `type-coverage` | Reports TypeScript coverage and enforces a minimum threshold (90%).                       |

---

### 🧪 Testing & Coverage

| Script        | Description                                                           |
| ------------- | --------------------------------------------------------------------- |
| `test`        | Runs Mocha tests with TypeScript support and clean module resolution. |
| `test:kaukau` | Runs tests using the custom `kaukau` runner for advanced scenarios.   |
| `coverage`    | Measures runtime test coverage using `c8`.                            |

---

### 🚦 CI & Verification

| Script   | Description                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify` | Runs a full validation pipeline: linting, formatting check, type checking, dependency analysis, type coverage, tests, and runtime coverage. |
| `ci`     | Alias for `verify`, intended for use in continuous integration environments.                                                                |

---

This setup is designed to be lean, fast, and scalable — ideal for solo development or preparing for team collaboration. Each script is modular and can be run independently or as part of a larger workflow.

---

## 🧰 Core Strengths of this Script Suite

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
