// index.ts
import { INFO_ENV } from './config';
import { jwksRotator } from './drafts/jwks';
import './routes';
import { app } from './server';

await app.listen();

app.log(`Kaapi server is ready: ${app}`);
app.log(`INFO_ENV: ${INFO_ENV}`);

setInterval(() => {
    jwksRotator.checkAndRotateKeys().catch(console.error);
}, 3600 * 1000); // 1h
