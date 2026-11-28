export type HolidayCategory = 'libur_nasional' | 'cuti_bersama';

export interface NationalHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  category: HolidayCategory;
}

const CURATED_HOLIDAYS_BY_YEAR: Record<number, NationalHoliday[]> = {
  2024: [
    { date: '2024-01-01', name: 'Tahun Baru 2024 Masehi', category: 'libur_nasional' },
    { date: '2024-02-08', name: 'Isra Mikraj Nabi Muhammad SAW', category: 'libur_nasional' },
    { date: '2024-02-09', name: 'Cuti Bersama Tahun Baru Imlek 2575 Kongzili', category: 'cuti_bersama' },
    { date: '2024-02-10', name: 'Tahun Baru Imlek 2575 Kongzili', category: 'libur_nasional' },
    { date: '2024-03-11', name: 'Hari Suci Nyepi Tahun Baru Saka 1946', category: 'libur_nasional' },
    { date: '2024-03-12', name: 'Cuti Bersama Hari Suci Nyepi', category: 'cuti_bersama' },
    { date: '2024-03-29', name: 'Wafat Yesus Kristus', category: 'libur_nasional' },
    { date: '2024-03-31', name: 'Kebangkitan Yesus Kristus (Paskah)', category: 'libur_nasional' },
    { date: '2024-04-08', name: 'Cuti Bersama Hari Raya Idulfitri 1445 Hijriah', category: 'cuti_bersama' },
    { date: '2024-04-09', name: 'Cuti Bersama Hari Raya Idulfitri 1445 Hijriah', category: 'cuti_bersama' },
    { date: '2024-04-10', name: 'Hari Raya Idulfitri 1445 Hijriah', category: 'libur_nasional' },
    { date: '2024-04-11', name: 'Hari Raya Idulfitri 1445 Hijriah', category: 'libur_nasional' },
    { date: '2024-04-12', name: 'Cuti Bersama Hari Raya Idulfitri 1445 Hijriah', category: 'cuti_bersama' },
    { date: '2024-04-15', name: 'Cuti Bersama Hari Raya Idulfitri 1445 Hijriah', category: 'cuti_bersama' },
    { date: '2024-05-01', name: 'Hari Buruh Internasional', category: 'libur_nasional' },
    { date: '2024-05-09', name: 'Kenaikan Yesus Kristus', category: 'libur_nasional' },
    { date: '2024-05-10', name: 'Cuti Bersama Kenaikan Yesus Kristus', category: 'cuti_bersama' },
    { date: '2024-05-23', name: 'Hari Raya Waisak 2568 BE', category: 'libur_nasional' },
    { date: '2024-05-24', name: 'Cuti Bersama Hari Raya Waisak 2568 BE', category: 'cuti_bersama' },
    { date: '2024-06-01', name: 'Hari Lahir Pancasila', category: 'libur_nasional' },
    { date: '2024-06-17', name: 'Hari Raya Iduladha 1445 Hijriah', category: 'libur_nasional' },
    { date: '2024-06-18', name: 'Cuti Bersama Hari Raya Iduladha 1445 Hijriah', category: 'cuti_bersama' },
    { date: '2024-07-07', name: '1 Muharam Tahun Baru Islam 1446 Hijriah', category: 'libur_nasional' },
    { date: '2024-08-17', name: 'Hari Proklamasi Kemerdekaan RI', category: 'libur_nasional' },
    { date: '2024-09-16', name: 'Maulid Nabi Muhammad SAW', category: 'libur_nasional' },
    { date: '2024-12-25', name: 'Kelahiran Yesus Kristus (Natal)', category: 'libur_nasional' },
    { date: '2024-12-26', name: 'Cuti Bersama Kelahiran Yesus Kristus', category: 'cuti_bersama' },
  ],
  2025: [
    { date: '2025-01-01', name: 'Tahun Baru 2025 Masehi', category: 'libur_nasional' },
    { date: '2025-01-27', name: 'Isra Mikraj Nabi Muhammad SAW', category: 'libur_nasional' },
    { date: '2025-01-28', name: 'Cuti Bersama Tahun Baru Imlek 2576 Kongzili', category: 'cuti_bersama' },
    { date: '2025-01-29', name: 'Tahun Baru Imlek 2576 Kongzili', category: 'libur_nasional' },
    { date: '2025-03-28', name: 'Cuti Bersama Hari Suci Nyepi Tahun Baru Saka 1947', category: 'cuti_bersama' },
    { date: '2025-03-29', name: 'Hari Suci Nyepi Tahun Baru Saka 1947', category: 'libur_nasional' },
    { date: '2025-03-31', name: 'Hari Raya Idulfitri 1446 Hijriah', category: 'libur_nasional' },
    { date: '2025-04-01', name: 'Hari Raya Idulfitri 1446 Hijriah', category: 'libur_nasional' },
    { date: '2025-04-02', name: 'Cuti Bersama Hari Raya Idulfitri 1446 Hijriah', category: 'cuti_bersama' },
    { date: '2025-04-03', name: 'Cuti Bersama Hari Raya Idulfitri 1446 Hijriah', category: 'cuti_bersama' },
    { date: '2025-04-04', name: 'Cuti Bersama Hari Raya Idulfitri 1446 Hijriah', category: 'cuti_bersama' },
    { date: '2025-04-07', name: 'Cuti Bersama Hari Raya Idulfitri 1446 Hijriah', category: 'cuti_bersama' },
    { date: '2025-04-18', name: 'Wafat Yesus Kristus', category: 'libur_nasional' },
    { date: '2025-04-20', name: 'Kebangkitan Yesus Kristus (Paskah)', category: 'libur_nasional' },
    { date: '2025-05-01', name: 'Hari Buruh Internasional', category: 'libur_nasional' },
    { date: '2025-05-12', name: 'Hari Raya Waisak 2569 BE', category: 'libur_nasional' },
    { date: '2025-05-13', name: 'Cuti Bersama Hari Raya Waisak 2569 BE', category: 'cuti_bersama' },
    { date: '2025-05-29', name: 'Kenaikan Yesus Kristus', category: 'libur_nasional' },
    { date: '2025-05-30', name: 'Cuti Bersama Kenaikan Yesus Kristus', category: 'cuti_bersama' },
    { date: '2025-06-01', name: 'Hari Lahir Pancasila', category: 'libur_nasional' },
    { date: '2025-06-06', name: 'Hari Raya Iduladha 1446 Hijriah', category: 'libur_nasional' },
    { date: '2025-06-09', name: 'Cuti Bersama Hari Raya Iduladha 1446 Hijriah', category: 'cuti_bersama' },
    { date: '2025-06-27', name: '1 Muharam Tahun Baru Islam 1447 Hijriah', category: 'libur_nasional' },
    { date: '2025-08-17', name: 'Hari Proklamasi Kemerdekaan RI', category: 'libur_nasional' },
    { date: '2025-08-18', name: 'Cuti Bersama Proklamasi Kemerdekaan RI', category: 'cuti_bersama' },
    { date: '2025-09-05', name: 'Maulid Nabi Muhammad SAW', category: 'libur_nasional' },
    { date: '2025-12-25', name: 'Kelahiran Yesus Kristus (Natal)', category: 'libur_nasional' },
    { date: '2025-12-26', name: 'Cuti Bersama Kelahiran Yesus Kristus', category: 'cuti_bersama' },
  ],
  2026: [
    { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi', category: 'libur_nasional' },
    { date: '2026-01-16', name: 'Isra Mikraj Nabi Muhammad SAW', category: 'libur_nasional' },
    { date: '2026-02-16', name: 'Cuti Bersama Tahun Baru Imlek 2577 Kongzili', category: 'cuti_bersama' },
    { date: '2026-02-17', name: 'Tahun Baru Imlek 2577 Kongzili', category: 'libur_nasional' },
    { date: '2026-03-18', name: 'Cuti Bersama Hari Suci Nyepi Tahun Baru Saka 1948', category: 'cuti_bersama' },
    { date: '2026-03-19', name: 'Hari Suci Nyepi Tahun Baru Saka 1948', category: 'libur_nasional' },
    { date: '2026-03-20', name: 'Cuti Bersama Hari Raya Idulfitri 1447 Hijriah', category: 'cuti_bersama' },
    { date: '2026-03-21', name: 'Hari Raya Idulfitri 1447 Hijriah', category: 'libur_nasional' },
    { date: '2026-03-22', name: 'Hari Raya Idulfitri 1447 Hijriah', category: 'libur_nasional' },
    { date: '2026-03-23', name: 'Cuti Bersama Hari Raya Idulfitri 1447 Hijriah', category: 'cuti_bersama' },
    { date: '2026-03-24', name: 'Cuti Bersama Hari Raya Idulfitri 1447 Hijriah', category: 'cuti_bersama' },
    { date: '2026-04-03', name: 'Wafat Yesus Kristus', category: 'libur_nasional' },
    { date: '2026-04-05', name: 'Kebangkitan Yesus Kristus (Paskah)', category: 'libur_nasional' },
    { date: '2026-05-01', name: 'Hari Buruh Internasional', category: 'libur_nasional' },
    { date: '2026-05-14', name: 'Kenaikan Yesus Kristus', category: 'libur_nasional' },
    { date: '2026-05-15', name: 'Cuti Bersama Kenaikan Yesus Kristus', category: 'cuti_bersama' },
    { date: '2026-05-27', name: 'Hari Raya Iduladha 1447 Hijriah', category: 'libur_nasional' },
    { date: '2026-05-28', name: 'Cuti Bersama Hari Raya Iduladha 1447 Hijriah', category: 'cuti_bersama' },
    { date: '2026-05-31', name: 'Hari Raya Waisak 2570 BE', category: 'libur_nasional' },
    { date: '2026-06-01', name: 'Hari Lahir Pancasila', category: 'libur_nasional' },
    { date: '2026-06-16', name: '1 Muharam Tahun Baru Islam 1448 Hijriah', category: 'libur_nasional' },
    { date: '2026-08-17', name: 'Hari Proklamasi Kemerdekaan RI', category: 'libur_nasional' },
    { date: '2026-08-25', name: 'Maulid Nabi Muhammad SAW', category: 'libur_nasional' },
    { date: '2026-12-24', name: 'Cuti Bersama Kelahiran Yesus Kristus', category: 'cuti_bersama' },
    { date: '2026-12-25', name: 'Kelahiran Yesus Kristus (Natal)', category: 'libur_nasional' },
  ],
  2027: [
    { date: '2027-01-01', name: 'Tahun Baru 2027 Masehi', category: 'libur_nasional' },
    { date: '2027-01-05', name: 'Isra Mikraj Nabi Muhammad SAW 1448 H', category: 'libur_nasional' },
    { date: '2027-02-06', name: 'Tahun Baru Imlek 2578 Kongzili', category: 'libur_nasional' },
    { date: '2027-03-08', name: 'Hari Suci Nyepi Tahun Baru Saka 1949', category: 'libur_nasional' },
    { date: '2027-03-10', name: 'Hari Raya Idulfitri 1448 Hijriah', category: 'libur_nasional' },
    { date: '2027-03-11', name: 'Hari Raya Idulfitri 1448 Hijriah', category: 'libur_nasional' },
    { date: '2027-03-26', name: 'Wafat Yesus Kristus', category: 'libur_nasional' },
    { date: '2027-03-28', name: 'Kebangkitan Yesus Kristus (Paskah)', category: 'libur_nasional' },
    { date: '2027-05-01', name: 'Hari Buruh Internasional', category: 'libur_nasional' },
    { date: '2027-05-06', name: 'Kenaikan Yesus Kristus', category: 'libur_nasional' },
    { date: '2027-05-17', name: 'Hari Raya Iduladha 1448 Hijriah', category: 'libur_nasional' },
    { date: '2027-05-20', name: 'Hari Raya Waisak 2571 BE', category: 'libur_nasional' },
    { date: '2027-06-01', name: 'Hari Lahir Pancasila', category: 'libur_nasional' },
    { date: '2027-06-06', name: '1 Muharam Tahun Baru Islam 1449 Hijriah', category: 'libur_nasional' },
    { date: '2027-08-15', name: 'Maulid Nabi Muhammad SAW 1449 H', category: 'libur_nasional' },
    { date: '2027-08-17', name: 'Hari Proklamasi Kemerdekaan RI', category: 'libur_nasional' },
    { date: '2027-12-25', name: 'Kelahiran Yesus Kristus (Natal)', category: 'libur_nasional' },
    { date: '2027-12-26', name: 'Isra Mikraj Nabi Muhammad SAW 1449 H', category: 'libur_nasional' },
  ],
};

function toDateStr(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getGregorianEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function buildFallbackHolidaysForYear(year: number): NationalHoliday[] {
  const easter = getGregorianEasterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const ascension = new Date(easter);
  ascension.setDate(easter.getDate() + 39);

  const items: NationalHoliday[] = [
    { date: `${year}-01-01`, name: `Tahun Baru ${year} Masehi`, category: 'libur_nasional' },
    { date: toDateStr(goodFriday), name: 'Wafat Yesus Kristus', category: 'libur_nasional' },
    { date: toDateStr(easter), name: 'Kebangkitan Yesus Kristus (Paskah)', category: 'libur_nasional' },
    { date: `${year}-05-01`, name: 'Hari Buruh Internasional', category: 'libur_nasional' },
    { date: toDateStr(ascension), name: 'Kenaikan Yesus Kristus', category: 'libur_nasional' },
    { date: `${year}-06-01`, name: 'Hari Lahir Pancasila', category: 'libur_nasional' },
    { date: `${year}-08-17`, name: 'Hari Proklamasi Kemerdekaan RI', category: 'libur_nasional' },
    { date: `${year}-12-25`, name: 'Kelahiran Yesus Kristus (Natal)', category: 'libur_nasional' },
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export function isCuratedHolidayYear(year: number): boolean {
  return Boolean(CURATED_HOLIDAYS_BY_YEAR[year]);
}

export function getHolidaysForYear(year: number): NationalHoliday[] {
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return [];
  const curated = CURATED_HOLIDAYS_BY_YEAR[year];
  if (curated) return curated;
  return buildFallbackHolidaysForYear(year);
}

export function getHolidayMapForYear(year: number): Map<string, NationalHoliday> {
  const map = new Map<string, NationalHoliday>();
  for (const h of getHolidaysForYear(year)) {
    map.set(h.date, h);
  }
  return map;
}

export function getHolidayForDate(dateStr: string): NationalHoliday | null {
  const year = Number(dateStr.slice(0, 4));
  if (!year) return null;
  const list = getHolidaysForYear(year);
  return list.find((h) => h.date === dateStr) ?? null;
}

export function getHolidaysInMonth(yearMonth: string): NationalHoliday[] {
  const year = Number(yearMonth.slice(0, 4));
  if (!year) return [];
  return getHolidaysForYear(year).filter((h) => h.date.startsWith(yearMonth));
}
