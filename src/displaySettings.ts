export const saturationKey = "jiazu-map-saturation";
export function normalizeSaturation(value: unknown) {
  const number =
    typeof value === "string" && value.trim()
      ? Number(value)
      : typeof value === "number"
        ? value
        : NaN;
  return Number.isFinite(number)
    ? Math.min(200, Math.max(0, Math.round(number)))
    : 100;
}
export function readSaturation() {
  try {
    return normalizeSaturation(localStorage.getItem(saturationKey));
  } catch {
    return 100;
  }
}
