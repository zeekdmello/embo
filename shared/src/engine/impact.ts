import { isBetween } from './calendar';
import { bpLabel, buildCtx, cloneCells, coverage, empName, type Cells } from './context';
import { repairRoster } from './generate';
import { validateWithCtx } from './validate';
import type { Dataset, ISODate, Issue, Leave, LeaveType } from './types';

export interface BrandImpact {
  brandProcessId: string;
  label: string;
  coOwners: string[]; // names of other primaries
  operatingDays: number; // days in the window this process needs people
  gapDaysNoAction: number; // days short if nothing is done
  gapDaysAfterRepair: number; // days still short after automatic repair
  verdict: 'OK' | 'BACKUP_NEEDED' | 'AT_RISK';
  explanation: string;
}

export interface ImpactReport {
  leave: Leave;
  perProcess: BrandImpact[];
  newIssuesNoAction: Issue[];
  remainingAfterRepair: Issue[];
  repairActions: string[];
  repairedCells: Cells;
  dataWithLeave: Dataset;
}

/**
 * "What if this person is unavailable?" — the change-handling simulator.
 * Compares three worlds: current roster, roster with the absence and no action, and after Repair.
 */
export function analyzeAbsence(
  data: Dataset,
  month: string,
  cells: Cells,
  employeeId: string,
  from: ISODate,
  to: ISODate,
  type: LeaveType = 'SICK',
): ImpactReport {
  const leave: Leave = { id: `lv-${Date.now()}`, employeeId, from, to, type, status: 'APPROVED', note: 'Added from change simulator' };
  const dataWithLeave: Dataset = { ...data, leaves: [...data.leaves, leave] };
  const ctx = buildCtx(dataWithLeave, month);

  const baseIssues = validateWithCtx(buildCtx(data, month), cells);
  const baseIds = new Set(baseIssues.map((i) => i.id));

  // world 2: absence applied, nobody reacts
  const noAction = cloneCells(cells);
  for (const d of ctx.dates) {
    if (!isBetween(d, from, to) || !noAction[d]?.[employeeId]) continue;
    noAction[d][employeeId] = { status: type === 'COMP_OFF' ? 'COMP_OFF' : 'LEAVE', covers: [], locked: false, source: 'MANUAL' };
  }
  const noActionIssues = validateWithCtx(ctx, noAction);
  // world 3: automatic repair (unlock the absent person's cells so leave can apply)
  const unlocked = cloneCells(cells);
  for (const d of ctx.dates) if (isBetween(d, from, to) && unlocked[d]?.[employeeId]) unlocked[d][employeeId].locked = false;
  const repaired = repairRoster(dataWithLeave, month, unlocked);
  const repairedIssues = validateWithCtx(ctx, repaired.cells);

  const window = ctx.dates.filter((d) => isBetween(d, from, to));
  const touched = new Set<string>(ctx.primariesOfEmp.get(employeeId) ?? []);
  for (const d of window) for (const b of cells[d]?.[employeeId]?.covers ?? []) touched.add(b);

  const perProcess: BrandImpact[] = [...touched].map((b) => {
    const opDays = window.filter((d) => ctx.req(b, d) > 0);
    const gapsNo = opDays.filter((d) => coverage(ctx, noAction, b, d).length < ctx.req(b, d)).length;
    const gapsRep = opDays.filter((d) => coverage(ctx, repaired.cells, b, d).length < ctx.req(b, d)).length;
    const coOwners = (ctx.primariesOfBp.get(b) ?? []).filter((p) => p !== employeeId).map((p) => empName(ctx, p));
    const verdict: BrandImpact['verdict'] = gapsNo === 0 ? 'OK' : gapsRep === 0 ? 'BACKUP_NEEDED' : 'AT_RISK';
    const explanation =
      verdict === 'OK'
        ? coOwners.length
          ? `${coOwners.join(', ')} can keep the minimum on every operating day.`
          : opDays.length
            ? 'Was only covering here; others already meet the minimum.'
            : 'Not operating during this window.'
        : verdict === 'BACKUP_NEEDED'
          ? `${coOwners.length ? `Remaining owners (${coOwners.join(', ')}) fall short on ${gapsNo} day(s)` : `Sole owner — ${gapsNo} operating day(s) uncovered`}; Repair fills them with trained backups.`
          : `${gapsRep} day(s) still uncovered after Repair — needs a manager decision.`;
    return {
      brandProcessId: b,
      label: bpLabel(ctx, b),
      coOwners,
      operatingDays: opDays.length,
      gapDaysNoAction: gapsNo,
      gapDaysAfterRepair: gapsRep,
      verdict,
      explanation,
    };
  });
  perProcess.sort((a, b) => b.gapDaysAfterRepair - a.gapDaysAfterRepair || b.gapDaysNoAction - a.gapDaysNoAction);

  return {
    leave,
    perProcess,
    newIssuesNoAction: noActionIssues.filter((i) => i.severity === 'HARD' && !baseIds.has(i.id)),
    remainingAfterRepair: repairedIssues.filter((i) => i.severity === 'HARD' && !baseIds.has(i.id)),
    repairActions: repaired.actions,
    repairedCells: repaired.cells,
    dataWithLeave,
  };
}
