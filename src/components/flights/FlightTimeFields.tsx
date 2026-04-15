"use client";

import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { COPY } from "@/lib/copy";
import {
  EngineTimesError,
  formatHHMM,
  parseEngineTimes,
} from "@/lib/duration";
import { useState } from "react";

const PREVIEW_DATE = "2026-01-01";

export function FlightTimeFields() {
  const [engineStart, setEngineStart] = useState("");
  const [engineStop, setEngineStop] = useState("");

  let preview = "—";
  let helper =
    "Calculée automatiquement à partir du bloc OFF / bloc ON.";
  let helperClass = "text-text-subtle";

  if (engineStart && engineStop) {
    try {
      preview = formatHHMM(
        parseEngineTimes(PREVIEW_DATE, engineStart, engineStop).durationMin,
      );
    } catch (err) {
      if (err instanceof EngineTimesError) {
        helper = err.message;
        helperClass = "text-danger";
      } else {
        helper = "Heures bloc OFF / bloc ON invalides.";
        helperClass = "text-danger";
      }
    }
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="engineStart" required>
          {COPY.flight.blocOff}
        </Label>
        <Input
          id="engineStart"
          name="engineStart"
          type="time"
          step="60"
          required
          className="tabular"
          value={engineStart}
          onChange={(e) => setEngineStart(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="engineStop" required>
          {COPY.flight.blocOn}
        </Label>
        <Input
          id="engineStop"
          name="engineStop"
          type="time"
          step="60"
          required
          className="tabular"
          value={engineStop}
          onChange={(e) => setEngineStop(e.target.value)}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="computedFlightHours">HDV calculée</Label>
        <Input
          id="computedFlightHours"
          type="text"
          readOnly
          value={preview}
          className="tabular bg-surface-sunken text-text-strong"
          aria-describedby="computedFlightHoursHelp"
        />
        <p
          id="computedFlightHoursHelp"
          className={`text-xs ${helperClass}`}
          aria-live="polite"
        >
          {helper}
        </p>
      </div>
    </>
  );
}
