import { Router } from 'express';
import { createSampleData } from '@shared/data/seed';
import { defaultMonth, MONTH_RE } from '@shared/engine/roster';
import type { Dataset, Roster } from '@shared/engine/types';
import { dbState } from '../db';
import { asyncHandler, HttpError } from '../middleware/http';
import { loadDataset, loadRosters, replaceDataset, replaceRosters } from '../services/dataset';

/**
 *   GET  /api/health          liveness + database state (used by the host's health check)
 *   GET  /api/bootstrap       everything the React app needs on load: { data, rosters }
 *   GET  /api/admin/export    full backup as JSON
 *   POST /api/admin/import    replace everything with a backup  { data, rosters }
 *   POST /api/admin/reset     restore the sample dataset         { month?: "YYYY-MM" }
 */
export function adminRouter(): Router {
  const r = Router();

  r.get('/health', (_req, res) => res.json({ ok: true, db: dbState(), time: new Date().toISOString() }));

  r.get(
    '/bootstrap',
    asyncHandler(async (_req, res) => {
      const [data, rosters] = await Promise.all([loadDataset(), loadRosters()]);
      res.json({ data, rosters });
    }),
  );

  r.get(
    '/admin/export',
    asyncHandler(async (_req, res) => {
      const [data, rosters] = await Promise.all([loadDataset(), loadRosters()]);
      res.setHeader('Content-Disposition', 'attachment; filename="embo-data.json"');
      res.json({ data, rosters });
    }),
  );

  r.post(
    '/admin/import',
    asyncHandler(async (req, res) => {
      const { data, rosters } = (req.body ?? {}) as { data?: Dataset; rosters?: Record<string, Roster> };
      if (!data?.employees || !data?.brandProcesses) throw new HttpError(400, 'Not an Embo export (missing data.employees / data.brandProcesses)');
      await replaceDataset(data);
      await replaceRosters(rosters ?? {});
      res.json({ data: await loadDataset(), rosters: await loadRosters() });
    }),
  );

  r.post(
    '/admin/reset',
    asyncHandler(async (req, res) => {
      const month = (req.body?.month as string | undefined) ?? defaultMonth();
      if (!MONTH_RE.test(month)) throw new HttpError(400, 'Month must look like 2026-12');
      await replaceDataset(createSampleData(month));
      await replaceRosters({});
      res.json({ data: await loadDataset(), rosters: {} });
    }),
  );

  return r;
}
