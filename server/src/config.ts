import 'dotenv/config';

/** All runtime configuration comes from environment variables (see server/.env.example). */
export const config = {
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/embo',
  port: Number(process.env.PORT ?? 4000),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  seedOnEmpty: (process.env.SEED_ON_EMPTY ?? 'true') !== 'false',
  /** Folder with the built React app; served by Express in production. */
  clientDist: process.env.CLIENT_DIST,
  isProd: process.env.NODE_ENV === 'production',
};
