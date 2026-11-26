import {
  Employee,
  getActiveWeekDates,
  getShiftMembersForWeekday,
  HARI_WEEKDAYS,
  isEmployeeOffOnShiftDay,
  ShiftConfig,
} from '../types';

export interface DailyScheduleRoleRow {
  /** Text per shift column (index aligns with `shiftHeaders`) */
  cells: string[];
}

export interface DailyScheduleRoleGroup {
  key: string;
  label: string;
  isLeader: boolean;
  rows: DailyScheduleRoleRow[];
}

export interface DailyScheduleBlock {
  dayIndex: number;
  dayLabel: string;
  shiftHeaders: string[];
  roleGroups: DailyScheduleRoleGroup[];
  offNames: string[];
}

interface RoleMeta {
  key: string;
  label: string;
  order: number;
  isLeader: boolean;
}

export function formatShiftColumnHeader(shift: ShiftConfig): string {
  const cleaned = shift.name.trim().replace(/^shift\s+/i, '').trim() || shift.name.trim();
  return `${cleaned.toUpperCase()} (${shift.startTime}-${shift.endTime})`;
}

export function normalizeRoleMeta(position?: string, department?: string): RoleMeta {
  const raw = (position || department || 'LAINNYA').trim();
  const lower = raw.toLowerCase();

  if (lower === 'leader' || lower === 'lead' || lower === 'supervisor' || lower === 'spv') {
    return { key: 'LEADER', label: 'LEADER', order: 1, isLeader: true };
  }
  if (
    lower === 'fa' ||
    lower === 'finance' ||
    lower === 'keuangan' ||
    lower === 'accounting' ||
    lower === 'akunting'
  ) {
    return { key: 'FINANCE', label: 'FINANCE', order: 2, isLeader: false };
  }
  if (lower === 'fl' || lower === 'frontliner' || lower === 'front liner' || lower === 'front-liner') {
    return { key: 'FL', label: 'FL', order: 3, isLeader: false };
  }
  if (
    lower === 'log' ||
    lower === 'logistik' ||
    lower === 'logistic' ||
    lower === 'logistics' ||
    lower === 'gudang' ||
    lower === 'warehouse'
  ) {
    return { key: 'LOG', label: 'LOG', order: 4, isLeader: false };
  }
  if (
    lower === 'deliv' ||
    lower === 'deliver' ||
    lower === 'delivery' ||
    lower === 'kurir' ||
    lower === 'driver'
  ) {
    return { key: 'DELIV', label: 'DELIV', order: 5, isLeader: false };
  }
  if (lower === 'adm' || lower === 'admin' || lower === 'administrasi' || lower === 'administration') {
    return { key: 'ADM', label: 'ADM', order: 6, isLeader: false };
  }
  if (lower === 'fakturis' || lower === 'faktur') {
    return { key: 'FAKTURIS', label: 'FAKTURIS', order: 7, isLeader: false };
  }
  if (lower === 'dispen' || lower === 'dispensing' || lower === 'dispensary') {
    return { key: 'DISPEN', label: 'DISPEN', order: 8, isLeader: false };
  }
  if (
    lower === 'purchase' ||
    lower === 'purchasing' ||
    lower === 'procurement' ||
    lower === 'pembelian'
  ) {
    return { key: 'PURCHASE', label: 'PURCHASE', order: 9, isLeader: false };
  }

  const upper = raw.toUpperCase() || 'LAINNYA';
  return { key: upper, label: upper, order: 100, isLeader: false };
}

export interface EmployeePositionGroup {
  key: string;
  label: string;
  isLeader: boolean;
  employees: Employee[];
}

export function groupEmployeesByPosition(employees: Employee[]): EmployeePositionGroup[] {
  const groupMap = new Map<
    string,
    { meta: RoleMeta; employees: Employee[] }
  >();

  for (const emp of employees) {
    const meta = normalizeRoleMeta(emp.position, emp.department);
    const existing = groupMap.get(meta.key);
    if (existing) {
      existing.employees.push(emp);
    } else {
      groupMap.set(meta.key, { meta, employees: [emp] });
    }
  }

  return Array.from(groupMap.values())
    .sort((a, b) => {
      if (a.meta.order !== b.meta.order) return a.meta.order - b.meta.order;
      return a.meta.label.localeCompare(b.meta.label, 'id');
    })
    .map(({ meta, employees: groupEmps }) => ({
      key: meta.key,
      label: meta.label,
      isLeader: meta.isLeader,
      employees: [...groupEmps].sort((a, b) => a.name.localeCompare(b.name, 'id')),
    }));
}

function chunkNamesIntoRows(names: string[], maxPerRow = 2): string[] {
  if (names.length === 0) return [];
  const lines: string[] = [];
  for (let i = 0; i < names.length; i += maxPerRow) {
    lines.push(names.slice(i, i + maxPerRow).join(', '));
  }
  return lines;
}

export function buildDailyScheduleBlocks(params: {
  shifts: ShiftConfig[];
  employees: Employee[];
  days?: ReadonlyArray<{ index: number; label: string }>;
}): DailyScheduleBlock[] {
  const { shifts, employees, days = HARI_WEEKDAYS } = params;
  const activeEmployees = employees
    .filter((e) => e.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));

  // Collect all role groups present across active employees in consistent canonical order
  const roleMap = new Map<string, RoleMeta>();
  for (const emp of activeEmployees) {
    const meta = normalizeRoleMeta(emp.position, emp.department);
    if (!roleMap.has(meta.key)) {
      roleMap.set(meta.key, meta);
    }
  }
  const orderedRoles = Array.from(roleMap.values()).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.label.localeCompare(b.label, 'id');
  });

  const shiftHeaders = shifts.map(formatShiftColumnHeader);
  const activeWeekDates = getActiveWeekDates();

  return days.map((day) => {
    const weekDateStr = activeWeekDates[day.index];
    const offEmployees = activeEmployees.filter(
      (emp) => isEmployeeOffOnShiftDay(emp, day.index, weekDateStr).isOff
    );
    const offNames = offEmployees.map((emp) => emp.name.trim().toUpperCase());

    // Precompute working employees per shift for this weekday (excluding routine & custom OFF)
    const workingPerShift: Employee[][] = shifts.map((shift) => {
      const { members } = getShiftMembersForWeekday(shift, day.index, activeEmployees);
      return members.filter(
        (emp) => !isEmployeeOffOnShiftDay(emp, day.index, weekDateStr).isOff
      );
    });

    const roleGroups: DailyScheduleRoleGroup[] = orderedRoles.map((role) => {
      const columnChunks: string[][] = workingPerShift.map((shiftMembers) => {
        const namesInRole = shiftMembers
          .filter((emp) => normalizeRoleMeta(emp.position, emp.department).key === role.key)
          .map((emp) => emp.name.trim().toUpperCase());
        return chunkNamesIntoRows(namesInRole, 2);
      });

      const rowCount = Math.max(1, ...columnChunks.map((chunks) => chunks.length));
      const rows: DailyScheduleRoleRow[] = [];
      for (let r = 0; r < rowCount; r++) {
        rows.push({
          cells: columnChunks.map((chunks) => chunks[r] ?? ''),
        });
      }

      return {
        key: role.key,
        label: role.label,
        isLeader: role.isLeader,
        rows,
      };
    });

    return {
      dayIndex: day.index,
      dayLabel: day.label.toUpperCase(),
      shiftHeaders,
      roleGroups,
      offNames,
    };
  });
}
