// Formateo común de horas (hora local de Uruguay, UTC−3) para la interfaz y los gráficos.

const TIME_ZONE = "America/Montevideo";

const timeFormat = new Intl.DateTimeFormat("es-UY", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const shortTimeFormat = new Intl.DateTimeFormat("es-UY", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** HH:MM:SS en hora local de Uruguay. */
export function formatLocalTime(ms) {
  return timeFormat.format(new Date(ms));
}

/** HH:MM en hora local de Uruguay. */
export function formatLocalTimeShort(ms) {
  return shortTimeFormat.format(new Date(ms));
}
