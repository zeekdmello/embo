import { Router } from 'express';
import type { Model } from 'mongoose';
import { COLLECTIONS, Settings, type CollectionKey } from '../models';
import { asyncHandler, HttpError } from '../middleware/http';
import { DEFAULT_SETTINGS, fromDoc, getSettings, toDoc } from '../services/dataset';

/**
 * REST endpoints for every configuration collection, e.g.
 *   GET    /api/employees           list
 *   GET    /api/employees/:id       one
 *   POST   /api/employees           create (id optional — generated if missing)
 *   PUT    /api/employees/:id       create-or-replace (idempotent; what the React app uses)
 *   DELETE /api/employees/:id       delete (idempotent)
 */
function collectionRouter(key: CollectionKey): Router {
  const { model, idField } = COLLECTIONS[key];
  const M = model as Model<unknown>;
  const r = Router();

  r.get(
    '/',
    asyncHandler(async (_req, res) => {
      const docs = await M.find().lean();
      res.json(docs.map((d) => fromDoc(d as Record<string, unknown>, idField)));
    }),
  );

  r.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const doc = await M.findById(req.params.id).lean();
      if (!doc) throw new HttpError(404, `${key} "${req.params.id}" not found`);
      res.json(fromDoc(doc as Record<string, unknown>, idField));
    }),
  );

  const upsert = async (id: string, body: Record<string, unknown>) => {
    const doc = toDoc({ ...body, [idField]: id }, idField);
    await new M(doc).validate(); // schema validation (types, enums, required fields)
    await M.replaceOne({ _id: id }, doc, { upsert: true });
    return fromDoc<Record<string, unknown>>(doc, idField);
  };

  r.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const id = String(body[idField] ?? `${key.slice(0, 3)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
      if (await M.exists({ _id: id })) throw new HttpError(409, `${key} "${id}" already exists`);
      res.status(201).json(await upsert(id, body));
    }),
  );

  r.put(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json(await upsert(req.params.id, (req.body ?? {}) as Record<string, unknown>));
    }),
  );

  r.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await M.deleteOne({ _id: req.params.id });
      res.status(204).end();
    }),
  );
  return r;
}

export function collectionsRouter(): Router {
  const r = Router();
  for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) r.use(`/${COLLECTIONS[key].route}`, collectionRouter(key));

  r.get(
    '/settings',
    asyncHandler(async (_req, res) => {
      res.json(await getSettings());
    }),
  );
  r.put(
    '/settings',
    asyncHandler(async (req, res) => {
      const next = { ...DEFAULT_SETTINGS, ...(req.body ?? {}), _id: 'settings' };
      await new Settings(next).validate();
      await Settings.replaceOne({ _id: 'settings' }, next, { upsert: true });
      res.json(await getSettings());
    }),
  );
  return r;
}
