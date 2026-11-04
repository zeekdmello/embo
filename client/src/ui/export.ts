import { bpLabel, coverage, type Ctx } from '@shared/engine/context';
import type { Roster } from '@shared/engine/types';
import { cellCode } from './components/common';

function download(name: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportRosterCsv(ctx: Ctx, roster: Roster) {
  const rows: (string | number)[][] = [];
  rows.push(['Employee', 'Pod', 'Owns', ...ctx.dates, 'Working days', 'Weekly offs', 'Leave', 'Comp-offs earned']);
  for (const e of ctx.employees) {
    const codes = ctx.dates.map((d) => {
      const c = roster.cells[d]?.[e.id];
      const base = cellCode(c, ctx.holidays.has(d));
      return c?.covers.length ? `${base} (+${c.covers.map((b) => bpLabel(ctx, b)).join(' / ')})` : base;
    });
    const st = ctx.dates.map((d) => roster.cells[d]?.[e.id]?.status);
    rows.push([
      e.name,
      ctx.pod.get(e.podId)?.name ?? '',
      (ctx.primariesOfEmp.get(e.id) ?? []).map((b) => bpLabel(ctx, b)).join(' / '),
      ...codes,
      st.filter((s) => s === 'WORK').length,
      st.filter((s) => s === 'OFF').length,
      st.filter((s) => s === 'LEAVE').length,
      ctx.dates.filter((d) => ctx.holidays.has(d) && roster.cells[d]?.[e.id]?.status === 'WORK').length,
    ]);
  }
  rows.push([]);
  rows.push(['Coverage (working / required)', '', '', ...ctx.dates]);
  for (const b of ctx.bp.keys()) {
    rows.push([
      bpLabel(ctx, b),
      '',
      '',
      ...ctx.dates.map((d) => (ctx.req(b, d) ? `${coverage(ctx, roster.cells, b, d).length}/${ctx.req(b, d)}` : 'closed')),
    ]);
  }
  download(`roster-${roster.month}-v${roster.version}.csv`, rows.map((r) => r.map(esc).join(',')).join('\n'));
}

export function exportJson(name: string, obj: unknown) {
  download(name, JSON.stringify(obj, null, 2), 'application/json');
}
