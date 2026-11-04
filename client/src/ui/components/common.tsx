import { useEffect, type ReactNode } from 'react';
import { WEEKDAY_SHORT } from '@shared/engine/calendar';
import { validateRoster } from '@shared/engine/validate';
import type { Cell, Weekday } from '@shared/engine/types';
import { useUI } from '../../store/derived';
import { useStore } from '../../store/store';

/**
 * Runs a roster action (sync or async) and tells the manager what it did to the hard-issue count.
 * Errors (e.g. the server is unreachable) are shown as a red toast instead of crashing the page.
 */
export async function runWithImpact(label: string, fn: () => unknown): Promise<void> {
  const hardNow = () => {
    const s = useStore.getState();
    const r = s.rosters[s.month];
    return r ? validateRoster(s.data, s.month, r.cells).filter((i) => i.severity === 'HARD').length : 0;
  };
  const toast = useUI.getState().toast;
  const before = hardNow();
  try {
    await fn();
  } catch (e) {
    toast(`${label} failed: ${(e as Error).message}`, 'bad');
    return;
  }
  const after = hardNow();
  if (after > before) toast(`${label}: ${after - before} new hard issue${after - before > 1 ? 's' : ''} (${after} total)`, 'bad');
  else if (after < before) toast(`${label}: resolved ${before - after} hard issue${before - after > 1 ? 's' : ''} (${after} left)`, 'ok');
  else toast(`${label}: no change in hard issues (${after})`);
}

export function Drawer({ title, sub, onClose, children }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog">
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <h3>{title}</h3>
            {sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`}>{t.text}</div>
      ))}
    </div>
  );
}

export function WeekdayPicker({ value, onChange }: { value: Weekday[]; onChange: (v: Weekday[]) => void }) {
  return (
    <span className="wd-pick">
      {[1, 2, 3, 4, 5, 6, 0].map((w) => (
        <button
          key={w}
          type="button"
          className={value.includes(w as Weekday) ? 'on' : ''}
          onClick={() => onChange(value.includes(w as Weekday) ? value.filter((x) => x !== w) : [...value, w as Weekday].sort())}
          title={WEEKDAY_SHORT[w]}
        >
          {WEEKDAY_SHORT[w].slice(0, 2)}
        </button>
      ))}
    </span>
  );
}

export function cellCode(c: Cell | undefined, isHoliday: boolean): string {
  if (!c) return '';
  switch (c.status) {
    case 'WORK':
      return isHoliday ? 'W★' : 'W';
    case 'OFF':
      return c.offKind === 'NON_OPERATING' ? '–' : 'WO';
    case 'LEAVE':
      return 'L';
    case 'COMP_OFF':
      return 'CO';
    case 'HOLIDAY':
      return 'H';
  }
}

export const STATUS_LABEL: Record<Cell['status'], string> = {
  WORK: 'Working',
  OFF: 'Weekly off',
  LEAVE: 'Leave',
  COMP_OFF: 'Comp-off',
  HOLIDAY: 'Holiday',
};

export function Legend() {
  return (
    <div className="legend">
      <span><span className="sw" style={{ background: '#fff' }}>W</span>Working</span>
      <span><span className="sw" style={{ background: '#fff', position: 'relative' }}>•</span>Covering as backup</span>
      <span><span className="sw" style={{ background: 'var(--off)' }} />Weekly off</span>
      <span><span className="sw" style={{ background: 'var(--closed)' }}>–</span>Own brands closed</span>
      <span><span className="sw" style={{ background: 'var(--leave)' }} />Leave</span>
      <span><span className="sw" style={{ background: 'var(--comp)' }} />Comp-off</span>
      <span><span className="sw" style={{ background: 'var(--hol)' }} />Holiday</span>
      <span><span className="sw" style={{ background: '#fff' }}>W★</span>Works holiday (earns comp-off)</span>
      <span><span className="sw" style={{ boxShadow: 'inset 0 0 0 2px var(--bad)' }} />Hard issue</span>
      <span>◥ Locked manual edit</span>
    </div>
  );
}
