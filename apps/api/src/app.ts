import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from './routes/index.js';
import { createContext } from './trpc/context.js';

export const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  credentials: true,
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'camello-api' }));

// tRPC handler
// @hono/trpc-server expects Record<string, unknown> from createContext, but our
// Context has typed properties. tRPC resolves the correct type via
// initTRPC.context<Context>(). The double-cast is safe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use('/trpc/*', trpcServer({
  router: appRouter,
  createContext: createContext as any,
}));

export type AppRouter = typeof appRouter;
