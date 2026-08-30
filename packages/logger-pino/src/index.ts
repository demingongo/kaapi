import { ILogger } from '@kaapi/logger';
import pino from 'pino';

export const internalCustomLevels = Object.freeze({
    /** Silly log level, alias for trace (10) */
    silly: 10,
    /** Verbose log level, sits between debug (20) and info (30) */
    verbose: 25,
});

export type InternalCustomLevels = keyof typeof internalCustomLevels;

export function formatPinoLogArgs(args: Parameters<pino.LogFn>): Parameters<pino.LogFn> {
    if (args.length > 1) {
        const firstArg = args.shift();
        const secondArg = args.shift();

        let formattedArgs: [obj: unknown, msg?: string | undefined, ...args: unknown[]] | undefined = undefined;
        if (typeof firstArg === 'string') {
            const matches = firstArg.match(/%[sdoOj]/g);
            const placeholdersCount = matches ? matches.length : 0;
            if (placeholdersCount > 0) {
                formattedArgs = [{}, firstArg, secondArg, ...args];
            } else {
                formattedArgs = [
                    {},
                    [firstArg, secondArg, ...args]
                        .map((a) => {
                            if (a instanceof Error) return `${a.constructor.name}: ${a.message}`;
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
                        .join(' '),
                ];
            }
        } else if (typeof secondArg === 'string') {
            const matches = secondArg.match(/%[sdoOj]/g);
            const placeholdersCount = matches ? matches.length : 0;
            if (placeholdersCount > 0) {
                formattedArgs = [firstArg, secondArg, ...args];
            } else {
                formattedArgs = [
                    firstArg,
                    [secondArg, ...args]
                        .map((a) => {
                            if (a instanceof Error) return `${a.constructor.name}: ${a.message}`;
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
                        .join(' '),
                ];
            }
        }

        if (formattedArgs) return formattedArgs;
    }

    return args;
}

export function createPinoLogger<CustomLevels extends string = never>(
    options: pino.LoggerOptions<CustomLevels | InternalCustomLevels, false>,
    stream?: pino.DestinationStream | undefined
): pino.Logger<CustomLevels | InternalCustomLevels, false> & ILogger {
    const userCustomLevels = {
        ...(options.customLevels || {}),
        ...internalCustomLevels,
    } as Record<CustomLevels | InternalCustomLevels, number>;
    const logMethod: (this: pino.Logger, args: Parameters<pino.LogFn>, method: pino.LogFn, level: number) => void =
        function (this: pino.Logger, args: Parameters<pino.LogFn>, method: pino.LogFn) {
            method.apply(this, formatPinoLogArgs(args));
        };
    return pino<CustomLevels | InternalCustomLevels, false>(
        {
            ...options,
            useOnlyCustomLevels: false,
            customLevels: userCustomLevels,
            hooks: options.hooks
                ? { ...options.hooks, logMethod }
                : {
                      logMethod,
                  },
        },
        stream
    ) as pino.Logger<CustomLevels | InternalCustomLevels, false> & ILogger;
}
