// ───────────────────────── Domain model ─────────────────────────
// Everything the operations manager configures lives in a `Dataset`.
// A generated `Roster` is a separate object that references the dataset by id.

export type ISODate = string; // 'YYYY-MM-DD'
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Pod {
  id: string;
  name: string;
  leadId: string | null; // employee who leads the pod
}

export interface Employee {
  id: string;
  name: string;
  podId: string;
  /** Weekdays the employee would like as weekly off (soft preference). */
  preferredOffDays: Weekday[];
  /** Weekly offs per full week (Mon–Sun). Default 1. */
  weeklyOffs: number;
  /** Comp-off days carried in from earlier months. */
  compOffOpening: number;
  active: boolean;
}

export interface Process {
  id: string;
  code: string; // CS, ACC, NDR, RET …
  name: string;
}

export interface Brand {
  id: string;
  name: string;
  podId: string;
}

/** How a brand-process decides which days it operates. */
export type CalendarMode = 'ALL_DAYS' | 'NO_PH' | 'NO_SUN_NO_PH' | 'CUSTOM';

export interface CalendarRule {
  mode: CalendarMode;
  /** Only for CUSTOM: weekdays it operates. */
  weekdays?: Weekday[];
  /** Only for CUSTOM: closed on public holidays? */
  holidaysOff?: boolean;
}

export type Shift = 'GENERAL' | 'LATE';

/** A process run for a specific brand — the unit that needs coverage. */
export interface BrandProcess {
  id: string;
  brandId: string;
  processId: string;
  rule: CalendarRule;
  shift: Shift;
  /** Minimum people needed on an operating day. */
  minStaff: number;
  /** Optional per-weekday override of minStaff (e.g. Mondays need 2). */
  weekdayMin?: Partial<Record<Weekday, number>>;
  /** Optional per-date override (e.g. sale day). */
  dateMin?: Record<ISODate, number>;
}

/** PRIMARY = owns the work. BACKUP = trained to cover when primaries are off. */
export type AssignmentType = 'PRIMARY' | 'BACKUP';

export interface Assignment {
  id: string;
  employeeId: string;
  brandProcessId: string;
  type: AssignmentType;
}

export interface Holiday {
  date: ISODate;
  name: string;
}

export type LeaveType = 'PLANNED' | 'SICK' | 'COMP_OFF';
export type LeaveStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

export interface Leave {
  id: string;
  employeeId: string;
  from: ISODate;
  to: ISODate;
  type: LeaveType;
  status: LeaveStatus;
  note?: string;
}

export interface Settings {
  /** Hard cap on consecutive working days. */
  maxConsecutiveDays: number;
  /** Max brand-processes one person can handle on a day (own + covers). */
  maxResponsibilitiesPerDay: number;
  /** A week (Mon–Sun) only earns a weekly off if at least this many of its days fall in the month. */
  minDaysInWeekForOff: number;
}

export interface Dataset {
  pods: Pod[];
  employees: Employee[];
  processes: Process[];
  brands: Brand[];
  brandProcesses: BrandProcess[];
  assignments: Assignment[];
  holidays: Holiday[];
  leaves: Leave[];
  settings: Settings;
}

// ───────────────────────── Roster ─────────────────────────

export type DayStatus = 'WORK' | 'OFF' | 'LEAVE' | 'COMP_OFF' | 'HOLIDAY';

export interface Cell {
  status: DayStatus;
  /** Brand-process ids this person covers as a backup on this day (on top of own work). */
  covers: string[];
  /** Locked cells are never changed by the generator/repair (manual edits lock automatically). */
  locked: boolean;
  source: 'AUTO' | 'MANUAL';
  /** OFF reason: weekly off vs. all own brand-processes closed that day. */
  offKind?: 'WEEKLY' | 'NON_OPERATING';
}

export type RosterStatus = 'DRAFT' | 'PUBLISHED';

export interface ChangeLogEntry {
  at: string; // ISO timestamp
  message: string;
  afterPublish: boolean;
}

export interface Roster {
  month: string; // 'YYYY-MM'
  /** cells[date][employeeId] */
  cells: Record<ISODate, Record<string, Cell>>;
  status: RosterStatus;
  version: number;
  generatedAt: string;
  publishedAt?: string;
  /** Snapshot of cells at publish time — used to show what changed afterwards. */
  publishedCells?: Record<ISODate, Record<string, Cell>>;
  log: ChangeLogEntry[];
}

// ───────────────────────── Validation ─────────────────────────

export type Severity = 'HARD' | 'SOFT' | 'INFO';

export type IssueCode =
  | 'COVERAGE_GAP'
  | 'NO_PRIMARY'
  | 'LEAVE_CONFLICT'
  | 'SHIFT_CONFLICT'
  | 'OVERLOAD'
  | 'INVALID_COVER'
  | 'WEEKLY_OFF_MISSING'
  | 'MAX_CONSECUTIVE'
  | 'COMP_OFF_BALANCE'
  | 'MULTI_BRAND_IMPACT'
  | 'PREFERENCE_NOT_MET'
  | 'NO_WEEKEND_OFF'
  | 'CROSS_COVER'
  | 'BACKUP_OVERUSE'
  | 'PENDING_LEAVE';

export interface Issue {
  id: string;
  severity: Severity;
  code: IssueCode;
  title: string;
  detail: string;
  date?: ISODate;
  employeeId?: string;
  brandProcessId?: string;
  /** Other employees involved (e.g. the absent owners behind a gap). */
  relatedEmployeeIds?: string[];
}

export type Suggestion =
  | {
      kind: 'ASSIGN_COVER';
      employeeId: string;
      brandProcessId: string;
      date: ISODate;
      tier: 1 | 2;
      callIn: boolean; // employee was on holiday and is called in (earns comp-off)
      label: string;
    }
  | {
      kind: 'MOVE_OFF';
      employeeId: string;
      fromDate: ISODate;
      toDate: ISODate;
      label: string;
    }
  | {
      kind: 'REMOVE_COVER';
      employeeId: string;
      brandProcessId: string;
      date: ISODate;
      label: string;
    }
  | {
      kind: 'GIVE_OFF';
      employeeId: string;
      date: ISODate;
      label: string;
    }
  | {
      kind: 'REPAIR';
      label: string;
    };

export interface EvaluatedSuggestion {
  suggestion: Suggestion;
  hardBefore: number;
  hardAfter: number;
  softBefore: number;
  softAfter: number;
  resolves: boolean;
}
