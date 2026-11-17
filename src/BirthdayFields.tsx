import { birthdayError, completeBirthday, lunarBirthday } from "./birthday";
import type { BirthdayParts } from "./birthday";

export function BirthdayFields({
  value,
  onChange,
}: {
  value: BirthdayParts;
  onChange: (value: BirthdayParts) => void;
}) {
  const date = completeBirthday(value);
  const error = birthdayError(value);
  return (
    <fieldset className="birthday-editor span-two">
      <legend>公历生日</legend>
      <div className="birthday-fields">
        {(
          [
            ["year", "出生年份", "年", 4],
            ["month", "出生月份", "月", 2],
            ["day", "出生日期", "日", 2],
          ] as const
        ).map(([key, label, unit, length]) => (
          <label key={key}>
            <input
              aria-label={label}
              inputMode="numeric"
              autoComplete="off"
              maxLength={length}
              value={value[key]}
              onChange={(e) =>
                onChange({
                  ...value,
                  [key]: e.target.value.replace(/\D/g, "").slice(0, length),
                })
              }
            />
            <span>{unit}</span>
          </label>
        ))}
      </div>
      <p
        className={`birthday-conversion ${error ? "date-error" : ""}`}
        aria-live="polite"
      >
        {error ||
          (date
            ? `农历 · ${lunarBirthday(date)}`
            : "年月日可留空，完整填写后自动换算农历")}
      </p>
    </fieldset>
  );
}
