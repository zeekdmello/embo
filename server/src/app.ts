import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config';
import { errorHandler, notFound } from './middleware/http';
import { adminRouter } from './routes/admin';
import { collectionsRouter } from './routes/collections';
import { rostersRouter } from './routes/rosters';

/** Builds the Express app: JSON API under /api, plus the built React app in production. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));
  if (config.clientOrigins.length) app.use('/api', cors({ origin: config.clientOrigins }));

  app.use('/api', adminRouter());
  app.use('/api/rosters', rostersRouter());
  app.use('/api', collectionsRouter());
  app.use('/api', notFound);

  // Serve the React build (client/dist) so one service hosts the whole app.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = config.clientDist ?? path.resolve(here, '../../client/dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
    console.log(`[web] serving React app from ${clientDist}`);
  } else if (config.isProd) {
    console.warn(`[web] no React build found at ${clientDist} — run "npm run build" first`);
  }

  app.use(errorHandler);
  return app;
}
