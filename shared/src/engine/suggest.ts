import { formatDate, monthWeeks } from './calendar';
import { bpLabel, buildCtx, canCover, cloneCells, coverage, empName, responsibilities, type Cells } from './context';
import { repairRoster } from './generate';
import { validateWithCtx } from './validate';
import type { Dataset, EvaluatedSuggestion, Issue, Suggestion } from './types';

export interface SuggestionResult {
  options: EvaluatedSuggestion[];
  /** People who were considered but cannot help, with the reason — makes "why not X?" answerable. */
  blocked: { employeeId: string; name: string; reason: string }[];
  advice: string[];
}

/** Proposes concrete fixes for one issue and simulates each one (before/after hard-issue counts). */
export function suggestFixes(data: Dataset, month: string, cells: Cells, issue: Issue): SuggestionResult {
  const ctx = buildCtx(data, month);
  const raw: Suggestion[] = [];
  const blocked: SuggestionResult['blocked'] = [];
  const advice: string[] = [];

  if (issue.code === 'COVERAGE_GAP' && issue.date && issue.brandProcessId) {
    const d = issue.date;
    const b = issue.brandProcessId;
    const bp = ctx.bp.get(b)!;
    // 1. trained backups and cross-trained colleagues
    const considered = new Set<string>();
    const tryEmp = (e: string) => {
      if (considered.has(e)) return;
      considered.add(e);
      const chk = canCover(ctx, cells, e, b, d, { allowTier2: true, allowCallIn: true });
      if (chk.ok) {
        raw.push({
          kind: 'ASSIGN_COVER',
          employeeId: e,
          brandProcessId: b,
          date: d,
          tier: chk.tier as 1 | 2,
          callIn: chk.callIn,
          label: `${empName(ctx, e)} covers ${bpLabel(ctx, b)}${chk.tier === 2 ? ' (cross-trained)' : ' (backup)'}${
            chk.callIn ? ' — called in from holiday, earns comp-off' : ''
          }`,
        });
      } else if (chk.tier > 0) {
        blocked.push({ employeeId: e, name: empName(ctx, e), reason: chk.reason ?? 'unavailable' });
      }
    };
    (ctx.backupsOfBp.get(b) ?? []).forEach(tryEmp);
    ctx.employees.forEach((e) => tryEmp(e.id));

    // 2. a primary on weekly off could move the off within the week
    const week = monthWeeks(month).find((w) => w.includes(d)) ?? [];
    for (const p of ctx.primariesOfBp.get(b) ?? []) {
      const c = cells[d]?.[p];
      if (!c) continue;
      if (c.status === 'OFF' && c.offKind === 'WEEKLY') {
        for (const alt of week) {
          if (alt === d || cells[alt]?.[p]?.status !== 'WORK') continue;
          raw.push({
            kind: 'MOVE_OFF',
            employeeId: p,
            fromDate: d,
            toDate: alt,
            label: `Move ${empName(ctx, p)}'s weekly off from ${formatDate(d)} to ${formatDate(alt)}`,
          });
        }
      } else if (c.status !== 'WORK') {
        blocked.push({ employeeId: p, name: empName(ctx, p), reason: `owner, but ${c.status === 'LEAVE' ? 'on approved leave' : c.status.toLowerCase().replace('_', '-')}` });
      }
    }
    if (!raw.length) {
      advice.push(
        `No one available can legally cover ${bpLabel(ctx, b)} on ${formatDate(d)}.`,
        `Options for the manager: add a trained BACKUP for this process (Setup → Brands), reschedule a leave, ` +
          `temporarily relax the minimum for ${ctx.brand.get(bp.brandId)?.name}, or agree reduced service with the client.`,
      );
    }
  }

  if (issue.code === 'LEAVE_CONFLICT' || issue.code === 'PENDING_LEAVE' || issue.code === 'WEEKLY_OFF_MISSING') {
    raw.push({ kind: 'REPAIR', label: 'Run Repair (apply approved leave, fill gaps with backups, re-place weekly offs)' });
    if (issue.code === 'WEEKLY_OFF_MISSING' && issue.employeeId && issue.date) {
      const week = monthWeeks(month).find((w) => w.includes(issue.date!)) ?? [];
      for (const d of week) {
        if (cells[d]?.[issue.employeeId]?.status !== 'WORK' || ctx.holidays.has(d)) continue;
        raw.push({
          kind: 'GIVE_OFF',
          employeeId: issue.employeeId,
          date: d,
          label: `Give ${empName(ctx, issue.employeeId)} the off on ${formatDate(d)}; hand their work to backups / cross-trained colleagues`,
        });
      }
    }
    if (issue.code === 'WEEKLY_OFF_MISSING')
      advice.push(
        'If Repair cannot place it, add a backup assignment for this person’s brand-processes, or let them work and grant a comp-off (mark a later day as COMP_OFF).',
      );
    if (issue.code === 'PENDING_LEAVE') advice.push('Approve the leave in Setup → Leaves, then Repair to see whether coverage holds.');
  }

  if ((issue.code === 'SHIFT_CONFLICT' || issue.code === 'OVERLOAD' || issue.code === 'INVALID_COVER') && issue.date && issue.employeeId) {
    const c = cells[issue.date]?.[issue.employeeId];
    for (const b of c?.covers ?? []) {
      if (issue.brandProcessId && b !== issue.brandProcessId) continue;
      raw.push({
        kind: 'REMOVE_COVER',
        employeeId: issue.employeeId,
        brandProcessId: b,
        date: issue.date,
        label: `Remove ${empName(ctx, issue.employeeId)} from covering ${bpLabel(ctx, b)} (then Repair finds someone else)`,
      });
    }
  }

  // simulate each option
  const before = validateWithCtx(ctx, cells);
  const hardBefore = before.filter((i) => i.severity === 'HARD').length;
  const softBefore = before.filter((i) => i.severity === 'SOFT').length;
  const options = raw
    .map((s) => {
      const after = validateWithCtx(ctx, applySuggestion(data, month, cells, s));
      return {
        suggestion: s,
        hardBefore,
        hardAfter: after.filter((i) => i.severity === 'HARD').length,
        softBefore,
        softAfter: after.filter((i) => i.severity === 'SOFT').length,
        resolves: !after.some((i) => i.id === issue.id),
      };
    })
    .sort(
      (a, b) =>
        Number(b.resolves) - Number(a.resolves) || a.hardAfter - b.hardAfter || a.softAfter - b.softAfter,
    )
    .slice(0, 6);
  return { options, blocked, advice };
}

/** Applies a suggestion to a copy of the cells. Applied fixes are manager decisions → cells are locked. */
export function applySuggestion(data: Dataset, month: string, cells: Cells, s: Suggestion): Cells {
  if (s.kind === 'REPAIR') return repairRoster(data, month, cells).cells;
  const out = cloneCells(cells);
  if (s.kind === 'ASSIGN_COVER') {
    const c = out[s.date][s.employeeId];
    if (s.callIn) c.status = 'WORK';
    if (!c.covers.includes(s.brandProcessId)) c.covers.push(s.brandProcessId);
    c.locked = true;
    c.source = 'MANUAL';
  } else if (s.kind === 'MOVE_OFF') {
    out[s.fromDate][s.employeeId] = { status: 'WORK', covers: [], locked: true, source: 'MANUAL' };
    out[s.toDate][s.employeeId] = { status: 'OFF', offKind: 'WEEKLY', covers: [], locked: true, source: 'MANUAL' };
    // the moved person may have been covering others on the new off day → refill there
    return repairOnlyGaps(data, month, out);
  } else if (s.kind === 'GIVE_OFF') {
    const ctx = buildCtx(data, month);
    const work = responsibilities(ctx, out, s.employeeId, s.date);
    out[s.date][s.employeeId] = { status: 'OFF', offKind: 'WEEKLY', covers: [], locked: true, source: 'MANUAL' };
    for (const b of work) {
      if (coverage(ctx, out, b, s.date).length >= ctx.req(b, s.date)) continue;
      const pick = ctx.employees
        .map((e) => ({ e: e.id, chk: canCover(ctx, out, e.id, b, s.date, { allowTier2: true }) }))
        .filter((x) => x.chk.ok)
        .sort((a, b2) => a.chk.tier - b2.chk.tier || responsibilities(ctx, out, a.e, s.date).length - responsibilities(ctx, out, b2.e, s.date).length)[0];
      if (pick) {
        const c = out[s.date][pick.e];
        c.covers.push(b);
        c.locked = true;
        c.source = 'MANUAL';
      }
    }
  } else if (s.kind === 'REMOVE_COVER') {
    const c = out[s.date][s.employeeId];
    c.covers = c.covers.filter((b) => b !== s.brandProcessId);
    c.locked = true;
    c.source = 'MANUAL';
  }
  return out;
}

function repairOnlyGaps(data: Dataset, month: string, cells: Cells): Cells {
  const ctx = buildCtx(data, month);
  const hasGap = ctx.dates.some((d) => [...ctx.bp.keys()].some((b) => coverage(ctx, cells, b, d).length < ctx.req(b, d)));
  return hasGap ? repairRoster(data, month, cells).cells : cells;
}
