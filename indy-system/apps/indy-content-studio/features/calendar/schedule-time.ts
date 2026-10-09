const BANGKOK_TIME_ZONE = "Asia/Bangkok";

export function createBangkokScheduleTimestamp(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("วันหรือเวลาไม่ถูกต้อง");
  }
  return `${date}T${time}:00+07:00`;
}

export function formatBangkokSchedule(value: string): { date: string; time: string } {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    return { date: value.slice(0, 10), time: value.slice(11, 16) };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("วันเวลาปฏิทินไม่ถูกต้อง");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

export function compareScheduleTimestamps(left: string, right: string): number {
  const leftParts = formatBangkokSchedule(left);
  const rightParts = formatBangkokSchedule(right);
  return `${leftParts.date}T${leftParts.time}`.localeCompare(`${rightParts.date}T${rightParts.time}`);
}
