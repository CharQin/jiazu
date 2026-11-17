import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createDemo } from "./fixtures.ts";
import {
  createEmpty,
  relationshipPath,
  saveFamilyPerson,
  validateData,
} from "../src/model.ts";
import { inferPlacement } from "../src/kinship.ts";
import { siblingGroups, siblingIdsFor } from "../src/familyRelations.ts";

test("explicit siblings synchronize generations and reciprocal links without inventing parents", () => {
  const data = createEmpty();
  const sibling = {
    ...data.people[0],
    id: "sibling",
    name: "姐姐",
    generation: 0,
    siblingIds: [data.selfId],
  };
  assert.equal(inferPlacement(data, sibling).generation, 2);
  const before = structuredClone(data),
    saved = saveFamilyPerson(data, sibling);
  assert.equal(saved.people[1].generation, 2);
  assert.deepEqual(saved.people[0].siblingIds, ["sibling"]);
  assert.ok(saved.people.every((p) => p.parentIds.length === 0));
  assert.equal(relationshipPath(saved, "sibling").length, 2);
  assert.deepEqual(data, before);
  const unlinked = saveFamilyPerson(saved, {
    ...saved.people[1],
    siblingIds: [],
  });
  assert.deepEqual(unlinked.people[0].siblingIds, []);
});

test("selecting children updates their parent roles, synchronizes generations, and disconnects only that parent", () => {
  const data = createEmpty(),
    me = data.people[0];
  data.people.push({ ...me, id: "child", name: "儿子", generation: 2 });
  const dad = { ...me, id: "new-dad", gender: "male" as const, name: "爸爸" };
  assert.equal(inferPlacement(data, dad, ["child"]).generation, 1);
  const saved = saveFamilyPerson(data, dad, undefined, ["child"]);
  const child = saved.people.find((p) => p.id === "child")!;
  assert.deepEqual(child.parentIds, ["new-dad"]);
  assert.equal(child.parentRoles?.father, "new-dad");
  assert.equal(saved.people.find((p) => p.id === "new-dad")!.generation, 1);
  const mom = { ...me, id: "new-mom", gender: "female" as const };
  const withMom = saveFamilyPerson(saved, mom, undefined, ["child"]);
  const removed = saveFamilyPerson(
    withMom,
    withMom.people.find((p) => p.id === "new-dad")!,
    undefined,
    [],
  );
  assert.deepEqual(removed.people.find((p) => p.id === "child")!.parentIds, [
    "new-mom",
  ]);
  assert.equal(
    removed.people.find((p) => p.id === "child")!.parentRoles?.mother,
    "new-mom",
  );
});

test("children selections cannot silently replace existing parents and invalid sibling links fail atomically", () => {
  const data = createDemo(),
    before = structuredClone(data);
  const newParent = {
    ...data.people[0],
    id: "extra-parent",
    parentIds: [],
    partnerId: "",
  };
  assert.throws(
    () => saveFamilyPerson(data, newParent, undefined, ["kid"]),
    /已有两位父母/,
  );
  assert.throws(
    () =>
      saveFamilyPerson(data, { ...data.people[0], siblingIds: ["grandpa"] }),
    /冲突/,
  );
  assert.throws(
    () => saveFamilyPerson(data, { ...data.people[0], siblingIds: ["wife"] }),
    /兄弟姐妹/,
  );
  assert.deepEqual(data, before);
});

test("common parents infer siblings and half siblings without adding false pair links", () => {
  const data = createEmpty(),
    base = data.people[0];
  const people = [
    { ...base, id: "a", parentIds: ["father"] },
    { ...base, id: "b", parentIds: ["father", "mother"] },
    { ...base, id: "c", parentIds: ["mother"] },
    { ...base, id: "friend", kind: "friend" as const, parentIds: [] },
  ];
  assert.deepEqual(siblingIdsFor(people[0], people), ["b"]);
  const groups = siblingGroups(people);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].pairs, [
    ["a", "b"],
    ["b", "c"],
  ]);
  assert.ok(people.every((p) => !p.siblingIds));
});

test("sibling links round trip in backups and reject broken or friend references", () => {
  const data = createEmpty();
  const saved = saveFamilyPerson(data, {
    ...data.people[0],
    id: "sister",
    siblingIds: [data.selfId],
  });
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(saved))), saved);
  const broken = structuredClone(saved);
  broken.people[0].siblingIds = ["missing"];
  assert.throws(() => validateData(broken), /兄弟姐妹/);
  const friend = structuredClone(saved);
  friend.people[1].kind = "friend";
  assert.throws(() => validateData(friend), /兄弟姐妹|朋友/);
});
