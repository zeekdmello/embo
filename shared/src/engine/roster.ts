import { shiftMonth, toISO } from './calendar';
import type { Cells } from './context';
import type { Roster } from './types';

/** Helpers for the Roster record that both the browser and the API server use. */

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month planners usually work on: next calendar month. */
export const defaultMonth = (today = new Date()) => shiftMonth(toISO(today).slice(0, 7), 1);

export function emptyRoster(month: string): Roster {
  return { month, cells: {}, status: 'DRAFT', version: 0, generatedAt: new Date().toISOString(), log: [] };
}

/** Adds a change-log entry; when new cells are given they replace the old ones and the version goes up. */
export function withLog(r: Roster, message: string, cells?: Cells): Roster {
  const afterPublish = r.status === 'PUBLISHED' || !!r.publishedAt;
  return {
    ...r,
    cells: cells ?? r.cells,
    version: cells ? r.version + 1 : r.version,
    log: [{ at: new Date().toISOString(), message, afterPublish }, ...r.log].slice(0, 200),
  };
}

export function countLocked(cells: Cells | undefined): number {
  if (!cells) return 0;
  let n = 0;
  for (const day of Object.values(cells)) for (const c of Object.values(day)) if (c.locked) n++;
  return n;
}
