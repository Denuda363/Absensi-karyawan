import {
  AttendanceRecord,
  calculateLatenessMinutes,
  Employee,
  EmployeeSalaryProfile,
  getEmployeeShiftTolerance,
  getMonthEffectiveWorkDays,
  LateSettlement,
  PayrollAdjustment,
  PayrollMonthlyStatus,
  PayrollRecordStatus,
  PayrollSettings,
  SalaryRaiseRecord,
  ShiftConfig,
} from '../types';

export interface EmployeePayrollCalculation {
  employee: Employee;
  profile: EmployeeSalaryProfile;
  paydayDay: number;
  effectiveWorkDays: number;
  presentDays: number;
  hadirCount: number;
  terlambatCount: number;
  izinTerlambatCount: number;
  izinCount: number;
  sakitCount: number;
  alphaCount: number;
  overtimeHours: number;
  totalLateMinutes: number;
  workSettledMinutes: number;
  salarySettledMinutes: number;
  recordedLateDeduction: number;
  remainingLateMinutes: number;
  autoRemainingLateDeduction: number;
  totalLateDeduction: number;
  baseSalary: number;
  positionAllowance: number;
  transportMealAllowance: number;
  otherAllowance: number;
  overtimeHourlyRate: number;
  overtimePay: number;
  bonusItems: PayrollAdjustment[];
  totalBonus: number;
  extraAllowanceItems: PayrollAdjustment[];
  totalExtraAllowance: number;
  grossSalary: number;
  alphaDeduction: number;
  izinDeduction: number;
  bpjsKesehatanDeduction: number;
  bpjsTkDeduction: number;
  otherDeductionItems: PayrollAdjustment[];
  totalOtherDeduction: number;
  totalDeductions: number;
  netSalary: number;
  latestRaise?: SalaryRaiseRecord;
  status: PayrollRecordStatus;
  paidAt?: string;
}

export function formatRupiah(amount: number): string {
  return `Rp ${Math.max(0, Math.round(amount)).toLocaleString('id-ID')}`;
}

export function calculateEmployeePayroll(params: {
  employee: Employee;
  attendanceRecords: AttendanceRecord[];
  lateSettlements: LateSettlement[];
  shifts: ShiftConfig[];
  lateDeductionPerMinute: number;
  payrollSettings: PayrollSettings;
  salaryProfile?: EmployeeSalaryProfile;
  adjustments: PayrollAdjustment[];
  salaryRaises?: SalaryRaiseRecord[];
  monthlyStatus?: PayrollMonthlyStatus;
  yearMonth: string;
}): EmployeePayrollCalculation {
  const {
    employee,
    attendanceRecords,
    lateSettlements,
    shifts,
    lateDeductionPerMinute,
    payrollSettings,
    salaryProfile,
    adjustments,
    salaryRaises = [],
    monthlyStatus,
    yearMonth,
  } = params;

  const profile: EmployeeSalaryProfile = salaryProfile ?? {
    employeeId: employee.id,
    baseSalary: 0,
    positionAllowance: 0,
    transportMealAllowance: 0,
    otherAllowance: 0,
    overtimeHourlyRate: payrollSettings.defaultOvertimeHourlyRate,
    paydayDay: payrollSettings.paydayDayOfMonth,
    paymentMethod: 'transfer',
    bankName: 'BCA',
    bankAccountNumber: '',
    bankAccountHolder: employee.name,
    notes: '',
  };

  const paydayDay = Math.max(
    1,
    Math.min(
      31,
      Math.round(profile.paydayDay ?? payrollSettings.paydayDayOfMonth ?? 25)
    )
  );

  const monthRecords = attendanceRecords.filter(
    (r) => r.employeeId === employee.id && r.date.startsWith(yearMonth)
  );

  const effectiveWorkDays = getMonthEffectiveWorkDays(employee, yearMonth);
  const hadirCount = monthRecords.filter((r) => r.status === 'hadir').length;
  const terlambatCount = monthRecords.filter((r) => r.status === 'terlambat').length;
  const izinTerlambatCount = monthRecords.filter(
    (r) => r.status === 'izin_terlambat'
  ).length;
  const presentDays = hadirCount + terlambatCount + izinTerlambatCount;
  const izinCount = monthRecords.filter((r) => r.status === 'izin').length;
  const sakitCount = monthRecords.filter((r) => r.status === 'sakit').length;
  const alphaCount = monthRecords.filter((r) => r.status === 'alpha').length;
  const overtimeHours =
    Math.round(
      monthRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0) * 10
    ) / 10;

  // Lateness calculation integrated with LateSettlements
  const tolerance = getEmployeeShiftTolerance(employee, shifts);
  let totalLateMinutes = 0;
  for (const r of monthRecords) {
    if (r.status !== 'terlambat') continue;
    const rawLate = r.checkIn
      ? calculateLatenessMinutes(r.checkIn, employee.shiftStart)
      : 0;
    const effectiveLate =
      rawLate > 0 ? Math.max(0, rawLate - tolerance) : 0;
    totalLateMinutes += effectiveLate;
  }

  const empSettlements = lateSettlements.filter(
    (s) => s.employeeId === employee.id && s.yearMonth === yearMonth
  );
  let workSettledMinutes = 0;
  let salarySettledMinutes = 0;
  let recordedLateDeduction = 0;

  for (const s of empSettlements) {
    if (s.method === 'tambahan_jam_kerja') {
      workSettledMinutes += s.minutesSettled;
    } else {
      salarySettledMinutes += s.minutesSettled;
      recordedLateDeduction += s.deductionAmount || 0;
    }
  }

  const totalSettledMinutes = workSettledMinutes + salarySettledMinutes;
  const remainingLateMinutes = Math.max(0, totalLateMinutes - totalSettledMinutes);
  const autoRemainingLateDeduction = payrollSettings.autoDeductRemainingLate
    ? Math.round(remainingLateMinutes * Math.max(0, lateDeductionPerMinute))
    : 0;
  const totalLateDeduction = recordedLateDeduction + autoRemainingLateDeduction;

  // Earnings
  const baseSalary = Math.max(0, Math.round(profile.baseSalary || 0));
  const positionAllowance = Math.max(0, Math.round(profile.positionAllowance || 0));
  const transportMealAllowance = Math.max(
    0,
    Math.round(profile.transportMealAllowance || 0)
  );
  const otherAllowance = Math.max(0, Math.round(profile.otherAllowance || 0));
  const overtimeHourlyRate =
    profile.overtimeHourlyRate !== undefined && profile.overtimeHourlyRate >= 0
      ? Math.round(profile.overtimeHourlyRate)
      : payrollSettings.defaultOvertimeHourlyRate;
  const overtimePay = Math.round(overtimeHours * overtimeHourlyRate);

  const empMonthAdjustments = adjustments.filter(
    (a) => a.employeeId === employee.id && a.yearMonth === yearMonth
  );
  const bonusItems = empMonthAdjustments.filter((a) => a.type === 'bonus');
  const extraAllowanceItems = empMonthAdjustments.filter((a) => a.type === 'tunjangan');
  const otherDeductionItems = empMonthAdjustments.filter((a) => a.type === 'potongan');

  const totalBonus = bonusItems.reduce((acc, b) => acc + Math.round(b.amount), 0);
  const totalExtraAllowance = extraAllowanceItems.reduce(
    (acc, t) => acc + Math.round(t.amount),
    0
  );
  const totalOtherDeduction = otherDeductionItems.reduce(
    (acc, d) => acc + Math.round(d.amount),
    0
  );

  const grossSalary =
    baseSalary +
    positionAllowance +
    transportMealAllowance +
    otherAllowance +
    overtimePay +
    totalBonus +
    totalExtraAllowance;

  // Deductions
  const alphaDeduction =
    alphaCount * Math.max(0, Math.round(payrollSettings.defaultAlphaDeductionPerDay));
  const izinDeduction =
    izinCount * Math.max(0, Math.round(payrollSettings.defaultIzinDeductionPerDay));
  const bpjsKesehatanDeduction = Math.round(
    (baseSalary * Math.max(0, payrollSettings.bpjsKesehatanPct)) / 100
  );
  const bpjsTkDeduction = Math.round(
    (baseSalary * Math.max(0, payrollSettings.bpjsKetenagakerjaanPct)) / 100
  );

  const totalDeductions =
    totalLateDeduction +
    alphaDeduction +
    izinDeduction +
    bpjsKesehatanDeduction +
    bpjsTkDeduction +
    totalOtherDeduction;

  const netSalary = Math.max(0, grossSalary - totalDeductions);

  const latestRaise = [...salaryRaises]
    .filter((sr) => sr.employeeId === employee.id)
    .sort((a, b) => (b.raiseDate || '').localeCompare(a.raiseDate || ''))[0];

  return {
    employee,
    profile,
    paydayDay,
    effectiveWorkDays,
    presentDays,
    hadirCount,
    terlambatCount,
    izinTerlambatCount,
    izinCount,
    sakitCount,
    alphaCount,
    overtimeHours,
    totalLateMinutes,
    workSettledMinutes,
    salarySettledMinutes,
    recordedLateDeduction,
    remainingLateMinutes,
    autoRemainingLateDeduction,
    totalLateDeduction,
    baseSalary,
    positionAllowance,
    transportMealAllowance,
    otherAllowance,
    overtimeHourlyRate,
    overtimePay,
    bonusItems,
    totalBonus,
    extraAllowanceItems,
    totalExtraAllowance,
    grossSalary,
    alphaDeduction,
    izinDeduction,
    bpjsKesehatanDeduction,
    bpjsTkDeduction,
    otherDeductionItems,
    totalOtherDeduction,
    totalDeductions,
    netSalary,
    latestRaise,
    status: monthlyStatus?.status ?? 'draft',
    paidAt: monthlyStatus?.paidAt,
  };
}
