import type { Model } from 'mongoose';
import type { Dataset, Roster, Settings as SettingsT } from '@shared/engine/types';
import { COLLECTIONS, RosterModel, Settings, type CollectionKey } from '../models';

/** Converts between MongoDB documents (`_id`) and the app's plain objects (`id` / `date`). */
export function fromDoc<T>(doc: Record<string, unknown>, idField = 'id'): T {
  const { _id, ...rest } = doc;
  return { [idField]: _id, ...rest } as T;
}

export function toDoc(obj: Record<string, unknown>, idField = 'id'): Record<string, unknown> {
  const { [idField]: id, _id: _ignored, ...rest } = obj;
  return { _id: id, ...rest };
}

export const DEFAULT_SETTINGS: SettingsT = { maxConsecutiveDays: 6, maxResponsibilitiesPerDay: 6, minDaysInWeekForOff: 4 };

export async function getSettings(): Promise<SettingsT> {
  const doc = await Settings.findById('settings').lean();
  if (!doc) return DEFAULT_SETTINGS;
  const { _id, ...rest } = doc as Record<string, unknown>;
  return { ...DEFAULT_SETTINGS, ...(rest as Partial<SettingsT>) };
}

/** Reads every collection and assembles the `Dataset` the scheduling engine works on. */
export async function loadDataset(): Promise<Dataset> {
  const entries = await Promise.all(
    (Object.keys(COLLECTIONS) as CollectionKey[]).map(async (key) => {
      const { model, idField } = COLLECTIONS[key];
      const docs = await (model as Model<unknown>).find().lean();
      return [key, docs.map((d) => fromDoc(d as Record<string, unknown>, idField))] as const;
    }),
  );
  return { ...(Object.fromEntries(entries) as Omit<Dataset, 'settings'>), settings: await getSettings() };
}

/** Replaces the whole dataset (used by import and "reset to sample data"). */
export async function replaceDataset(data: Dataset): Promise<void> {
  for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
    const { model, idField } = COLLECTIONS[key];
    const m = model as Model<unknown>;
    await m.deleteMany({});
    const rows = (data[key] as unknown as Record<string, unknown>[]) ?? [];
    if (rows.length) await m.insertMany(rows.map((r) => toDoc(r, idField)), { ordered: true });
  }
  await Settings.replaceOne({ _id: 'settings' }, { _id: 'settings', ...DEFAULT_SETTINGS, ...data.settings }, { upsert: true });
}

export async function loadRosters(): Promise<Record<string, Roster>> {
  const docs = await RosterModel.find().lean();
  return Object.fromEntries(docs.map((d) => [d._id, rosterFromDoc(d as Record<string, unknown>)]));
}

export function rosterFromDoc(doc: Record<string, unknown>): Roster {
  return fromDoc<Roster>(doc, 'month');
}

export async function saveRoster(r: Roster): Promise<Roster> {
  const { month, ...rest } = r;
  await RosterModel.replaceOne({ _id: month }, { _id: month, ...rest }, { upsert: true });
  return r;
}

export async function replaceRosters(rosters: Record<string, Roster>): Promise<void> {
  await RosterModel.deleteMany({});
  for (const r of Object.values(rosters)) await saveRoster(r);
}
