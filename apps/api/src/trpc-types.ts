/**
 * Type-only re-export of AppRouter for frontend consumption.
 * This file exists to decouple the web app from API internals —
 * import `type { AppRouter } from '@camello/api/trpc'` in apps/web.
 */
export type { AppRouter } from './routes/index.js';
