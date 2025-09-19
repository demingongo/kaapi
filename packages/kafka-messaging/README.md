# 📦 @kaapi/kafka-messaging

`@kaapi/kafka-messaging` is a lightweight wrapper around [`kafkajs`](https://github.com/tulios/kafkajs) that integrates with the [`Kaapi`](https://github.com/demingongo/kaapi) framework to provide a clean and consistent **message publishing and consuming interface**.

It abstracts Kafka’s producer/consumer logic and provides a simple interface to:

* ✅ Publish messages
* ✅ Subscribe to topics
* ✅ Support structured logging via Kaapi's logger
* ✅ Handle offsets and message metadata
* ✅ Reuse Kafka producers/consumers

---

## ✨ Features

* Simple `publish(topic, message)` API
* Flexible `subscribe(topic, handler, config)` with offset tracking
* KafkaJS-compatible configuration
* Structured logging via Kaapi’s `ILogger`
* Typed message handling with TypeScript

---

## 🚀 Getting Started with KafkaMessaging

This guide walks you through setting up and using the `KafkaMessaging` class to publish and consume messages with Apache Kafka.

### Installation

```bash
npm install @kaapi/kafka-messaging kafkajs
```

---

### Basic Setup

```ts
import { KafkaMessaging } from '@kaapi/kafka-messaging';

const messaging = new KafkaMessaging({
    clientId: 'my-app',
    brokers: ['localhost:9092'],
    name: 'my-service',
    address: 'service-1',
    logger: createLogger() // optional, use Kaapi ILogger
});
```

The constructor accepts a `KafkaMessagingConfig` object, which extends `KafkaConfig` from [kafkajs](https://kafka.js.org/):

| Option     | Type             | Description                                                               |
| ---------- | ---------------- | ------------------------------------------------------------------------- |
| `brokers`  | `string[]`       | List of Kafka broker addresses (e.g. `['localhost:9092']`). **Required.** |
| `clientId` | `string`         | Unique client identifier for Kafka.                                       |
| `logger`   | `ILogger`        | Optional logger implementing Kaapi's `ILogger` interface.                 |
| `address`  | `string`         | Optional unique service address for routing and identification.           |
| `name`     | `string`         | Optional human-readable name for service tracking/monitoring.             |
| `producer` | `ProducerConfig` | Optional default KafkaJS producer configuration.                          |

---

### Creating a Topic

```ts
await messaging.createTopic({
    topic: 'my-topic',
    numPartitions: 1,
    replicationFactor: 1,
}, {
    waitForLeaders: true
});

// ensure the topic is ready before publishing
const timeoutMs = 10000;
const checkIntervalMs = 200;
await messaging.waitForTopicReady('my-topic', timeoutMs, checkIntervalMs);
```

---

### Publishing a Message

`publish(topic, message)` sends a message to a given Kafka topic.

```ts
await messaging.publish('my-topic', {
    userId: '123',
    action: 'login',
});
```

* `topic`: The Kafka topic name
* `message`: Any serializable object

---

### Subscribing to a Topic

`subscribe(topic, handler, config?)` subscribes to a Kafka topic and calls the provided handler on each message.

```ts
await messaging.subscribe('my-topic', async (message, sender) => {
    console.log('Received:', message);
    console.log('From:', sender.name, sender.address);
    console.log('Offset:', sender.offset);
}, {
    fromBeginning: true
});
```

* `topic`: The Kafka topic name
* `handler`: `(message, sender) => void | Promise<void>`
* `config?`: `KafkaMessagingSubscribeConfig` (extends `ConsumerConfig`)
    * `groupId?`: Kafka consumer group ID
    * `fromBeginning?`: boolean - Start consuming from beginning of topic

---

### Graceful Shutdown

```ts
await messaging.shutdown();
```
This will disconnect all tracked producers, consumers, and admin clients safely.

---

## 🧱 Example Usage

```ts
// messaging.ts

import { Kaapi, createLogger } from '@kaapi/kaapi'
import { KafkaMessaging } from '@kaapi/kafka-messaging';

const messaging = new KafkaMessaging({
    clientId: 'my-app',
    brokers: ['localhost:9092'],
    name: 'my-service',
    address: 'service-1'
});

/**
 * Initialize the Kaapi app with messaging
 */
const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    messaging,
});

/**
 * Demonstrates how to subscribe and publish a message
 */
async function runExample(): Promise<void> {

    /**
     * Option 1: Use Kaapi app (recommended in app lifecycle)
     */
    // Publish a message
    await app.publish('my-topic', { event: 'user.created', userId: 456 });

    // Subscribe to messages
    await app.subscribe('my-topic', async (message, sender) => {
        console.log('Received:', message);
        console.log('Offset:', sender.offset);
    });

    /**
     * Option 2: Use messaging directly (standalone)
     */
    // Publish a message
    await messaging.publish('my-topic', { event: 'user.created', userId: 123 });

    // Subscribe to messages
    await messaging.subscribe('my-topic', async (message, sender) => {
        console.log('Received:', message);
        console.log('Offset:', sender.offset);
    });
}

runExample().catch((err) => {
    console.error('❌ Messaging example failed:', err);
});
```

---

## Public API Contract

The `KafkaMessaging` class provides a safe and resilient interface for interacting with Kafka. Developers should use the following methods to ensure proper lifecycle management, resource tracking, and graceful shutdown.

### Public Methods

| Method                             | Purpose                                                                 |
|-----------------------------------|-------------------------------------------------------------------------|
| `createProducer()`                | Creates and connects a Kafka producer. Automatically tracked and cleaned up. |
| `createConsumer(groupId, config?)`| Creates and connects a Kafka consumer. Automatically tracked and cleaned up. |
| `createAdmin(config?)`                   | Creates and connects a Kafka admin client. Tracked for shutdown.        |
| `publish(topic, message)`         | Sends a message to the specified topic using the managed producer.      |
| `subscribe(topic, handler, config?)` | Subscribes to a topic and processes messages with the given handler. |
| `shutdown()`                      | Gracefully disconnects all tracked producers, consumers, and admins.    |
| `safeDisconnect(client, timeoutMs?)` | Disconnects a Kafka client with timeout protection.             |
| `createTopic(topicConfig, options?)` | Creates a Kafka topic with optional validation and leader wait. |
| `waitForTopicReady(topic, timeoutMs?, checkIntervalMs?)` | Ensures the topic is ready. |

### Internal Methods (Not Public)

| Method         | Status     | Reason for Restriction                          |
|----------------|------------|-------------------------------------------------|
| `getKafka()`   | Protected  | Used internally to instantiate Kafka clients. Avoid direct access to prevent unmanaged connections. |

### Best Practices

- Always use `createProducer`, `createConsumer`, or `createAdmin` to ensure proper tracking.
- Avoid accessing the raw Kafka instance directly.
- Call `shutdown()` during application teardown to release resources.
- Use `createTopic()` and `waitForTopicReady()` in tests or dynamic topic scenarios.

---

## 🛠️ Requirements

* Node.js 16+
* A running Kafka instance
* Optional: integrate into a [Kaapi](https://github.com/demingongo/kaapi) service lifecycle

---

## 📚 Related

* [KafkaJS](https://github.com/tulios/kafkajs) — the underlying Kafka client
* [Kaapi](https://github.com/demingongo/kaapi) — framework powering this abstraction
* [@kaapi/kaapi](https://www.npmjs.com/package/@kaapi/kaapi)

---

## 🧪 Testing

You can mock Kafka in tests or point to a local dev broker. Integration testing can be done using Docker or services like Redpanda.

---

## 📝 License

MIT
