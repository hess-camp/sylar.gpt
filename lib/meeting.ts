export const MEETING_TITLE = "HCT 中籍美語教務主管會議";
export const PDF_TITLE = "HCT 美語教務主管會議 簽到記錄";
export const SOURCE_TITLE = "2026.09.29 中籍美語教務主管會議 HCT Meeting";

export const MEALS = {
  meat: "葷",
  veg: "素",
  none: "不用餐",
} as const;

export type Meal = keyof typeof MEALS;

export function isMeal(value: string): value is Meal {
  return value === "meat" || value === "veg" || value === "none";
}

export function displayName(nameZh: string, nameEn: string) {
  const zh = nameZh.trim();
  const en = nameEn.trim();
  if (zh && en) return `${zh} ${en}`;
  return zh || en;
}

export function formatTaipei(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}
