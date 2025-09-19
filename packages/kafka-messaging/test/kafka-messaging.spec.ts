/* eslint-disable @typescript-eslint/no-unused-expressions */

// test/kafka-messaging.spec.ts

import { expect } from 'chai';
import { KafkaMessaging } from '../src/index';

describe('KafkaMessaging', () => {
  const kafkaConfig = {
    clientId: 'test-client',
    brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
  };

  let messaging: KafkaMessaging;

  beforeEach(() => {
    messaging = new KafkaMessaging(kafkaConfig);
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

describe('KafkaMessaging Integration', function () {
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
});