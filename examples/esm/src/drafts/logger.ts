import { createLogger } from '@kaapi/kaapi';
import winston from 'winston';

export default createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.splat(),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()],
    exceptionHandlers: [new winston.transports.Console({ handleExceptions: true })],
    rejectionHandlers: [new winston.transports.Console()],
    exitOnError: false,
});
