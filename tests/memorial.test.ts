import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ageLabel,
  createEmpty,
  isBlankStarter,
  saveFamilyPerson,
  upcomingBirthdays,
  validateData,
} from "../src/model.ts";

test("old backups remain valid and optional deceased state survives editing and backup", () => {
  const data = createEmpty();
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  const edited = saveFamilyPerson(data, { ...data.people[0], deceased: true });
  assert.equal(edited.people[0].deceased, true);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(edited))), edited);
  assert.equal(isBlankStarter(edited), false);
  const restored = saveFamilyPerson(edited, {
    ...edited.people[0],
    deceased: false,
  });
  assert.equal(restored.people[0].deceased, false);
});

test("deceased people have no ongoing age and invalid deceased values are rejected", () => {
  assert.equal(ageLabel({ birthday: "1950-01-01", deceased: true }), "");
  assert.equal(
    ageLabel({
      birthday: "",
      birthdayParts: { year: "1950", month: "", day: "" },
      deceased: true,
    }),
    "",
  );
  const data = createEmpty();
  Object.assign(data.people[0], { deceased: "true" });
  assert.throws(() => validateData(data), /离世状态/);
});

test("upcoming lunar birthdays exclude friends and deceased people and are sorted by actual dates", () => {
  const base = createEmpty().people[0];
  const people = [
    { ...base, id: "later", birthday: "2024-02-11" },
    { ...base, id: "friend", kind: "friend" as const, birthday: "2024-02-10" },
    { ...base, id: "deceased", deceased: true, birthday: "2024-02-10" },
    { ...base, id: "today", birthday: "2024-02-10" },
    {
      ...base,
      id: "incomplete",
      birthday: "",
      birthdayParts: { year: "1980", month: "", day: "" },
    },
  ];
  const list = upcomingBirthdays(people, new Date("2025-01-29T12:00:00+08:00"));
  assert.deepEqual(
    list.map((b) => b.person.id),
    ["today", "later"],
  );
  assert.deepEqual(
    list.map((b) => b.days),
    [0, 1],
  );
  assert.deepEqual(
    list.map((b) => b.solarDate),
    ["2025-01-29", "2025-01-30"],
  );
});
