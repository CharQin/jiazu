import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createDemo } from "./fixtures.ts";
import {
  ageLabel,
  createEmpty,
  isBlankStarter,
  saveFamilyPerson,
  validateData,
} from "../src/model.ts";
import {
  deriveBranches,
  inferPlacement,
  synchronizeGenerations,
} from "../src/kinship.ts";

test("connecting a parent anchors self and synchronizes all connected generations", () => {
  const data = createDemo();
  data.people.forEach((p) => (p.generation = 2));
  const before = structuredClone(data);
  const saved = saveFamilyPerson(data, {
    ...data.people[0],
    parentRoles: { father: "dad", mother: "mom" },
  });
  for (const p of saved.people)
    assert.equal(
      p.generation,
      createDemo().people.find((m) => m.id === p.id)!.generation,
    );
  assert.deepEqual(data, before);
});

test("parents suggest their household and child generation; partner takes household priority", () => {
  const data = createDemo();
  const draft = {
    ...data.people[0],
    id: "new-child",
    partnerId: "",
    parentIds: ["uncle"],
    parentRoles: { father: "uncle" },
  };
  assert.deepEqual(inferPlacement(data, draft), {
    familyId: "uncle",
    generation: 2,
  });
  assert.deepEqual(inferPlacement(data, { ...draft, partnerId: "m-cousin" }), {
    familyId: "m-uncle",
    generation: 2,
  });
  assert.deepEqual(
    inferPlacement(data, {
      ...draft,
      parentIds: ["me"],
      parentRoles: { father: "me" },
    }),
    { familyId: "home", generation: 3 },
  );
});

test("connecting own parents keeps self on the reference row and preserves an independent household", () => {
  const data = createDemo();
  const me = data.people[0];
  assert.deepEqual(
    inferPlacement(data, { ...me, partnerId: "", generation: 4 }),
    { familyId: "home", generation: 2 },
  );
  const saved = saveFamilyPerson(data, { ...me, generation: 4 });
  assert.equal(saved.people[0].generation, 2);
});

test("unconnected family members keep manual generations and friends are excluded", () => {
  const data = createEmpty();
  const unconnected = { ...data.people[0], id: "other", generation: 0 };
  const saved = saveFamilyPerson(data, unconnected);
  assert.equal(saved.people[1].generation, 0);
  const friend = {
    ...unconnected,
    id: "friend",
    kind: "friend" as const,
    friendOfId: data.selfId,
  };
  assert.equal(saveFamilyPerson(saved, friend).people[2].generation, 0);
});

test("conflicting or out-of-range generations fail atomically", () => {
  const data = createDemo(),
    before = structuredClone(data);
  assert.throws(
    () =>
      saveFamilyPerson(data, {
        ...data.people[0],
        parentIds: ["dad", "grandpa"],
      }),
    /辈分.*冲突/,
  );
  assert.throws(
    () =>
      saveFamilyPerson(data, {
        ...data.people[0],
        id: "new-relative",
        partnerId: "grandpa",
        parentIds: ["grandpa"],
      }),
    /辈分.*冲突/,
  );
  const cyclic = structuredClone(data.people);
  cyclic.find((p) => p.id === "grandpa")!.parentIds = ["me"];
  assert.throws(
    () => synchronizeGenerations(cyclic, data.selfId, "me"),
    /冲突/,
  );
  assert.deepEqual(data, before);
});

test("a connected tree accepts 100 generations in either direction and rejects the 101st", () => {
  for (const direction of [-1, 1]) {
    const data = createEmpty();
    const self = data.people[0];
    for (let i = 1; i <= 100; i++) {
      const id = `relative-${i}`;
      const previous = data.people.at(-1)!;
      if (direction === -1) previous.parentIds = [id];
      data.people.push({
        ...self,
        id,
        parentIds: direction === 1 ? [previous.id] : [],
        generation: 2,
      });
    }
    const last = data.people.pop()!;
    if (direction === -1) data.people.at(-1)!.parentIds = [];
    data.people = synchronizeGenerations(data.people, data.selfId, data.selfId);
    assert.equal(data.people.at(-1)!.generation, 2 + 99 * direction);
    assert.equal(
      validateData(JSON.parse(JSON.stringify(data))).people.length,
      100,
    );
    if (direction === -1) data.people.at(-1)!.parentIds = [last.id];
    assert.throws(
      () =>
        synchronizeGenerations([...data.people, last], data.selfId, last.id),
      /最多支持 100 代/,
    );
  }
});

test("the 100-generation limit also applies across both directions", () => {
  const data = createEmpty();
  const self = data.people[0];
  const elder = { ...self, id: "elder", generation: -47 };
  const descendant = { ...self, id: "descendant", generation: 52 };
  const people = [self, elder, descendant];
  assert.doesNotThrow(() => synchronizeGenerations(people, self.id, self.id));
  assert.throws(
    () =>
      synchronizeGenerations(
        [self, elder, { ...descendant, generation: 53 }],
        self.id,
        self.id,
      ),
    /最多支持 100 代/,
  );
});

test("partner replacement remains reciprocal and does not discard personal details", () => {
  const data = createDemo();
  const saved = saveFamilyPerson(data, {
    ...data.people[0],
    partnerId: "cousin",
    note: "保留的资料",
    maritalStatus: "married",
  });
  assert.equal(saved.people.find((p) => p.id === "wife")!.partnerId, "");
  assert.equal(saved.people.find((p) => p.id === "cousin")!.partnerId, "me");
  assert.equal(saved.people[0].note, "保留的资料");
  assert.equal(saved.people[0].maritalStatus, "married");
});

test("father and mother branches come from connections even inside the same household", () => {
  const data = createDemo();
  data.families.forEach((f) => (f.branch = "home"));
  const before = structuredClone(data),
    branches = deriveBranches(data);
  for (const id of [
    "dad",
    "grandpa",
    "grandma",
    "uncle",
    "aunt-in-law",
    "cousin",
    "aunt-kid",
  ])
    assert.deepEqual([...branches.get(id)!], ["father"]);
  for (const id of [
    "mom",
    "m-grandpa",
    "m-grandma",
    "m-uncle",
    "m-aunt",
    "m-cousin",
  ])
    assert.deepEqual([...branches.get(id)!], ["mother"]);
  for (const id of ["me", "wife", "kid"])
    assert.deepEqual([...branches.get(id)!], ["home"]);
  assert.deepEqual(data, before);
});

test("explicit parent roles identify both sides when genders and names are blank", () => {
  const data = createDemo();
  data.people.forEach((p) => {
    p.gender = "other";
    p.relation = "";
    p.name = "";
  });
  data.people[0].parentRoles = { father: "dad", mother: "mom" };
  const branches = deriveBranches(validateData(data));
  assert.ok(branches.get("grandpa")!.has("father"));
  assert.equal(branches.get("mom")!.has("father"), false);
  assert.ok(branches.get("m-grandpa")!.has("mother"));
  assert.equal(branches.get("dad")!.has("mother"), false);
  data.people.find((p) => p.id === "mom")!.gender = "male";
  data.people[0].parentIds = ["mom"];
  data.people[0].parentRoles = { mother: "mom", father: "" };
  const explicit = deriveBranches(data);
  assert.deepEqual([...explicit.get("mom")!], ["mother"]);
});

test("in-law ancestry does not leak across branches; friends inherit the host's side", () => {
  const data = createDemo();
  data.families.push({ id: "inlaw", name: "", branch: "other" });
  const relative = {
    ...data.people[0],
    id: "inlaw-parent",
    familyId: "inlaw",
    parentIds: [],
    partnerId: "",
    generation: 0,
  };
  data.people.push(relative);
  data.people.find((p) => p.id === "aunt-in-law")!.parentIds = [relative.id];
  data.people.push({
    ...relative,
    id: "dad-friend",
    familyId: "parents",
    kind: "friend",
    friendOfId: "dad",
  });
  data.people.push({
    ...relative,
    id: "family-friend",
    familyId: "parents",
    kind: "friend",
    friendOfId: "",
  });
  const branches = deriveBranches(data);
  assert.deepEqual([...branches.get(relative.id)!], ["other"]);
  assert.deepEqual([...branches.get("dad-friend")!], ["father"]);
  assert.deepEqual([...branches.get("family-friend")!], ["other"]);
});

test("disconnected parents fall back to their manually chosen family branch", () => {
  const data = createDemo();
  data.people[0].parentIds = [];
  data.people[0].parentRoles = {};
  data.families.find((f) => f.id === "parents")!.branch = "other";
  const branches = deriveBranches(data);
  assert.deepEqual([...branches.get("dad")!], ["other"]);
  assert.deepEqual([...branches.get("mom")!], ["other"]);
});

test("old backups and new marital status and parent roles round trip", () => {
  assert.deepEqual(
    validateData(JSON.parse(JSON.stringify(createDemo()))),
    createDemo(),
  );
  const data = createDemo();
  data.people[0].maritalStatus = "divorced";
  data.people[0].parentRoles = { father: "dad", mother: "mom" };
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  data.people[0].parentRoles.father = "wife";
  assert.throws(() => validateData(data), /父亲和母亲/);
  data.people[0].parentRoles = {};
  data.people[0].maritalStatus = "invalid" as never;
  assert.throws(() => validateData(data), /婚姻/);
  const starter = createEmpty();
  starter.people[0].maritalStatus = "single";
  assert.equal(isBlankStarter(starter), false);
});

test("ages distinguish complete birthdays from approximate birth years", () => {
  const year = new Date().getFullYear();
  assert.equal(ageLabel({ birthday: `${year - 20}-01-01` }), "20岁");
  assert.equal(
    ageLabel({
      birthday: "",
      birthdayParts: { year: String(year - 20), month: "", day: "" },
    }),
    "约20岁",
  );
  assert.equal(
    ageLabel({
      birthday: "",
      birthdayParts: { year: "", month: "5", day: "2" },
    }),
    "",
  );
});
