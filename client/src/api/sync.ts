import type { Dataset } from '@shared/engine/types';

/**
 * Turns "old dataset → new dataset" into the minimal list of REST calls.
 * Every call is idempotent (PUT = create-or-replace, DELETE = remove-if-present), so a
 * failed save can simply be retried with the same diff.
 */
export interface SyncOp {
  method: 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
}

const COLLECTIONS: { key: keyof Omit<Dataset, 'settings'>; route: string; id: string }[] = [
  { key: 'pods', route: 'pods', id: 'id' },
  { key: 'employees', route: 'employees', id: 'id' },
  { key: 'processes', route: 'processes', id: 'id' },
  { key: 'brands', route: 'brands', id: 'id' },
  { key: 'brandProcesses', route: 'brand-processes', id: 'id' },
  { key: 'assignments', route: 'assignments', id: 'id' },
  { key: 'holidays', route: 'holidays', id: 'date' },
  { key: 'leaves', route: 'leaves', id: 'id' },
];

export function diffDataset(prev: Dataset, next: Dataset): SyncOp[] {
  const ops: SyncOp[] = [];
  for (const { key, route, id } of COLLECTIONS) {
    const before = new Map((prev[key] as unknown as Record<string, unknown>[]).map((x) => [String(x[id]), x]));
    const after = new Map((next[key] as unknown as Record<string, unknown>[]).map((x) => [String(x[id]), x]));
    for (const k of before.keys()) if (!after.has(k)) ops.push({ method: 'DELETE', path: `/${route}/${encodeURIComponent(k)}` });
    for (const [k, v] of after) {
      const old = before.get(k);
      if (!old || JSON.stringify(old) !== JSON.stringify(v)) ops.push({ method: 'PUT', path: `/${route}/${encodeURIComponent(k)}`, body: v });
    }
  }
  if (JSON.stringify(prev.settings) !== JSON.stringify(next.settings)) ops.push({ method: 'PUT', path: '/settings', body: next.settings });
  return ops;
}
