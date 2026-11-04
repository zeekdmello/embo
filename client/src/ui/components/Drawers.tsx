import { useMemo } from 'react';
import { formatDate, ruleLabel } from '@shared/engine/calendar';
import { bpLabel, canCover, coverage, responsibilities, statusWord } from '@shared/engine/context';
import { suggestFixes } from '@shared/engine/suggest';
import type { DayStatus, Issue } from '@shared/engine/types';
import { useDerived, useUI } from '../../store/derived';
import { useStore } from '../../store/store';
import { Drawer, STATUS_LABEL, runWithImpact } from './common';

/** Shows simulated fixes for one issue, each with its before → after hard-issue count. */
export function FixList({ issue }: { issue: Issue }) {
  const { data, month, roster } = useDerived();
  const apply = useStore((s) => s.apply);
  const res = useMemo(() => (roster ? suggestFixes(data, month, roster.cells, issue) : null), [data, month, roster, issue]);
  if (!res) return null;
  return (
    <div className="col">
      {res.options.map((o, i) => (
        <div className="fix" key={i}>
          <div style={{ flex: 1 }}>
            <div>{o.suggestion.label}</div>
            <div className="delta muted">
              Hard issues {o.hardBefore} → <b style={{ color: o.hardAfter < o.hardBefore ? 'var(--ok)' : o.hardAfter > o.hardBefore ? 'var(--bad)' : undefined }}>{o.hardAfter}</b>
              {' · '}soft {o.softBefore} → {o.softAfter}
              {o.resolves ? ' · ✓ resolves this' : ' · does not resolve this one'}
            </div>
          </div>
          <button className="btn small primary" onClick={() => runWithImpact('Fix applied', () => apply(o.suggestion))}>Apply</button>
        </div>
      ))}
      {!res.options.length && <div className="muted small">No automatic fix available.</div>}
      {res.blocked.length > 0 && (
        <details>
          <summary className="small muted" style={{ cursor: 'pointer' }}>Why not others? ({res.blocked.length} considered)</summary>
          <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {res.blocked.map((b, i) => (
              <li key={i}><b>{b.name}</b>: {b.reason}</li>
            ))}
          </ul>
        </details>
      )}
      {res.advice.map((a, i) => (
        <div key={i} className="banner warn small">{a}</div>
      ))}
    </div>
  );
}

export function CellDrawer() {
  const cellRef = useUI((s) => s.cell);
  const close = useUI((s) => s.closeAll);
  const { ctx, roster, index } = useDerived();
  const { setCell, unlockCell } = useStore();
  if (!cellRef || !roster) return null;
  const { date, empId } = cellRef;
  const emp = ctx.emp.get(empId);
  const cell = roster.cells[date]?.[empId];
  if (!emp || !cell) return null;
  const own = ctx.primariesOfEmp.get(empId) ?? [];
  const resp = responsibilities(ctx, roster.cells, empId, date);
  const issues = index.byCell.get(`${date}|${empId}`) ?? [];
  const holiday = ctx.holidays.get(date);
  const leave = ctx.approvedLeave(empId, date) ?? ctx.pendingLeave(empId, date);

  // processes short today that this person could cover
  const coverable = [...ctx.bp.keys()]
    .filter((b) => ctx.req(b, date) > 0 && !own.includes(b) && !cell.covers.includes(b))
    .map((b) => ({ b, chk: canCover(ctx, roster.cells, empId, b, date, { allowTier2: true }), short: coverage(ctx, roster.cells, b, date).length < ctx.req(b, date) }))
    .filter((x) => x.chk.tier > 0)
    .sort((a, b) => Number(b.short) - Number(a.short) || a.chk.tier - b.chk.tier);

  const setStatus = (s: DayStatus) => runWithImpact(`${emp.name} → ${STATUS_LABEL[s]}`, () => setCell(date, empId, { status: s, offKind: s === 'OFF' ? 'WEEKLY' : undefined }));

  return (
    <Drawer
      title={emp.name}
      sub={<>{formatDate(date)}{holiday && <> · <b>{holiday}</b> (public holiday)</>} · {ctx.pod.get(emp.podId)?.name}</>}
      onClose={close}
    >
      <div>
        <div className="section-title">Status</div>
        <div className="status-picker">
          {(['WORK', 'OFF', 'LEAVE', 'COMP_OFF', 'HOLIDAY'] as DayStatus[]).map((s) => (
            <button key={s} className={cell.status === s ? 'active' : ''} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
        <div className="row small muted" style={{ marginTop: 8 }}>
          {cell.locked ? (
            <>🔒 Locked manual edit — kept when regenerating. <button className="btn small" onClick={() => unlockCell(date, empId)}>Unlock</button></>
          ) : (
            <>Auto-planned. Any edit locks this cell so regeneration keeps it.</>
          )}
        </div>
        {leave && <div className={`banner ${leave.status === 'PENDING' ? 'warn' : ''} small`} style={{ marginTop: 8 }}>Leave {leave.status.toLowerCase()}: {leave.type.toLowerCase()} {leave.from} → {leave.to}{leave.note ? ` · ${leave.note}` : ''}</div>}
      </div>

      {issues.length > 0 && (
        <div>
          <div className="section-title">Issues on this cell</div>
          <div className="col">
            {issues.map((i) => (
              <div key={i.id} className={`issue ${i.severity}`}>
                <div className="t">{i.title}</div>
                <div className="small muted">{i.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="section-title">Responsibilities today</div>
        {own.length === 0 && <div className="muted small">Floater / pod lead — no own brand-processes; available as backup.</div>}
        <div className="list">
          {own.map((b) => {
            const need = ctx.req(b, date);
            const have = coverage(ctx, roster.cells, b, date);
            return (
              <div className="list-item" key={b}>
                <div style={{ flex: 1 }}>
                  <div><b>{bpLabel(ctx, b)}</b> <span className="tag">{ctx.bp.get(b)?.shift}</span></div>
                  <div className="small muted">{ruleLabel(ctx.bp.get(b)!.rule)}</div>
                </div>
                {need === 0 ? <span className="pill neutral">closed</span> : <span className={`pill ${have.length >= need ? 'ok' : 'hard'}`}>{have.length}/{need}</span>}
              </div>
            );
          })}
          {cell.covers.map((b) => (
            <div className="list-item" key={b}>
              <div style={{ flex: 1 }}>
                <div><b>{bpLabel(ctx, b)}</b> <span className="tag backup">covering</span></div>
                <div className="small muted">Backup cover for an absent owner</div>
              </div>
              <button className="btn small danger" onClick={() => runWithImpact('Cover removed', () => setCell(date, empId, { covers: cell.covers.filter((x) => x !== b) }))}>Remove</button>
            </div>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>Load today: {resp.length} / {ctx.data.settings.maxResponsibilitiesPerDay} processes</div>
      </div>

      {cell.status === 'WORK' && coverable.length > 0 && (
        <div>
          <div className="section-title">Can also cover</div>
          <div className="list">
            {coverable.slice(0, 12).map(({ b, chk, short }) => (
              <div className="list-item" key={b}>
                <div style={{ flex: 1 }}>
                  <div>{bpLabel(ctx, b)} {short && <span className="pill hard">short</span>} <span className="tag">{chk.tier === 1 ? 'backup' : 'cross-trained'}</span></div>
                  {!chk.ok && <div className="small" style={{ color: 'var(--bad)' }}>Blocked: {chk.reason}</div>}
                </div>
                <button className="btn small" disabled={!chk.ok} onClick={() => runWithImpact('Cover added', () => setCell(date, empId, { covers: [...cell.covers, b] }))}>Cover</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function DayDrawer() {
  const day = useUI((s) => s.day);
  const close = useUI((s) => s.closeAll);
  const openCell = useUI((s) => s.openCell);
  const openGap = useUI((s) => s.openGap);
  const { ctx, roster } = useDerived();
  if (!day || !roster) return null;
  const brands = ctx.data.brands;
  const offPeople = ctx.employees.filter((e) => roster.cells[day]?.[e.id]?.status !== 'WORK');
  const working = ctx.employees.filter((e) => roster.cells[day]?.[e.id]?.status === 'WORK');
  let short = 0;
  for (const b of ctx.bp.keys()) if (coverage(ctx, roster.cells, b, day).length < ctx.req(b, day)) short++;
  return (
    <Drawer
      title={`Who's working — ${formatDate(day)}`}
      sub={<>{ctx.holidays.get(day) ? <b>{ctx.holidays.get(day)} · </b> : null}{working.length} working · {offPeople.length} off · {short ? <span style={{ color: 'var(--bad)' }}>{short} processes short</span> : 'all coverage met'}</>}
      onClose={close}
    >
      <div>
        <div className="section-title">Coverage by brand</div>
        <table className="simple">
          <thead><tr><th>Brand · process</th><th>Need</th><th>On duty</th></tr></thead>
          <tbody>
            {brands.flatMap((br) =>
              ctx.data.brandProcesses.filter((b) => b.brandId === br.id).map((b) => {
                const need = ctx.req(b.id, day);
                const who = coverage(ctx, roster.cells, b.id, day);
                return (
                  <tr key={b.id} onClick={() => need > who.length && openGap({ date: day, bpId: b.id })} style={{ cursor: need > who.length ? 'pointer' : undefined }}>
                    <td>{bpLabel(ctx, b.id)}</td>
                    <td>{need ? need : <span className="muted">closed</span>}</td>
                    <td>
                      {need > 0 && who.length < need && <span className="pill hard" style={{ marginRight: 4 }}>short {who.length}/{need}</span>}
                      {who.map((e) => (
                        <span key={e} className={`tag ${(ctx.primariesOfBp.get(b.id) ?? []).includes(e) ? '' : 'backup'}`}>{ctx.emp.get(e)?.name.split(' ')[0]}</span>
                      ))}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <div>
        <div className="section-title">Not working</div>
        <div className="chips">
          {offPeople.map((e) => {
            const c = roster.cells[day][e.id];
            return (
              <button key={e.id} className="chip" style={{ border: 'none', cursor: 'pointer', paddingRight: 8 }} onClick={() => openCell(day, e.id)}>
                {e.name} · <span className="muted">{statusWord(c.status, c.offKind)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}

export function GapDrawer() {
  const gap = useUI((s) => s.gap);
  const close = useUI((s) => s.closeAll);
  const { ctx, roster, index } = useDerived();
  if (!gap || !roster) return null;
  const issue = (index.byBpDate.get(`${gap.date}|${gap.bpId}`) ?? []).find((i) => i.code === 'COVERAGE_GAP');
  const bp = ctx.bp.get(gap.bpId);
  const who = coverage(ctx, roster.cells, gap.bpId, gap.date);
  return (
    <Drawer title={bpLabel(ctx, gap.bpId)} sub={`${formatDate(gap.date)} · ${bp ? ruleLabel(bp.rule) : ''}`} onClose={close}>
      <div className="row">
        <span className={`pill ${issue ? 'hard' : 'ok'}`}>{who.length} / {ctx.req(gap.bpId, gap.date)} staffed</span>
        <span className="muted small">Owners: {(ctx.primariesOfBp.get(gap.bpId) ?? []).map((e) => ctx.emp.get(e)?.name).join(', ') || 'none'} · Backups: {(ctx.backupsOfBp.get(gap.bpId) ?? []).map((e) => ctx.emp.get(e)?.name).join(', ') || 'none'}</span>
      </div>
      {issue ? (
        <>
          <div className={`issue HARD`}>
            <div className="t">{issue.title}</div>
            <div className="small muted">{issue.detail}</div>
          </div>
          <div>
            <div className="section-title">Possible resolutions (simulated)</div>
            <FixList issue={issue} />
          </div>
        </>
      ) : (
        <div className="banner">Coverage is met for this day.</div>
      )}
    </Drawer>
  );
}
