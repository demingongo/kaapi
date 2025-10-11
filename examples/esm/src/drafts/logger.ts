import { createLogger } from '@kaapi/kaapi';
import winston from 'winston';

export default createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()],
    exceptionHandlers: [new winston.transports.Console({ handleExceptions: true })],
    rejectionHandlers: [new winston.transports.Console()],
    exitOnError: false,
});
