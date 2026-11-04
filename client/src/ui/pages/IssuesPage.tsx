import { useState } from 'react';
import type { Issue, IssueCode, Severity } from '@shared/engine/types';
import { useDerived, useUI } from '../../store/derived';
import { FixList } from '../components/Drawers';

const CODE_LABEL: Record<IssueCode, string> = {
  COVERAGE_GAP: 'Coverage gap',
  NO_PRIMARY: 'No assigned employee',
  LEAVE_CONFLICT: 'Leave conflict',
  SHIFT_CONFLICT: 'Incompatible shifts',
  OVERLOAD: 'Overloaded',
  INVALID_COVER: 'Untrained cover',
  WEEKLY_OFF_MISSING: 'Weekly off missing',
  MAX_CONSECUTIVE: 'Too many days in a row',
  COMP_OFF_BALANCE: 'Comp-off balance',
  MULTI_BRAND_IMPACT: 'Multi-brand impact',
  PREFERENCE_NOT_MET: 'Preference not met',
  NO_WEEKEND_OFF: 'No weekend off',
  CROSS_COVER: 'Cross-trained cover',
  BACKUP_OVERUSE: 'Backup overused',
  PENDING_LEAVE: 'Pending leave',
};

export function IssuesPage() {
  const { issues, summary, ctx } = useDerived();
  const { openCell, setView } = useUI();
  const [sev, setSev] = useState<Severity | 'ALL'>('HARD');
  const [code, setCode] = useState<IssueCode | ''>('');
  const [open, setOpen] = useState<string | null>(null);

  const filtered = issues.filter((i) => (sev === 'ALL' || i.severity === sev) && (!code || i.code === code));
  const codes = [...new Set(issues.filter((i) => sev === 'ALL' || i.severity === sev).map((i) => i.code))];

  const goTo = (i: Issue) => {
    if (i.date && i.employeeId) openCell(i.date, i.employeeId);
    else if (i.brandProcessId) setView('brand', ctx.bp.get(i.brandProcessId)?.brandId);
    else if (i.employeeId) setView('employee', i.employeeId);
  };

  return (
    <div className="col page-narrow" style={{ gap: 14 }}>
      <div className="banner">
        <div>
          <b>Hard</b> issues break a mandatory rule (client coverage, leave, shifts, rest days) and must be fixed or explicitly
          accepted before publishing. <b>Soft</b> issues are preferences/fairness — coverage always wins over them.
          <b> Info</b> needs a human decision (e.g. pending leave). Every fix below is simulated before you apply it.
        </div>
      </div>
      <div className="row">
        <div className="segmented">
          {(['HARD', 'SOFT', 'INFO', 'ALL'] as const).map((s) => (
            <button key={s} className={sev === s ? 'active' : ''} onClick={() => (setSev(s), setCode(''))}>
              {s === 'ALL' ? `All (${issues.length})` : `${s[0] + s.slice(1).toLowerCase()} (${summary[s.toLowerCase() as 'hard' | 'soft' | 'info']})`}
            </button>
          ))}
        </div>
        <select value={code} onChange={(e) => setCode(e.target.value as IssueCode)}>
          <option value="">All types</option>
          {codes.map((c) => <option key={c} value={c}>{CODE_LABEL[c]}</option>)}
        </select>
      </div>
      {filtered.length === 0 && (
        <div className="card empty">
          <h3>{sev === 'HARD' ? '✓ No hard conflicts' : 'Nothing here'}</h3>
          <p className="muted">{sev === 'HARD' ? 'Every required brand-process day is covered and all mandatory rules hold.' : ''}</p>
        </div>
      )}
      <div className="col">
        {filtered.map((i) => (
          <div key={i.id} className={`issue ${i.severity}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8 }}>
                <span className={`pill ${i.severity.toLowerCase()}`}>{CODE_LABEL[i.code]}</span>
                <span className="t">{i.title}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn small" onClick={() => goTo(i)}>View</button>
                {i.severity !== 'SOFT' || i.code === 'CROSS_COVER' ? (
                  <button className="btn small primary" onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? 'Hide fixes' : 'Suggest fixes'}</button>
                ) : null}
              </div>
            </div>
            <div className="small muted">{i.detail}</div>
            {open === i.id && <FixList issue={i} />}
          </div>
        ))}
      </div>
    </div>
  );
}
