import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from './routes/index.js';
import { createContext } from './trpc/context.js';
import { widgetRoutes } from './webhooks/widget.js';
import { whatsappRoutes } from './webhooks/whatsapp.js';
import { clerkWebhookRoutes } from './webhooks/clerk.js';
import { paddleWebhookRoutes } from './webhooks/paddle.js';
import { internalRoutes } from './routes/internal.js';

export const app = new Hono();

// Global error handler — log full stack traces
app.onError((err, c) => {
  console.error('[ERROR]', c.req.method, c.req.path, err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

// Middleware
app.use('*', logger());

// CORS — widget routes accept any origin (JWT-based auth, no cookies).
// tRPC routes restrict to the dashboard origin.
app.use('/api/widget/*', cors({ origin: '*' }));
app.use('/api/channels/*', cors({ origin: '*' })); // Webhooks; Meta doesn't send origin but harmless to allow
app.use('*', cors({
  origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  credentials: true,
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'camello-api' }));

// --- Widget routes (anonymous JWT auth, not Clerk) ---
app.route('/api/widget', widgetRoutes);

// --- Channel webhook routes (external service callbacks) ---
app.route('/api/channels/whatsapp', whatsappRoutes);

// --- Clerk webhook routes (org lifecycle) ---
app.route('/api/webhooks', clerkWebhookRoutes);

// --- Paddle webhook routes (billing lifecycle) ---
app.route('/api/webhooks', paddleWebhookRoutes);

// --- Internal service-to-service routes (jobs → api) ---
app.route('/api/internal', internalRoutes);

// tRPC handler (Clerk auth)
// @hono/trpc-server expects Record<string, unknown> from createContext, but our
// Context has typed properties. tRPC resolves the correct type via
// initTRPC.context<Context>(). The double-cast is safe.
app.use('/trpc/*', trpcServer({
  router: appRouter,
  createContext: createContext as any,
}));

export type AppRouter = typeof appRouter;
