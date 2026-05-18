export function formatMatchDate(date: string, time: string) {
  const d = new Date(`${date}T${time}:00`);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
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
