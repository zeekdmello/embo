import { generateRoster, repairRoster } from '@shared/engine/generate';
import { countLocked, emptyRoster, withLog } from '@shared/engine/roster';
import type { ISODate, Roster } from '@shared/engine/types';
import { summarize, validateRoster } from '@shared/engine/validate';
import { RosterModel } from '../models';
import { loadDataset, rosterFromDoc, saveRoster } from './dataset';

/**
 * Server-side roster actions. The same pure engine (in /shared) runs here as in the browser,
 * so the database always holds rosters produced by the real scheduler.
 */

export async function getRoster(month: string): Promise<Roster | null> {
  const doc = await RosterModel.findById(month).lean();
  return doc ? rosterFromDoc(doc as Record<string, unknown>) : null;
}

export async function generate(month: string, freezeBefore?: ISODate) {
  const data = await loadDataset();
  const prev = await getRoster(month);
  const cells = generateRoster(data, month, { existing: prev?.cells, freezeBefore });
  const base = prev ?? emptyRoster(month);
  const message = freezeBefore
    ? `Re-planned from ${freezeBefore} onwards (earlier days and locked cells kept)`
    : prev
      ? `Roster regenerated (${countLocked(prev.cells)} locked cells kept)`
      : 'Roster generated';
  const roster = await saveRoster(withLog({ ...base, generatedAt: new Date().toISOString() }, message, cells));
  return { roster, summary: summarize(validateRoster(data, month, cells)) };
}

export async function repair(month: string) {
  const data = await loadDataset();
  const prev = await getRoster(month);
  if (!prev) return null;
  const res = repairRoster(data, month, prev.cells);
  const head = res.actions.slice(0, 6).join('; ');
  const more = res.actions.length > 6 ? ` (+${res.actions.length - 6} more)` : '';
  const roster = await saveRoster(withLog(prev, `Repair: ${res.actions.length ? head + more : 'nothing to change'}`, res.cells));
  return { roster, actions: res.actions, summary: summarize(validateRoster(data, month, res.cells)) };
}

export async function issues(month: string) {
  const data = await loadDataset();
  const roster = await getRoster(month);
  if (!roster) return null;
  const list = validateRoster(data, month, roster.cells);
  return { summary: summarize(list), issues: list };
}
