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
app.use('/trpc/*', trpcServer({
  router: appRouter,
  createContext,
}));

export type AppRouter = typeof appRouter;
