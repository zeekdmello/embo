import { daysInMonth, weekday } from '../engine/calendar';
import type {
  Assignment,
  Brand,
  BrandProcess,
  CalendarRule,
  Dataset,
  Employee,
  Holiday,
  Leave,
  Pod,
  Shift,
  Weekday,
} from '../engine/types';

/**
 * SAMPLE DATASET — 32 employees, 4 pods, 25 brands (20 single-owner = 80%, 5 multi-owner).
 * All names are fictional. Leaves are generated relative to the demo month so the demo
 * scenarios always line up no matter when the app is opened.
 *
 * Built-in scenarios:
 *  • Single-owner brands with a buddy backup (e.g. Rohan ↔ Sneha).
 *  • Multi-owner brands with separate processes (FitFuel, Craftory) and shared processes
 *    (PureSip CS needs 2 people; Glowveda & Hearth & Hive CS need 2 on Mondays).
 *  • Late-shift brands (Nomad Gear, Trailblaze) whose backups must not mix shifts.
 *  • An UNRESOLVABLE gap: Siddharth (Trailblaze, sole owner) and Neha (his only backup) are both
 *    on leave on the same day → the app flags it instead of producing an invalid roster.
 *  • A pending leave request (Kavya) awaiting manager decision, comp-off usage (Rahul).
 */

const R365: CalendarRule = { mode: 'ALL_DAYS' };
const NOPH: CalendarRule = { mode: 'NO_PH' };
const MONSAT: CalendarRule = { mode: 'NO_SUN_NO_PH' };
const WEEKDAYS: CalendarRule = { mode: 'CUSTOM', weekdays: [1, 2, 3, 4, 5], holidaysOff: true };

export const SAMPLE_HOLIDAYS: Holiday[] = [
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-04', name: 'Holi' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-10-02', name: 'Gandhi Jayanti' },
  { date: '2026-10-20', name: 'Dussehra' },
  { date: '2026-11-09', name: 'Diwali (observed)' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti' },
  { date: '2026-12-25', name: 'Christmas' },
  { date: '2027-01-01', name: "New Year's Day" },
  { date: '2027-01-26', name: 'Republic Day' },
  { date: '2027-03-22', name: 'Holi' },
  { date: '2027-03-26', name: 'Good Friday' },
  { date: '2027-05-01', name: 'Labour Day' },
  { date: '2027-08-16', name: 'Independence Day (observed)' },
  { date: '2027-10-02', name: 'Gandhi Jayanti' },
  { date: '2027-10-29', name: 'Diwali' },
  { date: '2027-12-25', name: 'Christmas' },
];

interface BrandSpec {
  id: string;
  name: string;
  pod: string;
  processes: {
    code: 'CS' | 'ACC' | 'NDR' | 'RET';
    rule: CalendarRule;
    min?: number;
    weekdayMin?: Partial<Record<Weekday, number>>;
    shift?: Shift;
    primaries: string[];
    backups?: string[];
  }[];
}

const PODS: Pod[] = [
  { id: 'pod-alpha', name: 'Pod Alpha', leadId: 'priya' },
  { id: 'pod-beta', name: 'Pod Beta', leadId: 'vikram' },
  { id: 'pod-gamma', name: 'Pod Gamma', leadId: 'sana' },
  { id: 'pod-delta', name: 'Pod Delta', leadId: 'neha' },
];

const EMP: [id: string, name: string, pod: string, prefs: Weekday[], compOff?: number][] = [
  // Alpha
  ['priya', 'Priya Nair', 'pod-alpha', [0]],
  ['rohan', 'Rohan Mehta', 'pod-alpha', [0]],
  ['sneha', 'Sneha Kulkarni', 'pod-alpha', [6]],
  ['arjun', 'Arjun Rao', 'pod-alpha', [0]],
  ['meera', 'Meera Iyer', 'pod-alpha', [3]],
  ['kabir', 'Kabir Singh', 'pod-alpha', [0]],
  ['tanvi', 'Tanvi Desai', 'pod-alpha', [5]],
  ['ishaan', 'Ishaan Verma', 'pod-alpha', [2]],
  // Beta
  ['vikram', 'Vikram Joshi', 'pod-beta', [0]],
  ['ananya', 'Ananya Gupta', 'pod-beta', [0]],
  ['dev', 'Dev Patel', 'pod-beta', [6]],
  ['nisha', 'Nisha Reddy', 'pod-beta', [1]],
  ['karan', 'Karan Malhotra', 'pod-beta', [0]],
  ['pooja', 'Pooja Shah', 'pod-beta', [6, 0]],
  ['rahul', 'Rahul Bose', 'pod-beta', [0], 1],
  ['farah', 'Farah Khan', 'pod-beta', [4]],
  // Gamma
  ['sana', 'Sana Sheikh', 'pod-gamma', [6]],
  ['aditya', 'Aditya Kumar', 'pod-gamma', [0]],
  ['riya', 'Riya Chawla', 'pod-gamma', [6]],
  ['manav', 'Manav Jain', 'pod-gamma', [0]],
  ['zoya', 'Zoya Ali', 'pod-gamma', [0]],
  ['harsh', 'Harsh Vardhan', 'pod-gamma', []],
  ['lakshmi', 'Lakshmi Menon', 'pod-gamma', [3]],
  ['yash', 'Yash Thakur', 'pod-gamma', [0]],
  // Delta
  ['neha', 'Neha Kapoor', 'pod-delta', [0]],
  ['aman', 'Aman Sethi', 'pod-delta', [0]],
  ['divya', 'Divya Pillai', 'pod-delta', [1], 2],
  ['siddharth', 'Siddharth Roy', 'pod-delta', [3]],
  ['kavya', 'Kavya Bhat', 'pod-delta', [6]],
  ['gaurav', 'Gaurav Mishra', 'pod-delta', [0]],
  ['isha', 'Isha Dutta', 'pod-delta', [2]],
  ['omkar', 'Omkar Patil', 'pod-delta', []],
];

const BRANDS: BrandSpec[] = [
  // ── Pod Alpha ──
  { id: 'bloom', name: 'Bloom Botanics', pod: 'pod-alpha', processes: [
    { code: 'CS', rule: R365, primaries: ['rohan'], backups: ['sneha', 'priya'] },
    { code: 'ACC', rule: MONSAT, primaries: ['rohan'], backups: ['sneha', 'priya'] },
    { code: 'NDR', rule: NOPH, primaries: ['rohan'], backups: ['sneha', 'priya'] },
  ]},
  { id: 'urbanthread', name: 'UrbanThread', pod: 'pod-alpha', processes: [
    { code: 'CS', rule: R365, primaries: ['sneha'], backups: ['rohan', 'priya'] },
    { code: 'RET', rule: MONSAT, primaries: ['sneha'], backups: ['rohan'] },
  ]},
  { id: 'kettle', name: 'Kettle & Co', pod: 'pod-alpha', processes: [
    { code: 'CS', rule: NOPH, primaries: ['arjun'], backups: ['priya', 'rohan'] },
    { code: 'ACC', rule: MONSAT, primaries: ['arjun'], backups: ['priya'] },
  ]},
  { id: 'pawpantry', name: 'PawPantry', pod: 'pod-alpha', processes: [
    { code: 'CS', rule: MONSAT, primaries: ['arjun'], backups: ['priya'] },
  ]},
  { id: 'glowveda', name: 'Glowveda', pod: 'pod-alpha', processes: [
    { code: 'CS', rule: R365, weekdayMin: { 1: 2 }, primaries: ['meera', 'tanvi'], backups: ['kabir'] },
    { code: 'ACC', rule: MONSAT, primaries: ['kabir'], backups: ['meera'] },
    { code: 'NDR', rule: NOPH, primaries: ['tanvi'], backups: ['meera'] },
    { code: 'RET', rule: MONSAT, primaries: ['kabir'], backups: ['tanvi'] },
  ]},
  { id: 'nomad', name: 'Nomad Gear', pod: 'pod-alpha', processes: [
    { code: 'CS', rule: R365, shift: 'LATE', primaries: ['ishaan'], backups: ['priya'] },
  ]},
  // ── Pod Beta ──
  { id: 'crumb', name: 'Crumb Bakehouse', pod: 'pod-beta', processes: [
    { code: 'CS', rule: NOPH, primaries: ['ananya'], backups: ['nisha', 'vikram'] },
    { code: 'ACC', rule: MONSAT, primaries: ['ananya'], backups: ['nisha'] },
  ]},
  { id: 'voltride', name: 'VoltRide', pod: 'pod-beta', processes: [
    { code: 'CS', rule: R365, primaries: ['dev'], backups: ['farah', 'vikram'] },
    { code: 'NDR', rule: R365, primaries: ['dev'], backups: ['farah', 'vikram'] },
  ]},
  { id: 'solestory', name: 'SoleStory', pod: 'pod-beta', processes: [
    { code: 'CS', rule: R365, primaries: ['nisha'], backups: ['ananya', 'vikram'] },
    { code: 'ACC', rule: NOPH, primaries: ['nisha'], backups: ['ananya'] },
    { code: 'RET', rule: MONSAT, primaries: ['nisha'], backups: ['vikram'] },
  ]},
  { id: 'fitfuel', name: 'FitFuel', pod: 'pod-beta', processes: [
    { code: 'CS', rule: R365, primaries: ['karan'], backups: ['pooja', 'vikram'] },
    { code: 'NDR', rule: NOPH, primaries: ['karan'], backups: ['pooja'] },
    { code: 'ACC', rule: MONSAT, primaries: ['pooja'], backups: ['karan'] },
    { code: 'RET', rule: WEEKDAYS, primaries: ['pooja'], backups: ['karan'] },
  ]},
  { id: 'leafluxe', name: 'LeafLuxe', pod: 'pod-beta', processes: [
    { code: 'CS', rule: MONSAT, primaries: ['rahul'], backups: ['vikram', 'ananya'] },
    { code: 'ACC', rule: MONSAT, primaries: ['rahul'], backups: ['vikram'] },
  ]},
  { id: 'tinytots', name: 'Tiny Tots Co', pod: 'pod-beta', processes: [
    { code: 'CS', rule: MONSAT, primaries: ['rahul'], backups: ['vikram'] },
  ]},
  { id: 'homehearth', name: 'HomeHearth', pod: 'pod-beta', processes: [
    { code: 'CS', rule: R365, primaries: ['farah'], backups: ['dev', 'vikram'] },
    { code: 'NDR', rule: NOPH, primaries: ['farah'], backups: ['dev'] },
    { code: 'ACC', rule: MONSAT, primaries: ['farah'], backups: ['vikram'] },
  ]},
  // ── Pod Gamma ──
  { id: 'puresip', name: 'PureSip', pod: 'pod-gamma', processes: [
    { code: 'CS', rule: R365, min: 2, weekdayMin: { 0: 1 }, primaries: ['aditya', 'riya', 'manav'], backups: ['sana'] },
    { code: 'ACC', rule: MONSAT, primaries: ['manav'], backups: ['aditya'] },
  ]},
  { id: 'craftory', name: 'Craftory', pod: 'pod-gamma', processes: [
    { code: 'CS', rule: NOPH, primaries: ['zoya'], backups: ['harsh', 'sana'] },
    { code: 'ACC', rule: MONSAT, primaries: ['zoya'], backups: ['harsh'] },
    { code: 'NDR', rule: NOPH, primaries: ['harsh'], backups: ['zoya'] },
    { code: 'RET', rule: MONSAT, primaries: ['harsh'], backups: ['zoya'] },
  ]},
  { id: 'aquapure', name: 'AquaPure Home', pod: 'pod-gamma', processes: [
    { code: 'CS', rule: R365, primaries: ['lakshmi'], backups: ['sana', 'zoya'] },
    { code: 'NDR', rule: R365, primaries: ['lakshmi'], backups: ['sana', 'harsh'] },
  ]},
  { id: 'spiceroute', name: 'Spice Route', pod: 'pod-gamma', processes: [
    { code: 'CS', rule: MONSAT, primaries: ['yash'], backups: ['sana', 'manav'] },
    { code: 'ACC', rule: MONSAT, primaries: ['yash'], backups: ['sana'] },
  ]},
  { id: 'rootsy', name: 'Rootsy', pod: 'pod-gamma', processes: [
    { code: 'CS', rule: NOPH, primaries: ['yash'], backups: ['sana', 'riya'] },
  ]},
  // ── Pod Delta ──
  { id: 'lumen', name: 'Lumen Skincare', pod: 'pod-delta', processes: [
    { code: 'CS', rule: R365, primaries: ['aman'], backups: ['neha', 'omkar'] },
    { code: 'ACC', rule: MONSAT, primaries: ['aman'], backups: ['neha', 'omkar'] },
    { code: 'NDR', rule: NOPH, primaries: ['aman'], backups: ['neha'] },
    { code: 'RET', rule: MONSAT, primaries: ['aman'], backups: ['omkar'] },
  ]},
  { id: 'brewtheory', name: 'Brew Theory', pod: 'pod-delta', processes: [
    { code: 'CS', rule: R365, primaries: ['divya'], backups: ['kavya', 'neha'] },
  ]},
  { id: 'petalpost', name: 'Petal Post', pod: 'pod-delta', processes: [
    { code: 'CS', rule: NOPH, primaries: ['divya'], backups: ['kavya'] },
    { code: 'NDR', rule: NOPH, primaries: ['divya'], backups: ['neha'] },
  ]},
  { id: 'trailblaze', name: 'Trailblaze', pod: 'pod-delta', processes: [
    { code: 'CS', rule: R365, shift: 'LATE', primaries: ['siddharth'], backups: ['neha'] },
    { code: 'NDR', rule: NOPH, shift: 'LATE', primaries: ['siddharth'], backups: ['neha', 'isha'] },
  ]},
  { id: 'mintly', name: 'Mintly', pod: 'pod-delta', processes: [
    { code: 'CS', rule: MONSAT, primaries: ['kavya'], backups: ['divya'] },
    { code: 'ACC', rule: MONSAT, primaries: ['kavya'], backups: ['neha'] },
  ]},
  { id: 'ozone', name: 'Ozone Wear', pod: 'pod-delta', processes: [
    { code: 'CS', rule: R365, primaries: ['kavya'], backups: ['divya', 'neha'] },
  ]},
  { id: 'hearthhive', name: 'Hearth & Hive', pod: 'pod-delta', processes: [
    { code: 'CS', rule: R365, weekdayMin: { 1: 2 }, primaries: ['gaurav', 'isha'], backups: ['neha'] },
    { code: 'NDR', rule: NOPH, primaries: ['isha'], backups: ['gaurav'] },
    { code: 'ACC', rule: MONSAT, primaries: ['omkar'], backups: ['isha'] },
    { code: 'RET', rule: MONSAT, primaries: ['omkar'], backups: ['isha'] },
  ]},
];

export function createSampleData(month: string): Dataset {
  const processes = [
    { id: 'CS', code: 'CS', name: 'Customer Support' },
    { id: 'ACC', code: 'ACC', name: 'Abandoned Cart Conversion' },
    { id: 'NDR', code: 'NDR', name: 'Non-Delivery Report' },
    { id: 'RET', code: 'RET', name: 'Retention' },
  ];
  const employees: Employee[] = EMP.map(([id, name, podId, prefs, compOff]) => ({
    id,
    name,
    podId,
    preferredOffDays: prefs,
    weeklyOffs: 1,
    compOffOpening: compOff ?? 0,
    active: true,
  }));
  const brands: Brand[] = [];
  const brandProcesses: BrandProcess[] = [];
  const assignments: Assignment[] = [];
  for (const b of BRANDS) {
    brands.push({ id: b.id, name: b.name, podId: b.pod });
    for (const p of b.processes) {
      const bpId = `${b.id}-${p.code.toLowerCase()}`;
      brandProcesses.push({
        id: bpId,
        brandId: b.id,
        processId: p.code,
        rule: p.rule,
        shift: p.shift ?? 'GENERAL',
        minStaff: p.min ?? 1,
        weekdayMin: p.weekdayMin,
      });
      for (const e of p.primaries) assignments.push({ id: `as-${bpId}-${e}`, employeeId: e, brandProcessId: bpId, type: 'PRIMARY' });
      for (const e of p.backups ?? []) assignments.push({ id: `as-${bpId}-${e}-b`, employeeId: e, brandProcessId: bpId, type: 'BACKUP' });
    }
  }

  // leaves relative to the demo month
  const days = daysInMonth(month);
  const day = (n: number) => days[Math.min(n, days.length) - 1];
  const nthWeekdayAfter = (n: number, wd: Weekday) => days.find((d, i) => i + 1 >= n && weekday(d) === wd) ?? day(n);
  const firstMonAfter15 = nthWeekdayAfter(15, 1);
  const leaves: Leave[] = [
    { id: 'lv-dev', employeeId: 'dev', from: day(7), to: day(9), type: 'PLANNED', status: 'APPROVED', note: 'Family function' },
    { id: 'lv-sid', employeeId: 'siddharth', from: day(14), to: day(16), type: 'PLANNED', status: 'APPROVED', note: 'Travel' },
    { id: 'lv-neha', employeeId: 'neha', from: day(15), to: day(15), type: 'PLANNED', status: 'APPROVED', note: 'Personal' },
    { id: 'lv-meera', employeeId: 'meera', from: firstMonAfter15, to: firstMonAfter15, type: 'SICK', status: 'APPROVED', note: 'Medical appointment' },
    { id: 'lv-aditya', employeeId: 'aditya', from: day(22), to: day(24), type: 'PLANNED', status: 'APPROVED' },
    { id: 'lv-rahul', employeeId: 'rahul', from: day(11), to: day(11), type: 'COMP_OFF', status: 'APPROVED', note: 'Using carried comp-off' },
    { id: 'lv-lakshmi', employeeId: 'lakshmi', from: day(24), to: day(26), type: 'PLANNED', status: 'APPROVED', note: 'Vacation' },
    { id: 'lv-kavya', employeeId: 'kavya', from: day(28), to: day(29), type: 'PLANNED', status: 'PENDING', note: 'Awaiting approval' },
  ];

  return {
    pods: PODS.map((p) => ({ ...p })),
    employees,
    processes,
    brands,
    brandProcesses,
    assignments,
    holidays: SAMPLE_HOLIDAYS.map((h) => ({ ...h })),
    leaves,
    settings: { maxConsecutiveDays: 6, maxResponsibilitiesPerDay: 6, minDaysInWeekForOff: 4 },
  };
}
