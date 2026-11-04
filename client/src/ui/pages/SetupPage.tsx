import { useRef, useState } from 'react';
import { ruleLabel, WEEKDAY_SHORT } from '@shared/engine/calendar';
import type { AssignmentType, BrandProcess, CalendarMode, Dataset, Employee, Leave, Weekday } from '@shared/engine/types';
import { useDerived, useUI } from '../../store/derived';
import { useStore } from '../../store/store';
import { Modal, WeekdayPicker } from '../components/common';
import { Pencils } from '../components/brand';
import { exportJson } from '../export';

type Tab = 'employees' | 'brands' | 'pods' | 'processes' | 'holidays' | 'leaves' | 'settings';
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function SetupPage() {
  const [tab, setTab] = useState<Tab>('brands');
  const tabs: [Tab, string][] = [
    ['brands', 'Brands'],
    ['employees', 'Employees'],
    ['pods', 'Pods & leads'],
    ['processes', 'Processes'],
    ['leaves', 'Leaves'],
    ['holidays', 'Holidays'],
    ['settings', 'Rules & data'],
  ];
  return (
    <div className="col" style={{ gap: 14 }}>
      <section className="hero hero-compact">
        <div>
          <div className="eyebrow">Draw it your way</div>
          <h2>Edit anything. No code needed.</h2>
          <p>
            Brands, processes, calendars, people, backups, leave and holidays are all data. Every change is checked against the
            roster straight away — use <b>Repair</b> to adapt it or <b>Regenerate</b> to rebuild it.
          </p>
        </div>
        <div className="art">
          <Pencils width={170} />
          <span className="script">sketch, check, repeat</span>
        </div>
      </section>
      <div className="segmented" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'employees' && <Employees />}
      {tab === 'brands' && <Brands />}
      {tab === 'pods' && <Pods />}
      {tab === 'processes' && <Processes />}
      {tab === 'holidays' && <Holidays />}
      {tab === 'leaves' && <Leaves />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function useUpdate() {
  const updateData = useStore((s) => s.updateData);
  return (fn: (d: Dataset) => Dataset, msg?: string) => updateData(fn, msg);
}

// ───────────── Employees ─────────────
function Employees() {
  const { data, ctx } = useDerived();
  const update = useUpdate();
  const setView = useUI((s) => s.setView);
  const [q, setQ] = useState('');
  const patch = (id: string, p: Partial<Employee>) => update((d) => ({ ...d, employees: d.employees.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
  const remove = (id: string) =>
    update(
      (d) => ({
        ...d,
        employees: d.employees.filter((e) => e.id !== id),
        assignments: d.assignments.filter((a) => a.employeeId !== id),
        leaves: d.leaves.filter((l) => l.employeeId !== id),
        pods: d.pods.map((p) => (p.leadId === id ? { ...p, leadId: null } : p)),
      }),
      `removed employee ${data.employees.find((e) => e.id === id)?.name}`,
    );
  const add = () =>
    update(
      (d) => ({ ...d, employees: [...d.employees, { id: uid('emp'), name: 'New employee', podId: d.pods[0]?.id ?? '', preferredOffDays: [], weeklyOffs: 1, compOffOpening: 0, active: true }] }),
      'added employee',
    );
  const list = data.employees.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <div className="row card-pad" style={{ justifyContent: 'space-between' }}>
        <input type="text" placeholder="Search employees…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={add}>+ Add employee</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="simple">
          <thead><tr><th>Name</th><th>Pod</th><th>Owns</th><th>Preferred weekly off</th><th>Offs / week</th><th>Comp-off carried</th><th>Active</th><th /></tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td><input type="text" value={e.name} onChange={(ev) => patch(e.id, { name: ev.target.value })} /></td>
                <td>
                  <select value={e.podId} onChange={(ev) => patch(e.id, { podId: ev.target.value })}>
                    {data.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td className="small" style={{ maxWidth: 260 }}>
                  {[...new Set((ctx.primariesOfEmp.get(e.id) ?? []).map((b) => ctx.brand.get(ctx.bp.get(b)!.brandId)?.name))].join(', ') || <span className="muted">—</span>}
                </td>
                <td><WeekdayPicker value={e.preferredOffDays} onChange={(v) => patch(e.id, { preferredOffDays: v })} /></td>
                <td><input type="number" min={0} max={3} value={e.weeklyOffs} onChange={(ev) => patch(e.id, { weeklyOffs: Math.max(0, +ev.target.value) })} /></td>
                <td><input type="number" min={0} value={e.compOffOpening} onChange={(ev) => patch(e.id, { compOffOpening: Math.max(0, +ev.target.value) })} /></td>
                <td><input type="checkbox" checked={e.active} onChange={(ev) => patch(e.id, { active: ev.target.checked })} /></td>
                <td className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn small" onClick={() => setView('employee', e.id)}>Schedule</button>
                  <button className="btn small danger" onClick={() => confirm(`Remove ${e.name}? Their assignments and leave are deleted too.`) && remove(e.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────── Brands & assignments ─────────────
function Brands() {
  const { data } = useDerived();
  const update = useUpdate();
  const [pod, setPod] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [newPod, setNewPod] = useState(data.pods[0]?.id ?? '');
  const brands = data.brands.filter((b) => (!pod || b.podId === pod) && b.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="col">
      <div className="row">
        <input type="text" placeholder="Search brands…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={pod} onChange={(e) => setPod(e.target.value)}>
          <option value="">All pods</option>
          {data.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add brand</button>
      </div>
      {brands.map((b) => <BrandCard key={b.id} brandId={b.id} />)}
      {adding && (
        <Modal onClose={() => setAdding(false)}>
          <h3>New brand</h3>
          <label className="field">Name<input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label className="field">Pod
            <select value={newPod} onChange={(e) => setNewPod(e.target.value)}>
              {data.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="muted small">The brand starts with Customer Support (365 days, min 1). Add more processes and assign people on its card.</div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button
              className="btn primary"
              disabled={!name.trim()}
              onClick={() => {
                const id = uid('brand');
                update(
                  (d) => ({
                    ...d,
                    brands: [...d.brands, { id, name: name.trim(), podId: newPod }],
                    brandProcesses: [...d.brandProcesses, { id: uid('bp'), brandId: id, processId: d.processes[0]?.id ?? 'CS', rule: { mode: 'ALL_DAYS' }, shift: 'GENERAL', minStaff: 1 }],
                  }),
                  `added brand ${name.trim()}`,
                );
                setAdding(false);
                setName('');
                setQ(name.trim());
              }}
            >
              Create
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BrandCard({ brandId }: { brandId: string }) {
  const { data, ctx } = useDerived();
  const update = useUpdate();
  const brand = data.brands.find((b) => b.id === brandId)!;
  const bps = data.brandProcesses.filter((b) => b.brandId === brandId);
  const owners = new Set(bps.flatMap((b) => ctx.primariesOfBp.get(b.id) ?? []));
  const patchBp = (id: string, p: Partial<BrandProcess>) => update((d) => ({ ...d, brandProcesses: d.brandProcesses.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
  const addAssign = (bpId: string, employeeId: string, type: AssignmentType) =>
    update(
      (d) => ({ ...d, assignments: [...d.assignments.filter((a) => !(a.brandProcessId === bpId && a.employeeId === employeeId)), { id: uid('as'), brandProcessId: bpId, employeeId, type }] }),
      `${data.employees.find((e) => e.id === employeeId)?.name} → ${type.toLowerCase()} on ${brand.name} ${bpId}`,
    );
  const removeAssign = (id: string) => update((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== id) }), `removed assignment on ${brand.name}`);
  return (
    <details className="card" open={false}>
      <summary className="card-pad row" style={{ cursor: 'pointer', justifyContent: 'space-between' }}>
        <span className="row" style={{ gap: 8 }}>
          <b>{brand.name}</b>
          <span className="muted small">{ctx.pod.get(brand.podId)?.name}</span>
          <span className={`pill ${owners.size === 1 ? 'neutral' : 'info'}`}>{owners.size === 0 ? 'unstaffed' : owners.size === 1 ? 'single owner' : `${owners.size} owners`}</span>
          {bps.map((b) => <span key={b.id} className="tag">{ctx.process.get(b.processId)?.code}</span>)}
        </span>
      </summary>
      <div className="card-pad col" style={{ paddingTop: 0, gap: 12 }}>
        <div className="row">
          <label className="field">Brand name<input type="text" value={brand.name} onChange={(e) => update((d) => ({ ...d, brands: d.brands.map((b) => (b.id === brandId ? { ...b, name: e.target.value } : b)) }))} /></label>
          <label className="field">Pod
            <select value={brand.podId} onChange={(e) => update((d) => ({ ...d, brands: d.brands.map((b) => (b.id === brandId ? { ...b, podId: e.target.value } : b)) }), `${brand.name} moved pod`)}>
              {data.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="spacer" />
          <button
            className="btn small danger"
            onClick={() =>
              confirm(`Delete ${brand.name} and all its processes/assignments?`) &&
              update(
                (d) => ({
                  ...d,
                  brands: d.brands.filter((b) => b.id !== brandId),
                  brandProcesses: d.brandProcesses.filter((b) => b.brandId !== brandId),
                  assignments: d.assignments.filter((a) => !bps.some((b) => b.id === a.brandProcessId)),
                }),
                `deleted brand ${brand.name}`,
              )
            }
          >
            Delete brand
          </button>
        </div>
        {bps.map((b) => {
          const assigns = data.assignments.filter((a) => a.brandProcessId === b.id);
          return (
            <div key={b.id} className="card card-pad col" style={{ gap: 10, boxShadow: 'none' }}>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <label className="field">Process
                  <select value={b.processId} onChange={(e) => patchBp(b.id, { processId: e.target.value })}>
                    {data.processes.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </label>
                <label className="field">Operating calendar
                  <select
                    value={b.rule.mode}
                    onChange={(e) => {
                      const mode = e.target.value as CalendarMode;
                      patchBp(b.id, { rule: mode === 'CUSTOM' ? { mode, weekdays: [1, 2, 3, 4, 5], holidaysOff: true } : { mode } });
                    }}
                  >
                    <option value="ALL_DAYS">365 days (incl. Sundays & holidays)</option>
                    <option value="NO_PH">Every day except public holidays</option>
                    <option value="NO_SUN_NO_PH">Mon–Sat, closed on holidays</option>
                    <option value="CUSTOM">Custom days…</option>
                  </select>
                </label>
                {b.rule.mode === 'CUSTOM' && (
                  <>
                    <WeekdayPicker value={b.rule.weekdays ?? []} onChange={(v) => patchBp(b.id, { rule: { ...b.rule, weekdays: v } })} />
                    <label className="row small"><input type="checkbox" checked={!!b.rule.holidaysOff} onChange={(e) => patchBp(b.id, { rule: { ...b.rule, holidaysOff: e.target.checked } })} /> closed on holidays</label>
                  </>
                )}
                <label className="field">Shift
                  <select value={b.shift} onChange={(e) => patchBp(b.id, { shift: e.target.value as BrandProcess['shift'] })}>
                    <option value="GENERAL">General</option>
                    <option value="LATE">Late</option>
                  </select>
                </label>
                <label className="field">Min staff<input type="number" min={0} value={b.minStaff} onChange={(e) => patchBp(b.id, { minStaff: Math.max(0, +e.target.value) })} /></label>
                <div className="spacer" />
                <button className="btn small danger" onClick={() => update((d) => ({ ...d, brandProcesses: d.brandProcesses.filter((x) => x.id !== b.id), assignments: d.assignments.filter((a) => a.brandProcessId !== b.id) }), `removed process from ${brand.name}`)}>Remove process</button>
              </div>
              <div className="row small">
                <span className="muted">Min per weekday (blank = default):</span>
                {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                  <label key={w} className="row" style={{ gap: 3 }}>
                    {WEEKDAY_SHORT[w].slice(0, 2)}
                    <input
                      type="number"
                      min={0}
                      style={{ width: 46 }}
                      value={b.weekdayMin?.[w as Weekday] ?? ''}
                      placeholder={String(b.minStaff)}
                      onChange={(e) => {
                        const wm = { ...(b.weekdayMin ?? {}) };
                        if (e.target.value === '') delete wm[w as Weekday];
                        else wm[w as Weekday] = Math.max(0, +e.target.value);
                        patchBp(b.id, { weekdayMin: wm });
                      }}
                    />
                  </label>
                ))}
                <span className="muted">· {ruleLabel(b.rule)}</span>
              </div>
              {(['PRIMARY', 'BACKUP'] as AssignmentType[]).map((type) => (
                <div key={type} className="row">
                  <span className="small muted" style={{ width: 70 }}>{type === 'PRIMARY' ? 'Owners' : 'Backups'}</span>
                  <div className="chips">
                    {assigns.filter((a) => a.type === type).map((a) => (
                      <span key={a.id} className={`chip ${type === 'PRIMARY' ? 'primary' : 'backup'}`}>
                        {data.employees.find((e) => e.id === a.employeeId)?.name ?? a.employeeId}
                        <button onClick={() => removeAssign(a.id)} aria-label="Remove">×</button>
                      </span>
                    ))}
                    <select value="" onChange={(e) => e.target.value && addAssign(b.id, e.target.value, type)}>
                      <option value="">+ add {type === 'PRIMARY' ? 'owner' : 'backup'}…</option>
                      {data.employees
                        .filter((e) => e.active && !assigns.some((a) => a.employeeId === e.id))
                        .sort((x, y) => Number(y.podId === brand.podId) - Number(x.podId === brand.podId) || x.name.localeCompare(y.name))
                        .map((e) => <option key={e.id} value={e.id}>{e.name} ({ctx.pod.get(e.podId)?.name})</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        <button
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => update((d) => ({ ...d, brandProcesses: [...d.brandProcesses, { id: uid('bp'), brandId, processId: d.processes[0]?.id ?? 'CS', rule: { mode: 'NO_SUN_NO_PH' }, shift: 'GENERAL', minStaff: 1 }] }), `added process to ${brand.name}`)}
        >
          + Add process to {brand.name}
        </button>
      </div>
    </details>
  );
}

// ───────────── Pods ─────────────
function Pods() {
  const { data } = useDerived();
  const update = useUpdate();
  return (
    <div className="card">
      <table className="simple">
        <thead><tr><th>Pod</th><th>Lead</th><th>Members</th><th>Brands</th><th /></tr></thead>
        <tbody>
          {data.pods.map((p) => (
            <tr key={p.id}>
              <td><input type="text" value={p.name} onChange={(e) => update((d) => ({ ...d, pods: d.pods.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) }))} /></td>
              <td>
                <select value={p.leadId ?? ''} onChange={(e) => update((d) => ({ ...d, pods: d.pods.map((x) => (x.id === p.id ? { ...x, leadId: e.target.value || null } : x)) }), `${p.name} lead changed`)}>
                  <option value="">— none —</option>
                  {data.employees.filter((e) => e.podId === p.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </td>
              <td>{data.employees.filter((e) => e.podId === p.id).length}</td>
              <td>{data.brands.filter((b) => b.podId === p.id).length}</td>
              <td>
                <button
                  className="btn small danger"
                  disabled={data.employees.some((e) => e.podId === p.id) || data.brands.some((b) => b.podId === p.id)}
                  title="Move members and brands out first"
                  onClick={() => update((d) => ({ ...d, pods: d.pods.filter((x) => x.id !== p.id) }), `deleted ${p.name}`)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card-pad"><button className="btn primary" onClick={() => update((d) => ({ ...d, pods: [...d.pods, { id: uid('pod'), name: `Pod ${d.pods.length + 1}`, leadId: null }] }), 'added pod')}>+ Add pod</button></div>
    </div>
  );
}

function Processes() {
  const { data } = useDerived();
  const update = useUpdate();
  return (
    <div className="card">
      <table className="simple">
        <thead><tr><th>Code</th><th>Name</th><th>Used by</th><th /></tr></thead>
        <tbody>
          {data.processes.map((p) => {
            const used = data.brandProcesses.filter((b) => b.processId === p.id).length;
            return (
              <tr key={p.id}>
                <td><input type="text" style={{ width: 80 }} value={p.code} onChange={(e) => update((d) => ({ ...d, processes: d.processes.map((x) => (x.id === p.id ? { ...x, code: e.target.value } : x)) }))} /></td>
                <td><input type="text" value={p.name} onChange={(e) => update((d) => ({ ...d, processes: d.processes.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) }))} /></td>
                <td>{used} brands</td>
                <td><button className="btn small danger" disabled={used > 0} title={used ? 'In use by brands' : ''} onClick={() => update((d) => ({ ...d, processes: d.processes.filter((x) => x.id !== p.id) }))}>Delete</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="card-pad"><button className="btn primary" onClick={() => update((d) => ({ ...d, processes: [...d.processes, { id: uid('proc'), code: 'NEW', name: 'New process' }] }), 'added process type')}>+ Add process type</button></div>
    </div>
  );
}

function Holidays() {
  const { data, month } = useDerived();
  const update = useUpdate();
  const [date, setDate] = useState(`${month}-15`);
  const [name, setName] = useState('');
  const list = [...data.holidays].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="card">
      <div className="card-pad row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="text" placeholder="Holiday name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim() || data.holidays.some((h) => h.date === date)} onClick={() => (update((d) => ({ ...d, holidays: [...d.holidays, { date, name: name.trim() }] }), `holiday added ${date}`), setName(''))}>+ Add holiday</button>
        <span className="muted small">Brands on “365 days” keep operating; others close. Staff on closed brands get the day off; staff needed on 365-day brands work it and earn a comp-off.</span>
      </div>
      <table className="simple">
        <thead><tr><th>Date</th><th>Name</th><th /></tr></thead>
        <tbody>
          {list.map((h) => (
            <tr key={h.date} style={{ fontWeight: h.date.startsWith(month) ? 600 : undefined }}>
              <td>{h.date}</td>
              <td>{h.name}</td>
              <td><button className="btn small danger" onClick={() => update((d) => ({ ...d, holidays: d.holidays.filter((x) => x.date !== h.date) }), `holiday removed ${h.date}`)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Leaves() {
  const { data, ctx } = useDerived();
  const update = useUpdate();
  const [f, setF] = useState<Omit<Leave, 'id'>>({ employeeId: ctx.employees[0]?.id ?? '', from: ctx.dates[0], to: ctx.dates[0], type: 'PLANNED', status: 'PENDING', note: '' });
  const list = [...data.leaves].sort((a, b) => b.from.localeCompare(a.from));
  const patch = (id: string, p: Partial<Leave>) => update((d) => ({ ...d, leaves: d.leaves.map((l) => (l.id === id ? { ...l, ...p } : l)) }), p.status ? `leave ${p.status.toLowerCase()}` : undefined);
  return (
    <div className="card">
      <div className="card-pad row" style={{ alignItems: 'flex-end' }}>
        <label className="field">Employee
          <select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
            {data.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="field">From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: e.target.value > f.to ? e.target.value : f.to })} /></label>
        <label className="field">To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <label className="field">Type
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Leave['type'] })}>
            <option value="PLANNED">Planned</option><option value="SICK">Sick</option><option value="COMP_OFF">Comp-off</option>
          </select>
        </label>
        <label className="field">Status
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Leave['status'] })}>
            <option value="PENDING">Pending</option><option value="APPROVED">Approved</option>
          </select>
        </label>
        <label className="field">Note<input type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <button className="btn primary" disabled={f.from > f.to} onClick={() => update((d) => ({ ...d, leaves: [...d.leaves, { ...f, id: uid('lv') }] }), `leave added for ${data.employees.find((e) => e.id === f.employeeId)?.name}`)}>+ Add</button>
      </div>
      <div className="card-pad muted small" style={{ paddingTop: 0 }}>
        Approving a leave doesn't silently rewrite the roster: it shows up as a <b>Leave conflict</b> until you press <b>Repair</b> (or preview it first under Changes).
      </div>
      <table className="simple">
        <thead><tr><th>Employee</th><th>From</th><th>To</th><th>Type</th><th>Status</th><th>Note</th><th /></tr></thead>
        <tbody>
          {list.map((l) => (
            <tr key={l.id}>
              <td>{data.employees.find((e) => e.id === l.employeeId)?.name}</td>
              <td>{l.from}</td>
              <td>{l.to}</td>
              <td>{l.type.toLowerCase().replace('_', '-')}</td>
              <td>
                <select value={l.status} onChange={(e) => patch(l.id, { status: e.target.value as Leave['status'] })}>
                  <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
                </select>
              </td>
              <td className="small muted">{l.note}</td>
              <td><button className="btn small danger" onClick={() => update((d) => ({ ...d, leaves: d.leaves.filter((x) => x.id !== l.id) }), 'leave deleted')}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab() {
  const { data } = useDerived();
  const update = useUpdate();
  const { rosters, replaceAll, reset } = useStore();
  const toast = useUI((s) => s.toast);
  const file = useRef<HTMLInputElement>(null);
  const s = data.settings;
  const set = (p: Partial<typeof s>) => update((d) => ({ ...d, settings: { ...d.settings, ...p } }), 'rules changed');
  return (
    <div className="grid2">
      <div className="card card-pad col" style={{ gap: 12 }}>
        <div className="section-title">Scheduling rules</div>
        <label className="row">Max consecutive working days <input type="number" min={1} value={s.maxConsecutiveDays} onChange={(e) => set({ maxConsecutiveDays: Math.max(1, +e.target.value) })} /></label>
        <label className="row">Max brand-processes per person per day (own + covers) <input type="number" min={1} value={s.maxResponsibilitiesPerDay} onChange={(e) => set({ maxResponsibilitiesPerDay: Math.max(1, +e.target.value) })} /></label>
        <label className="row">Weekly off only for weeks with at least <input type="number" min={1} max={7} value={s.minDaysInWeekForOff} onChange={(e) => set({ minDaysInWeekForOff: Math.min(7, Math.max(1, +e.target.value)) })} /> days in the month</label>
        <div className="muted small">Weekly offs per person are set on each employee. Shift compatibility: one person can't work GENERAL and LATE processes on the same day.</div>
      </div>
      <div className="card card-pad col" style={{ gap: 12 }}>
        <div className="section-title">Data</div>
        <div className="muted small">Data is stored in MongoDB and saved automatically. Export a JSON backup, restore one, or reset to the sample dataset (this replaces everything for every user).</div>
        <div className="row">
          <button className="btn" onClick={() => exportJson('embo-data.json', { data, rosters })}>⬇ Export JSON</button>
          <button className="btn" onClick={() => file.current?.click()}>⬆ Import JSON</button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const parsed = JSON.parse(await f.text());
                if (!parsed.data?.employees || !parsed.data?.brandProcesses) throw new Error('Not an Embo export');
                await replaceAll(parsed.data, parsed.rosters ?? {});
                toast('Data imported', 'ok');
              } catch (err) {
                toast(`Import failed: ${(err as Error).message}`, 'bad');
              }
              e.target.value = '';
            }}
          />
          <button className="btn danger" onClick={async () => {
              if (!confirm('Reset all data and rosters to the sample dataset?')) return;
              try {
                await reset();
                toast('Sample data restored', 'ok');
              } catch (err) {
                toast(`Reset failed: ${(err as Error).message}`, 'bad');
              }
            }}>Reset to sample data</button>
        </div>
      </div>
    </div>
  );
}
