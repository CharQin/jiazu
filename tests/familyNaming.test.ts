import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createEmpty,
  familyHead,
  familyName,
  saveFamilyPerson,
} from "../src/model.ts";
import { makeGenerationLayout } from "../src/treeLayout.ts";
import type { Person } from "../src/model.ts";

test("household naming prioritizes generation, then the oldest birthday", () => {
  let data = createEmpty("年轻一代");
  const owner = data.people[0],
    family = data.families[0];
  data = saveFamilyPerson(data, {
    ...owner,
    id: "older",
    name: "年长同辈",
    generation: 2,
    birthday: "1950-01-01",
  });
  data = saveFamilyPerson(data, {
    ...owner,
    id: "elder",
    name: "最高辈分",
    generation: 1,
    birthday: "1980-01-01",
  });
  assert.equal(familyName(family, data.people), "最高辈分一家");
  data = saveFamilyPerson(data, {
    ...owner,
    id: "eldest",
    name: "同辈年长者",
    generation: 1,
    birthday: "1970-12-31",
  });
  assert.equal(familyHead(family.id, data.people)?.id, "eldest");
  assert.equal(familyName(family, data.people), "同辈年长者一家");
});

test("partial birth years determine age and missing dates remain deterministic", () => {
  let data = createEmpty("生日未知");
  const owner = data.people[0],
    family = data.families[0];
  data = saveFamilyPerson(data, {
    ...owner,
    id: "partial",
    name: "只知道年份",
    birthdayParts: { year: "1960", month: "", day: "" },
  });
  data = saveFamilyPerson(data, {
    ...owner,
    id: "full",
    name: "知道完整生日",
    birthday: "1970-01-01",
  });
  assert.equal(familyName(family, data.people), "只知道年份一家");
  assert.equal(familyName(family, data.people.toReversed()), "只知道年份一家");
  const unknown = data.people.map((p) => ({
    ...p,
    birthday: "",
    birthdayParts: undefined,
  }));
  assert.equal(
    familyName(family, unknown),
    familyName(family, unknown.toReversed()),
  );
  const noYears = [
    {
      ...owner,
      id: "a",
      name: "未知年份",
      birthday: "",
      birthdayParts: { year: "", month: "12", day: "31" },
    },
    {
      ...owner,
      id: "b",
      name: "生日月份较早",
      birthday: "",
      birthdayParts: { year: "", month: "1", day: "1" },
    },
  ];
  assert.equal(familyHead(family.id, noYears)?.id, "a");
});

test("a deceased household head is replaced by the oldest living elder and updates every tree row", () => {
  let data = createEmpty("年轻一代");
  const owner = data.people[0],
    family = data.families[0];
  for (const person of [
    { id: "ancestor", name: "祖辈", generation: 0, birthday: "1930-01-01" },
    { id: "older", name: "年长长辈", generation: 1, birthday: "1960-01-01" },
    {
      id: "younger",
      name: "另一位长辈",
      generation: 1,
      birthday: "1965-01-01",
    },
  ])
    data = saveFamilyPerson(data, { ...owner, ...person });
  const setDeceased = (id: string, deceased: boolean) => {
    data = saveFamilyPerson(data, {
      ...data.people.find((p) => p.id === id)!,
      deceased,
    });
  };
  assert.equal(familyName(family, data.people), "祖辈一家");
  setDeceased("ancestor", true);
  assert.equal(familyName(family, data.people), "年长长辈一家");
  setDeceased("older", true);
  assert.equal(familyName(family, data.people), "另一位长辈一家");
  assert.ok(
    makeGenerationLayout(data).groups.every((g) => g.name === "另一位长辈一家"),
  );
  setDeceased("younger", true);
  assert.equal(familyName(family, data.people), "年轻一代一家");
  setDeceased("ancestor", false);
  assert.equal(familyName(family, data.people), "祖辈一家");
});

test("household names never fall back to deceased people or friends", () => {
  const data = createEmpty("已离世家人");
  const owner = data.people[0],
    family = data.families[0];
  owner.deceased = true;
  data.people.push({
    ...owner,
    id: "friend",
    name: "在世朋友",
    kind: "friend",
    deceased: false,
  });
  assert.equal(familyHead(family.id, data.people), undefined);
  assert.equal(familyName(family, data.people), "纪念家庭");
  data.people.push({ ...owner, id: "living", name: "", deceased: false });
  assert.equal(familyName(family, data.people), "");
  data.people.find((p) => p.id === "living")!.name = "在世家人";
  assert.equal(familyName(family, data.people), "在世家人一家");
  assert.equal(familyName(family, data.people.toReversed()), "在世家人一家");
});

test("friends and unnamed members cannot supply a household name", () => {
  let data = createEmpty();
  const owner = data.people[0],
    family = { ...data.families[0], name: "旧的手动名称" };
  data = saveFamilyPerson(data, {
    ...owner,
    id: "friend",
    name: "年长朋友",
    kind: "friend",
    generation: 0,
    birthday: "1930-01-01",
  });
  assert.equal(familyName(family, data.people), "");
  data = saveFamilyPerson(data, {
    ...owner,
    id: "named",
    name: "有姓名的家人",
    generation: 3,
  });
  assert.equal(familyName(family, data.people), "有姓名的家人一家");
  assert.equal(familyHead(family.id, data.people)?.id, "named");
});

test("renaming an unnamed person changes only their record and retains card order", () => {
  let data = createEmpty();
  const owner = data.people[0];
  data = saveFamilyPerson(data, { ...owner, id: "person-a", name: "" });
  data = saveFamilyPerson(data, {
    ...owner,
    id: "person-b",
    name: "另一位家人",
  });
  data = saveFamilyPerson(data, {
    ...owner,
    id: "friend",
    name: "",
    kind: "friend",
  });
  const ids = data.people.map((p) => p.id);
  const positions = makeGenerationLayout(data).nodes;
  const input = structuredClone(data);
  data = saveFamilyPerson(data, {
    ...data.people.find((p) => p.id === "person-a")!,
    name: "  中文姓名  ",
  });
  assert.equal(data.people.find((p) => p.id === "person-a")!.name, "中文姓名");
  assert.equal(
    data.people.find((p) => p.id === "person-b")!.name,
    "另一位家人",
  );
  assert.deepEqual(
    data.people.map((p) => p.id),
    ids,
  );
  assert.deepEqual(makeGenerationLayout(data).nodes, positions);
  assert.equal(input.people.find((p) => p.id === "person-a")!.name, "");
  data = saveFamilyPerson(data, {
    ...data.people.find((p) => p.id === "friend")!,
    name: "朋友姓名",
  });
  assert.equal(data.people.find((p) => p.id === "friend")!.name, "朋友姓名");
  assert.equal(data.people.find((p) => p.id === "person-a")!.name, "中文姓名");
});

test("new households require no name and every tree row shares the derived label", () => {
  let data = createEmpty();
  const owner = data.people[0];
  const added: Person = {
    ...owner,
    id: "new-person",
    familyId: "new",
    name: "新家庭长辈",
    generation: 1,
  };
  data = saveFamilyPerson(data, added, { branch: "father" });
  const family = data.families.find((f) => f.id !== owner.familyId)!;
  assert.equal(family.name, "");
  assert.equal(familyName(family, data.people), "新家庭长辈一家");
  data = saveFamilyPerson(data, {
    ...owner,
    id: "new-child",
    familyId: family.id,
    name: "子女",
    generation: 2,
  });
  const labels = makeGenerationLayout(data)
    .groups.filter((g) => g.familyId === family.id)
    .map((g) => g.name);
  assert.deepEqual(labels, ["新家庭长辈一家", "新家庭长辈一家"]);
  data = saveFamilyPerson(data, {
    ...data.people.find((p) => p.id === "new-person")!,
    name: "已改名",
  });
  assert.equal(familyName(family, data.people), "已改名一家");
  assert.equal(
    familyName(
      family,
      data.people.filter((p) => p.id !== "new-person"),
    ),
    "子女一家",
  );
  data = saveFamilyPerson(data, {
    ...data.people.find((p) => p.id === "new-person")!,
    familyId: owner.familyId,
  });
  assert.equal(familyName(family, data.people), "子女一家");
});

test("renaming retains partner and friend references", () => {
  let data = createEmpty("起点");
  const owner = data.people[0];
  data = saveFamilyPerson(data, {
    ...owner,
    id: "partner",
    name: "伴侣",
    partnerId: owner.id,
  });
  data = saveFamilyPerson(data, {
    ...owner,
    id: "friend",
    name: "朋友",
    kind: "friend",
    friendOfId: "partner",
  });
  data = saveFamilyPerson(data, {
    ...data.people.find((p) => p.id === "partner")!,
    name: "更改姓名",
  });
  assert.equal(
    data.people.find((p) => p.id === owner.id)!.partnerId,
    "partner",
  );
  assert.equal(
    data.people.find((p) => p.id === "partner")!.partnerId,
    owner.id,
  );
  assert.equal(
    data.people.find((p) => p.id === "friend")!.friendOfId,
    "partner",
  );
});
