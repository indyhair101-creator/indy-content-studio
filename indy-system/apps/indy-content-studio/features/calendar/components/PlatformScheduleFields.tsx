"use client";

import type { Platform, PlatformSchedule } from "../../domain/types";
import { createBangkokScheduleTimestamp, formatBangkokSchedule } from "../schedule-time";

const platforms: Array<{ value: Platform; label: string }> = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
];

function defaultSchedule(platform: Platform): PlatformSchedule {
  return { platform, enabled: false, publishAt: null, latestAttemptId: null, manualEvidence: null };
}

export function PlatformScheduleFields({ schedules, allowedPlatforms, defaultDate, disabled = false, onChange }: {
  schedules: PlatformSchedule[];
  allowedPlatforms: Platform[];
  defaultDate?: string;
  disabled?: boolean;
  onChange: (schedules: PlatformSchedule[]) => void;
}) {
  function getSchedule(platform: Platform) {
    return schedules.find((schedule) => schedule.platform === platform) ?? defaultSchedule(platform);
  }

  function update(platform: Platform, values: Partial<PlatformSchedule>) {
    onChange(platforms.map(({ value }) => value === platform
      ? { ...getSchedule(platform), ...values }
      : getSchedule(value)));
  }

  function updateTime(platform: Platform, date: string, time: string) {
    update(platform, { publishAt: date && time ? createBangkokScheduleTimestamp(date, time) : null });
  }

  return <div className="platform-schedule-fields" aria-label="กำหนดวันเวลารายช่องทาง">
    {platforms.map(({ value, label }) => {
      const schedule = getSchedule(value);
      const supported = allowedPlatforms.includes(value);
      const formatted = schedule.publishAt ? formatBangkokSchedule(schedule.publishAt) : { date: defaultDate ?? "", time: "09:00" };
      return <div className="platform-schedule-row" key={value}>
        <label className="platform-schedule-toggle"><span className="platform-schedule-name">{label}</span><input type="checkbox" aria-label={`เปิด ${label}`} checked={schedule.enabled} disabled={disabled || !supported} onChange={(event) => update(value, { enabled: event.target.checked, publishAt: event.target.checked && !schedule.publishAt && defaultDate ? createBangkokScheduleTimestamp(defaultDate, "09:00") : schedule.publishAt })} /></label>
        {!supported && <span className="field-hint">รูปแบบนี้ไม่รองรับช่องทาง {label}</span>}
        <label>วันลง {label}<input type="date" aria-label={`วันลง ${label}`} value={formatted.date} disabled={disabled || !schedule.enabled || !supported} onChange={(event) => updateTime(value, event.target.value, formatted.time)} /></label>
        <label>เวลาลง {label}<input type="time" aria-label={`เวลาลง ${label}`} value={formatted.time} disabled={disabled || !schedule.enabled || !supported} onChange={(event) => updateTime(value, formatted.date, event.target.value)} /></label>
      </div>;
    })}
  </div>;
}
