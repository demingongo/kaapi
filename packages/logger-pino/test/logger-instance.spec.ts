import { describe, beforeEach, afterEach, it } from 'mocha';
import { createPinoLogger, internalCustomLevels } from '../src';
import { expect } from 'chai';

describe('Logger Instance', () => {
    const log = createPinoLogger({
        customLevels: {
            ...internalCustomLevels,
            notice: 35,
        },
    });

    beforeEach(async () => { });

    afterEach(async () => { });

    it('should create a logger instance with custom levels', () => {
        expect(log).to.not.be.an('undefined');
        expect(typeof log.notice).to.equal('function');
        expect(typeof log.silly).to.equal('function');
        expect(typeof log.verbose).to.equal('function');
        expect(typeof log.trace).to.equal('function');
        expect(typeof log.debug).to.equal('function');
        expect(typeof log.info).to.equal('function');
        expect(typeof log.warn).to.equal('function');
        expect(typeof log.error).to.equal('function');
        expect(typeof log.fatal).to.equal('function');
    });
});
