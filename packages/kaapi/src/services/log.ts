import winston from 'winston';

export interface ILogger {
    (...args: unknown[]): void
    silly: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    verbose: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    warning: (...args: unknown[]) => void;
    err: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

function wrap(loggerFn: winston.LeveledLogMethod) {
    return (...args: unknown[]) => {
        loggerFn(args.map(a => {
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
        }).join(' '));
    }
}

export function createLogger(options?: winston.LoggerOptions): ILogger {
    const wlogger = winston.createLogger(options);

    return Object.assign(
        wrap(wlogger.info),
        {
            silly: wrap(wlogger.silly),
            debug: wrap(wlogger.debug),
            verbose: wrap(wlogger.verbose),
            info: wrap(wlogger.info),
            warn: wrap(wlogger.warn),
            warning: wrap(wlogger.warn),
            err: wrap(wlogger.error),
            error: wrap(wlogger.error)
        }
    )
}