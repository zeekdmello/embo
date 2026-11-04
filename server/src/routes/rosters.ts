import { Router } from 'express';
import { MONTH_RE } from '@shared/engine/roster';
import type { Roster } from '@shared/engine/types';
import { RosterModel } from '../models';
import { asyncHandler, HttpError } from '../middleware/http';
import { loadRosters, saveRoster } from '../services/dataset';
import * as rosters from '../services/rosters';

/**
 *   GET    /api/rosters                       all rosters (month → roster)
 *   GET    /api/rosters/:month                one month
 *   PUT    /api/rosters/:month                save (manual edits, applied fixes, publish)
 *   DELETE /api/rosters/:month                delete a month's roster
 *   POST   /api/rosters/:month/generate       run the scheduler   { freezeBefore?: "YYYY-MM-DD" }
 *   POST   /api/rosters/:month/repair         non-destructive repair after changes
 *   GET    /api/rosters/:month/issues         validation result (hard / soft / info)
 */
export function rostersRouter(): Router {
  const r = Router();

  r.param('month', (_req, _res, next, month: string) => {
    if (!MONTH_RE.test(month)) return next(new HttpError(400, 'Month must look like 2026-12'));
    next();
  });

  r.get('/', asyncHandler(async (_req, res) => res.json(await loadRosters())));

  r.get(
    '/:month',
    asyncHandler(async (req, res) => {
      const roster = await rosters.getRoster(req.params.month);
      if (!roster) throw new HttpError(404, `No roster for ${req.params.month}`);
      res.json(roster);
    }),
  );

  r.put(
    '/:month',
    asyncHandler(async (req, res) => {
      const body = req.body as Roster;
      if (!body || typeof body.cells !== 'object') throw new HttpError(400, 'Body must be a roster with cells');
      res.json(await saveRoster({ ...body, month: req.params.month }));
    }),
  );

  r.delete(
    '/:month',
    asyncHandler(async (req, res) => {
      await RosterModel.deleteOne({ _id: req.params.month });
      res.status(204).end();
    }),
  );

  r.post(
    '/:month/generate',
    asyncHandler(async (req, res) => {
      const freezeBefore = req.body?.freezeBefore as string | undefined;
      if (freezeBefore && !/^\d{4}-\d{2}-\d{2}$/.test(freezeBefore)) throw new HttpError(400, 'freezeBefore must be YYYY-MM-DD');
      res.json(await rosters.generate(req.params.month, freezeBefore));
    }),
  );

  r.post(
    '/:month/repair',
    asyncHandler(async (req, res) => {
      const out = await rosters.repair(req.params.month);
      if (!out) throw new HttpError(404, `No roster for ${req.params.month} — generate it first`);
      res.json(out);
    }),
  );

  r.get(
    '/:month/issues',
    asyncHandler(async (req, res) => {
      const out = await rosters.issues(req.params.month);
      if (!out) throw new HttpError(404, `No roster for ${req.params.month}`);
      res.json(out);
    }),
  );

  return r;
}
