# `@kaapi/kafka-messaging` — Package Reference

**npm**: `@kaapi/kafka-messaging` · **version**: 0.0.42  
**Source**: `packages/kafka-messaging/src/index.ts` (single file)  
**Build**: `tsc` → `lib/` · **Format**: CommonJS (`NodeNext`)  
**Dependencies**: `@kaapi/kaapi`, `kafkajs`, `tslib`

---

## Purpose

Provides `KafkaMessaging`, a [KafkaJS](https://kafka.js.org)-based implementation of `IMessaging` from `@kaapi/kaapi`. Drop it into `KaapiAppOptions.messaging` to give your Kaapi app publish/subscribe capabilities backed by Apache Kafka.

---

## Quick Start

```ts
import { Kaapi } from '@kaapi/kaapi';
import { KafkaMessaging } from '@kaapi/kafka-messaging';

const messaging = new KafkaMessaging({
    clientId: 'my-service',
    brokers: ['localhost:9092'],
    name: 'my-service',
    address: 'my-service-instance-1',
    logger: myLogger, // optional; uses ILogger interface
});

const app = new Kaapi({ messaging });

// Publish
await app.emit('user.created', { id: '123', email: 'a@b.com' });

// Subscribe
await app.on('user.created', async (message, context) => {
    console.log(message.id, context.offset);
});
```

---

## `KafkaMessaging`

Implements `IMessaging`. Manages producers, consumers, and an optional admin client.

### Constructor

```ts
new KafkaMessaging(config: KafkaMessagingConfig)
```

`KafkaMessagingConfig` extends KafkaJS's `KafkaConfig` with:

| Field                    | Type             | Default | Description                                                          |
| ------------------------ | ---------------- | ------- | -------------------------------------------------------------------- |
| `brokers`                | `string[]`       | —       | **Required.** Kafka broker addresses                                 |
| `clientId`               | `string`         | —       | KafkaJS client ID                                                    |
| `logger`                 | `ILogger`        | —       | Optional Kaapi logger; Kafka log levels forwarded to it              |
| `address`                | `string`         | —       | Unique instance address (appears in `KafkaMessagingContext.address`) |
| `name`                   | `string`         | —       | Human-readable service name; used as consumer group ID prefix        |
| `producer`               | `ProducerConfig` | —       | Default producer configuration                                       |
| All `KafkaConfig` fields |                  |         | SSL, SASL, retry, connection timeout, etc.                           |

### Methods

#### `publish<T>(topic, message)`

Produces a message to the Kafka topic. The message is JSON-serialized and wrapped with metadata headers.

```ts
await messaging.publish('orders', { orderId: 'abc', total: 99.99 });
```

#### `subscribe<T>(topic, handler, conf?)`

Creates a consumer and starts consuming the topic. The handler is called for each message.

```ts
await messaging.subscribe<{ orderId: string }>(
    'orders',
    async (message, context) => {
        console.log(message.orderId, context.offset, context.timestamp);
    },
    {
        fromBeginning: false,
        groupId: 'my-custom-group', // optional
        groupIdPrefix: 'my-service', // optional; used in auto-generated group ID
        logOffsets: true, // logs partition offsets on subscribe
        onReady: (consumer) => console.log('Consumer ready'),
        onError: async (error, message, context) => {
            console.error('Message handling failed', error);
        },
    }
);
```

**Auto-generated group ID**: when `groupId` is not provided, defaults to `{name}.{topic}` (or `{groupIdPrefix}.{topic}` if `groupIdPrefix` is set, or `group.{topic}` as final fallback).

#### `shutdown()`

Disconnects all active consumers, producers, and admin clients. Call on process exit.

```ts
await messaging.shutdown();
```

#### `createAdmin(conf?)`

Creates and connects a KafkaJS `Admin` instance. Returns `Admin | undefined` on failure.

```ts
const admin = await messaging.createAdmin();
```

#### `createProducer(conf?)`

Creates and connects a KafkaJS `Producer` instance.

```ts
const producer = await messaging.createProducer({ allowAutoTopicCreation: false });
```

#### `createTopics(topics, conf?)`

Creates Kafka topics via admin. `topics` is an array of KafkaJS `ITopicConfig`.

```ts
await messaging.createTopics([{ topic: 'orders', numPartitions: 3, replicationFactor: 1 }]);
```

### Getters

| Getter            | Type                    | Description                            |
| ----------------- | ----------------------- | -------------------------------------- |
| `activeConsumers` | `ReadonlySet<Consumer>` | All currently active KafkaJS consumers |
| `activeProducers` | `ReadonlySet<Producer>` | All currently active KafkaJS producers |

---

## `KafkaMessagingContext`

Extends `IMessagingContext` with Kafka-specific metadata:

```ts
interface KafkaMessagingContext extends IMessagingContext {
    id?: string; // from IMessagingContext (message ID)
    name?: string; // from IMessagingContext (service name)
    timestamp?: string; // from IMessagingContext (ISO string)
    offset?: string; // Kafka message offset
    address?: string; // service address from KafkaMessagingConfig
}
```

---

## `KafkaMessagingSubscribeConfig`

Extends `Partial<ConsumerConfig>` with:

| Field                       | Type                                                 | Default            | Description                                                   |
| --------------------------- | ---------------------------------------------------- | ------------------ | ------------------------------------------------------------- |
| `fromBeginning`             | `boolean`                                            | `false`            | Start consuming from the beginning of the topic               |
| `groupId`                   | `string`                                             | auto-generated     | Explicit consumer group ID                                    |
| `groupIdPrefix`             | `string`                                             | `name` from config | Prefix for auto-generated group ID                            |
| `logOffsets`                | `boolean`                                            | `false`            | Log partition offsets on subscribe (creates admin connection) |
| `onReady`                   | `(consumer: Consumer) => void`                       | —                  | Called when consumer is ready and subscribed                  |
| `onError`                   | `(error, message, context) => void \| Promise<void>` | —                  | Called when handler throws                                    |
| All `ConsumerConfig` fields |                                                      |                    | `sessionTimeout`, `heartbeatInterval`, etc.                   |

---

## `KafkaMessagingBatchMessage<T>`

For batch publishing (when supported by KafkaJS producer):

```ts
interface KafkaMessagingBatchMessage<T = unknown> {
    value: T;
    key?: string | Buffer | null;
    partition?: number;
    headers?: IHeaders;
}
```

---

## Kafka Log Level Mapping

KafkaJS log levels are forwarded to the Kaapi `ILogger`:

| KafkaJS level       | ILogger method |
| ------------------- | -------------- |
| `NOTHING` / `ERROR` | `logger.error` |
| `WARN`              | `logger.warn`  |
| `INFO`              | `logger.info`  |
| `DEBUG`             | `logger.debug` |

---

## Message Context & Metadata

Messages published via `KafkaMessaging.publish()` include context headers:

- `id` — unique message identifier
- `name` — service name
- `timestamp` — ISO 8601 string at publish time

These are deserialized into `KafkaMessagingContext` on the consumer side.
