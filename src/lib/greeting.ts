/** The greeting for an hour of the day (0 to 23): morning from 5, afternoon from 12, evening from 17. */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
