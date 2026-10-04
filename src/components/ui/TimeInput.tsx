"use client";

import { to24h } from "@/lib/time";

/**
 * 12-hour time picker (hour · minute · AM/PM). Browsers render <input type="time"> in
 * the phone's own 24h/12h setting, so this gives every user AM/PM.
 * Value in and out is always 24h "HH:mm", so the database and API don't change.
 */
export default function TimeInput({
  value,
  onChange,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  const [hStr, mStr] = (value || "00:00").split(":");
  const h24 = Number(hStr) || 0;
  const minute = Number(mStr) || 0;
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!minutes.includes(minute)) {
    minutes.push(minute);
    minutes.sort((a, b) => a - b);
  }

  const sel =
    "min-w-0 flex-1 appearance-none rounded-lg border border-slate-200 bg-white px-1.5 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#38BDF8]";

  return (
    <div className={`flex min-w-0 flex-1 items-center gap-1 ${className}`} role="group" aria-label={label}>
      <select
        aria-label={label ? `${label} hour` : "Hour"}
        className={sel}
        value={hour12}
        onChange={(e) => onChange(to24h(Number(e.target.value), minute, period))}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span className="text-sm text-[#94A3B8]">:</span>
      <select
        aria-label={label ? `${label} minute` : "Minute"}
        className={sel}
        value={minute}
        onChange={(e) => onChange(to24h(hour12, Number(e.target.value), period))}
      >
        {minutes.map((n) => (
          <option key={n} value={n}>
            {String(n).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        aria-label={label ? `${label} AM or PM` : "AM or PM"}
        className={`${sel} font-semibold`}
        value={period}
        onChange={(e) => onChange(to24h(hour12, minute, e.target.value as "AM" | "PM"))}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
