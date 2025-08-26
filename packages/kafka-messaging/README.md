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
* Flexible `subscribe(topic, handler)` with offset tracking
* KafkaJS-compatible configuration
* Structured logging via Kaapi’s `ILogger`
* Typed message handling with TypeScript

---

## 📦 Installation

```bash
npm install @kaapi/kafka-messaging kafkajs
```

---

## 🧱 Example Usage

```ts
// messaging.ts

import { Kaapi, createLogger } from '@kaapi/kaapi'
import { KafkaMessaging } from '@kaapi/kafka-messaging';

const messaging = new KafkaMessaging({
    clientId: 'my-service',
    brokers: ['localhost:9092'],
    logger: createLogger() // optional, use Kaapi ILogger
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

## ⚙️ Configuration

### KafkaMessagingConfig (extends `KafkaConfig` from kafkajs)

```ts
{
  clientId: string;           // Kafka client ID
  brokers: string[];          // Kafka broker addresses
  logger?: ILogger | Console; // Optional logger
  address?: string;           // Optional unique service address
  name?: string;              // Optional name for tracking
}
```

> 👉 Consider using the `name` or `address` options to distinguish multiple services in the same Kafka cluster.

### KafkaMessagingSubscribeConfig (extends `ConsumerConfig`)

```ts
{
  groupId?: string;           // Kafka consumer group ID
  fromBeginning?: boolean;    // Start consuming from beginning of topic
}
```

---

## 📤 `publish(topic, message)`

Sends a message to a given Kafka topic.

```ts
await messaging.publish('orders.created', { orderId: 987 });
```

* `topic`: The Kafka topic name
* `message`: Any serializable object

---

## 📥 `subscribe(topic, handler, config?)`

Subscribes to a Kafka topic and calls the provided handler on each message.

```ts
await messaging.subscribe('orders.created', async (msg, sender) => {
    console.log('Received order:', msg);
    console.log('Offset:', sender.offset);
});
```

* `handler`: `(message, sender) => void | Promise<void>`
* `sender.offset`: Kafka offset of the message

---

## 🔧 Additional Methods

### `getKafka(): Kafka | undefined`

Returns the KafkaJS client instance.

### `getProducer(): Promise<Producer | undefined>`

Returns or creates the [KafkaJS](https://github.com/tulios/kafkajs) producer instance.

### `getConsumer(topic, config): Promise<Consumer | undefined>`

Returns a configured KafkaJS consumer.

### `getAdmin(): Promise<Admin | undefined>`

Returns the KafkaJS admin client.

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
