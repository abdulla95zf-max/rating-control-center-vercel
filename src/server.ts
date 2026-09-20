import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, config.host, () => {
  console.log(`Online Rating Control Center: http://${config.host}:${config.port}`);
  console.log(`Talabat database configured: ${Boolean(config.talabatDatabasePath)}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
