import { formatDate, monthWeeks, weekday, WEEKDAY_SHORT } from './calendar';
import {
  bpLabel,
  buildCtx,
  coverTier,
  coverage,
  empName,
  responsibilities,
  shiftsOf,
  statusWord,
  type Cells,
  type Ctx,
} from './context';
import type { Dataset, Issue } from './types';

/**
 * VALIDATOR — a single pure function used after generation AND after every manual edit.
 * It never trusts the generator: it recomputes everything from the roster cells + configuration.
 *
 * HARD = must be fixed (or explicitly acknowledged) before publishing.
 * SOFT = preference / fairness, the roster is still valid.
 * INFO = needs a human decision (pending leave) or a summary of impact.
 */
export function validateRoster(data: Dataset, month: string, cells: Cells): Issue[] {
  const ctx = buildCtx(data, month);
  return validateWithCtx(ctx, cells);
}

export function validateWithCtx(ctx: Ctx, cells: Cells): Issue[] {
  const issues: Issue[] = [];
  const add = (i: Omit<Issue, 'id'>) =>
    issues.push({ ...i, id: `${i.code}|${i.date ?? ''}|${i.employeeId ?? ''}|${i.brandProcessId ?? ''}` });
  const { settings } = ctx.data;

  // ── configuration problems ──
  for (const b of ctx.bp.keys()) {
    if (!(ctx.primariesOfBp.get(b)?.length)) {
      const operatingDays = ctx.dates.filter((d) => ctx.req(b, d) > 0).length;
      if (operatingDays)
        add({
          severity: 'HARD',
          code: 'NO_PRIMARY',
          brandProcessId: b,
          title: `${bpLabel(ctx, b)} has no assigned employee`,
          detail: `It operates ${operatingDays} days this month but nobody is assigned as primary. Add an assignment in Setup → Brands.`,
        });
    }
  }

  // ── per day / brand-process coverage ──
  const gapsByAbsentee = new Map<string, Set<string>>(); // `${date}|${emp}` -> brandIds
  for (const d of ctx.dates) {
    for (const b of ctx.bp.keys()) {
      const need = ctx.req(b, d);
      if (!need) continue;
      const have = coverage(ctx, cells, b, d);
      if (have.length >= need) continue;
      const primaries = ctx.primariesOfBp.get(b) ?? [];
      if (!primaries.length) continue; // reported once as NO_PRIMARY
      const absent = primaries.filter((p) => cells[d]?.[p]?.status !== 'WORK');
      const why = absent
        .map((p) => {
          const c = cells[d]?.[p];
          return `${empName(ctx, p)} is ${c ? statusWord(c.status, c.offKind) : 'not rostered'}`;
        })
        .join('; ');
      const sole = primaries.length === 1;
      add({
        severity: 'HARD',
        code: 'COVERAGE_GAP',
        date: d,
        brandProcessId: b,
        relatedEmployeeIds: absent,
        title: `${bpLabel(ctx, b)} short on ${formatDate(d)} (${have.length}/${need})`,
        detail:
          `${sole ? 'Sole owner: ' : ''}${why ? why + '.' : 'Not enough owners assigned for the minimum.'}` +
          (have.length ? ` Working: ${have.map((e) => empName(ctx, e)).join(', ')}.` : ' Nobody is covering it.'),
      });
      const brandId = ctx.bp.get(b)!.brandId;
      for (const p of absent) {
        const key = `${d}|${p}`;
        if (!gapsByAbsentee.has(key)) gapsByAbsentee.set(key, new Set());
        gapsByAbsentee.get(key)!.add(brandId);
      }
    }
  }
  for (const [key, brands] of gapsByAbsentee) {
    if (brands.size < 2) continue;
    const [d, p] = key.split('|');
    add({
      severity: 'INFO',
      code: 'MULTI_BRAND_IMPACT',
      date: d,
      employeeId: p,
      title: `${empName(ctx, p)}'s absence on ${formatDate(d)} leaves ${brands.size} brands short`,
      detail: `Affected: ${[...brands].map((x) => ctx.brand.get(x)?.name).join(', ')}.`,
    });
  }

  // ── per employee ──
  const weeks = monthWeeks(ctx.month);
  const coverDays = new Map<string, number>();
  for (const e of ctx.employees) {
    let run = 0;
    let runStart = '';
    let compOffUsed = 0;
    let compOffEarned = 0;
    let weekendOffs = 0;
    let weekendWorkNeeded = false;
    let prefWeeks = 0;
    const prefMissed: string[] = [];

    for (const d of ctx.dates) {
      const c = cells[d]?.[e.id];
      if (!c) continue;
      const wd = weekday(d);

      // leave honoured?
      const leave = ctx.approvedLeave(e.id, d);
      if (leave && c.status === 'WORK') {
        add({
          severity: 'HARD',
          code: 'LEAVE_CONFLICT',
          date: d,
          employeeId: e.id,
          title: `${e.name} rostered on ${formatDate(d)} during approved leave`,
          detail: `Approved ${leave.type.toLowerCase().replace('_', '-')} ${leave.from} → ${leave.to}. Use "Repair" to apply it, or reject the leave.`,
        });
      }
      const pending = ctx.pendingLeave(e.id, d);
      if (pending && c.status === 'WORK') {
        add({
          severity: 'INFO',
          code: 'PENDING_LEAVE',
          date: d,
          employeeId: e.id,
          title: `${e.name} has a pending leave request for ${formatDate(d)}`,
          detail: `Approve or reject it in Setup → Leaves. Use "Changes" to preview the impact first.`,
        });
      }

      if (c.status === 'WORK') {
        const resp = responsibilities(ctx, cells, e.id, d);
        if (resp.length > settings.maxResponsibilitiesPerDay)
          add({
            severity: 'HARD',
            code: 'OVERLOAD',
            date: d,
            employeeId: e.id,
            title: `${e.name} overloaded on ${formatDate(d)} (${resp.length} processes)`,
            detail: `Limit is ${settings.maxResponsibilitiesPerDay}: ${resp.map((b) => bpLabel(ctx, b)).join(', ')}.`,
          });
        const shifts = shiftsOf(ctx, resp);
        if (shifts.size > 1)
          add({
            severity: 'HARD',
            code: 'SHIFT_CONFLICT',
            date: d,
            employeeId: e.id,
            title: `${e.name} has incompatible shifts on ${formatDate(d)}`,
            detail: `Assigned to ${[...shifts].join(' and ')} shifts: ${resp
              .map((b) => `${bpLabel(ctx, b)} (${ctx.bp.get(b)?.shift})`)
              .join(', ')}.`,
          });
        for (const b of c.covers) {
          if (!ctx.bp.has(b) || ctx.req(b, d) === 0) continue;
          const tier = coverTier(ctx, e.id, b);
          if (tier === 0)
            add({
              severity: 'HARD',
              code: 'INVALID_COVER',
              date: d,
              employeeId: e.id,
              brandProcessId: b,
              title: `${e.name} covers ${bpLabel(ctx, b)} without training`,
              detail: `Not a backup and not cross-trained. Add a BACKUP assignment or pick someone else.`,
            });
          else if (tier === 2)
            add({
              severity: 'SOFT',
              code: 'CROSS_COVER',
              date: d,
              employeeId: e.id,
              brandProcessId: b,
              title: `${e.name} cross-covers ${bpLabel(ctx, b)} on ${formatDate(d)}`,
              detail: `Cross-trained (same brand or same process in pod) but not a designated backup.`,
            });
        }
        if (c.covers.length) coverDays.set(e.id, (coverDays.get(e.id) ?? 0) + 1);
        if (ctx.holidays.has(d)) compOffEarned++;
        if (wd === 0 || wd === 6) {
          if ((ctx.primariesOfEmp.get(e.id) ?? []).some((b) => ctx.req(b, d) > 0)) weekendWorkNeeded = true;
        }
        if (run === 0) runStart = d;
        run++;
        if (run === settings.maxConsecutiveDays + 1)
          add({
            severity: 'HARD',
            code: 'MAX_CONSECUTIVE',
            date: d,
            employeeId: e.id,
            title: `${e.name} works more than ${settings.maxConsecutiveDays} days in a row`,
            detail: `Working streak from ${formatDate(runStart)} reaches ${run} days on ${formatDate(d)}.`,
          });
      } else {
        run = 0;
        if (c.status === 'COMP_OFF') compOffUsed++;
        if (c.status === 'OFF' && (wd === 0 || wd === 6)) weekendOffs++;
      }
    }

    // weekly offs
    for (const week of weeks) {
      if (week.length < settings.minDaysInWeekForOff) continue;
      const offs = week.filter((d) => cells[d]?.[e.id]?.status === 'OFF').length;
      const worked = week.filter((d) => cells[d]?.[e.id]?.status === 'WORK').length;
      if (offs < e.weeklyOffs && worked > week.length - e.weeklyOffs) {
        add({
          severity: 'HARD',
          code: 'WEEKLY_OFF_MISSING',
          date: week[0],
          employeeId: e.id,
          title: `${e.name} has no weekly off in week of ${formatDate(week[0])}`,
          detail:
            `Every day of this week leaves one of their brand-processes uncovered and no trained backup is free. ` +
            `Options: add a backup assignment, move another person's off, or let them work it and grant a comp-off.`,
        });
      }
      // preferences (collected, reported once per employee)
      if (e.preferredOffDays.length) {
        const weeklyOffDays = week.filter(
          (d) => cells[d]?.[e.id]?.status === 'OFF' && cells[d]?.[e.id]?.offKind !== 'NON_OPERATING',
        );
        prefWeeks++;
        if (weeklyOffDays.length && !weeklyOffDays.some((d) => e.preferredOffDays.includes(weekday(d))))
          prefMissed.push(weeklyOffDays[0]);
      }
    }
    if (prefMissed.length) {
      add({
        severity: 'SOFT',
        code: 'PREFERENCE_NOT_MET',
        date: prefMissed[0],
        employeeId: e.id,
        title: `${e.name}: preferred off day missed in ${prefMissed.length} of ${prefWeeks} weeks`,
        detail: `Prefers ${e.preferredOffDays.map((w) => WEEKDAY_SHORT[w]).join('/')}; got ${prefMissed
          .map((d) => formatDate(d))
          .join(', ')} instead. Client coverage took priority over the preference.`,
      });
    }

    // comp-off balance
    const balance = e.compOffOpening + compOffEarned - compOffUsed;
    if (balance < 0)
      add({
        severity: 'HARD',
        code: 'COMP_OFF_BALANCE',
        employeeId: e.id,
        title: `${e.name} uses more comp-offs than earned`,
        detail: `Opening ${e.compOffOpening} + earned ${compOffEarned} − used ${compOffUsed} = ${balance}.`,
      });

    if (weekendWorkNeeded && weekendOffs === 0 && ctx.dates.length >= 28)
      add({
        severity: 'SOFT',
        code: 'NO_WEEKEND_OFF',
        employeeId: e.id,
        title: `${e.name} gets no Saturday/Sunday off this month`,
        detail: `Consider rotating a weekend off with a backup for fairness.`,
      });
  }

  for (const [empId, n] of coverDays) {
    if (n > 8)
      add({
        severity: 'SOFT',
        code: 'BACKUP_OVERUSE',
        employeeId: empId,
        title: `${empName(ctx, empId)} covers for others on ${n} days`,
        detail: `Heavy backup load — consider adding another trained backup to spread it.`,
      });
  }

  const rank = { HARD: 0, SOFT: 1, INFO: 2 } as const;
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.date ?? '').localeCompare(b.date ?? ''));
}

export function summarize(issues: Issue[]) {
  return {
    hard: issues.filter((i) => i.severity === 'HARD').length,
    soft: issues.filter((i) => i.severity === 'SOFT').length,
    info: issues.filter((i) => i.severity === 'INFO').length,
  };
}
