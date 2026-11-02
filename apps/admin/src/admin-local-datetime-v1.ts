/** HTML datetime-local values are local wall time; wire contracts require UTC. */
const TWO = (value: number) => String(value).padStart(2, '0');
export function adminLocalDatetimeToUtcV1(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(local)) throw new Error('Invalid local date and time.');
  const instant = new Date(local);
  if (!Number.isFinite(instant.getTime()) || adminUtcToLocalDatetimeV1(instant.toISOString()) !== local) {
    throw new Error('Nonexistent or invalid local date and time.');
  }
  return instant.toISOString();
}
export function adminUtcToLocalDatetimeV1(utc: string): string {
  const instant = new Date(utc);
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid UTC date and time.');
  return [instant.getFullYear(), TWO(instant.getMonth()+1), TWO(instant.getDate())].join('-')
    + 'T' + TWO(instant.getHours()) + ':' + TWO(instant.getMinutes());
}
