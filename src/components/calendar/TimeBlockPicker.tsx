// FlightSchedule — 3-hour block time picker.
//
// Replaces the old `<input type="time" step="10800">` UI on the booking
// form. The aircraft is bookable in 3-hour blocks only, so the picker
// shows the 9 canonical boundaries (00, 03, 06, 09, 12, 15, 18, 21, 24)
// as a radio group of buttons.
//
// "24:00" is a valid END value (means midnight of the next calendar day);
// the server action normalizes it to "00:00" + nextDay before persisting.
// "24:00" as a START value is rejected server-side.

"use client";

import { useState } from "react";

export const TIME_BLOCKS = [
  "00:00",
  "03:00",
  "06:00",
  "09:00",
  "12:00",
  "15:00",
  "18:00",
  "21:00",
  "24:00",
] as const;

export type TimeBlock = (typeof TIME_BLOCKS)[number];

type Props = {
  /** Form field name (e.g. "startTime", "endTime"). */
  name: string;
  /** Initial selected block. */
  defaultValue: TimeBlock;
  /** Accessible label for the radiogroup wrapper. */
  ariaLabel: string;
};

export function TimeBlockPicker({ name, defaultValue, ariaLabel }: Props) {
  const [value, setValue] = useState<TimeBlock>(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="grid grid-cols-5 gap-1.5 sm:grid-cols-9"
      >
        {TIME_BLOCKS.map((b) => {
          const selected = value === b;
          return (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setValue(b)}
              className={`tabular min-h-11 rounded-md border px-2 py-2 text-sm font-semibold transition-colors focus:outline-none ${
                selected
                  ? "border-brand bg-brand text-text-on-brand shadow-[var(--shadow-brand)]"
                  : "border-border bg-surface-elevated text-text hover:border-border-strong hover:bg-surface-soft"
              }`}
            >
              {b.slice(0, 2)}
            </button>
          );
        })}
      </div>
    </>
  );
}
