import mongoose, { Schema, type Model } from 'mongoose';

/**
 * MongoDB collections. Every document keeps the app's own string id as `_id`
 * (e.g. "rohan", "bloom-cs") so ids are stable across the browser, the API and exports.
 * Holidays use the date as `_id`; settings is a single document with `_id: "settings"`;
 * rosters use the month ("2026-12") as `_id`.
 */

const base = { versionKey: false, minimize: false } as const;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

const PodSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    leadId: { type: String, default: null },
  },
  base,
);

const EmployeeSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    podId: { type: String, required: true },
    preferredOffDays: { type: [Number], enum: WEEKDAYS, default: [] },
    weeklyOffs: { type: Number, min: 0, max: 7, default: 1 },
    compOffOpening: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true },
  },
  base,
);

const ProcessSchema = new Schema(
  {
    _id: { type: String, required: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  base,
);

const BrandSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    podId: { type: String, required: true },
  },
  base,
);

const RuleSchema = new Schema(
  {
    mode: { type: String, enum: ['ALL_DAYS', 'NO_PH', 'NO_SUN_NO_PH', 'CUSTOM'], required: true },
    weekdays: { type: [Number], enum: WEEKDAYS, default: undefined },
    holidaysOff: { type: Boolean, default: undefined },
  },
  { _id: false },
);

const BrandProcessSchema = new Schema(
  {
    _id: { type: String, required: true },
    brandId: { type: String, required: true, index: true },
    processId: { type: String, required: true },
    rule: { type: RuleSchema, required: true },
    shift: { type: String, enum: ['GENERAL', 'LATE'], default: 'GENERAL' },
    minStaff: { type: Number, min: 0, default: 1 },
    weekdayMin: { type: Schema.Types.Mixed, default: undefined },
    dateMin: { type: Schema.Types.Mixed, default: undefined },
  },
  base,
);

const AssignmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    employeeId: { type: String, required: true, index: true },
    brandProcessId: { type: String, required: true, index: true },
    type: { type: String, enum: ['PRIMARY', 'BACKUP'], required: true },
  },
  base,
);

const HolidaySchema = new Schema(
  {
    _id: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // the date
    name: { type: String, required: true, trim: true },
  },
  base,
);

const LeaveSchema = new Schema(
  {
    _id: { type: String, required: true },
    employeeId: { type: String, required: true, index: true },
    from: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    to: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    type: { type: String, enum: ['PLANNED', 'SICK', 'COMP_OFF'], required: true },
    status: { type: String, enum: ['APPROVED', 'PENDING', 'REJECTED'], required: true },
    note: { type: String, default: '' },
  },
  base,
);

const SettingsSchema = new Schema(
  {
    _id: { type: String, default: 'settings' },
    maxConsecutiveDays: { type: Number, min: 1, default: 6 },
    maxResponsibilitiesPerDay: { type: Number, min: 1, default: 6 },
    minDaysInWeekForOff: { type: Number, min: 1, max: 7, default: 4 },
  },
  base,
);

const RosterSchema = new Schema(
  {
    _id: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ }, // the month
    cells: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    version: { type: Number, default: 0 },
    generatedAt: { type: String },
    publishedAt: { type: String },
    publishedCells: { type: Schema.Types.Mixed },
    log: [{ _id: false, at: String, message: String, afterPublish: Boolean }],
  },
  base,
);

export const Pod = mongoose.model('Pod', PodSchema);
export const Employee = mongoose.model('Employee', EmployeeSchema);
export const ProcessType = mongoose.model('Process', ProcessSchema);
export const Brand = mongoose.model('Brand', BrandSchema);
export const BrandProcess = mongoose.model('BrandProcess', BrandProcessSchema);
export const Assignment = mongoose.model('Assignment', AssignmentSchema);
export const Holiday = mongoose.model('Holiday', HolidaySchema);
export const Leave = mongoose.model('Leave', LeaveSchema);
export const Settings = mongoose.model('Settings', SettingsSchema);
export const RosterModel = mongoose.model('Roster', RosterSchema);

/**
 * The dataset collections, keyed the same way as the `Dataset` type in /shared.
 * `idField` is the name the app uses for the document's `_id`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (m: unknown) => m as Model<any>; // the generic CRUD layer treats every collection the same way

export const COLLECTIONS = {
  pods: { model: loose(Pod), idField: 'id', route: 'pods' },
  employees: { model: loose(Employee), idField: 'id', route: 'employees' },
  processes: { model: loose(ProcessType), idField: 'id', route: 'processes' },
  brands: { model: loose(Brand), idField: 'id', route: 'brands' },
  brandProcesses: { model: loose(BrandProcess), idField: 'id', route: 'brand-processes' },
  assignments: { model: loose(Assignment), idField: 'id', route: 'assignments' },
  holidays: { model: loose(Holiday), idField: 'date', route: 'holidays' },
  leaves: { model: loose(Leave), idField: 'id', route: 'leaves' },
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;
