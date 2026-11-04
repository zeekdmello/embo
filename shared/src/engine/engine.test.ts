import { describe, expect, it } from 'vitest';
import { createSampleData } from '../data/seed';
import { daysInMonth, monthWeeks, operates, requiredStaff } from './calendar';
import { buildCtx, coverage, cloneCells } from './context';
import { generateRoster, repairRoster } from './generate';
import { analyzeAbsence } from './impact';
import { suggestFixes } from './suggest';
import { validateRoster } from './validate';
import type { BrandProcess } from './types';

const MONTHS = ['2026-11', '2026-12', '2027-01', '2027-03'];

describe('calendar rules', () => {
  it('distinguishes the four operating calendars', () => {
    const sun = '2026-12-06';
    const ph = '2026-12-25'; // Friday, Christmas
    const tue = '2026-12-01';
    expect(operates({ mode: 'ALL_DAYS' }, ph, true)).toBe(true);
    expect(operates({ mode: 'NO_PH' }, ph, true)).toBe(false);
    expect(operates({ mode: 'NO_PH' }, sun, false)).toBe(true);
    expect(operates({ mode: 'NO_SUN_NO_PH' }, sun, false)).toBe(false);
    expect(operates({ mode: 'NO_SUN_NO_PH' }, tue, false)).toBe(true);
    expect(operates({ mode: 'CUSTOM', weekdays: [1, 2, 3, 4, 5], holidaysOff: true }, ph, true)).toBe(false);
    expect(operates({ mode: 'CUSTOM', weekdays: [5], holidaysOff: false }, ph, true)).toBe(true);
  });

  it('applies weekday and date minimum overrides', () => {
    const bp: BrandProcess = {
      id: 'x', brandId: 'b', processId: 'CS', shift: 'GENERAL', rule: { mode: 'ALL_DAYS' },
      minStaff: 1, weekdayMin: { 1: 2 }, dateMin: { '2026-12-02': 3 },
    };
    expect(requiredStaff(bp, '2026-12-07', false)).toBe(2); // Monday
    expect(requiredStaff(bp, '2026-12-02', false)).toBe(3); // date override
    expect(requiredStaff(bp, '2026-12-03', false)).toBe(1);
  });

  it('splits months into Mon–Sun weeks', () => {
    const w = monthWeeks('2026-11'); // Nov 1 2026 is a Sunday
    expect(w[0]).toEqual(['2026-11-01']);
    expect(w[1][0]).toBe('2026-11-02');
    expect(w.flat()).toHaveLength(30);
  });
});

describe('sample dataset', () => {
  it('matches the brief: ≥30 employees, ~80% single-owner brands, multi-owner brands with 2–3 people', () => {
    const data = createSampleData('2026-12');
    expect(data.employees.length).toBeGreaterThanOrEqual(30);
    const ownersPerBrand = data.brands.map((b) => {
      const bps = data.brandProcesses.filter((x) => x.brandId === b.id).map((x) => x.id);
      return new Set(data.assignments.filter((a) => a.type === 'PRIMARY' && bps.includes(a.brandProcessId)).map((a) => a.employeeId)).size;
    });
    const single = ownersPerBrand.filter((n) => n === 1).length;
    expect(single / data.brands.length).toBeCloseTo(0.8, 1);
    expect(ownersPerBrand.filter((n) => n > 1).every((n) => n >= 2 && n <= 3)).toBe(true);
  });
});

describe('generator', () => {
  for (const month of MONTHS) {
    it(`${month}: every gap is reported and only the designed conflicts remain`, () => {
      const data = createSampleData(month);
      const cells = generateRoster(data, month);
      const issues = validateRoster(data, month, cells);
      const ctx = buildCtx(data, month);

      // the validator must report exactly the real coverage gaps — nothing silent
      const realGaps: string[] = [];
      for (const d of ctx.dates)
        for (const b of ctx.bp.keys()) if (coverage(ctx, cells, b, d).length < ctx.req(b, d)) realGaps.push(`${d}|${b}`);
      const reported = issues.filter((i) => i.code === 'COVERAGE_GAP').map((i) => `${i.date}|${i.brandProcessId}`);
      expect(reported.sort()).toEqual(realGaps.sort());

      // the only uncovered work is Trailblaze on the 15th (owner + only backup both on leave)
      for (const g of realGaps) {
        expect(g.startsWith(`${month}-15|trailblaze`)).toBe(true);
      }
      // these hard rules are never broken by the generator itself
      for (const code of ['SHIFT_CONFLICT', 'OVERLOAD', 'LEAVE_CONFLICT', 'INVALID_COVER', 'MAX_CONSECUTIVE', 'COMP_OFF_BALANCE']) {
        expect(issues.filter((i) => i.code === code)).toEqual([]);
      }
    });
  }

  it('honours approved leave and fills sole-owner gaps with trained backups', () => {
    const month = '2026-12';
    const data = createSampleData(month);
    const cells = generateRoster(data, month);
    const ctx = buildCtx(data, month);
    for (const d of ['2026-12-07', '2026-12-08', '2026-12-09']) {
      expect(cells[d].dev.status).toBe('LEAVE');
      const who = coverage(ctx, cells, 'voltride-cs', d);
      expect(who.length).toBe(1);
      expect(['farah', 'vikram']).toContain(who[0]);
    }
  });

  it('gives holidays to people whose brands close, keeps 365-day brands staffed', () => {
    const month = '2026-12';
    const data = createSampleData(month);
    const cells = generateRoster(data, month);
    const ctx = buildCtx(data, month);
    expect(cells['2026-12-25'].ananya.status).toBe('HOLIDAY'); // Crumb is closed on holidays
    expect(coverage(ctx, cells, 'bloom-cs', '2026-12-25').length).toBeGreaterThanOrEqual(1); // 365-day brand
  });

  it('respects multi-person minimums (PureSip CS needs 2 people)', () => {
    const month = '2026-12';
    const data = createSampleData(month);
    const cells = generateRoster(data, month);
    const ctx = buildCtx(data, month);
    for (const d of daysInMonth(month)) {
      expect(coverage(ctx, cells, 'puresip-cs', d).length).toBeGreaterThanOrEqual(ctx.req('puresip-cs', d));
    }
  });

  it('keeps locked manual edits when regenerating', () => {
    const month = '2026-12';
    const data = createSampleData(month);
    const first = generateRoster(data, month);
    const edited = cloneCells(first);
    edited['2026-12-10'].rohan = { status: 'OFF', offKind: 'WEEKLY', covers: [], locked: true, source: 'MANUAL' };
    const again = generateRoster(data, month, { existing: edited });
    expect(again['2026-12-10'].rohan).toMatchObject({ status: 'OFF', locked: true });
  });
});

describe('validator & change handling', () => {
  it('flags a coverage gap created by a manual edit', () => {
    const month = '2026-12';
    const data = createSampleData(month);
    const cells = generateRoster(data, month);
    const d = '2026-12-03';
    // Rohan is the sole owner of Bloom Botanics; take him off and strip any cover
    cells[d].rohan = { status: 'OFF', offKind: 'WEEKLY', covers: [], locked: true, source: 'MANUAL' };
    for (const c of Object.values(cells[d])) c.covers = c.covers.filter((b) => !b.startsWith('bloom'));
    const issues = validateRoster(data, month, cells);
    expect(issues.some((i) => i.code === 'COVERAGE_GAP' && i.brandProcessId === 'bloom-cs' && i.date === d)).toBe(true);
  });

  it('sole owner unavailable → gaps identified, Repair fills them with backups', () => {
    const month = '2026-12';
    const data = createSampleData(month);
    const cells = generateRoster(data, month);
    const r = analyzeAbsence(data, month, cells, 'aman', '2026-12-02', '2026-12-03');
    expect(r.newIssuesNoAction.some((i) => i.code === 'COVERAGE_GAP')).toBe(true);
    const lumenCs = r.perProcess.find((p) => p.brandProcessId === 'lumen-cs')!;
    expect(lumenCs.verdict).toBe('BACKUP_NEEDED');
    expect(lumenCs.gapDaysAfterRepair).toBe(0);
    expect(r.remainingAfterRepair.filter((i) => i.code === 'COVERAGE_GAP')).toEqual([]);
  });

  it('one of several owners unavailable → evaluates whether the rest can cover', () => {
    const month = '2026-12';
    const data = createSampleData(month);
    const cells = generateRoster(data, month);
    // Hearth & Hive CS has 2 owners (Gaurav, Isha) and needs 2 on Mondays
    const r = analyzeAbsence(data, month, cells, 'gaurav', '2026-12-07', '2026-12-08'); // Mon + Tue
    const cs = r.perProcess.find((p) => p.brandProcessId === 'hearthhive-cs')!;
    expect(cs.coOwners).toContain('Isha Dutta');
    expect(cs.gapDaysAfterRepair).toBe(0);
  });

  it('repair applies newly approved leave without regenerating everything', () => {
    const month = '2026-12';
    const data = createSampleData(month);
    const cells = generateRoster(data, month);
    const withLeave = { ...data, leaves: [...data.leaves, { id: 'n', employeeId: 'sneha', from: '2026-12-17', to: '2026-12-17', type: 'SICK' as const, status: 'APPROVED' as const }] };
    expect(validateRoster(withLeave, month, cells).some((i) => i.code === 'LEAVE_CONFLICT')).toBe(true);
    const { cells: fixed } = repairRoster(withLeave, month, cells);
    expect(fixed['2026-12-17'].sneha.status).toBe('LEAVE');
    const after = validateRoster(withLeave, month, fixed);
    expect(after.some((i) => i.code === 'LEAVE_CONFLICT')).toBe(false);
    expect(after.some((i) => i.code === 'COVERAGE_GAP' && i.brandProcessId?.startsWith('urbanthread'))).toBe(false);
    // untouched days stay identical
    expect(fixed['2026-12-02']).toEqual(cells['2026-12-02']);
  });

  it('explains an unresolvable gap instead of hiding it', () => {
    const month = '2026-12';
    const data = createSampleData(month);
    const cells = generateRoster(data, month);
    const gap = validateRoster(data, month, cells).find((i) => i.code === 'COVERAGE_GAP' && i.brandProcessId === 'trailblaze-cs')!;
    expect(gap).toBeTruthy();
    const res = suggestFixes(data, month, cells, gap);
    expect(res.options.filter((o) => o.resolves && o.hardAfter < o.hardBefore && o.suggestion.kind === 'ASSIGN_COVER' && o.suggestion.tier === 1)).toEqual([]);
    expect(res.blocked.some((b) => b.reason.includes('leave') || b.reason.includes('shift'))).toBe(true);
  });
});
