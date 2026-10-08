export interface MonthGrid {
  /** Month and year for the heading, for example "October 2026". */
  title: string;
  /** Day numbers of the previous month that fill the first week, for example [28, 29, 30]. */
  leading: number[];
  daysInMonth: number;
  /** Day of the month for `today`. */
  todayDay: number;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Builds a Monday-first month grid for an ISO date such as "2026-10-08". */
export function monthGrid(isoDate: string): MonthGrid {
  const [y, m, d] = isoDate.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const leading = Array.from({ length: offset }, (_, i) => prevDays - offset + 1 + i);
  return { title: `${MONTHS[m - 1]} ${y}`, leading, daysInMonth, todayDay: d };
}
