import { useMemo } from 'react';
import { create } from 'zustand';
import { buildCtx } from '@shared/engine/context';
import { validateWithCtx, summarize } from '@shared/engine/validate';
import type { ISODate, Issue } from '@shared/engine/types';
import { useStore } from './store';

/** Context + live validation of the current month's roster. Recomputed only when data/roster change. */
export function useDerived() {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const roster = useStore((s) => s.rosters[s.month]);
  const ctx = useMemo(() => buildCtx(data, month), [data, month]);
  const issues = useMemo(() => (roster ? validateWithCtx(ctx, roster.cells) : []), [ctx, roster]);
  const index = useMemo(() => {
    const byCell = new Map<string, Issue[]>(); // `${date}|${emp}`
    const byBpDate = new Map<string, Issue[]>(); // `${date}|${bp}`
    const push = (m: Map<string, Issue[]>, k: string, i: Issue) => {
      const a = m.get(k);
      if (a) a.push(i);
      else m.set(k, [i]);
    };
    for (const i of issues) {
      if (i.date && i.employeeId) push(byCell, `${i.date}|${i.employeeId}`, i);
      if (i.code === 'COVERAGE_GAP' && i.date) for (const e of i.relatedEmployeeIds ?? []) push(byCell, `${i.date}|${e}`, i);
      if (i.date && i.brandProcessId) push(byBpDate, `${i.date}|${i.brandProcessId}`, i);
    }
    return { byCell, byBpDate };
  }, [issues]);
  return { data, month, roster, ctx, issues, index, summary: summarize(issues) };
}

// ── UI-only state (not persisted) ──
export type Page = 'roster' | 'coverage' | 'issues' | 'changes' | 'setup' | 'guide';
export type ViewMode = 'company' | 'pod' | 'brand' | 'process' | 'employee';

interface UIState {
  page: Page;
  view: ViewMode;
  focusId: string; // pod/brand/process/employee id for the current view
  cell: { date: ISODate; empId: string } | null;
  day: ISODate | null;
  gap: { date: ISODate; bpId: string } | null;
  toasts: { id: number; text: string; tone?: 'ok' | 'bad' }[];
  go: (page: Page) => void;
  setView: (v: ViewMode, focusId?: string) => void;
  openCell: (date: ISODate, empId: string) => void;
  openDay: (d: ISODate | null) => void;
  openGap: (g: { date: ISODate; bpId: string } | null) => void;
  closeAll: () => void;
  toast: (text: string, tone?: 'ok' | 'bad') => void;
}

let toastId = 0;
export const useUI = create<UIState>((set) => ({
  page: 'roster',
  view: 'company',
  focusId: '',
  cell: null,
  day: null,
  gap: null,
  toasts: [],
  go: (page) => set({ page }),
  setView: (view, focusId = '') => set({ view, focusId, page: 'roster' }),
  openCell: (date, empId) => set({ cell: { date, empId }, day: null, gap: null }),
  openDay: (day) => set({ day, cell: null, gap: null }),
  openGap: (gap) => set({ gap, cell: null, day: null }),
  closeAll: () => set({ cell: null, day: null, gap: null }),
  toast: (text, tone) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
}));
