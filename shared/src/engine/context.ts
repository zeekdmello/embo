import { daysInMonth, requiredStaff, isBetween } from './calendar';
import type { Brand, BrandProcess, Cell, Dataset, Employee, ISODate, Leave, Pod, Process, Shift } from './types';

export type Cells = Record<ISODate, Record<string, Cell>>;

/**
 * Pre-computed indexes over a dataset for one month.
 * Built once per generate/validate call so every lookup is O(1).
 */
export interface Ctx {
  data: Dataset;
  month: string;
  dates: ISODate[];
  holidays: Map<ISODate, string>;
  employees: Employee[]; // active only
  emp: Map<string, Employee>;
  bp: Map<string, BrandProcess>;
  brand: Map<string, Brand>;
  process: Map<string, Process>;
  pod: Map<string, Pod>;
  primariesOfEmp: Map<string, string[]>;
  backupsOfEmp: Map<string, string[]>;
  primariesOfBp: Map<string, string[]>;
  backupsOfBp: Map<string, string[]>;
  req: (bpId: string, d: ISODate) => number;
  approvedLeave: (empId: string, d: ISODate) => Leave | undefined;
  pendingLeave: (empId: string, d: ISODate) => Leave | undefined;
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

export function buildCtx(data: Dataset, month: string): Ctx {
  const employees = data.employees.filter((e) => e.active);
  const emp = new Map(employees.map((e) => [e.id, e]));
  const bp = new Map(data.brandProcesses.map((b) => [b.id, b]));
  const primariesOfEmp = new Map<string, string[]>();
  const backupsOfEmp = new Map<string, string[]>();
  const primariesOfBp = new Map<string, string[]>();
  const backupsOfBp = new Map<string, string[]>();
  for (const a of data.assignments) {
    if (!emp.has(a.employeeId) || !bp.has(a.brandProcessId)) continue;
    if (a.type === 'PRIMARY') {
      push(primariesOfEmp, a.employeeId, a.brandProcessId);
      push(primariesOfBp, a.brandProcessId, a.employeeId);
    } else {
      push(backupsOfEmp, a.employeeId, a.brandProcessId);
      push(backupsOfBp, a.brandProcessId, a.employeeId);
    }
  }
  const holidays = new Map(data.holidays.map((h) => [h.date, h.name]));
  const reqMemo = new Map<string, number>();
  const req = (bpId: string, d: ISODate) => {
    const key = bpId + d;
    let v = reqMemo.get(key);
    if (v === undefined) {
      const b = bp.get(bpId);
      v = b ? requiredStaff(b, d, holidays.has(d)) : 0;
      reqMemo.set(key, v);
    }
    return v;
  };
  const leavesByEmp = new Map<string, Leave[]>();
  for (const l of data.leaves) {
    const arr = leavesByEmp.get(l.employeeId) ?? [];
    arr.push(l);
    leavesByEmp.set(l.employeeId, arr);
  }
  const findLeave = (status: Leave['status']) => (empId: string, d: ISODate) =>
    (leavesByEmp.get(empId) ?? []).find((l) => l.status === status && isBetween(d, l.from, l.to));

  return {
    data,
    month,
    dates: daysInMonth(month),
    holidays,
    employees,
    emp,
    bp,
    brand: new Map(data.brands.map((b) => [b.id, b])),
    process: new Map(data.processes.map((p) => [p.id, p])),
    pod: new Map(data.pods.map((p) => [p.id, p])),
    primariesOfEmp,
    backupsOfEmp,
    primariesOfBp,
    backupsOfBp,
    req,
    approvedLeave: findLeave('APPROVED'),
    pendingLeave: findLeave('PENDING'),
  };
}

export function bpLabel(ctx: Ctx, bpId: string): string {
  const b = ctx.bp.get(bpId);
  if (!b) return 'Unknown process';
  return `${ctx.brand.get(b.brandId)?.name ?? '?'} · ${ctx.process.get(b.processId)?.code ?? '?'}`;
}

export function empName(ctx: Ctx, empId: string): string {
  return ctx.emp.get(empId)?.name ?? ctx.data.employees.find((e) => e.id === empId)?.name ?? 'Unknown';
}

export function getCell(cells: Cells, d: ISODate, empId: string): Cell | undefined {
  return cells[d]?.[empId];
}

/** Brand-processes this person is actually responsible for on a date (own operating work + covers). */
export function responsibilities(ctx: Ctx, cells: Cells, empId: string, d: ISODate): string[] {
  const cell = getCell(cells, d, empId);
  if (!cell || cell.status !== 'WORK') return [];
  const own = (ctx.primariesOfEmp.get(empId) ?? []).filter((b) => ctx.req(b, d) > 0);
  const covers = cell.covers.filter((b) => !own.includes(b) && ctx.bp.has(b));
  return [...own, ...covers];
}

/** Employees counted as working on a brand-process on a date. */
export function coverage(ctx: Ctx, cells: Cells, bpId: string, d: ISODate): string[] {
  const out: string[] = [];
  const day = cells[d] ?? {};
  for (const empId of ctx.primariesOfBp.get(bpId) ?? []) {
    if (day[empId]?.status === 'WORK') out.push(empId);
  }
  for (const [empId, cell] of Object.entries(day)) {
    if (cell.status === 'WORK' && cell.covers.includes(bpId) && !out.includes(empId) && ctx.emp.has(empId)) out.push(empId);
  }
  return out;
}

export function shiftsOf(ctx: Ctx, bpIds: string[]): Set<Shift> {
  return new Set(bpIds.map((b) => ctx.bp.get(b)?.shift ?? 'GENERAL'));
}

/**
 * Eligibility tier of an employee to cover a brand-process:
 * 1 = explicit BACKUP assignment (trained)
 * 2 = cross-trained: works the same brand on another process, or the same process for another brand in the same pod
 * 0 = not eligible
 */
export function coverTier(ctx: Ctx, empId: string, bpId: string): 0 | 1 | 2 {
  if ((ctx.backupsOfEmp.get(empId) ?? []).includes(bpId)) return 1;
  const target = ctx.bp.get(bpId);
  const e = ctx.emp.get(empId);
  if (!target || !e) return 0;
  const targetBrand = ctx.brand.get(target.brandId);
  for (const own of ctx.primariesOfEmp.get(empId) ?? []) {
    const b = ctx.bp.get(own);
    if (!b) continue;
    if (b.brandId === target.brandId) return 2;
    if (b.processId === target.processId && targetBrand && e.podId === targetBrand.podId) return 2;
  }
  return 0;
}

export interface CoverCheck {
  ok: boolean;
  tier: 0 | 1 | 2;
  callIn: boolean;
  reason?: string;
}

/** Can `empId` take on `bpId` on date `d` without breaking a hard rule? */
export function canCover(
  ctx: Ctx,
  cells: Cells,
  empId: string,
  bpId: string,
  d: ISODate,
  opts: { allowTier2?: boolean; allowCallIn?: boolean } = {},
): CoverCheck {
  const tier = coverTier(ctx, empId, bpId);
  const fail = (reason: string, callIn = false): CoverCheck => ({ ok: false, tier, callIn, reason });
  if ((ctx.primariesOfBp.get(bpId) ?? []).includes(empId)) return fail('already a primary on this process');
  if (tier === 0) return fail('not trained on this brand/process');
  if (tier === 2 && !opts.allowTier2) return fail('cross-trained only (no backup assignment)');
  const cell = getCell(cells, d, empId);
  if (!cell) return fail('not on roster');
  let callIn = false;
  if (cell.status !== 'WORK') {
    if (cell.status === 'HOLIDAY' && opts.allowCallIn && !cell.locked) callIn = true;
    else return fail(`is ${statusWord(cell.status, cell.offKind)} that day`);
  }
  if (cell.covers.includes(bpId)) return fail('already covering it');
  const current = callIn
    ? (ctx.primariesOfEmp.get(empId) ?? []).filter((b) => ctx.req(b, d) > 0)
    : responsibilities(ctx, cells, empId, d);
  if (current.length + 1 > ctx.data.settings.maxResponsibilitiesPerDay)
    return fail(`would exceed ${ctx.data.settings.maxResponsibilitiesPerDay} responsibilities that day`, callIn);
  const shifts = shiftsOf(ctx, [...current, bpId]);
  if (shifts.size > 1) return fail(`shift clash (${[...shifts].join(' vs ')})`, callIn);
  return { ok: true, tier, callIn };
}

export function statusWord(s: Cell['status'], offKind?: Cell['offKind']): string {
  switch (s) {
    case 'WORK':
      return 'working';
    case 'OFF':
      return offKind === 'NON_OPERATING' ? 'off (own brands closed)' : 'on weekly off';
    case 'LEAVE':
      return 'on leave';
    case 'COMP_OFF':
      return 'on comp-off';
    case 'HOLIDAY':
      return 'on public holiday';
  }
}

export function cloneCells(cells: Cells): Cells {
  const out: Cells = {};
  for (const [d, day] of Object.entries(cells)) {
    const nd: Record<string, Cell> = {};
    for (const [e, c] of Object.entries(day)) nd[e] = { ...c, covers: [...c.covers] };
    out[d] = nd;
  }
  return out;
}
