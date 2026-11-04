import { Fragment, useMemo } from 'react';
import { WEEKDAY_SHORT, parseISO, ruleShort, weekday } from '@shared/engine/calendar';
import { bpLabel, coverage, responsibilities } from '@shared/engine/context';
import type { Employee } from '@shared/engine/types';
import { useDerived, useUI, type ViewMode } from '../../store/derived';
import { Legend, cellCode } from '../components/common';
import { Icon, Sparkle, Sun } from '../components/brand';

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'company', label: 'Company' },
  { id: 'pod', label: 'Pod' },
  { id: 'brand', label: 'Brand' },
  { id: 'process', label: 'Process' },
  { id: 'employee', label: 'Employee' },
];

export function RosterPage() {
  const { ctx, roster, index } = useDerived();
  const { view, focusId, setView, openCell, openDay, openGap } = useUI();
  const data = ctx.data;

  const options = useMemo(() => {
    switch (view) {
      case 'pod':
        return data.pods.map((p) => ({ id: p.id, label: p.name }));
      case 'brand':
        return data.brands.map((b) => ({ id: b.id, label: b.name }));
      case 'process':
        return data.processes.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
      case 'employee':
        return ctx.employees.map((e) => ({ id: e.id, label: e.name }));
      default:
        return [];
    }
  }, [view, data, ctx]);
  const focus = focusId && options.some((o) => o.id === focusId) ? focusId : options[0]?.id ?? '';

  // which brand-processes get a coverage strip, which employees get rows
  const { bps, groups } = useMemo(() => {
    let bps: string[] = [];
    let groups: { title: string; sub?: string; emps: { e: Employee; tag?: string }[] }[] = [];
    const podGroup = (podId: string) => {
      const pod = ctx.pod.get(podId);
      const lead = pod?.leadId ? ctx.emp.get(pod.leadId) : undefined;
      const emps = ctx.employees.filter((e) => e.podId === podId);
      emps.sort((a, b) => Number(b.id === pod?.leadId) - Number(a.id === pod?.leadId) || a.name.localeCompare(b.name));
      return { title: pod?.name ?? 'No pod', sub: lead ? `Lead: ${lead.name}` : 'No lead', emps: emps.map((e) => ({ e })) };
    };
    if (view === 'company') {
      groups = data.pods.map((p) => podGroup(p.id));
      const orphan = ctx.employees.filter((e) => !ctx.pod.has(e.podId));
      if (orphan.length) groups.push({ title: 'Unassigned', emps: orphan.map((e) => ({ e })) });
    } else if (view === 'pod') {
      groups = [podGroup(focus)];
      bps = data.brandProcesses.filter((b) => ctx.brand.get(b.brandId)?.podId === focus).map((b) => b.id);
    } else if (view === 'brand') {
      bps = data.brandProcesses.filter((b) => b.brandId === focus).map((b) => b.id);
      const owners = new Set(bps.flatMap((b) => ctx.primariesOfBp.get(b) ?? []));
      const backups = new Set(bps.flatMap((b) => ctx.backupsOfBp.get(b) ?? []).filter((e) => !owners.has(e)));
      groups = [
        { title: 'Owners', emps: [...owners].map((id) => ({ e: ctx.emp.get(id)!, tag: 'owner' })).filter((x) => x.e) },
        { title: 'Trained backups', emps: [...backups].map((id) => ({ e: ctx.emp.get(id)!, tag: 'backup' })).filter((x) => x.e) },
      ];
    } else if (view === 'process') {
      bps = data.brandProcesses.filter((b) => b.processId === focus).map((b) => b.id);
      const owners = new Set(bps.flatMap((b) => ctx.primariesOfBp.get(b) ?? []));
      groups = data.pods
        .map((p) => ({ title: p.name, emps: ctx.employees.filter((e) => e.podId === p.id && owners.has(e.id)).map((e) => ({ e })) }))
        .filter((g) => g.emps.length);
    } else if (view === 'employee') {
      const e = ctx.emp.get(focus);
      if (e) {
        groups = [{ title: e.name, emps: [{ e }] }];
        bps = [...(ctx.primariesOfEmp.get(e.id) ?? [])];
      }
    }
    return { bps, groups };
  }, [view, focus, ctx, data]);

  if (!roster) return null;
  const dates = ctx.dates;
  const published = roster.publishedCells;

  return (
    <div className="col" style={{ gap: 16 }}>
      {view === 'company' && <Overview />}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <div className="segmented">
            {VIEWS.map((v) => (
              <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
          {options.length > 0 && (
            <select value={focus} onChange={(e) => setView(view, e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
        <span className="muted small">Click a cell to edit · click a date for “who's working” · red cells need attention</span>
      </div>

      {view === 'employee' && ctx.emp.get(focus) && <EmployeeSummary empId={focus} />}

      <div className="grid-wrap">
        <table className="roster">
          <thead>
            <tr>
              <th className="name-col">{view === 'company' ? `${ctx.employees.length} employees` : ''}</th>
              {dates.map((d) => {
                const wd = weekday(d);
                return (
                  <th key={d} className={`day-h ${wd === 0 || wd === 6 ? 'weekend' : ''} ${ctx.holidays.has(d) ? 'ph' : ''}`} onClick={() => openDay(d)} title={ctx.holidays.get(d) ?? 'Who is working?'}>
                    <div>{parseISO(d).getUTCDate()}</div>
                    <div className="wd">{WEEKDAY_SHORT[wd].slice(0, 2)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {bps.length > 0 && (
              <>
                <tr className="group"><td colSpan={dates.length + 1}>Coverage (on duty / required)</td></tr>
                {bps.map((b) => (
                  <tr key={b} className="cov-row">
                    <td className="name-col">
                      <div className="name-main">{bpLabel(ctx, b)} {ctx.bp.get(b)?.shift === 'LATE' && <span className="tag late">late</span>}</div>
                      <div className="name-sub">{ruleShort(ctx.bp.get(b)!.rule)} · min {ctx.bp.get(b)!.minStaff}{ctx.bp.get(b)!.weekdayMin && Object.keys(ctx.bp.get(b)!.weekdayMin!).length ? ' (varies)' : ''}</div>
                    </td>
                    {dates.map((d) => {
                      const need = ctx.req(b, d);
                      const have = need ? coverage(ctx, roster.cells, b, d).length : 0;
                      const cls = !need ? 'closed' : have < need ? 'short' : have > need ? 'over' : 'ok';
                      return (
                        <td key={d} className={`cv ${cls}`} onClick={() => (need && have < need ? openGap({ date: d, bpId: b }) : openDay(d))} title={need ? `${have}/${need}` : 'Closed'}>
                          {need ? `${have}/${need}` : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            )}
            {groups.map((g) => (
              <Fragment key={g.title}>
                {(groups.length > 1 || view !== 'employee') && (
                  <tr className="group">
                    <td colSpan={dates.length + 1}>
                      {g.title} {g.sub && <span className="muted" style={{ fontWeight: 400 }}>· {g.sub}</span>}
                    </td>
                  </tr>
                )}
                {g.emps.map(({ e, tag }) => {
                  const own = ctx.primariesOfEmp.get(e.id) ?? [];
                  const brands = [...new Set(own.map((b) => ctx.brand.get(ctx.bp.get(b)!.brandId)?.name))];
                  const isLead = ctx.pod.get(e.podId)?.leadId === e.id;
                  return (
                    <tr key={e.id}>
                      <td className="name-col">
                        <div className="name-main">
                          <a href="#" onClick={(ev) => (ev.preventDefault(), setView('employee', e.id))} style={{ color: 'inherit', textDecoration: 'none' }}>{e.name}</a>{' '}
                          {isLead && <span className="tag lead">Lead</span>}
                          {tag === 'backup' && <span className="tag backup">backup</span>}
                        </div>
                        <div className="name-sub" title={own.map((b) => bpLabel(ctx, b)).join(', ')}>
                          {brands.length ? brands.join(', ') : 'Floater · backup for pod'}
                        </div>
                      </td>
                      {dates.map((d) => {
                        const c = roster.cells[d]?.[e.id];
                        const iss = index.byCell.get(`${d}|${e.id}`) ?? [];
                        const hard = iss.some((i) => i.severity === 'HARD');
                        const soft = !hard && iss.some((i) => i.severity === 'SOFT' && i.code !== 'PREFERENCE_NOT_MET');
                        const pub = published?.[d]?.[e.id];
                        const changed = pub && c && (pub.status !== c.status || pub.covers.join() !== c.covers.join());
                        const isPh = ctx.holidays.has(d);
                        const cls = [
                          'c',
                          c?.status,
                          c?.status === 'OFF' && c.offKind === 'NON_OPERATING' ? 'nonop' : '',
                          c?.covers.length ? 'cover' : '',
                          c?.status === 'WORK' && isPh ? 'ph-work' : '',
                          c?.locked ? 'locked' : '',
                          hard ? 'has-hard' : soft ? 'has-soft' : '',
                          changed ? 'changed' : '',
                        ].join(' ');
                        const title = c
                          ? `${e.name} · ${d}\n${c.status}${c.covers.length ? `\nCovering: ${c.covers.map((b) => bpLabel(ctx, b)).join(', ')}` : ''}${
                              c.status === 'WORK' ? `\nOn duty for: ${responsibilities(ctx, roster.cells, e.id, d).map((b) => bpLabel(ctx, b)).join(', ') || '—'}` : ''
                            }${iss.length ? `\n⚠ ${iss.map((i) => i.title).join('\n⚠ ')}` : ''}`
                          : '';
                        return (
                          <td key={d} className={cls} onClick={() => openCell(d, e.id)} title={title}>
                            {cellCode(c, isPh)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Legend />
    </div>
  );
}

function EmployeeSummary({ empId }: { empId: string }) {
  const { ctx, roster, issues } = useDerived();
  const openCell = useUI((s) => s.openCell);
  if (!roster) return null;
  const e = ctx.emp.get(empId)!;
  const st = ctx.dates.map((d) => roster.cells[d]?.[empId]);
  const count = (s: string) => st.filter((c) => c?.status === s).length;
  const coverDays = st.filter((c) => c?.covers.length).length;
  const phWorked = ctx.dates.filter((d) => ctx.holidays.has(d) && roster.cells[d]?.[empId]?.status === 'WORK').length;
  const mine = issues.filter((i) => i.employeeId === empId || i.relatedEmployeeIds?.includes(empId));
  const first = weekday(ctx.dates[0]);
  const pad = (first + 6) % 7; // Monday-first calendar
  return (
    <div className="grid2">
      <div className="card card-pad col">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>{e.name}</h3>
          <span className="muted small">{ctx.pod.get(e.podId)?.name}{ctx.pod.get(e.podId)?.leadId === e.id ? ' · Pod lead' : ''}</span>
        </div>
        <div className="stats">
          <div className="stat card"><div className="v">{count('WORK')}</div><div className="l">Working days</div></div>
          <div className="stat card"><div className="v">{count('OFF')}</div><div className="l">Offs</div></div>
          <div className="stat card"><div className="v">{count('LEAVE') + count('COMP_OFF')}</div><div className="l">Leave / comp-off</div></div>
          <div className="stat card"><div className="v">{count('HOLIDAY')}</div><div className="l">Holidays off</div></div>
          <div className="stat card"><div className="v">{phWorked}</div><div className="l">Comp-offs earned</div></div>
          <div className="stat card"><div className="v">{coverDays}</div><div className="l">Days covering</div></div>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Owns</div>
          <div className="chips">
            {(ctx.primariesOfEmp.get(empId) ?? []).map((b) => <span key={b} className="chip primary" style={{ paddingRight: 8 }}>{bpLabel(ctx, b)} · {ruleShort(ctx.bp.get(b)!.rule)}</span>)}
            {!(ctx.primariesOfEmp.get(empId) ?? []).length && <span className="muted small">Nothing — floater</span>}
          </div>
          <div className="small muted" style={{ margin: '8px 0 4px' }}>Backup for</div>
          <div className="chips">
            {(ctx.backupsOfEmp.get(empId) ?? []).map((b) => <span key={b} className="chip backup" style={{ paddingRight: 8 }}>{bpLabel(ctx, b)}</span>)}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Preferred off: {e.preferredOffDays.map((w) => WEEKDAY_SHORT[w]).join(', ') || 'none'} · Comp-off balance: {e.compOffOpening + phWorked - count('COMP_OFF')}
          </div>
        </div>
        {mine.length > 0 && (
          <div className="col" style={{ gap: 4 }}>
            {mine.slice(0, 6).map((i) => <div key={i.id} className={`issue ${i.severity}`} style={{ padding: '6px 10px' }}><span className="small">{i.title}</span></div>)}
          </div>
        )}
      </div>
      <div className="card card-pad">
        <div className="cal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((h) => <div key={h} className="h">{h}</div>)}
          {Array.from({ length: pad }).map((_, i) => <div key={`p${i}`} />)}
          {ctx.dates.map((d) => {
            const c = roster.cells[d]?.[empId];
            return (
              <div key={d} className={`d ${c?.status}`} onClick={() => openCell(d, empId)}>
                <div className="n">{parseISO(d).getUTCDate()}</div>
                <div>{c?.status === 'OFF' && c.offKind === 'NON_OPERATING' ? 'Closed' : c ? { WORK: 'Work', OFF: 'Weekly off', LEAVE: 'Leave', COMP_OFF: 'Comp-off', HOLIDAY: 'Holiday' }[c.status] : ''}</div>
                {c?.covers.length ? <div className="muted">+{c.covers.length} cover</div> : null}
                {ctx.holidays.has(d) && <div className="muted">{ctx.holidays.get(d)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Dashboard hero + three summary tiles, in the spirit of a calm daily overview. */
function Overview() {
  const { ctx, roster, summary } = useDerived();
  const go = useUI((s) => s.go);
  if (!roster) return null;
  let need = 0;
  let met = 0;
  let covers = 0;
  let weeklyOffs = 0;
  for (const d of ctx.dates) {
    for (const b of ctx.bp.keys()) {
      const r = ctx.req(b, d);
      if (!r) continue;
      need++;
      if (coverage(ctx, roster.cells, b, d).length >= r) met++;
    }
    for (const e of ctx.employees) {
      const c = roster.cells[d]?.[e.id];
      if (c?.covers.length) covers++;
      if (c?.status === 'OFF' && c.offKind === 'WEEKLY') weeklyOffs++;
    }
  }
  const pct = need ? (met / need) * 100 : 100;
  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">Your month, at a glance</div>
          {summary.hard === 0 ? (
            <h2>Every brand covered.<br />Everyone rested.</h2>
          ) : (
            <h2>Almost there.<br />{summary.hard} thing{summary.hard > 1 ? 's' : ''} need{summary.hard > 1 ? '' : 's'} you.</h2>
          )}
          <p>
            {ctx.employees.length} people · {ctx.data.brands.length} brands · {ctx.bp.size} brand-processes. You don't have to fix it all —
            just the next little thing.
          </p>
          <button className="link-arrow" onClick={() => go(summary.hard ? 'issues' : 'coverage')}>
            {summary.hard ? 'Review conflicts' : 'See coverage'} <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className="art">
          <Sun size={124} />
          <span className="script">a fair roster, every month</span>
        </div>
        <span className="spark"><Sparkle size={26} color="#a9c48a" /></span>
      </section>
      <div className="stats-joined">
        <div className="stat"><div className="ic"><Icon name="check" /></div><div><div className="v">{pct.toFixed(1)}%</div><div className="l">required process-days covered</div></div></div>
        <div className="stat"><div className="ic"><Icon name="issues" /></div><div><div className="v">{summary.hard}</div><div className="l">hard conflicts · {summary.soft} soft</div></div></div>
        <div className="stat"><div className="ic"><Icon name="users" /></div><div><div className="v">{covers}</div><div className="l">backup cover days</div></div></div>
        <div className="stat"><div className="ic"><Icon name="flame" /></div><div><div className="v">{weeklyOffs}</div><div className="l">weekly offs placed</div></div></div>
      </div>
    </>
  );
}
