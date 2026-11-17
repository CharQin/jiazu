import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  birthdayError,
  birthdayParts,
  completeBirthday,
  lunarBirthday,
  nextLunarBirthday,
} from "../src/birthday.ts";

test("birthday fields can be empty or partial without inventing a date", () => {
  for (const parts of [
    { year: "", month: "", day: "" },
    { year: "1990", month: "", day: "" },
    { year: "", month: "5", day: "12" },
    { year: "19", month: "", day: "" },
  ]) {
    assert.equal(birthdayError(parts), "");
    assert.equal(completeBirthday(parts), "");
  }
  assert.equal(
    completeBirthday({ year: "2000", month: "2", day: "9" }),
    "2000-02-09",
  );
  assert.deepEqual(birthdayParts("2000-02-09"), {
    year: "2000",
    month: "02",
    day: "09",
  });
});

test("lunar birthdays use the lunar anniversary, including the 2027 new year correction", () => {
  for (const [today, expected] of [
    ["2025-01-01", "2025-01-29"],
    ["2025-01-30", "2026-02-17"],
    ["2026-11-17", "2027-02-06"],
  ]) {
    const next = nextLunarBirthday(
      "2024-02-10",
      new Date(`${today}T12:00:00+08:00`),
    );
    assert.equal(next?.solarDate, expected);
    assert.equal(next?.lunarDate, "正月初一");
    assert.equal(next?.adjustment, "");
  }
});

test("birthday countdowns include today and follow Beijing midnight in any host timezone", () => {
  const before = nextLunarBirthday(
    "2024-02-10",
    new Date("2025-01-28T15:59:59Z"),
  );
  const midnight = nextLunarBirthday(
    "2024-02-10",
    new Date("2025-01-28T16:00:00Z"),
  );
  const late = nextLunarBirthday(
    "2024-02-10",
    new Date("2025-01-29T15:59:59Z"),
  );
  assert.equal(before?.days, 1);
  assert.equal(midnight?.days, 0);
  assert.equal(late?.days, 0);
  assert.equal(midnight?.solarDate, "2025-01-29");
});

test("leap-month birthdays prefer the leap month and fall back to the ordinary month only when absent", () => {
  const withLeap = nextLunarBirthday(
    "2023-03-22",
    new Date("2023-02-21T12:00:00+08:00"),
  );
  assert.equal(withLeap?.solarDate, "2023-03-22");
  assert.equal(withLeap?.lunarDate, "闰二月初一");
  assert.equal(withLeap?.adjustment, "");
  const withoutLeap = nextLunarBirthday(
    "2023-03-22",
    new Date("2025-01-01T12:00:00+08:00"),
  );
  assert.equal(withoutLeap?.solarDate, "2025-02-28");
  assert.equal(withoutLeap?.lunarDate, "二月初一");
  assert.match(withoutLeap!.adjustment, /常月/);
  // A regular second-month birthday is not celebrated a second time in leap February.
  const ordinary = nextLunarBirthday(
    "2023-02-20",
    new Date("2023-02-21T12:00:00+08:00"),
  );
  assert.equal(ordinary?.solarDate, "2024-03-10");
});

test("a lunar thirtieth birthday uses the last day of a short month with an explanation", () => {
  const next = nextLunarBirthday(
    "2024-02-09",
    new Date("2024-03-01T12:00:00+08:00"),
  );
  assert.equal(next?.solarDate, "2025-01-28");
  assert.equal(next?.lunarDate, "腊月廿九");
  assert.equal(next?.adjustment, "当月无三十，按廿九");
});

test("partial or impossible birthdays never acquire an invented lunar anniversary", () => {
  for (const date of ["", "1990", "2000-02", "2000-02-30", "2099-01-01"])
    assert.equal(nextLunarBirthday(date), null);
});
test("birthday validation rejects impossible dates and accepts leap days", () => {
  assert.equal(birthdayError({ year: "2000", month: "2", day: "29" }), "");
  for (const date of [
    "2001-02-29",
    "2000-04-31",
    "2099-01-01",
    "2000-13-01",
    "2000-01-00",
  ]) {
    assert.ok(birthdayError(birthdayParts(date)), date);
    assert.equal(completeBirthday(birthdayParts(date)), "");
  }
});
test("lunar conversion includes the lunar year, leap month, and traditional day", () => {
  assert.equal(lunarBirthday("2024-02-10"), "2024甲辰年 正月初一");
  assert.equal(lunarBirthday("2023-03-22"), "2023癸卯年 闰二月初一");
  assert.equal(lunarBirthday("2024-02-29"), "2024甲辰年 正月二十");
  assert.equal(lunarBirthday(""), "");
  assert.equal(lunarBirthday("2024-02-30"), "");
});
