import { app } from './app';
import { healthRoute } from './routes/health';

app
  // health check endpoint
  .route(healthRoute);

// start the server
await app.listen();

const BASE_URI = process.env.EXTERNAL_URI || app.base().info.uri;

app.log.info(`Server running on ${BASE_URI}`);
app.log.info(`Scalar UI on ${BASE_URI}/scalar`);
