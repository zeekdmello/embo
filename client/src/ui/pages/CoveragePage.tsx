import { Fragment, useState } from 'react';
import { WEEKDAY_SHORT, parseISO, ruleLabel, weekday } from '@shared/engine/calendar';
import { coverage } from '@shared/engine/context';
import { useDerived, useUI } from '../../store/derived';

/** Brand × process × day matrix — the client's view: is every required day covered? */
export function CoveragePage() {
  const { ctx, roster } = useDerived();
  const { openGap, openDay, setView } = useUI();
  const [pod, setPod] = useState('');
  const [onlyShort, setOnlyShort] = useState(false);
  if (!roster) return null;
  const dates = ctx.dates;

  const brands = ctx.data.brands.filter((b) => !pod || b.podId === pod);
  let totalReq = 0;
  let totalMet = 0;
  const rows = brands.map((br) => {
    const bps = ctx.data.brandProcesses.filter((b) => b.brandId === br.id);
    const cells = bps.map((b) =>
      dates.map((d) => {
        const need = ctx.req(b.id, d);
        const have = need ? coverage(ctx, roster.cells, b.id, d).length : 0;
        if (need) {
          totalReq++;
          if (have >= need) totalMet++;
        }
        return { need, have };
      }),
    );
    const short = cells.some((r) => r.some((c) => c.need && c.have < c.need));
    return { br, bps, cells, short };
  });
  const owners = (brandId: string) =>
    new Set(ctx.data.brandProcesses.filter((b) => b.brandId === brandId).flatMap((b) => ctx.primariesOfBp.get(b.id) ?? [])).size;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="stats">
        <div className="card stat"><div className="v">{totalReq ? ((totalMet / totalReq) * 100).toFixed(1) : 100}%</div><div className="l">Required process-days covered</div></div>
        <div className="card stat"><div className="v">{totalReq - totalMet}</div><div className="l">Process-days short</div></div>
        <div className="card stat"><div className="v">{brands.length}</div><div className="l">Brands</div></div>
        <div className="card stat"><div className="v">{brands.filter((b) => owners(b.id) === 1).length}</div><div className="l">Single-owner brands</div></div>
      </div>
      <div className="row">
        <select value={pod} onChange={(e) => setPod(e.target.value)}>
          <option value="">All pods</option>
          {ctx.data.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="row small"><input type="checkbox" checked={onlyShort} onChange={(e) => setOnlyShort(e.target.checked)} /> Only brands with gaps</label>
        <span className="muted small">Green = met · dark green = above minimum · red = short (click for fixes) · grey = brand closed that day</span>
      </div>
      <div className="grid-wrap">
        <table className="roster">
          <thead>
            <tr>
              <th className="name-col">Brand · process</th>
              {dates.map((d) => {
                const wd = weekday(d);
                return (
                  <th key={d} className={`day-h ${wd === 0 || wd === 6 ? 'weekend' : ''} ${ctx.holidays.has(d) ? 'ph' : ''}`} onClick={() => openDay(d)} title={ctx.holidays.get(d)}>
                    <div>{parseISO(d).getUTCDate()}</div>
                    <div className="wd">{WEEKDAY_SHORT[wd].slice(0, 2)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => !onlyShort || r.short)
              .map(({ br, bps, cells }) => (
                <Fragment key={br.id}>
                  <tr className="group">
                    <td colSpan={dates.length + 1}>
                      <a href="#" onClick={(e) => (e.preventDefault(), setView('brand', br.id))} style={{ color: 'inherit' }}>{br.name}</a>{' '}
                      <span className="muted" style={{ fontWeight: 400 }}>· {ctx.pod.get(br.podId)?.name} · {owners(br.id) === 1 ? 'single owner' : `${owners(br.id)} owners`}</span>
                    </td>
                  </tr>
                  {bps.map((b, i) => (
                    <tr key={b.id} className="cov-row">
                      <td className="name-col" title={ruleLabel(b.rule)}>
                        <div className="name-main">{ctx.process.get(b.processId)?.name} {b.shift === 'LATE' && <span className="tag late">late</span>}</div>
                        <div className="name-sub">{ruleLabel(b.rule)} · {(ctx.primariesOfBp.get(b.id) ?? []).map((e) => ctx.emp.get(e)?.name.split(' ')[0]).join(', ') || 'unassigned'}</div>
                      </td>
                      {cells[i].map(({ need, have }, j) => {
                        const d = dates[j];
                        const cls = !need ? 'closed' : have < need ? 'short' : have > need ? 'over' : 'ok';
                        return (
                          <td key={d} className={`cv ${cls}`} onClick={() => (need && have < need ? openGap({ date: d, bpId: b.id }) : openDay(d))}>
                            {need ? `${have}/${need}` : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
