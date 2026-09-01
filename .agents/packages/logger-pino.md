# `@kaapi/logger-pino` — Package Reference

**npm**: `@kaapi/logger-pino` · **version**: 0.0.51  
**Source**: `packages/logger-pino/src/index.ts` (single file)  
**Build**: `tsc` → `lib/` · **Format**: CommonJS (`NodeNext`)  
**Dependencies**: `@kaapi/logger`, `pino`, `tslib`

---

## Purpose

A Pino-based implementation of `ILogger` (from `@kaapi/logger`). Adds two custom log levels beyond the standard Pino set:

- **`silly`** — alias for `trace` (level 10)
- **`verbose`** — sits between `debug` (20) and `info` (30) (level 25)

Use `createPinoLogger()` to create a logger that satisfies the `ILogger` interface and can be passed directly to `Kaapi` as the `logger` option.

---

## Quick Start

```ts
import { Kaapi } from '@kaapi/kaapi';
import { createPinoLogger } from '@kaapi/logger-pino';

const logger = createPinoLogger({ level: 'info' });

const app = new Kaapi({ logger });
await app.listen();
```

---

## API

### `createPinoLogger<CustomLevels>(options, stream?)`

Creates a Pino logger instance that implements `ILogger`.

```ts
import { createPinoLogger } from '@kaapi/logger-pino';
import pino from 'pino';

const logger = createPinoLogger(
    { level: 'debug', transport: { target: 'pino-pretty' } }
    // optional DestinationStream
);

logger.info('Server started');
logger.verbose('Detailed trace info'); // custom level
logger.silly('Very low-level noise'); // custom level
```

**Type signature:**

```ts
function createPinoLogger<CustomLevels extends string = never>(
    options: pino.LoggerOptions<CustomLevels | InternalCustomLevels, false>,
    stream?: pino.DestinationStream
): pino.Logger<CustomLevels | InternalCustomLevels, false> & ILogger;
```

The returned logger is both a full `pino.Logger` and an `ILogger`, so it can be used anywhere a Kaapi logger is expected.

---

### `internalCustomLevels`

The built-in custom level definitions, frozen:

```ts
export const internalCustomLevels = Object.freeze({
    silly: 10, // alias for trace
    verbose: 25, // between debug and info
});
```

### `formatPinoLogArgs(args)`

Internal utility that normalises multi-argument log calls (e.g. `logger.info('msg', obj, obj2)`) into the Pino format expected by its `logMethod` hook. Applied automatically by `createPinoLogger` — no need to call directly.

---

## Build & Test

```bash
pnpm --filter @kaapi/logger-pino build
pnpm --filter @kaapi/logger-pino test
```
