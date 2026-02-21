import { serve } from '@hono/node-server';
import { app } from './app.js';
import { shutdownLangfuse } from './lib/langfuse.js';

const port = Number(process.env.PORT ?? 4000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Camello API running at http://localhost:${info.port}`);
});

async function shutdown() {
  console.log('Shutting down...');
  await shutdownLangfuse();
  server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
