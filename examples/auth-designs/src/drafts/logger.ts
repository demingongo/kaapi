import { createLogger } from '@kaapi/kaapi'
import winston from 'winston'
//import DailyRotateFile from 'winston-daily-rotate-file' // For on-prem applications with no log aggregation or restricted env

export default createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        //new DailyRotateFile({
        //    filename: 'logs/app-%DATE%.log',
        //    datePattern: 'YYYY-MM-DD',
        //    maxSize: '20m',
        //    maxFiles: '1d'
        //})
    ],
    exceptionHandlers: [
        //new DailyRotateFile({ filename: 'logs/exceptions-%DATE%.log' }),
        new winston.transports.Console({ handleExceptions: true })
    ],
    rejectionHandlers: [
        new winston.transports.Console()
    ],
    exitOnError: false
})