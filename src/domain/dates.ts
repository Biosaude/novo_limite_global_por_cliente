const DAY = 86400000;
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value.slice(0, 4) >= "1900" &&
    value.slice(0, 4) <= "9999" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function dateValue(value: unknown, date1904 = false): string | null {
  if (value === null || value === undefined || value === "") return null;
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1 || value > 2958465) return null;
    // ExcelJS normalmente resolve células formatadas como datas; fallback para serial numérico.
    text = new Date(
      Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) +
        Math.floor(value) * DAY,
    )
      .toISOString()
      .slice(0, 10);
  } else {
    text = String(value).trim();
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (br)
      text = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    else if (/^\d{4}-\d{2}-\d{2}T/.test(text)) text = text.slice(0, 10);
  }
  return validDate(text) ? text : null;
}
export const daysBetween = (reference: string, due: string) =>
  Math.round((Date.parse(reference) - Date.parse(due)) / DAY);
export const displayDate = (value: string | null) =>
  value ? value.split("-").reverse().join("/") : "Não informada";
export function cutoff(reference: string, year: string, month: string): string {
  const end = new Date(Date.UTC(Number(year), Number(month), 0))
    .toISOString()
    .slice(0, 10);
  return end < reference ? end : reference;
}
