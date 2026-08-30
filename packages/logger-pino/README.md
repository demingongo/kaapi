# @kaapi/logger-pino

A high-performance Pino logger adapter custom-built for the Kaapi framework.
This package extends the blazing-fast pino logger to seamlessly implement Kaapi's ILogger interface, instantly provisioning your application with unified logging capabilities including native silly and verbose levels.

## ✨ Features

- Extended Log Levels: Seamlessly adds silly (5) and verbose (15) methods alongside standard Pino levels.
- Full Pino Ecosystem Support: Retains raw access to Pino configurations, streams, ecosystem plugins, and transports.
- Strict Type Safety: Extensible TypeScript support allowing you to still supply your own additional runtime custom levels.

## 🚀 Getting Started

### Installation

```bash
npm install @kaapi/logger-pino pino @kaapi/logger
```

### Basic Setup

Pass the initialized logger directly into the Kaapi application constructor configuration:

```ts
import { Kaapi } from '@kaapi/kaapi';
import { createPinoLogger } from '@kaapi/logger-pino';

const app = new Kaapi({
    logger: createPinoLogger({}),
});

app.log.info('Using Pino to log');
app.log.silly('This is a highly detailed silly trace log!');
```

## Advanced Custom Levels

If you need to introduce extra custom levels beyond the built-in silly and verbose options, import the internalCustomLevels object. This ensures your custom settings merge seamlessly with Kaapi's defaults without overwriting them:

```ts
import { createPinoLogger, internalCustomLevels } from '@kaapi/logger-pino';

// Define your custom type constraints so TypeScript catches typo errors
type ExtendedLevels = 'notice' | 'alert';

const log = createPinoLogger<ExtendedLevels>({
    customLevels: {
        ...internalCustomLevels,
        notice: 35,
        alert: 55,
    },
});

log.info('Standard log message');
log.silly('Kaapi built-in level');
log.notice('Your new notice log level!');
log.alert('Your new alert log level!');
```
