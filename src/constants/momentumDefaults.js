/**
 * momentumDefaults — the Momentum board's defaults (kinlo_business/02 §B).
 * Columns are fully editable by the host (rename/reorder/recolor/add/archive);
 * these are just the seed. Default column names come from i18n via `nameKey`
 * until the host renames one (then a literal `name` is stored).
 */
export const DEFAULT_COLUMNS = [
  { id: "at_risk", nameKey: "business.momentum.columns.atRisk", color: "#F59E0B", order: 0 },
  { id: "inactive", nameKey: "business.momentum.columns.inactive", color: "#8A8F9C", order: 1 },
  { id: "contacted", nameKey: "business.momentum.columns.contacted", color: "#4F5BD5", order: 2 },
  { id: "recovered", nameKey: "business.momentum.columns.recovered", color: "#1F8A6E", order: 3 },
];

/** Preset swatches for the recolor picker (user data — not theme tokens). */
export const COLUMN_COLORS = [
  "#F59E0B",
  "#8A8F9C",
  "#4F5BD5",
  "#1F8A6E",
  "#7C3AED",
  "#E91E8C",
  "#EF4444",
  "#0EA5E9",
];

export const PRIORITIES = ["low", "medium", "high", "urgent"];
export const CHANNELS = ["push", "sms", "email"];
export const ACTION_STATUSES = ["todo", "in_progress", "done"];

/** Column display name: host override, else the localized default. */
export const columnName = (col, t) => col.name || (col.nameKey ? t(col.nameKey) : "");
