import { createDemo } from "./fixtures.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createEmpty,
  relationshipPath,
  upcomingBirthdays,
  validateData,
  migrateData,
} from "../src/model.ts";

test("a new family contains only its owner and no example information", () => {
  const data = validateData(createEmpty("小秦", "秦家的故事"));
  assert.equal(data.demo, false);
  assert.equal(data.people.length, 1);
  assert.equal(data.people[0].relation, "");
  assert.equal(data.people[0].name, "小秦");
  assert.equal(data.people[0].address, "");
  assert.equal(data.memories.length, 0);
});
test("all user fields are optional and partial birthdays survive a backup", () => {
  const data = createEmpty();
  data.people[0].birthdayParts = { year: "", month: "6", day: "" };
  data.memories.push({
    id: "blank",
    personId: "",
    date: "",
    kind: "",
    title: "",
    note: "",
  });
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(data.people[0].name, "");
  assert.equal(data.families[0].name, "");
  assert.equal(data.title, "");
});
test("upgrade removes untouched example information and is idempotent", () => {
  const migrated = validateData(migrateData(createDemo()));
  assert.equal(migrated.people.length, 1);
  assert.equal(migrated.people[0].name, "");
  assert.equal(migrated.people[0].birthday, "");
  assert.equal(migrated.people[0].gender, "other");
  assert.equal(migrated.people[0].relation, "");
  assert.equal(migrated.title, "");
  assert.equal(migrated.families[0].name, "");
  assert.equal(migrated.memories.length, 0);
  assert.deepEqual(migrateData(migrated), migrated);
});
test("upgrade preserves user edits, added members, and custom memories", () => {
  const data = createDemo();
  const edited = data.people.find((p) => p.id === "dad")!;
  edited.name = "手动修改的姓名";
  edited.note = "手动填写的近况";
  const custom = {
    ...data.people[0],
    id: "custom",
    name: "自建成员",
    parentIds: [],
    partnerId: "",
    note: "自建资料",
  };
  data.people.push(custom);
  data.memories.push({
    id: "custom-memory",
    personId: custom.id,
    date: "",
    kind: "",
    title: "手动记录",
    note: "",
  });
  const migrated = validateData(migrateData(data));
  assert.equal(migrated.people.find((p) => p.id === "dad")!.name, edited.name);
  assert.equal(migrated.people.find((p) => p.id === "dad")!.note, edited.note);
  assert.equal(migrated.people.find((p) => p.id === "dad")!.address, "");
  assert.deepEqual(
    migrated.people.find((p) => p.id === "custom"),
    custom,
  );
  assert.equal(migrated.memories.length, 1);
  assert.equal(migrated.memories[0].title, "手动记录");
});
test("friends retain their household and host without joining kinship paths", () => {
  const data = createEmpty();
  const friend = {
    ...data.people[0],
    id: "friend",
    kind: "friend" as const,
    friendOfId: data.selfId,
  };
  data.people.push(friend);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  assert.deepEqual(relationshipPath(data, friend.id), []);
  friend.parentIds = [data.selfId];
  assert.throws(() => validateData(data), /朋友/);
  friend.parentIds = [];
  data.people[0].parentIds = [friend.id];
  assert.throws(() => validateData(data), /朋友/);
  data.people[0].parentIds = [];
  friend.friendOfId = "missing";
  assert.throws(() => validateData(data), /朋友关联/);
});
test("upgrade preserves new relationship references with unnamed anchors", () => {
  const data = createDemo();
  data.people.push({
    ...data.people[0],
    id: "new-child",
    name: "自建成员",
    parentIds: ["dad"],
    partnerId: "",
  });
  const migrated = validateData(migrateData(data));
  assert.deepEqual(
    migrated.people.find((p) => p.id === "new-child")!.parentIds,
    ["dad"],
  );
  assert.equal(migrated.people.find((p) => p.id === "dad")!.name, "");
  assert.deepEqual(
    relationshipPath(migrated, "new-child").map((p) => p.id),
    ["me", "dad", "new-child"],
  );
});
test("example relationships produce real parent and partner paths", () => {
  const data = validateData(createDemo());
  assert.deepEqual(
    relationshipPath(data, "grandpa").map((p) => p.id),
    ["me", "dad", "grandpa"],
  );
  assert.deepEqual(
    relationshipPath(data, "m-cousin").map((p) => p.id),
    ["me", "mom", "m-grandpa", "m-uncle", "m-cousin"],
  );
  assert.deepEqual(
    relationshipPath(data, "wife").map((p) => p.id),
    ["me", "wife"],
  );
});
test("import rejects broken references, invalid families, and ancestor cycles", () => {
  const missing = createDemo();
  missing.people[0].parentIds = ["missing"];
  assert.throws(() => validateData(missing));
  const brokenFamily = createDemo();
  brokenFamily.families[0].branch = "__proto__" as never;
  assert.throws(() => validateData(brokenFamily));
  const cycle = createDemo();
  cycle.people.find((p) => p.id === "grandpa")!.parentIds = ["me"];
  assert.throws(() => validateData(cycle), /循环/);
});
test("a parent cannot become their child’s partner", () => {
  const data = createDemo();
  data.people[0].partnerId = "dad";
  assert.throws(() => validateData(data), /伴侣/);
});
test("invalid backups and future birth dates are rejected", () => {
  assert.throws(() => validateData({ version: 2 }));
  const data = createDemo();
  data.people[0].birthday = "2099-01-01";
  assert.throws(() => validateData(data), /出生日期/);
  data.people[0].birthday = "1993-02-30";
  assert.throws(() => validateData(data), /出生日期/);
});
test("backup round trips preserve portraits, relationships, and memories", () => {
  const data = createDemo();
  data.people[0].avatar = "data:image/jpeg;base64,test";
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
});
test("lunar birthdays are ordered and fall within the next lunar year", () => {
  const birthdays = upcomingBirthdays(createDemo().people);
  assert.ok(birthdays.length > 0);
  assert.ok(birthdays.every((b) => b.days >= 0 && b.days <= 385));
  assert.deepEqual(
    birthdays.map((b) => b.days),
    birthdays.map((b) => b.days).sort((a, b) => a - b),
  );
});
