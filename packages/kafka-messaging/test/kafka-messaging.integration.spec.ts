/* eslint-disable @typescript-eslint/no-unused-expressions */

// test/kafka-messaging.spec.ts

import { expect } from 'chai';
import { KafkaMessaging } from '../src/index';

// First suite: producer/consumer creation, tracking, disconnect, shutdown
describe('KafkaMessaging - Client Management', () => {
  const kafkaConfig = {
    clientId: 'test-client',
    brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
  };

  let messaging: KafkaMessaging;

  beforeEach(() => {
    messaging = new KafkaMessaging(kafkaConfig);
  });

  afterEach(async () => {
    await messaging.shutdown();
  });

  it('should create and track a producer', async () => {
    const producer = await messaging.createProducer();
    expect(producer).to.exist;
    if (producer)
      expect(messaging.activeProducers.has(producer)).to.be.true;
  });

  it('should create and track a consumer', async () => {
    const consumer = await messaging.createConsumer('test-group');
    expect(consumer).to.exist;
    if (consumer)
      expect(messaging.activeConsumers.has(consumer)).to.be.true;
  });

  it('should disconnect producer safely', async () => {
    const producer = await messaging.createProducer();
    expect(producer).to.exist;

    if (producer) {
      await messaging.safeDisconnect(producer);
      expect(messaging.activeProducers.has(producer)).to.be.false;
    }
  });

  it('should disconnect consumer safely', async () => {
    const consumer = await messaging.createConsumer('test-group');
    expect(consumer).to.exist;
    if (consumer) {
      await consumer.stop();
      await messaging.safeDisconnect(consumer);
      expect(messaging.activeConsumers.has(consumer)).to.be.false;
    }
  });

  it('should shutdown all tracked clients', async () => {
    await messaging.createProducer();
    await messaging.createConsumer('test-group');
    const result = await messaging.shutdown();
    expect(result.successProducers).to.be.greaterThan(0);
    expect(result.successConsumers).to.be.greaterThan(0);
    expect(result.errorCount).to.equal(0);
  });
});

// Second suite: publish, subscribe, batch, offsets, callbacks, edge cases
describe('KafkaMessaging - Messaging Operations', function () {
  this.timeout(20000); // Increase timeout for Kafka operations

  const kafkaConfig = {
    clientId: 'integration-client',
    brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
  };

  let messaging: KafkaMessaging;

  beforeEach(() => {
    messaging = new KafkaMessaging(kafkaConfig);
  });

  afterEach(async () => {
    await messaging.shutdown();
  });

  it('should publish and consume a message', async () => {
    const topic = 'test-topic-c';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, {
      waitForLeaders: true
    });
    await messaging.waitForTopicReady(topic); // 👈 wait for metadata to settle

    const message = { hello: 'world' };

    let received: unknown = null;

    await messaging.subscribe(topic, (msg) => {
      received = msg;
    }, { fromBeginning: true });

    await messaging.publish(topic, message);

    // Wait for message to be consumed
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(received).to.deep.equal(message);
  });

  it('should return correct shutdown summary', async () => {
    const topic = 'shutdown-topic-c';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, {
      waitForLeaders: true
    });
    await messaging.waitForTopicReady(topic); // 👈 wait for metadata to settle

    await messaging.subscribe(topic, () => { }, { fromBeginning: true });
    await messaging.publish(topic, { test: true });

    const result = await messaging.shutdown();

    expect(result.successProducers).to.be.greaterThan(0);
    expect(result.successConsumers).to.be.greaterThan(0);
    expect(result.errorCount).to.equal(0);
  });

  it('should use custom groupId when provided', async () => {
    const topic = 'custom-group-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    let receivedContext: unknown = null;

    await messaging.subscribe(topic, (_msg, ctx) => {
      receivedContext = ctx;
    }, {
      groupId: 'my-custom-group',
      fromBeginning: true
    });

    await messaging.publish(topic, { test: 'groupId' });

    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(receivedContext).to.exist;
  });

  it('should use groupIdPrefix when groupId not provided', async () => {
    const topic = 'prefix-group-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    let received = false;

    await messaging.subscribe(topic, () => {
      received = true;
    }, {
      groupIdPrefix: 'my-prefix',
      fromBeginning: true
    });

    await messaging.publish(topic, { test: 'prefix' });

    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(received).to.be.true;
  });

  it('should call onError when handler throws', async () => {
    const topic = 'error-handler-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    let errorCaught: unknown = null;
    let errorMessage: unknown = null;
    let errorContext: unknown = null;

    await messaging.subscribe(topic, () => {
      throw new Error('Test error');
    }, {
      fromBeginning: true,
      onError: (error, message, context) => {
        errorCaught = error;
        errorMessage = message;
        errorContext = context;
      }
    });

    await messaging.publish(topic, { trigger: 'error' });

    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(errorCaught).to.be.instanceOf(Error);
    expect((errorCaught as Error).message).to.equal('Test error');
    expect(errorMessage).to.deep.equal({ trigger: 'error' });
    expect(errorContext).to.have.property('offset');
  });

  it('should call async onError when handler throws', async () => {
    const topic = 'async-error-handler-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    let asyncErrorHandled = false;

    await messaging.subscribe(topic, () => {
      throw new Error('Async test error');
    }, {
      fromBeginning: true,
      onError: async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        asyncErrorHandled = true;
      }
    });

    await messaging.publish(topic, { trigger: 'async-error' });

    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(asyncErrorHandled).to.be.true;
  });

  it('should publish batch of messages', async () => {
    const topic = 'batch-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    const receivedMessages: unknown[] = [];

    await messaging.subscribe(topic, (msg) => {
      receivedMessages.push(msg);
    }, { fromBeginning: true });

    await messaging.publishBatch(topic, [
      { value: { id: 1, name: 'first' } },
      { value: { id: 2, name: 'second' } },
      { value: { id: 3, name: 'third' } },
    ]);

    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(receivedMessages).to.have.lengthOf(3);
    expect(receivedMessages).to.deep.include({ id: 1, name: 'first' });
    expect(receivedMessages).to.deep.include({ id: 2, name: 'second' });
    expect(receivedMessages).to.deep.include({ id: 3, name: 'third' });
  });

  it('should publish batch with custom keys and headers', async () => {
    const topic = 'batch-keys-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    const receivedContexts: unknown[] = [];

    await messaging.subscribe(topic, (_msg, ctx) => {
      receivedContexts.push(ctx);
    }, { fromBeginning: true });

    await messaging.publishBatch(topic, [
      { value: { id: 1 }, key: 'key-1', headers: { priority: 'high' } },
      { value: { id: 2 }, key: 'key-2', headers: { priority: 'low' } },
    ]);

    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(receivedContexts).to.have.lengthOf(2);
    expect(receivedContexts[0]).to.have.property('priority');
    expect(receivedContexts[1]).to.have.property('priority');
  });

  it('should not fail when publishBatch receives empty array', async () => {
    // Should return early without error
    await messaging.publishBatch('any-topic', []);
    // If we get here without error, test passes
    expect(true).to.be.true;
  });

  it('should fetch topic offsets', async () => {
    const topic = 'offsets-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    // Publish a message to ensure there's an offset
    await messaging.publish(topic, { test: 'offset' });

    const offsets = await messaging.fetchTopicOffsets(topic);

    expect(offsets).to.exist;
    expect(offsets).to.be.an('array');
    expect(offsets!.length).to.be.greaterThan(0);
    expect(offsets![0]).to.have.property('partition');
    expect(offsets![0]).to.have.property('offset');
    expect(offsets![0]).to.have.property('high');
    expect(offsets![0]).to.have.property('low');
  });

  it('should log offsets when logOffsets is true', async () => {
    const topic = 'log-offsets-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    // This should not throw even with logOffsets enabled
    await messaging.subscribe(topic, () => { }, {
      fromBeginning: true,
      logOffsets: true
    });

    await messaging.publish(topic, { test: 'logOffsets' });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // If we get here without error, the logOffsets path worked
    expect(true).to.be.true;
  });

  it('should call onReady callback when consumer is ready', async () => {
    const topic = 'onready-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    let consumerFromCallback: unknown = null;

    await messaging.subscribe(topic, () => { }, {
      fromBeginning: true,
      onReady: (consumer) => {
        consumerFromCallback = consumer;
      }
    });

    expect(consumerFromCallback).to.exist;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(messaging.activeConsumers.has(consumerFromCallback as any)).to.be.true;
  });

  it('should handle concurrent getProducer calls without race condition', async () => {
    // Call getProducer multiple times concurrently
    const [producer1, producer2, producer3] = await Promise.all([
      messaging.getProducer(),
      messaging.getProducer(),
      messaging.getProducer(),
    ]);

    // All should return the same producer instance
    expect(producer1).to.exist;
    expect(producer1).to.equal(producer2);
    expect(producer2).to.equal(producer3);

    // Only one producer should be tracked
    expect(messaging.activeProducers.size).to.equal(1);
  });

  // edge case tests

  it('should handle null message gracefully', async () => {
    const topic = 'null-message-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    let received: unknown = 'not-set';

    await messaging.subscribe(topic, (msg) => {
      received = msg;
    }, { fromBeginning: true });

    await messaging.publish(topic, null);

    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(received).to.be.null;
  });

  it('should call onError when handler returns rejected promise', async () => {
    const topic = 'rejected-promise-topic';
    await messaging.createTopic({
      topic,
      numPartitions: 1,
      replicationFactor: 1
    }, { waitForLeaders: true });
    await messaging.waitForTopicReady(topic);

    let errorCaught = false;

    await messaging.subscribe(topic, async () => {
      return Promise.reject(new Error('Rejected promise'));
    }, {
      fromBeginning: true,
      onError: () => {
        errorCaught = true;
      }
    });

    await messaging.publish(topic, { trigger: 'reject' });

    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(errorCaught).to.be.true;
  });

  it('should handle double shutdown gracefully', async () => {
    await messaging.createProducer();

    const result1 = await messaging.shutdown();
    const result2 = await messaging.shutdown();

    expect(result1.successProducers).to.equal(1);
    expect(result2.successProducers).to.equal(0); // Already shut down
    expect(result2.errorCount).to.equal(0);
  });
});