// Horodatage : la base enregistre les pointages en UTC avec une précision
// microseconde. Certains navigateurs (Safari, WebView de bornes) échouent à
// parser ce format ; on normalise donc avant conversion, puis on affiche dans
// le fuseau horaire de l'établissement.

/** Fuseau horaire de l'établissement (indépendant du réglage de la borne). */
export const APP_TIME_ZONE = "Africa/Conakry";

export function parseTs(value: string | Date): Date {
  if (value instanceof Date) return value;
  // 2026-08-18T03:00:28.392158+00:00 -> 2026-08-18T03:00:28.392+00:00
  const normalized = value
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const withZone = /(Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  return new Date(withZone);
}

export function formatTime(value: string | Date) {
  return parseTs(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
}

export function formatDate(value: string | Date) {
  return parseTs(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  });
}

export function formatLongDate(value: string | Date) {
  return parseTs(value).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  });
}

/** Jour civil (YYYY-MM-DD) dans le fuseau de l'établissement. */
export function localDay(value: string | Date = new Date()) {
  return parseTs(value).toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE });
}

export function minutesBetween(from: string | Date, to: string | Date) {
  return Math.max(0, Math.round((+parseTs(to) - +parseTs(from)) / 60000));
}

export function hoursLabel(mins: number) {
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}`;
}
