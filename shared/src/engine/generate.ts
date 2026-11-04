import { monthWeeks, weekday } from './calendar';
import {
  buildCtx,
  canCover,
  cloneCells,
  coverage,
  responsibilities,
  type Cells,
  type Ctx,
} from './context';
import type { Cell, Dataset, ISODate } from './types';

/**
 * ROSTER GENERATOR — deterministic greedy construction + local repair.
 *
 *  1. Fixed facts first: locked/manual cells, frozen past days, approved leave & comp-offs.
 *  2. Public holidays: everyone gets the holiday, then the minimum number of primaries are
 *     pulled back to keep operating brand-processes covered (they earn a comp-off).
 *  3. Fill gaps caused by leave with trained backups.
 *  4. Weekly offs, week by week, most-constrained employees first. Every candidate day is
 *     scored: unfillable coverage gap (1000) ≫ max-consecutive breach (300) ≫ needs a backup (40)
 *     ≫ preference / fairness / clustering (≤ 12). If every day would leave a gap nobody can fill,
 *     the off is NOT placed and the validator reports it — we never silently drop coverage.
 *  5. Days on which all of a person's own brand-processes are closed become non-operating offs.
 *  6. Final gap fill and removal of covers that are no longer needed.
 */

const COST = {
  UNFILLABLE_GAP: 1000,
  CONSECUTIVE: 300,
  NEEDS_BACKUP: 40,
  CALL_IN: 30,
  NOT_PREFERRED: 25,
  COLLEAGUE_OFF: 6,
  WEEKEND_REPEAT: 4,
} as const;

interface Plan {
  ctx: Ctx;
  cells: Cells;
  isFixed: (d: ISODate, empId: string) => boolean;
  coverCount: Map<string, number>; // fairness: how often someone has covered this month
  holidaysWorked: Map<string, number>;
  weekendOffs: Map<string, number>;
  actions: string[];
}

const blankCell = (status: Cell['status'] = 'WORK'): Cell => ({ status, covers: [], locked: false, source: 'AUTO' });

export interface GenerateOptions {
  /** Existing roster cells; locked cells (and anything before `freezeBefore`) are kept as-is. */
  existing?: Cells;
  freezeBefore?: ISODate;
}

export function generateRoster(data: Dataset, month: string, opts: GenerateOptions = {}): Cells {
  const ctx = buildCtx(data, month);
  const cells: Cells = {};
  const fixed = new Set<string>();

  // 1. initial state
  for (const d of ctx.dates) {
    cells[d] = {};
    for (const e of ctx.employees) {
      const prev = opts.existing?.[d]?.[e.id];
      if (prev && (prev.locked || (opts.freezeBefore && d < opts.freezeBefore))) {
        cells[d][e.id] = { ...prev, covers: [...prev.covers] };
        fixed.add(d + e.id);
        continue;
      }
      const leave = ctx.approvedLeave(e.id, d);
      cells[d][e.id] = blankCell(leave ? (leave.type === 'COMP_OFF' ? 'COMP_OFF' : 'LEAVE') : 'WORK');
    }
  }

  const plan: Plan = {
    ctx,
    cells,
    isFixed: (d, e) => fixed.has(d + e),
    coverCount: new Map(),
    holidaysWorked: new Map(),
    weekendOffs: new Map(),
    actions: [],
  };
  countExisting(plan);

  // 2. public holidays
  for (const d of ctx.dates) if (ctx.holidays.has(d)) assignHoliday(plan, d);

  // 3. leave-induced gaps
  for (const d of ctx.dates) fillGapsOnDay(plan, d);

  // 4. weekly offs
  placeWeeklyOffs(plan);

  // 5. non-operating days
  markNonOperating(plan);

  // 6. final pass
  for (const d of ctx.dates) fillGapsOnDay(plan, d);
  pruneCovers(plan);
  return cells;
}

/**
 * REPAIR — the non-destructive "handle a change" path. Keeps the existing roster and only
 * touches what the change broke: syncs leave, drops invalid covers, fills gaps with backups,
 * moves weekly offs inside the same week if that closes a gap, re-places missing weekly offs.
 */
export function repairRoster(data: Dataset, month: string, existing: Cells, freezeBefore?: ISODate) {
  const ctx = buildCtx(data, month);
  const cells = cloneCells(existing);
  const plan: Plan = {
    ctx,
    cells,
    isFixed: (d, e) => !!cells[d]?.[e]?.locked || (!!freezeBefore && d < freezeBefore),
    coverCount: new Map(),
    holidaysWorked: new Map(),
    weekendOffs: new Map(),
    actions: [],
  };
  // make sure every active employee has a cell (new hires)
  for (const d of ctx.dates) {
    cells[d] ??= {};
    for (const e of ctx.employees) if (!cells[d][e.id]) cells[d][e.id] = blankCell();
  }
  countExisting(plan);

  for (const d of ctx.dates) {
    for (const e of ctx.employees) {
      if (plan.isFixed(d, e.id)) continue;
      const cell = cells[d][e.id];
      const leave = ctx.approvedLeave(e.id, d);
      if (leave) {
        const st = leave.type === 'COMP_OFF' ? 'COMP_OFF' : 'LEAVE';
        if (cell.status !== st) {
          cells[d][e.id] = blankCell(st);
          plan.actions.push(`${e.name}: ${d} set to ${st === 'LEAVE' ? 'leave' : 'comp-off'} (approved)`);
        }
      } else if (cell.status === 'LEAVE' || cell.status === 'COMP_OFF') {
        cells[d][e.id] = blankCell('WORK');
        plan.actions.push(`${e.name}: ${d} back to working (leave no longer approved)`);
      } else if (cell.status === 'HOLIDAY' && !ctx.holidays.has(d)) {
        cells[d][e.id] = blankCell('WORK');
      }
      // drop covers that are no longer valid
      const c = cells[d][e.id];
      if (c.covers.length) {
        c.covers = c.covers.filter((b) => c.status === 'WORK' && ctx.bp.has(b) && ctx.req(b, d) > 0);
      }
      // a non-operating off whose brand now operates becomes a working day again
      if (c.status === 'OFF' && c.offKind === 'NON_OPERATING') {
        const own = (ctx.primariesOfEmp.get(e.id) ?? []).filter((b) => ctx.req(b, d) > 0);
        if (own.length) cells[d][e.id] = blankCell('WORK');
      }
    }
  }
  for (const d of ctx.dates) if (ctx.holidays.has(d)) assignHoliday(plan, d, true);
  for (const d of ctx.dates) fillGapsOnDay(plan, d, true);
  for (const d of ctx.dates) moveOffsToCloseGaps(plan, d);
  placeWeeklyOffs(plan, true);
  markNonOperating(plan);
  for (const d of ctx.dates) fillGapsOnDay(plan, d, true);
  pruneCovers(plan);
  return { cells, actions: plan.actions };
}

// ───────────────────────── steps ─────────────────────────

function countExisting(plan: Plan) {
  const { ctx, cells } = plan;
  for (const d of ctx.dates) {
    const wd = weekday(d);
    for (const [empId, c] of Object.entries(cells[d])) {
      if (c.covers.length) inc(plan.coverCount, empId, c.covers.length);
      if (c.status === 'OFF' && (wd === 0 || wd === 6)) inc(plan.weekendOffs, empId);
      if (c.status === 'WORK' && ctx.holidays.has(d)) inc(plan.holidaysWorked, empId);
    }
  }
}

function inc(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function assignHoliday(plan: Plan, d: ISODate, keepWorkers = false) {
  const { ctx, cells } = plan;
  if (!keepWorkers) {
    for (const e of ctx.employees) {
      const c = cells[d][e.id];
      if (!plan.isFixed(d, e.id) && c.status === 'WORK') cells[d][e.id] = blankCell('HOLIDAY');
    }
  } else {
    // repair mode: anyone working a holiday they aren't needed on goes back to holiday
    for (const e of ctx.employees) {
      const c = cells[d][e.id];
      if (plan.isFixed(d, e.id) || c.status !== 'WORK') continue;
      const own = (ctx.primariesOfEmp.get(e.id) ?? []).filter((b) => ctx.req(b, d) > 0);
      if (!own.length && !c.covers.length) cells[d][e.id] = blankCell('HOLIDAY');
    }
  }
  const operating = [...ctx.bp.keys()].filter((b) => ctx.req(b, d) > 0);
  // fewest primaries first — most fragile coverage is secured first
  operating.sort((a, b) => (ctx.primariesOfBp.get(a)?.length ?? 0) - (ctx.primariesOfBp.get(b)?.length ?? 0));
  for (const b of operating) {
    let have = coverage(ctx, cells, b, d).length;
    const need = ctx.req(b, d);
    while (have < need) {
      const pool = (ctx.primariesOfBp.get(b) ?? [])
        .filter((p) => cells[d][p]?.status === 'HOLIDAY' && !plan.isFixed(d, p))
        .sort((x, y) => (plan.holidaysWorked.get(x) ?? 0) - (plan.holidaysWorked.get(y) ?? 0));
      if (!pool.length) break;
      cells[d][pool[0]] = blankCell('WORK');
      inc(plan.holidaysWorked, pool[0]);
      have = coverage(ctx, cells, b, d).length;
    }
  }
}

/** Fill every shortfall on a day with tier-1 backups (callIn = pull someone off a public holiday). */
function fillGapsOnDay(plan: Plan, d: ISODate, log = false): number {
  const { ctx } = plan;
  let unfilled = 0;
  const operating = [...ctx.bp.keys()].filter((b) => ctx.req(b, d) > 0);
  operating.sort((a, b) => (ctx.backupsOfBp.get(a)?.length ?? 0) - (ctx.backupsOfBp.get(b)?.length ?? 0));
  for (const b of operating) unfilled += fillBp(plan, plan.cells, b, d, log);
  return unfilled;
}

function fillBp(plan: Plan, cells: Cells, b: string, d: ISODate, log: boolean): number {
  const { ctx } = plan;
  let short = ctx.req(b, d) - coverage(ctx, cells, b, d).length;
  while (short > 0) {
    const options = (ctx.backupsOfBp.get(b) ?? [])
      .filter((e) => !plan.isFixed(d, e))
      .map((e) => ({ e, chk: canCover(ctx, cells, e, b, d, { allowCallIn: true }) }))
      .filter((o) => o.chk.ok)
      .map((o) => ({
        ...o,
        score:
          (o.chk.callIn ? 50 : 0) +
          (plan.coverCount.get(o.e) ?? 0) * 2 +
          responsibilities(ctx, cells, o.e, d).length * 3,
      }))
      .sort((x, y) => x.score - y.score);
    if (!options.length) break;
    const pick = options[0];
    const cell = cells[d][pick.e];
    if (pick.chk.callIn) cell.status = 'WORK';
    cell.covers.push(b);
    if (cells === plan.cells) {
      inc(plan.coverCount, pick.e);
      if (log) plan.actions.push(`${ctx.emp.get(pick.e)?.name} covers ${label(ctx, b)} on ${d}`);
    }
    short--;
  }
  return Math.max(0, short);
}

const label = (ctx: Ctx, b: string) => {
  const bp = ctx.bp.get(b)!;
  return `${ctx.brand.get(bp.brandId)?.name} ${ctx.process.get(bp.processId)?.code}`;
};

/** Constraint score: how hard is it to give this person a day off? Higher = schedule first. */
function constraintScore(ctx: Ctx, empId: string, week: ISODate[]): number {
  let s = 0;
  for (const b of ctx.primariesOfEmp.get(empId) ?? []) {
    const people = (ctx.primariesOfBp.get(b)?.length ?? 1) + (ctx.backupsOfBp.get(b)?.length ?? 0) * 0.5;
    for (const d of week) s += ctx.req(b, d) / people;
  }
  return s;
}

function placeWeeklyOffs(plan: Plan, log = false) {
  const { ctx, cells } = plan;
  const minDays = ctx.data.settings.minDaysInWeekForOff;
  for (const week of monthWeeks(ctx.month)) {
    if (week.length < minDays) continue;
    // urgency first (whose max-consecutive deadline falls in this week), then most constrained
    const deadline = (empId: string) => {
      let i = ctx.dates.indexOf(week[0]) - 1;
      while (i >= 0 && cells[ctx.dates[i]][empId].status === 'WORK') i--;
      return i + ctx.data.settings.maxConsecutiveDays + 1; // index of the last day an off can fall on
    };
    const order = [...ctx.employees].sort(
      (a, b) =>
        deadline(a.id) - deadline(b.id) ||
        constraintScore(ctx, b.id, week) - constraintScore(ctx, a.id, week) ||
        a.name.localeCompare(b.name),
    );
    for (const e of order) {
      const offs = week.filter((d) => cells[d][e.id].status === 'OFF').length;
      let need = Math.max(0, e.weeklyOffs - offs);
      while (need > 0) {
        // public holidays are never used as weekly offs (the holiday is a separate entitlement)
        const candidates = week.filter(
          (d) => cells[d][e.id].status === 'WORK' && !plan.isFixed(d, e.id) && !ctx.holidays.has(d),
        );
        if (!candidates.length) break;
        let best: { d: ISODate; cost: number } | null = null;
        for (const d of candidates) {
          const cost = offCost(plan, e.id, d, week);
          if (!best || cost < best.cost) best = { d, cost };
        }
        if (!best || best.cost >= COST.UNFILLABLE_GAP) break; // reported by validator
        placeOff(plan, e.id, best.d);
        if (log) plan.actions.push(`${e.name}: weekly off placed on ${best.d}`);
        need--;
      }
    }
  }
  fixLongRuns(plan, log);
}

/**
 * Second pass for the max-consecutive-days rule (it spans week boundaries, so the weekly pass
 * can't always see it). For each streak that is too long, move that week's off into the streak,
 * or add an extra rest day if moving would just create another long streak.
 */
function fixLongRuns(plan: Plan, log: boolean) {
  const { ctx, cells } = plan;
  const max = ctx.data.settings.maxConsecutiveDays;
  const weeks = monthWeeks(ctx.month);
  for (const e of ctx.employees) {
    for (let guard = 0; guard < 10; guard++) {
      // find first streak > max
      let run: ISODate[] = [];
      let bad: ISODate[] | null = null;
      for (const d of ctx.dates) {
        if (cells[d][e.id].status === 'WORK') {
          run.push(d);
          if (run.length > max) bad = run;
        } else {
          if (bad) break;
          run = [];
        }
      }
      if (!bad) break;
      const streak = bad;
      // candidate days inside the streak that would split it into legal pieces
      let best: { d: ISODate; cost: number } | null = null;
      for (let i = 0; i < streak.length; i++) {
        const d = streak[i];
        if (plan.isFixed(d, e.id) || ctx.holidays.has(d)) continue;
        if (i > max || streak.length - i - 1 > max) continue; // must split into ≤ max pieces
        const week = weeks.find((w) => w.includes(d))!;
        const cost = offCost(plan, e.id, d, week);
        if (!best || cost < best.cost) best = { d, cost };
      }
      if (!best || best.cost >= COST.UNFILLABLE_GAP) break; // validator will report it
      const week = weeks.find((w) => w.includes(best!.d))!;
      placeOff(plan, e.id, best.d);
      if (log) plan.actions.push(`${e.name}: rest day added on ${best.d} (max ${max} consecutive days)`);
      // drop the now-redundant weekly off in the same week if that doesn't create a new long streak
      const other = week.find(
        (d) => d !== best!.d && cells[d][e.id].status === 'OFF' && cells[d][e.id].offKind === 'WEEKLY' && !plan.isFixed(d, e.id),
      );
      if (other) {
        cells[other][e.id] = blankCell('WORK');
        if (longestRun(ctx, cells, e.id) > max) cells[other][e.id] = { ...blankCell('OFF'), offKind: 'WEEKLY' };
      }
    }
  }
}

function longestRun(ctx: Ctx, cells: Cells, empId: string): number {
  let best = 0;
  let run = 0;
  for (const d of ctx.dates) {
    run = cells[d][empId].status === 'WORK' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Score giving `empId` a weekly off on `d`. Simulates the day with backups filled in. */
function offCost(plan: Plan, empId: string, d: ISODate, week: ISODate[]): number {
  const { ctx, cells } = plan;
  const e = ctx.emp.get(empId)!;
  const affected = responsibilities(ctx, cells, empId, d);
  let cost = 0;
  if (affected.length) {
    const trial: Cells = { [d]: {} };
    for (const [k, c] of Object.entries(cells[d])) trial[d][k] = { ...c, covers: [...c.covers] };
    trial[d][empId] = { ...blankCell('OFF'), offKind: 'WEEKLY' };
    const workingBefore = Object.values(trial[d]).filter((c) => c.status === 'WORK').length;
    for (const b of affected) {
      const short = ctx.req(b, d) - coverage(ctx, trial, b, d).length;
      if (short <= 0) continue;
      const unfilled = fillBp(plan, trial, b, d, false);
      cost += unfilled * COST.UNFILLABLE_GAP + (short - unfilled) * COST.NEEDS_BACKUP;
    }
    const callIns = Object.values(trial[d]).filter((c) => c.status === 'WORK').length - workingBefore;
    cost += Math.max(0, callIns) * COST.CALL_IN;
  }
  // consecutive working days before this off
  let run = 0;
  for (let i = ctx.dates.indexOf(d) - 1; i >= 0 && cells[ctx.dates[i]][empId].status === 'WORK'; i--) run++;
  if (run > ctx.data.settings.maxConsecutiveDays) cost += COST.CONSECUTIVE;
  // run after this off up to the end of next week (approximation: rest of month is still mostly WORK)
  const wd = weekday(d);
  if (e.preferredOffDays.length && !e.preferredOffDays.includes(wd)) cost += COST.NOT_PREFERRED;
  if (wd === 0 || wd === 6) cost += (plan.weekendOffs.get(empId) ?? 0) * COST.WEEKEND_REPEAT;
  // colleagues on the same brand-process already off that day → spread offs
  const mine = new Set(ctx.primariesOfEmp.get(empId) ?? []);
  for (const b of mine) {
    for (const other of ctx.primariesOfBp.get(b) ?? []) {
      if (other !== empId && cells[d][other]?.status === 'OFF') cost += COST.COLLEAGUE_OFF;
    }
  }
  // tiny deterministic rotation so independent people don't all get the same day
  cost += ((week.indexOf(d) + ctx.employees.findIndex((x) => x.id === empId)) % 7) * 0.01;
  return cost;
}

function placeOff(plan: Plan, empId: string, d: ISODate) {
  const { ctx, cells } = plan;
  const affected = responsibilities(ctx, cells, empId, d);
  cells[d][empId] = { ...blankCell('OFF'), offKind: 'WEEKLY' };
  const wd = weekday(d);
  if (wd === 0 || wd === 6) inc(plan.weekendOffs, empId);
  for (const b of affected) fillBp(plan, cells, b, d, false);
}

/** Repair helper: a primary on weekly off can swap the off to another day of the same week. */
function moveOffsToCloseGaps(plan: Plan, d: ISODate) {
  const { ctx, cells } = plan;
  const week = monthWeeks(ctx.month).find((w) => w.includes(d)) ?? [d];
  for (const b of ctx.bp.keys()) {
    const need = ctx.req(b, d);
    if (!need || coverage(ctx, cells, b, d).length >= need) continue;
    const primaries = ctx.primariesOfBp.get(b) ?? [];
    for (const p of [...primaries, ...(ctx.backupsOfBp.get(b) ?? [])]) {
      const c = cells[d][p];
      if (!c || c.status !== 'OFF' || c.offKind !== 'WEEKLY' || plan.isFixed(d, p)) continue;
      // put them back to work on d (as owner, or as backup covering b), then find another off day
      cells[d][p] = blankCell('WORK');
      if (!primaries.includes(p)) {
        if (!canCover(ctx, cells, p, b, d).ok) {
          cells[d][p] = { ...blankCell('OFF'), offKind: 'WEEKLY' };
          continue;
        }
        cells[d][p].covers.push(b);
      }
      let best: { d: ISODate; cost: number } | null = null;
      for (const alt of week) {
        if (alt === d || cells[alt][p].status !== 'WORK' || plan.isFixed(alt, p) || ctx.holidays.has(alt)) continue;
        const cost = offCost(plan, p, alt, week);
        if (!best || cost < best.cost) best = { d: alt, cost };
      }
      if (best && best.cost < COST.UNFILLABLE_GAP) {
        placeOff(plan, p, best.d);
        plan.actions.push(`${ctx.emp.get(p)?.name}: weekly off moved ${d} → ${best.d} to cover ${label(ctx, b)}`);
        if (coverage(ctx, cells, b, d).length >= need) break;
      } else {
        cells[d][p] = { ...blankCell('OFF'), offKind: 'WEEKLY' }; // undo
      }
    }
    if (coverage(ctx, cells, b, d).length >= need) continue;
    // chain move: a backup X is busy covering for owner P whose weekly off is today.
    // Move P's off to another day so X is free to cover b.
    for (const x of ctx.backupsOfBp.get(b) ?? []) {
      const xc = cells[d][x];
      if (!xc || xc.status !== 'WORK' || plan.isFixed(d, x)) continue;
      for (const c of [...xc.covers]) {
        const owner = (ctx.primariesOfBp.get(c) ?? []).find(
          (o) => cells[d][o]?.status === 'OFF' && cells[d][o].offKind === 'WEEKLY' && !plan.isFixed(d, o),
        );
        if (!owner) continue;
        const snapshot = cloneCells({ [d]: cells[d] })[d];
        const cur = cells[d][x];
        if (!cur.covers.includes(c)) continue;
        cells[d][owner] = blankCell('WORK');
        const ownerBusy = new Set(responsibilities(ctx, cells, owner, d));
        cur.covers = cur.covers.filter((k) => !ownerBusy.has(k));
        let ok = canCover(ctx, cells, x, b, d).ok;
        let best: { d: ISODate; cost: number } | null = null;
        if (ok) {
          cur.covers.push(b);
          for (const alt of week) {
            if (alt === d || cells[alt][owner].status !== 'WORK' || plan.isFixed(alt, owner) || ctx.holidays.has(alt)) continue;
            const cost = offCost(plan, owner, alt, week);
            if (!best || cost < best.cost) best = { d: alt, cost };
          }
          ok = !!best && best.cost < COST.UNFILLABLE_GAP;
        }
        if (ok && best) {
          placeOff(plan, owner, best.d);
          plan.actions.push(
            `${ctx.emp.get(owner)?.name}: weekly off moved ${d} → ${best.d} so ${ctx.emp.get(x)?.name} can cover ${label(ctx, b)}`,
          );
          break;
        }
        cells[d] = snapshot; // undo
      }
      if (coverage(ctx, cells, b, d).length >= need) break;
    }
  }
}

function markNonOperating(plan: Plan) {
  const { ctx, cells } = plan;
  for (const e of ctx.employees) {
    const own = ctx.primariesOfEmp.get(e.id) ?? [];
    if (!own.length) continue; // floaters stay available
    for (const d of ctx.dates) {
      const c = cells[d][e.id];
      if (c.status !== 'WORK' || plan.isFixed(d, e.id) || ctx.holidays.has(d)) continue;
      if (responsibilities(ctx, cells, e.id, d).length === 0) {
        cells[d][e.id] = { ...blankCell('OFF'), offKind: 'NON_OPERATING' };
      }
    }
  }
}

/** Remove backup covers that are no longer needed (coverage already met without them). */
function pruneCovers(plan: Plan) {
  const { ctx, cells } = plan;
  for (const d of ctx.dates) {
    for (const [empId, c] of Object.entries(cells[d])) {
      if (!c.covers.length || plan.isFixed(d, empId)) continue;
      for (const b of [...c.covers]) {
        if (coverage(ctx, cells, b, d).length - 1 >= ctx.req(b, d)) {
          c.covers = c.covers.filter((x) => x !== b);
        }
      }
      // someone called in from a holiday who no longer covers anything goes back on holiday
      if (ctx.holidays.has(d) && c.status === 'WORK' && !c.covers.length) {
        const own = (ctx.primariesOfEmp.get(empId) ?? []).filter((b) => ctx.req(b, d) > 0);
        const neededOwn = own.some((b) => coverage(ctx, cells, b, d).length - 1 < ctx.req(b, d));
        if (!neededOwn && !own.length) cells[d][empId] = blankCell('HOLIDAY');
      }
    }
  }
}
