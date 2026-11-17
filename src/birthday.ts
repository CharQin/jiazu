import { Lunar, LunarYear, Solar } from "lunar-typescript";

export interface BirthdayParts {
  year: string;
  month: string;
  day: string;
}
export function birthdayParts(birthday = ""): BirthdayParts {
  const [year = "", month = "", day = ""] = birthday.split("-");
  return { year, month, day };
}
export function birthdayError(parts: BirthdayParts): string {
  if (
    !/^\d{0,4}$/.test(parts.year) ||
    !/^\d{0,2}$/.test(parts.month) ||
    !/^\d{0,2}$/.test(parts.day)
  )
    return "日期请填写数字";
  if (parts.month && (+parts.month < 1 || +parts.month > 12))
    return "月份应在 1 至 12 之间";
  if (parts.day && (+parts.day < 1 || +parts.day > 31))
    return "日期应在 1 至 31 之间";
  if (
    parts.year.length === 4 &&
    (+parts.year < 1 || +parts.year > new Date().getFullYear())
  )
    return "请填写有效的出生年份";
  if (parts.year.length !== 4 || !parts.month || !parts.day) return "";
  const date = new Date(
    `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}T12:00:00+08:00`,
  );
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCDate() !== +parts.day ||
    date.getUTCMonth() + 1 !== +parts.month
  )
    return "这一天不存在，请检查年月日";
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (
    `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}` >
    today
  )
    return "出生日期不能晚于今天";
  return "";
}
export function completeBirthday(parts: BirthdayParts): string {
  if (
    birthdayError(parts) ||
    parts.year.length !== 4 ||
    !parts.month ||
    !parts.day
  )
    return "";
  return `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}`;
}
function birthLunar(birthday: string) {
  const [year, month, day] = birthday.split("-").map(Number);
  return Solar.fromYmd(year, month, day).getLunar();
}
function lunarMonthDay(lunar: Lunar) {
  return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
}
export function lunarBirthday(birthday: string): string {
  if (!birthday || !completeBirthday(birthdayParts(birthday))) return "";
  try {
    const birth = birthLunar(birthday);
    return `${birth.getYear()}${birth.getYearInGanZhi()}年 ${lunarMonthDay(birth)}`;
  } catch {
    return "暂无法换算农历";
  }
}
const DAY = 86_400_000;
export interface LunarBirthdayOccurrence {
  solarDate: string;
  lunarDate: string;
  days: number;
  adjustment: string;
}
const birthCache = new Map<
  string,
  { year: number; month: number; day: number }
>();
export function nextLunarBirthday(
  birthday: string,
  now = new Date(),
): LunarBirthdayOccurrence | null {
  if (!birthday || !completeBirthday(birthdayParts(birthday))) return null;
  try {
    // Represent each Beijing calendar day as an integer, without host timezone or DST.
    const today = Math.floor((now.getTime() + 8 * 3_600_000) / DAY);
    const civil = new Date(today * DAY);
    const currentYear = Solar.fromYmd(
      civil.getUTCFullYear(),
      civil.getUTCMonth() + 1,
      civil.getUTCDate(),
    )
      .getLunar()
      .getYear();
    let birth = birthCache.get(birthday);
    if (!birth) {
      const lunar = birthLunar(birthday);
      birth = {
        year: lunar.getYear(),
        month: lunar.getMonth(),
        day: lunar.getDay(),
      };
      if (birthCache.size >= 5000) birthCache.clear();
      birthCache.set(birthday, birth);
    }
    for (
      let year = Math.max(currentYear, birth.year);
      year <= currentYear + 1;
      year++
    ) {
      const calendar = LunarYear.fromYear(year);
      // Prefer the actual leap month; fall back only when that year's leap month is absent.
      const month =
        calendar.getMonth(birth.month) ??
        calendar.getMonth(Math.abs(birth.month));
      if (!month) continue;
      const day = Math.min(birth.day, month.getDayCount());
      const lunar = Lunar.fromYmd(year, month.getMonth(), day);
      const solar = lunar.getSolar();
      const occurrence =
        Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay()) / DAY;
      if (occurrence < today) continue;
      const adjustments = [];
      if (month.getMonth() !== birth.month)
        adjustments.push("当年无对应闰月，按常月");
      if (day !== birth.day) adjustments.push("当月无三十，按廿九");
      return {
        solarDate: solar.toYmd(),
        lunarDate: lunarMonthDay(lunar),
        days: occurrence - today,
        adjustment: adjustments.join("；"),
      };
    }
    return null;
  } catch {
    return null;
  }
}
