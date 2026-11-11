import { env } from './env.js';
import { createApp, defaultWebDist } from './app.js';

const app = createApp({ webDist: defaultWebDist, sesionesEnDb: true });

app.listen(env.PORT, () => {
  console.log(`L'Mont API escuchando en http://localhost:${env.PORT}`);
});
