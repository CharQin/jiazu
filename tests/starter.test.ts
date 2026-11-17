import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createEmpty,
  isBlankStarter,
  saveFamilyPerson,
  visibleFamilyMembers,
  personName,
  editableMaritalStatus,
  maritalStatusInfo,
  maritalStatusOptions,
} from "../src/model.ts";
import { makeGenerationLayout } from "../src/treeLayout.ts";

test("the blank self displays as Me without storing a preset name or renaming relatives", () => {
  const data = createEmpty();
  const self = data.people[0];
  assert.equal(personName(self, data.selfId), "我");
  assert.equal(self.name, "");
  assert.equal(personName({ ...self, id: "relative" }, data.selfId), "未命名");
  assert.equal(
    personName({ ...self, name: "自己填写的名字" }, data.selfId),
    "自己填写的名字",
  );
});

test("marital choices have three values while old records stay compatible and optional", () => {
  assert.deepEqual(
    maritalStatusOptions.map((key) => maritalStatusInfo[key]),
    ["已婚", "未婚", "其他"],
  );
  assert.equal(editableMaritalStatus(undefined), "");
  assert.equal(editableMaritalStatus("divorced"), "other");
  assert.equal(editableMaritalStatus("widowed"), "other");
  assert.equal(maritalStatusInfo.divorced, "其他");
});

test("the unused starting card disappears after a real family member is recorded", () => {
  let data = createEmpty();
  const self = data.people[0];
  assert.equal(isBlankStarter(data), true);
  assert.equal(visibleFamilyMembers(data).length, 1);
  data = saveFamilyPerson(data, {
    ...self,
    id: "first-member",
    name: "第一位家人",
    relation: "爸爸",
    generation: 1,
  });
  const members = visibleFamilyMembers(data);
  assert.deepEqual(
    members.map((p) => p.id),
    ["first-member"],
  );
  assert.equal(data.people.length, 2);
  assert.equal(data.selfId, self.id);
  assert.equal(members[0].relation, "爸爸");
  assert.equal(data.people.find((p) => p.id === self.id)!.relation, "");
  const layout = makeGenerationLayout({ ...data, people: members });
  assert.equal(layout.nodes.has(self.id), false);
  assert.deepEqual(
    layout.generations.map((row) => [row.generation, row.count]),
    [[1, 1]],
  );
});

test("unnamed people with personal details, relationships or memories remain visible", () => {
  const original = createEmpty();
  const self = original.people[0];
  const data = saveFamilyPerson(original, {
    ...self,
    id: "family",
    name: "家人",
  });
  for (const patch of [
    { phone: "123" },
    { gender: "male" as const },
    { birthdayParts: { year: "", month: "6", day: "" } },
    { note: "留下的资料" },
    { generation: 1 },
  ]) {
    const retained = {
      ...data,
      people: data.people.map((p) =>
        p.id === self.id ? { ...p, ...patch } : p,
      ),
    };
    assert.equal(visibleFamilyMembers(retained).length, 2);
  }
  assert.equal(
    visibleFamilyMembers({
      ...data,
      people: data.people.map((p) =>
        p.id === "family" ? { ...p, parentIds: [self.id] } : p,
      ),
    }).length,
    2,
  );
  assert.equal(
    visibleFamilyMembers({
      ...data,
      memories: [
        {
          id: "memory",
          personId: self.id,
          date: "",
          title: "",
          kind: "",
          note: "",
        },
      ],
    }).length,
    2,
  );
});

test("friends alone do not replace the initial family reference", () => {
  const data = createEmpty();
  const updated = saveFamilyPerson(data, {
    ...data.people[0],
    id: "friend",
    name: "朋友",
    kind: "friend",
  });
  assert.equal(visibleFamilyMembers(updated).length, 2);
  const filled = saveFamilyPerson(data, {
    ...data.people[0],
    name: "我的姓名",
  });
  assert.equal(filled.people.length, 1);
  assert.equal(isBlankStarter(filled), false);
  assert.equal(visibleFamilyMembers(filled)[0].name, "我的姓名");
});
