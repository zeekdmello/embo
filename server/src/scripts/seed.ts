/**
 * Loads (or reloads) the sample dataset into MongoDB and clears all rosters.
 *   npm run seed                 → leave scenarios placed in next month
 *   npm run seed -- 2026-12      → leave scenarios placed in December 2026
 */
import mongoose from 'mongoose';
import { createSampleData } from '@shared/data/seed';
import { defaultMonth, MONTH_RE } from '@shared/engine/roster';
import { connectDb } from '../db';
import { replaceDataset, replaceRosters } from '../services/dataset';

const month = process.argv[2] ?? defaultMonth();
if (!MONTH_RE.test(month)) {
  console.error('Usage: npm run seed -- YYYY-MM');
  process.exit(1);
}

await connectDb();
const data = createSampleData(month);
await replaceDataset(data);
await replaceRosters({});
console.log(`[seed] loaded ${data.employees.length} employees, ${data.brands.length} brands, ${data.brandProcesses.length} brand-processes (scenarios in ${month})`);
await mongoose.disconnect();
