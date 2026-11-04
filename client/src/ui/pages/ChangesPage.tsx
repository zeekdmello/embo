import { useMemo, useState } from 'react';
import { formatDate } from '@shared/engine/calendar';
import { bpLabel } from '@shared/engine/context';
import { analyzeAbsence, type ImpactReport } from '@shared/engine/impact';
import type { LeaveType } from '@shared/engine/types';
import { useDerived, useUI } from '../../store/derived';
import { useStore } from '../../store/store';
import { STATUS_LABEL, runWithImpact } from '../components/common';
import booksImg from '../assets/books.png';

export function ChangesPage() {
  const { ctx, data, month, roster } = useDerived();
  const { addLeaveAndRepair, regenerateFrom } = useStore();
  const toast = useUI((s) => s.toast);
  const setView = useUI((s) => s.setView);
  const [emp, setEmp] = useState('aman');
  const [from, setFrom] = useState(ctx.dates[9]);
  const [to, setTo] = useState(ctx.dates[10]);
  const [type, setType] = useState<LeaveType>('SICK');
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [replanFrom, setReplanFrom] = useState(ctx.dates[14]);

  const diff = useMemo(() => {
    if (!roster?.publishedCells) return [];
    const out: { date: string; empId: string; from: string; to: string }[] = [];
    for (const d of ctx.dates) {
      for (const e of ctx.employees) {
        const a = roster.publishedCells[d]?.[e.id];
        const b = roster.cells[d]?.[e.id];
        if (!a || !b) continue;
        const fmt = (c: typeof a) => `${STATUS_LABEL[c.status]}${c.covers.length ? ` + covers ${c.covers.map((x) => bpLabel(ctx, x)).join(', ')}` : ''}`;
        if (fmt(a) !== fmt(b)) out.push({ date: d, empId: e.id, from: fmt(a), to: fmt(b) });
      }
    }
    return out;
  }, [roster, ctx]);

  if (!roster) return null;

  const preview = () => {
    if (from > to) return toast('“From” must be on or before “to”', 'bad');
    setReport(analyzeAbsence(data, month, roster.cells, emp, from, to, type));
  };

  return (
    <div className="col page-narrow" style={{ gap: 18 }}>
      <div className="card card-pad col" style={{ gap: 12 }}>
        <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Every change, on the record</div>
            <div className="section-title">Simulate a change: someone becomes unavailable</div>
            <div className="muted small">
              Preview the impact before touching the roster. The simulator compares <b>no action</b> vs. <b>automatic repair</b>
              (backups fill in, weekly offs move within the week) and tells you which brands stay safe.
            </div>
          </div>
          <span className="hide-sm"><img src={booksImg} alt="" width={118} style={{ display: 'block' }} /></span>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field">Employee
            <select value={emp} onChange={(e) => (setEmp(e.target.value), setReport(null))}>
              {ctx.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {[...new Set((ctx.primariesOfEmp.get(e.id) ?? []).map((b) => ctx.brand.get(ctx.bp.get(b)!.brandId)?.name))].join(', ') || 'floater'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">From<input type="date" value={from} min={ctx.dates[0]} max={ctx.dates.at(-1)} onChange={(e) => (setFrom(e.target.value), setReport(null))} /></label>
          <label className="field">To<input type="date" value={to} min={ctx.dates[0]} max={ctx.dates.at(-1)} onChange={(e) => (setTo(e.target.value), setReport(null))} /></label>
          <label className="field">Type
            <select value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
              <option value="SICK">Sick / unplanned</option>
              <option value="PLANNED">Planned leave</option>
              <option value="COMP_OFF">Comp-off</option>
            </select>
          </label>
          <button className="btn primary" onClick={preview}>Preview impact</button>
        </div>
        <div className="row small muted">
          Try: <a href="#" onClick={(e) => (e.preventDefault(), setEmp('aman'), setReport(null))}>Aman (sole owner of Lumen, 4 processes)</a> ·
          <a href="#" onClick={(e) => (e.preventDefault(), setEmp('gaurav'), setReport(null))}>Gaurav (1 of 2 Hearth &amp; Hive CS owners)</a> ·
          <a href="#" onClick={(e) => (e.preventDefault(), setEmp('aditya'), setReport(null))}>Aditya (PureSip CS, needs 2 of 3)</a> ·
          <a href="#" onClick={(e) => (e.preventDefault(), setEmp('neha'), setReport(null))}>Neha (pod lead, backup for many)</a>
        </div>

        {report && (
          <div className="col" style={{ gap: 12 }}>
            <div className="stats">
              <div className="card stat"><div className="v" style={{ color: report.newIssuesNoAction.length ? 'var(--bad)' : 'var(--ok)' }}>{report.newIssuesNoAction.length}</div><div className="l">New hard issues if nothing is done</div></div>
              <div className="card stat"><div className="v" style={{ color: report.remainingAfterRepair.length ? 'var(--bad)' : 'var(--ok)' }}>{report.remainingAfterRepair.length}</div><div className="l">Remaining after auto-repair</div></div>
              <div className="card stat"><div className="v">{report.repairActions.length}</div><div className="l">Roster changes repair would make</div></div>
            </div>
            <table className="simple">
              <thead><tr><th>Affected brand · process</th><th>Co-owners</th><th>Days needed</th><th>Short (no action)</th><th>Short (after repair)</th><th>Verdict</th></tr></thead>
              <tbody>
                {report.perProcess.map((p) => (
                  <tr key={p.brandProcessId}>
                    <td>{p.label}</td>
                    <td>{p.coOwners.join(', ') || <span className="muted">none (sole owner)</span>}</td>
                    <td>{p.operatingDays}</td>
                    <td>{p.gapDaysNoAction}</td>
                    <td>{p.gapDaysAfterRepair}</td>
                    <td><div className={`verdict-${p.verdict}`}>{p.verdict === 'OK' ? 'Covered' : p.verdict === 'BACKUP_NEEDED' ? 'Backup fills it' : 'At risk'}</div><div className="small muted">{p.explanation}</div></td>
                  </tr>
                ))}
                {!report.perProcess.length && <tr><td colSpan={6} className="muted">No brand-process depends on this person in the window.</td></tr>}
              </tbody>
            </table>
            {report.repairActions.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer' }}>What repair would change ({report.repairActions.length})</summary>
                <ul className="small">{report.repairActions.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </details>
            )}
            {report.remainingAfterRepair.length > 0 && (
              <div className="banner bad col" style={{ alignItems: 'flex-start', gap: 4 }}>
                <b>Needs a manager decision:</b>
                {report.remainingAfterRepair.slice(0, 8).map((i) => <div key={i.id} className="small">• {i.title} — {i.detail}</div>)}
              </div>
            )}
            <div className="row">
              <button
                className="btn primary"
                onClick={() => {
                  runWithImpact('Change applied', () => addLeaveAndRepair({ ...report.leave, id: `lv-${Date.now()}` }));
                  setReport(null);
                }}
              >
                Apply change + auto-repair
              </button>
              <button className="btn" onClick={() => setView('employee', emp)}>Open {ctx.emp.get(emp)?.name}'s schedule</button>
            </div>
          </div>
        )}
      </div>

      <div className="card card-pad col" style={{ gap: 10 }}>
        <div className="section-title">Re-plan the rest of the month</div>
        <div className="muted small">Keeps every day before the chosen date and every locked cell; regenerates everything after it (e.g. after a brand changes its operating rules mid-month).</div>
        <div className="row">
          <input type="date" value={replanFrom} min={ctx.dates[0]} max={ctx.dates.at(-1)} onChange={(e) => setReplanFrom(e.target.value)} />
          <button className="btn" onClick={() => runWithImpact(`Re-planned from ${formatDate(replanFrom)}`, () => regenerateFrom(replanFrom))}>Re-plan from {formatDate(replanFrom)}</button>
        </div>
      </div>

      <div className="card card-pad col" style={{ gap: 10 }}>
        <div className="section-title">Changes since publish {roster.publishedAt ? `(published ${new Date(roster.publishedAt).toLocaleString()})` : ''}</div>
        {!roster.publishedAt && <div className="muted small">Not published yet. After publishing, every change to a cell is listed here — this is the list of people to notify.</div>}
        {roster.publishedAt && !diff.length && <div className="muted small">No changes since the published version.</div>}
        {diff.length > 0 && (
          <table className="simple">
            <thead><tr><th>Notify</th><th>Date</th><th>Was</th><th>Now</th></tr></thead>
            <tbody>
              {diff.map((x) => (
                <tr key={x.date + x.empId}><td>{ctx.emp.get(x.empId)?.name}</td><td>{formatDate(x.date)}</td><td>{x.from}</td><td><b>{x.to}</b></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card card-pad col" style={{ gap: 6 }}>
        <div className="section-title">Change log</div>
        {roster.log.length === 0 && <div className="muted small">No changes yet.</div>}
        {roster.log.map((l, i) => (
          <div key={i} className="row small" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(l.at).toLocaleString()}</span>
            {l.afterPublish && <span className="pill soft">after publish</span>}
            <span>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
