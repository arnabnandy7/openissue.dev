export function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function relativeDate(value: string) {
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffMs = new Date(value).getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    return formatter.format(diffHours, "hour");
  }

  return formatter.format(diffDays, "day");
}
