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
