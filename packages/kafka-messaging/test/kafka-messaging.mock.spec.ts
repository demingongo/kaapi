/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'chai';
import sinon from 'sinon';
import { Kafka, Producer, Consumer, Admin } from 'kafkajs';
import { KafkaMessaging } from '../src/index';

describe('KafkaMessaging - Mock Tests', () => {
    let messaging: KafkaMessaging;
    let producerStub: sinon.SinonStubbedInstance<Producer>;
    let consumerStub: sinon.SinonStubbedInstance<Consumer>;
    let adminStub: sinon.SinonStubbedInstance<Admin>;

    // Event listeners storage
    let producerEventListeners: Map<string, () => void>;
    let consumerEventListeners: Map<string, () => void>;
    let adminEventListeners: Map<string, () => void>;

    beforeEach(() => {
        // Reset event listeners
        producerEventListeners = new Map();
        consumerEventListeners = new Map();
        adminEventListeners = new Map();

        // Create stubs for Kafka clients
        producerStub = {
            connect: sinon.stub().resolves(),
            disconnect: sinon.stub().callsFake(async () => {
                // Trigger DISCONNECT event when disconnect is called
                const listener = producerEventListeners.get('producer.disconnect');
                if (listener) listener();
            }),
            send: sinon.stub().resolves([{ topicName: 'test', partition: 0, errorCode: 0, baseOffset: '0' }]),
            sendBatch: sinon.stub().resolves([{ topicName: 'test', partition: 0, errorCode: 0, baseOffset: '0' }]),
            on: sinon.stub().callsFake((event: string, listener: () => void) => {
                producerEventListeners.set(event, listener);
            }),
            events: {
                DISCONNECT: 'producer.disconnect',
            },
        } as any;

        consumerStub = {
            connect: sinon.stub().resolves(),
            disconnect: sinon.stub().callsFake(async () => {
                const listener = consumerEventListeners.get('consumer.disconnect');
                if (listener) listener();
            }),
            subscribe: sinon.stub().resolves(),
            run: sinon.stub().resolves(),
            stop: sinon.stub().resolves(),
            on: sinon.stub().callsFake((event: string, listener: () => void) => {
                consumerEventListeners.set(event, listener);
            }),
            events: {
                DISCONNECT: 'consumer.disconnect',
            },
        } as any;

        adminStub = {
            connect: sinon.stub().resolves(),
            disconnect: sinon.stub().callsFake(async () => {
                const listener = adminEventListeners.get('admin.disconnect');
                if (listener) listener();
            }),
            createTopics: sinon.stub().resolves(true),
            fetchTopicOffsets: sinon.stub().resolves([
                { partition: 0, offset: '10', high: '10', low: '0' }
            ]),
            fetchTopicMetadata: sinon.stub().resolves({
                topics: [{ name: 'test', partitions: [{ partitionId: 0, leader: 1 }] }]
            }),
            on: sinon.stub().callsFake((event: string, listener: () => void) => {
                adminEventListeners.set(event, listener);
            }),
            events: {
                DISCONNECT: 'admin.disconnect',
            },
        } as any;

        // Stub the Kafka constructor
        sinon.stub(Kafka.prototype, 'producer').returns(producerStub);
        sinon.stub(Kafka.prototype, 'consumer').returns(consumerStub);
        sinon.stub(Kafka.prototype, 'admin').returns(adminStub);

        messaging = new KafkaMessaging({
            clientId: 'mock-client',
            brokers: ['localhost:9092'],
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Producer Operations', () => {
        it('should create a producer and connect', async () => {
            const producer = await messaging.createProducer();

            expect(producer).to.exist;
            expect(producerStub.connect.calledOnce).to.be.true;
            expect(messaging.activeProducers.has(producer!)).to.be.true;
        });

        it('should reuse existing producer via getProducer()', async () => {
            const producer1 = await messaging.getProducer();
            const producer2 = await messaging.getProducer();

            expect(producer1).to.equal(producer2);
            expect(producerStub.connect.calledOnce).to.be.true;
        });

        it('should handle concurrent getProducer() calls correctly', async () => {
            const [p1, p2, p3] = await Promise.all([
                messaging.getProducer(),
                messaging.getProducer(),
                messaging.getProducer(),
            ]);

            expect(p1).to.equal(p2);
            expect(p2).to.equal(p3);
            expect(producerStub.connect.calledOnce).to.be.true;
        });

        it('should publish a JSON message', async () => {
            const topic = 'test-topic';
            const message = { foo: 'bar' };

            await messaging.publish(topic, message);

            expect(producerStub.send.calledOnce).to.be.true;
            const sendCall = producerStub.send.getCall(0);
            expect(sendCall.args[0].topic).to.equal(topic);
            expect(sendCall.args[0].messages[0].value).to.equal(JSON.stringify(message));
        });

        it('should publish a string message without JSON serialization', async () => {
            const topic = 'test-topic';
            const message = 'plain string message';

            await messaging.publish(topic, message);

            const sendCall = producerStub.send.getCall(0);
            expect(sendCall.args[0].messages[0].value).to.equal('plain string message');
        });

        it('should publish a Buffer message as-is', async () => {
            const topic = 'test-topic';
            const message = Buffer.from('binary data');

            await messaging.publish(topic, message);

            const sendCall = producerStub.send.getCall(0);
            expect(sendCall.args[0].messages[0].value).to.equal(message);
        });

        it('should publish null message', async () => {
            const topic = 'test-topic';

            await messaging.publish(topic, null);

            const sendCall = producerStub.send.getCall(0);
            expect(sendCall.args[0].messages[0].value).to.be.null;
        });

        it('should throw error when publish fails', async () => {
            producerStub.send.rejects(new Error('Send failed'));

            try {
                await messaging.publish('test-topic', { test: true });
                expect.fail('Should have thrown');
            } catch (error: any) {
                expect(error.message).to.equal('Send failed');
            }
        });

        it('should publish batch of messages', async () => {
            const topic = 'batch-topic';
            const messages = [
                { value: { id: 1 } },
                { value: { id: 2 }, key: 'key-2' },
                { value: { id: 3 }, headers: { priority: 'high' } },
            ];

            await messaging.publishBatch(topic, messages);

            expect(producerStub.send.calledOnce).to.be.true;
            const sendCall = producerStub.send.getCall(0);
            expect(sendCall.args[0].topic).to.equal(topic);
            expect(sendCall.args[0].messages).to.have.lengthOf(3);
        });

        it('should publish batch with mixed value types', async () => {
            const topic = 'batch-topic';
            const buffer = Buffer.from('binary');
            const messages = [
                { value: { id: 1 } },           // JSON object
                { value: 'plain string' },       // string
                { value: buffer },               // Buffer
                { value: null },                 // null
            ];

            await messaging.publishBatch<Buffer | string | object | null>(topic, messages);

            const sendCall = producerStub.send.getCall(0);
            expect(sendCall.args[0].messages[0].value).to.equal(JSON.stringify({ id: 1 }));
            expect(sendCall.args[0].messages[1].value).to.equal('plain string');
            expect(sendCall.args[0].messages[2].value).to.equal(buffer);
            expect(sendCall.args[0].messages[3].value).to.be.null;
        });

        it('should not call send when publishBatch receives empty array', async () => {
            await messaging.publishBatch('test-topic', []);

            expect(producerStub.send.called).to.be.false;
        });
    });

    describe('Consumer Operations', () => {
        it('should create a consumer and connect', async () => {
            const consumer = await messaging.createConsumer('test-group');

            expect(consumer).to.exist;
            expect(consumerStub.connect.calledOnce).to.be.true;
            expect(messaging.activeConsumers.has(consumer!)).to.be.true;
        });

        it('should subscribe to a topic with auto-generated groupId', async () => {
            await messaging.subscribe('my-topic', () => { });

            expect(consumerStub.subscribe.calledOnce).to.be.true;
            expect(consumerStub.run.calledOnce).to.be.true;
        });

        it('should subscribe with custom groupId', async () => {
            const createConsumerSpy = sinon.spy(messaging, 'createConsumer');

            await messaging.subscribe('my-topic', () => { }, {
                groupId: 'custom-group',
            });

            expect(createConsumerSpy.calledWith('custom-group')).to.be.true;
        });

        it('should subscribe with groupIdPrefix', async () => {
            const createConsumerSpy = sinon.spy(messaging, 'createConsumer');

            await messaging.subscribe('my-topic', () => { }, {
                groupIdPrefix: 'my-prefix',
            });

            // Should be called with 'my-prefix.my-topic'
            expect(createConsumerSpy.calledOnce).to.be.true;
            const groupIdArg = createConsumerSpy.getCall(0).args[0];
            expect(groupIdArg).to.equal('my-prefix.my-topic');
        });

        it('should call onReady callback after subscription', async () => {
            let readyConsumer: any = null;

            await messaging.subscribe('my-topic', () => { }, {
                onReady: (consumer) => {
                    readyConsumer = consumer;
                },
            });

            expect(readyConsumer).to.exist;
        });

        it('should use fromBeginning option when subscribing', async () => {
            await messaging.subscribe('my-topic', () => { }, {
                fromBeginning: true,
            });

            const subscribeCall = consumerStub.subscribe.getCall(0);
            expect(subscribeCall.args[0].fromBeginning).to.be.true;
        });
    });

    describe('Admin Operations', () => {
        it('should create an admin and connect', async () => {
            const admin = await messaging.createAdmin();

            expect(admin).to.exist;
            expect(adminStub.connect.calledOnce).to.be.true;
        });

        it('should create a topic', async () => {
            await messaging.createTopic({
                topic: 'new-topic',
                numPartitions: 3,
                replicationFactor: 1,
            });

            expect(adminStub.createTopics.calledOnce).to.be.true;
        });

        it('should fetch topic offsets', async () => {
            const offsets = await messaging.fetchTopicOffsets('test-topic');

            expect(offsets).to.exist;
            expect(offsets).to.be.an('array');
            expect(offsets![0]).to.have.property('partition', 0);
            expect(offsets![0]).to.have.property('offset', '10');
        });
    });

    describe('Disconnect Operations', () => {
        it('should safely disconnect a producer', async () => {
            const producer = await messaging.createProducer();

            await messaging.safeDisconnect(producer!);

            expect(producerStub.disconnect.calledOnce).to.be.true;
            expect(messaging.activeProducers.has(producer!)).to.be.false;
        });

        it('should safely disconnect a consumer', async () => {
            const consumer = await messaging.createConsumer('test-group');

            await messaging.safeDisconnect(consumer!);

            expect(consumerStub.disconnect.calledOnce).to.be.true;
            expect(messaging.activeConsumers.has(consumer!)).to.be.false;
        });

        it('should safely disconnect an admin', async () => {
            const admin = await messaging.createAdmin();

            await messaging.safeDisconnect(admin!);

            expect(adminStub.disconnect.calledOnce).to.be.true;
        });
    });

    describe('Shutdown', () => {
        it('should shutdown all clients and return summary', async () => {
            await messaging.createProducer();
            await messaging.createConsumer('group-1');

            const result = await messaging.shutdown();

            expect(result.successProducers).to.equal(1);
            expect(result.successConsumers).to.equal(1);
            expect(result.errorCount).to.equal(0);
        });

        it('should handle shutdown with no clients', async () => {
            const result = await messaging.shutdown();

            expect(result.successProducers).to.equal(0);
            expect(result.successConsumers).to.equal(0);
            expect(result.successAdmins).to.equal(0);
            expect(result.errorCount).to.equal(0);
        });

        it('should handle double shutdown gracefully', async () => {
            await messaging.createProducer();

            const result1 = await messaging.shutdown();
            const result2 = await messaging.shutdown();

            expect(result1.successProducers).to.equal(1);
            expect(result2.successProducers).to.equal(0);
            expect(result2.errorCount).to.equal(0);
        });
    });

    describe('Error Handling', () => {
        it('should call onError when message handler throws', async () => {
            let capturedError: any = null;
            let capturedMessage: any = null;

            // Capture the eachBatch handler
            let eachBatchHandler: any;
            consumerStub.run.callsFake(async (config: any) => {
                eachBatchHandler = config.eachBatch;
            });

            await messaging.subscribe('test-topic', () => {
                throw new Error('Handler error');
            }, {
                onError: (error, message) => {
                    capturedError = error;
                    capturedMessage = message;
                },
            });

            // Simulate a batch with one message
            await eachBatchHandler({
                batch: {
                    topic: 'test-topic',
                    partition: 0,
                    messages: [{
                        key: null,
                        value: Buffer.from(JSON.stringify({ test: true })),
                        headers: {},
                        offset: '0',
                        timestamp: Date.now().toString(),
                    }],
                },
                resolveOffset: sinon.stub(),
                heartbeat: sinon.stub().resolves(),
            });

            expect(capturedError).to.be.instanceOf(Error);
            expect(capturedError.message).to.equal('Handler error');
            expect(capturedMessage).to.deep.equal({ test: true });
        });

        it('should call async onError when handler rejects', async () => {
            let asyncHandlerCalled = false;

            let eachBatchHandler: any;
            consumerStub.run.callsFake(async (config: any) => {
                eachBatchHandler = config.eachBatch;
            });

            await messaging.subscribe('test-topic', async () => {
                return Promise.reject(new Error('Async error'));
            }, {
                onError: async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    asyncHandlerCalled = true;
                },
            });

            await eachBatchHandler({
                batch: {
                    topic: 'test-topic',
                    partition: 0,
                    messages: [{
                        key: null,
                        value: Buffer.from(JSON.stringify({ test: true })),
                        headers: {},
                        offset: '0',
                        timestamp: Date.now().toString(),
                    }],
                },
                resolveOffset: sinon.stub(),
                heartbeat: sinon.stub().resolves(),
            });

            expect(asyncHandlerCalled).to.be.true;
        });

        it('should not crash when onError itself throws', async () => {
            let eachBatchHandler: any;
            consumerStub.run.callsFake(async (config: any) => {
                eachBatchHandler = config.eachBatch;
            });

            await messaging.subscribe('test-topic', () => {
                throw new Error('Handler error');
            }, {
                onError: () => {
                    throw new Error('onError also failed');
                },
            });

            // Should not throw
            await eachBatchHandler({
                batch: {
                    topic: 'test-topic',
                    partition: 0,
                    messages: [{
                        key: null,
                        value: Buffer.from(JSON.stringify({ test: true })),
                        headers: {},
                        offset: '0',
                        timestamp: Date.now().toString(),
                    }],
                },
                resolveOffset: sinon.stub(),
                heartbeat: sinon.stub().resolves(),
            });

            expect(true).to.be.true; // If we get here, test passes
        });
    });

    describe('Message Parsing', () => {
        it('should parse JSON message correctly', async () => {
            let receivedMessage: any = null;

            let eachBatchHandler: any;
            consumerStub.run.callsFake(async (config: any) => {
                eachBatchHandler = config.eachBatch;
            });

            await messaging.subscribe('test-topic', (msg) => {
                receivedMessage = msg;
            });

            await eachBatchHandler({
                batch: {
                    topic: 'test-topic',
                    partition: 0,
                    messages: [{
                        key: null,
                        value: Buffer.from(JSON.stringify({ nested: { value: 42 } })),
                        headers: {},
                        offset: '0',
                        timestamp: Date.now().toString(),
                    }],
                },
                resolveOffset: sinon.stub(),
                heartbeat: sinon.stub().resolves(),
            });

            expect(receivedMessage).to.deep.equal({ nested: { value: 42 } });
        });

        it('should handle null message value', async () => {
            let receivedMessage: any = 'not-set';

            let eachBatchHandler: any;
            consumerStub.run.callsFake(async (config: any) => {
                eachBatchHandler = config.eachBatch;
            });

            await messaging.subscribe('test-topic', (msg) => {
                receivedMessage = msg;
            });

            await eachBatchHandler({
                batch: {
                    topic: 'test-topic',
                    partition: 0,
                    messages: [{
                        key: null,
                        value: null,
                        headers: {},
                        offset: '0',
                        timestamp: Date.now().toString(),
                    }],
                },
                resolveOffset: sinon.stub(),
                heartbeat: sinon.stub().resolves(),
            });

            expect(receivedMessage).to.be.null;
        });

        it('should keep Buffer when message is not valid JSON', async () => {
            let receivedMessage: any = null;
            const originalBuffer = Buffer.from('plain text message');

            let eachBatchHandler: any;
            consumerStub.run.callsFake(async (config: any) => {
                eachBatchHandler = config.eachBatch;
            });

            await messaging.subscribe('test-topic', (msg) => {
                receivedMessage = msg;
            });

            await eachBatchHandler({
                batch: {
                    topic: 'test-topic',
                    partition: 0,
                    messages: [{
                        key: null,
                        value: originalBuffer,
                        headers: {},
                        offset: '0',
                        timestamp: Date.now().toString(),
                    }],
                },
                resolveOffset: sinon.stub(),
                heartbeat: sinon.stub().resolves(),
            });

            // Non-JSON content keeps the original Buffer
            expect(receivedMessage).to.be.instanceOf(Buffer);
            expect(receivedMessage.toString()).to.equal('plain text message');
        });

        it('should parse JSON number correctly', async () => {
            let receivedMessage: any = null;

            let eachBatchHandler: any;
            consumerStub.run.callsFake(async (config: any) => {
                eachBatchHandler = config.eachBatch;
            });

            await messaging.subscribe('test-topic', (msg) => {
                receivedMessage = msg;
            });

            await eachBatchHandler({
                batch: {
                    topic: 'test-topic',
                    partition: 0,
                    messages: [{
                        key: null,
                        value: Buffer.from('42'),
                        headers: {},
                        offset: '0',
                        timestamp: Date.now().toString(),
                    }],
                },
                resolveOffset: sinon.stub(),
                heartbeat: sinon.stub().resolves(),
            });

            // Numbers are valid JSON
            expect(receivedMessage).to.equal(42);
        });

        it('should parse JSON string correctly', async () => {
            let receivedMessage: any = null;

            let eachBatchHandler: any;
            consumerStub.run.callsFake(async (config: any) => {
                eachBatchHandler = config.eachBatch;
            });

            await messaging.subscribe('test-topic', (msg) => {
                receivedMessage = msg;
            });

            await eachBatchHandler({
                batch: {
                    topic: 'test-topic',
                    partition: 0,
                    messages: [{
                        key: null,
                        value: Buffer.from('"quoted string"'),  // Valid JSON string
                        headers: {},
                        offset: '0',
                        timestamp: Date.now().toString(),
                    }],
                },
                resolveOffset: sinon.stub(),
                heartbeat: sinon.stub().resolves(),
            });

            // JSON-encoded strings are parsed
            expect(receivedMessage).to.equal('quoted string');
        });

        it('should pass context with headers to handler', async () => {
            let receivedContext: any = null;

            let eachBatchHandler: any;
            consumerStub.run.callsFake(async (config: any) => {
                eachBatchHandler = config.eachBatch;
            });

            await messaging.subscribe('test-topic', (_msg, ctx) => {
                receivedContext = ctx;
            });

            await eachBatchHandler({
                batch: {
                    topic: 'test-topic',
                    partition: 0,
                    messages: [{
                        key: Buffer.from('my-key'),
                        value: Buffer.from(JSON.stringify({ test: true })),
                        headers: { traceId: Buffer.from('trace-123') },
                        offset: '5',
                        timestamp: '1234567890',
                    }],
                },
                resolveOffset: sinon.stub(),
                heartbeat: sinon.stub().resolves(),
            });

            expect(receivedContext).to.have.property('offset', '5');
            expect(receivedContext).to.have.property('timestamp', '1234567890');
            expect(receivedContext).to.have.property('traceId', 'trace-123');
        });
    });
});