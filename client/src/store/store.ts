import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloneCells } from '@shared/engine/context';
import { defaultMonth, withLog } from '@shared/engine/roster';
import { applySuggestion } from '@shared/engine/suggest';
import type { Cell, Dataset, ISODate, Leave, Roster, Suggestion } from '@shared/engine/types';
import { api } from '../api/http';
import { diffDataset } from '../api/sync';

/**
 * App state.
 *  • Source of truth is MongoDB, reached through the Express API.
 *  • The UI updates instantly (optimistic); changes are saved in the background, batched 400 ms
 *    after the last edit, as idempotent REST calls (see api/sync.ts). Failed saves are retried.
 *  • Heavy actions (Generate, Re-plan, Repair) run on the server with the same shared engine.
 *  • Only the selected month is remembered in the browser.
 */

export { defaultMonth };

const EMPTY: Dataset = {
  pods: [],
  employees: [],
  processes: [],
  brands: [],
  brandProcesses: [],
  assignments: [],
  holidays: [],
  leaves: [],
  settings: { maxConsecutiveDays: 6, maxResponsibilitiesPerDay: 6, minDaysInWeekForOff: 4 },
};

export type SaveState = 'saved' | 'saving' | 'error';

interface State {
  status: 'loading' | 'ready' | 'error';
  loadError?: string;
  saveState: SaveState;
  saveError?: string;
  data: Dataset;
  month: string;
  rosters: Record<string, Roster>;
  load: () => Promise<void>;
  setMonth: (m: string) => void;
  generate: () => Promise<void>;
  regenerateFrom: (d: ISODate) => Promise<void>;
  repair: () => Promise<string[]>;
  setCell: (d: ISODate, empId: string, patch: Partial<Cell>) => void;
  unlockCell: (d: ISODate, empId: string) => void;
  apply: (s: Suggestion) => void;
  publish: () => void;
  backToDraft: () => void;
  updateData: (fn: (d: Dataset) => Dataset, message?: string) => void;
  addLeaveAndRepair: (leave: Leave) => Promise<string[]>;
  replaceAll: (data: Dataset, rosters: Record<string, Roster>) => Promise<void>;
  reset: () => Promise<void>;
  flushNow: () => Promise<void>;
}

// ── background save machinery ──
let synced: { data: Dataset; rosters: Record<string, string> } = { data: EMPTY, rosters: {} };
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<void> | null = null;
let again = false;

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const markSynced = (data: Dataset, rosters: Record<string, Roster>) => {
        synced = { data, rosters: Object.fromEntries(Object.entries(rosters).map(([m, r]) => [m, JSON.stringify(r)])) };
      };

      const flush = async (): Promise<void> => {
        if (flushing) {
          again = true;
          return flushing;
        }
        const run = (async () => {
          try {
            do {
              again = false;
              const { data, rosters } = get();
              const ops = diffDataset(synced.data, data);
              const dirtyMonths = Object.keys(rosters).filter((m) => JSON.stringify(rosters[m]) !== synced.rosters[m]);
              if (!ops.length && !dirtyMonths.length) break;
              set({ saveState: 'saving' });
              for (const op of ops) {
                try {
                  await api(op.path, { method: op.method, body: op.body });
                } catch (e) {
                  if (!(op.method === 'DELETE' && (e as { status?: number }).status === 404)) throw e;
                }
              }
              synced.data = data;
              for (const m of dirtyMonths) {
                const json = JSON.stringify(rosters[m]);
                await api(`/rosters/${m}`, { method: 'PUT', body: rosters[m] });
                synced.rosters[m] = json;
              }
            } while (again);
            set({ saveState: 'saved', saveError: undefined });
          } catch (e) {
            set({ saveState: 'error', saveError: (e as Error).message });
            clearTimeout(timer);
            timer = setTimeout(() => void flush(), 5000); // retry
          }
        })();
        // set after creating the promise: a no-op flush can finish synchronously
        flushing = run;
        void run.finally(() => {
          if (flushing === run) flushing = null;
          if (again) void flush(); // a change arrived after the last loop pass
        });
        return run;
      };

      const scheduleSave = () => {
        set({ saveState: 'saving' });
        clearTimeout(timer);
        timer = setTimeout(() => void flush(), 400);
      };

      const updateRoster = (fn: (r: Roster) => Roster) => {
        const { rosters, month } = get();
        const r = rosters[month];
        if (!r) return;
        set({ rosters: { ...rosters, [month]: fn(r) } });
        scheduleSave();
      };

      /** Store a roster that came back from the server (already saved there). */
      const acceptServerRoster = (r: Roster) => {
        set({ rosters: { ...get().rosters, [r.month]: r } });
        synced.rosters[r.month] = JSON.stringify(r);
      };

      const flushNow = async () => {
        clearTimeout(timer);
        await flush();
        if (get().saveState === 'error') throw new Error(get().saveError ?? 'Could not save changes');
      };

      return {
        status: 'loading',
        saveState: 'saved',
        data: EMPTY,
        month: defaultMonth(),
        rosters: {},

        load: async () => {
          set({ status: 'loading', loadError: undefined });
          try {
            const { data, rosters } = await api<{ data: Dataset; rosters: Record<string, Roster> }>('/bootstrap');
            markSynced(data, rosters);
            set({ data, rosters, status: 'ready' });
          } catch (e) {
            set({ status: 'error', loadError: (e as Error).message });
          }
        },

        setMonth: (m) => set({ month: m }),

        generate: async () => {
          await flushNow();
          const { roster } = await api<{ roster: Roster }>(`/rosters/${get().month}/generate`, { method: 'POST', body: {} });
          acceptServerRoster(roster);
        },

        regenerateFrom: async (d) => {
          await flushNow();
          const { roster } = await api<{ roster: Roster }>(`/rosters/${get().month}/generate`, { method: 'POST', body: { freezeBefore: d } });
          acceptServerRoster(roster);
        },

        repair: async () => {
          if (!get().rosters[get().month]) return [];
          await flushNow();
          const { roster, actions } = await api<{ roster: Roster; actions: string[] }>(`/rosters/${get().month}/repair`, { method: 'POST' });
          acceptServerRoster(roster);
          return actions;
        },

        setCell: (d, empId, patch) => {
          updateRoster((r) => {
            const cells = cloneCells(r.cells);
            const prev = cells[d]?.[empId] ?? { status: 'WORK', covers: [], locked: false, source: 'AUTO' };
            const next: Cell = { ...prev, ...patch, locked: true, source: 'MANUAL' };
            if (next.status !== 'WORK') next.covers = [];
            if (next.status === 'OFF' && !next.offKind) next.offKind = 'WEEKLY';
            if (next.status !== 'OFF') delete next.offKind;
            cells[d][empId] = next;
            const name = get().data.employees.find((e) => e.id === empId)?.name ?? empId;
            const what = patch.status ? `→ ${patch.status}` : patch.covers ? `covers [${next.covers.join(', ') || 'none'}]` : 'edited';
            return withLog(r, `Manual edit: ${name} on ${d} ${what}`, cells);
          });
        },

        unlockCell: (d, empId) =>
          updateRoster((r) => {
            const cells = cloneCells(r.cells);
            if (cells[d]?.[empId]) cells[d][empId].locked = false;
            return { ...r, cells };
          }),

        apply: (s) => {
          const { data, month } = get();
          updateRoster((r) => withLog(r, `Applied fix: ${s.label}`, applySuggestion(data, month, r.cells, s)));
        },

        publish: () =>
          updateRoster((r) => ({
            ...withLog(r, `Published version ${r.version}`),
            status: 'PUBLISHED',
            publishedAt: new Date().toISOString(),
            publishedCells: cloneCells(r.cells),
          })),

        backToDraft: () => updateRoster((r) => ({ ...withLog(r, 'Moved back to draft for changes'), status: 'DRAFT' })),

        updateData: (fn, message) => {
          set({ data: fn(get().data) });
          scheduleSave();
          if (message) updateRoster((r) => withLog(r, `Setup: ${message}`));
        },

        addLeaveAndRepair: async (leave) => {
          const emp = get().data.employees.find((e) => e.id === leave.employeeId)?.name;
          set({ data: { ...get().data, leaves: [...get().data.leaves, leave] } });
          updateRoster((r) => {
            // unlock the absent person's cells so the leave can be applied
            const cells = cloneCells(r.cells);
            for (const [d, day] of Object.entries(cells)) if (d >= leave.from && d <= leave.to && day[leave.employeeId]) day[leave.employeeId].locked = false;
            return withLog({ ...r, cells }, `Change: ${emp} unavailable ${leave.from} → ${leave.to} (${leave.type.toLowerCase()})`);
          });
          return get().repair();
        },

        replaceAll: async (data, rosters) => {
          clearTimeout(timer);
          const out = await api<{ data: Dataset; rosters: Record<string, Roster> }>('/admin/import', { method: 'POST', body: { data, rosters } });
          markSynced(out.data, out.rosters);
          set({ data: out.data, rosters: out.rosters, saveState: 'saved' });
        },

        reset: async () => {
          clearTimeout(timer);
          const month = defaultMonth();
          const out = await api<{ data: Dataset; rosters: Record<string, Roster> }>('/admin/reset', { method: 'POST', body: { month } });
          markSynced(out.data, out.rosters);
          set({ data: out.data, rosters: out.rosters, month, saveState: 'saved' });
        },

        flushNow,
      };
    },
    {
      name: 'embo-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ month: s.month }),
    },
  ),
);
