import { formatPinoLogArgs } from '../src';
import { expect } from 'chai';

describe('Format Pino Log Args', () => {
    it('should format log arguments with placeholders correctly (%s)', () => {
        const args = ['Test message %s', 'with placeholder', { key: 'value' }];
        const formattedArgs = formatPinoLogArgs(args as unknown as Parameters<typeof formatPinoLogArgs>);
        expect(formattedArgs).to.be.an('array');
        expect(formattedArgs).to.have.lengthOf(4);
        expect(formattedArgs[0]).to.be.an('object');
        expect(formattedArgs[1]).to.equal('Test message %s');
        expect(formattedArgs[2]).to.equal('with placeholder');
        expect(formattedArgs[3]).to.deep.equal({ key: 'value' });
    });

    it('should format log arguments with placeholders correctly (%d)', () => {
        const args = ['Test message with number %d', 5, { key: 'value' }];
        const formattedArgs = formatPinoLogArgs(args as unknown as Parameters<typeof formatPinoLogArgs>);
        expect(formattedArgs).to.be.an('array');
        expect(formattedArgs).to.have.lengthOf(4);
        expect(formattedArgs[0]).to.be.an('object');
        expect(formattedArgs[1]).to.equal('Test message with number %d');
        expect(formattedArgs[2]).to.equal(5);
        expect(formattedArgs[3]).to.deep.equal({ key: 'value' });
    });

    it('should format log arguments with placeholders correctly (%o)', () => {
        const args = ['Test message %o', 'with placeholder', { key: 'value' }];
        const formattedArgs = formatPinoLogArgs(args as unknown as Parameters<typeof formatPinoLogArgs>);
        expect(formattedArgs).to.be.an('array');
        expect(formattedArgs).to.have.lengthOf(4);
        expect(formattedArgs[0]).to.be.an('object');
        expect(formattedArgs[1]).to.equal('Test message %o');
        expect(formattedArgs[2]).to.equal('with placeholder');
        expect(formattedArgs[3]).to.deep.equal({ key: 'value' });
    });

    it('should format log arguments with placeholders correctly (%O)', () => {
        const args = ['Test message %O', 'with placeholder', { key: 'value' }];
        const formattedArgs = formatPinoLogArgs(args as unknown as Parameters<typeof formatPinoLogArgs>);
        expect(formattedArgs).to.be.an('array');
        expect(formattedArgs).to.have.lengthOf(4);
        expect(formattedArgs[0]).to.be.an('object');
        expect(formattedArgs[1]).to.equal('Test message %O');
        expect(formattedArgs[2]).to.equal('with placeholder');
        expect(formattedArgs[3]).to.deep.equal({ key: 'value' });
    });

    it('should format log arguments with placeholders correctly (%j)', () => {
        const args = ['Test message %j', 'with placeholder', { key: 'value' }];
        const formattedArgs = formatPinoLogArgs(args as unknown as Parameters<typeof formatPinoLogArgs>);
        expect(formattedArgs).to.be.an('array');
        expect(formattedArgs).to.have.lengthOf(4);
        expect(formattedArgs[0]).to.be.an('object');
        expect(formattedArgs[1]).to.equal('Test message %j');
        expect(formattedArgs[2]).to.equal('with placeholder');
        expect(formattedArgs[3]).to.deep.equal({ key: 'value' });
    });

    it('should format log arguments without placeholders correctly', () => {
        const args = ['Test message', 'with placeholder', { key: 'value' }];
        const formattedArgs = formatPinoLogArgs(args as unknown as Parameters<typeof formatPinoLogArgs>);
        expect(formattedArgs).to.be.an('array');
        expect(formattedArgs).to.have.lengthOf(2);
        expect(formattedArgs[0]).to.be.an('object');
        expect(formattedArgs[1]).to.equal(`Test message with placeholder ${JSON.stringify({ key: 'value' })}`);
    });

    it('should format log arguments with errors correctly', () => {
        const args = [new Error('Test error'), 'Another error after that', new TypeError('Yet another error')];
        const formattedArgs = formatPinoLogArgs(args as unknown as Parameters<typeof formatPinoLogArgs>);
        expect(formattedArgs).to.be.an('array');
        expect(formattedArgs).to.have.lengthOf(2);
        expect(formattedArgs[0]).to.be.an.instanceof(Error);
        expect(formattedArgs[1]).to.equal('Another error after that TypeError: Yet another error');
    });
});
