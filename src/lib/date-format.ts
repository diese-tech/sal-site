export function formatMatchDate(date: string, time: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) +
    " · " +
    formatEstTime(time)
  );
}

export function formatEstTime(time: string) {
  const [hourText = "0", minuteText = "00"] = time.split(":");
  const hour = Number(hourText);
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minuteText.padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"} EST`;
}

export function formatShortMatchDate(date: string, time: string) {
  const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  return `${weekday} ${formatEstTime(time)}`;
}

export function formatLongDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatAnnouncementDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
