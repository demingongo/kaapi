import type { ILogger } from '@kaapi/logger';
import winston from 'winston';

export { ILogger } from '@kaapi/logger';

export interface IKaapiAppLogger extends ILogger {
    (...args: unknown[]): void;
    warning: (...args: unknown[]) => void;
    err: (...args: unknown[]) => void;
}

function wrap(loggerFn: winston.LeveledLogMethod) {
    return (...args: unknown[]) => {
        loggerFn(
            args
                .map((a) => {
                    if (a instanceof Error) return a.stack;
                    try {
                        if (typeof a != 'string') a = JSON.stringify(a);
                    } catch (_e) {
                        try {
                            if (typeof a != 'string') a = a?.toString();
                        } catch (_e) {
                            //
                        }
                    }
                    return a;
                })
                .join(' ')
        );
    };
}

export function createLogger(options?: winston.LoggerOptions): IKaapiAppLogger {
    const wlogger = winston.createLogger(options);

    return Object.assign(wrap(wlogger.info), {
        silly: wrap(wlogger.silly),
        debug: wrap(wlogger.debug),
        verbose: wrap(wlogger.verbose),
        info: wrap(wlogger.info),
        warn: wrap(wlogger.warn),
        warning: wrap(wlogger.warn),
        err: wrap(wlogger.error),
        error: wrap(wlogger.error),
        fatal: wrap(wlogger.error),
    });
}
