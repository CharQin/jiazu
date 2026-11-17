import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createEmpty,
  saveFamilyPerson,
  completeFamilyRelations,
  validateData,
} from "../src/model.ts";
import type { Person } from "../src/model.ts";
import { completeKinship } from "../src/automaticKinship.ts";
import { siblingIdsFor } from "../src/familyRelations.ts";

function fixture() {
  const data = createEmpty();
  const base = { ...data.people[0], id: "me" };
  data.selfId = "me";
  const p = (
    id: string,
    generation: number,
    extra: Partial<Person> = {},
  ): Person => ({ ...base, id, generation, ...extra });
  data.people = [
    p("me", 2),
    p("dad", 1, { gender: "male" }),
    p("mom", 1, { gender: "female" }),
    p("sister", 2),
    p("brother", 2),
  ];
  const find = (id: string) => data.people.find((p) => p.id === id)!;
  return { data, find, p };
}

test("one selected parent completes both parents, siblings and generations without changing the input", () => {
  const { data, find } = fixture();
  find("dad").partnerId = "mom";
  find("mom").partnerId = "dad";
  find("sister").parentIds = ["mom"];
  const before = structuredClone(data);
  const saved = saveFamilyPerson(data, {
    ...find("me"),
    parentIds: ["dad"],
    parentRoles: { father: "dad" },
  });
  const me = saved.people.find((p) => p.id === "me")!;
  assert.deepEqual(me.parentIds, ["dad", "mom"]);
  assert.equal(me.parentRoles?.mother, "mom");
  assert.deepEqual(me.inferredParentIds, ["mom"]);
  assert.ok(siblingIdsFor(me, saved.people).includes("sister"));
  assert.deepEqual(completeFamilyRelations(saved), saved);
  assert.deepEqual(data, before);
});

test("connecting a couple after their children exist completes the other parent's edges", () => {
  const { data, find } = fixture();
  find("me").parentIds = ["dad"];
  const saved = saveFamilyPerson(data, { ...find("dad"), partnerId: "mom" });
  assert.deepEqual(saved.people.find((p) => p.id === "me")!.parentIds, [
    "dad",
    "mom",
  ]);
  assert.deepEqual(saved.people[0].parentRoles, {
    father: "dad",
    mother: "mom",
  });
});

test("a chain of explicit siblings shares known parents and connects all compatible siblings", () => {
  const { data, find } = fixture();
  find("me").parentIds = ["dad", "mom"];
  find("me").siblingIds = ["sister"];
  find("sister").siblingIds = ["brother"];
  const saved = completeFamilyRelations(data);
  for (const id of ["me", "sister", "brother"]) {
    const p = saved.people.find((p) => p.id === id)!;
    assert.deepEqual(new Set(p.parentIds), new Set(["dad", "mom"]));
    assert.equal(p.generation, 2);
    assert.equal(siblingIdsFor(p, saved.people).length, 2);
  }
  assert.deepEqual(completeFamilyRelations(saved), saved);
});

test("half siblings never inherit the other sibling's unrelated parent", () => {
  const { data, find, p } = fixture();
  data.people.push(p("other-mom", 1, { gender: "female" }));
  find("me").parentIds = ["dad", "mom"];
  find("sister").parentIds = ["dad", "other-mom"];
  find("brother").parentIds = ["other-mom"];
  const saved = completeFamilyRelations(data);
  assert.deepEqual(saved.people.find((p) => p.id === "sister")!.parentIds, [
    "dad",
    "other-mom",
  ]);
  assert.deepEqual(saved.people.find((p) => p.id === "brother")!.parentIds, [
    "other-mom",
  ]);
  assert.ok(!siblingIdsFor(saved.people[0], saved.people).includes("brother"));
});

test("conflicting known parents stop transitive sibling inference instead of overwriting families", () => {
  const { data, find, p } = fixture();
  data.people.push(p("other-mom", 1));
  find("me").parentIds = ["dad", "mom"];
  find("me").siblingIds = ["sister"];
  find("sister").parentIds = ["dad", "other-mom"];
  find("sister").siblingIds = ["brother"];
  const saved = completeFamilyRelations(data);
  assert.deepEqual(saved.people.find((p) => p.id === "brother")!.parentIds, []);
  assert.ok(!siblingIdsFor(saved.people[0], saved.people).includes("brother"));
});

test("replacing a partner retracts old automatic parents while preserving explicit parents", () => {
  const { data, find, p } = fixture();
  data.people.push(p("new-partner", 1));
  find("dad").partnerId = "mom";
  find("mom").partnerId = "dad";
  find("me").parentIds = ["dad"];
  const first = completeFamilyRelations(data);
  const saved = saveFamilyPerson(first, {
    ...first.people.find((p) => p.id === "dad")!,
    partnerId: "new-partner",
  });
  assert.deepEqual(saved.people[0].parentIds, ["dad", "new-partner"]);
  assert.deepEqual(saved.people[0].inferredParentIds, ["new-partner"]);
});

test("removing an inferred parent or sibling remains removed on the next edit and backup restore", () => {
  const { data, find } = fixture();
  find("dad").partnerId = "mom";
  find("mom").partnerId = "dad";
  find("me").parentIds = ["dad"];
  find("sister").parentIds = ["dad"];
  const first = completeFamilyRelations(data);
  const removed = saveFamilyPerson(first, {
    ...first.people[0],
    parentIds: ["dad"],
    parentRoles: { father: "dad" },
    siblingIds: [],
  });
  assert.deepEqual(removed.people[0].parentIds, ["dad"]);
  assert.deepEqual(siblingIdsFor(removed.people[0], removed.people), []);
  const restored = completeFamilyRelations(
    validateData(JSON.parse(JSON.stringify(removed))),
  );
  assert.deepEqual(restored, removed);
});

test("invalid inferred edges and nonfinite manual orders are rejected by backup validation", () => {
  const { data } = fixture();
  data.people[0].inferredParentIds = ["dad"];
  assert.throws(() => validateData(data), /自动亲属/);
  delete data.people[0].inferredParentIds;
  data.people[0].layoutOrder = Infinity;
  assert.throws(() => validateData(data), /排序/);
});

test("automatic edges never create a parent cycle through existing same-generation links", () => {
  const { data, find } = fixture();
  find("dad").partnerId = "sister";
  find("sister").partnerId = "dad";
  find("me").parentIds = ["dad"];
  find("me").siblingIds = ["sister"];
  const people = completeKinship(data.people);
  assert.ok(!people[0].parentIds.includes("sister"));
});
