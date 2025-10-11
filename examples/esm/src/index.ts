// index.ts
import { INFO_ENV } from './config';
import mflow from './plugins/multiple-flows';
import './routes';
import { app } from './server';

await app.listen();

app.log(`Kaapi server is ready: ${app}`);
app.log(`INFO_ENV: ${INFO_ENV}`);

setInterval(() => {
    mflow.checkAndRotateKeys().catch(console.error);
}, 3600 * 1000); // 1h
