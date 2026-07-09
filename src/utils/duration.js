/**
 * Pure duration helpers for the event-length picker (extracted from
 * DurationWheelModal so they can be unit-tested without the native spinner).
 *
 * A duration is stored as whole MINUTES. The iOS countdown spinner speaks in
 * Date objects, so we encode/decode a duration as a time-of-day on a fixed base
 * date — only hours+minutes matter, the date itself must never contribute
 * (BUG 4: selecting 0 hours / 5 min must yield 5, never 60).
 */
import i18n from "../i18n";

/** Human label, e.g. 45→"45 min", 150→"2h 30m", 420→"7 hours", 2880→"2 days". */
export function formatDuration(min) {
  const m = parseInt(min, 10) || 0;
  if (m < 60) return i18n.t("durationWheelModal.minShort", { m });
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r
      ? i18n.t("durationWheelModal.hoursMinutesShort", { h, m: r })
      : i18n.t(h === 1 ? "durationWheelModal.hourSingular" : "durationWheelModal.hoursPlural", { h });
  }
  const d = m / 1440;
  const dVal = Number.isInteger(d) ? d : d.toFixed(1);
  return i18n.t(d === 1 ? "durationWheelModal.daySingular" : "durationWheelModal.daysPlural", { d: dVal });
}

/**
 * Encode an hours+minutes duration as a time-of-day on a fixed base date, in
 * UTC. The iOS countdown picker is pinned to UTC (timeZoneOffsetInMinutes={0}),
 * so encode/decode must use UTC too — otherwise, in a non-UTC device zone
 * (e.g. Mexico), the read-back drifts by the offset and the header shows +1h
 * vs the wheel (round-5 BUG 4).
 */
export const durationToDate = (min) => {
  const m = Math.max(0, parseInt(min, 10) || 0);
  return new Date(Date.UTC(2000, 0, 1, Math.floor((m % 1440) / 60), m % 60, 0, 0));
};

/**
 * Read a duration back as whole minutes from the spinner's Date, in UTC. Only
 * the time-of-day matters; using UTC keeps a 0-hour pick at 0 in every device
 * timezone (round-5 BUG 4).
 */
export const dateToMinutes = (d) =>
  d instanceof Date ? d.getUTCHours() * 60 + d.getUTCMinutes() : 0;
