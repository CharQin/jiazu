import { strict as assert } from "node:assert";
import { test } from "node:test";
import { automaticHouseholds } from "../src/households.ts";
import { createEmpty, validateData } from "../src/model.ts";
import { createDemo } from "./fixtures.ts";

const member = (data: ReturnType<typeof createEmpty>, id: string) =>
  data.people.find((p) => p.id === id)!;
const home = (data: ReturnType<typeof createEmpty>, id: string) =>
  member(data, id).familyId;

test("parents and children group automatically; a married child and their friends move together", () => {
  const data = createDemo();
  const cousin = member(data, "cousin");
  data.people.push({
    ...cousin,
    id: "friend",
    kind: "friend",
    friendOfId: cousin.id,
    parentIds: [],
    partnerId: "",
    layoutOrder: 1024,
  });
  const before = structuredClone(data);
  const first = automaticHouseholds(data);
  assert.equal(home(first, "dad"), home(first, "mom"));
  assert.equal(home(first, "me"), home(first, "wife"));
  assert.equal(home(first, "kid"), home(first, "me"));
  assert.equal(home(first, "cousin"), home(first, "uncle"));
  assert.notEqual(home(first, "me"), home(first, "dad"));
  assert.deepEqual(data, before);
  cousin.maritalStatus = "married";
  const married = automaticHouseholds(data);
  assert.notEqual(home(married, "cousin"), home(married, "uncle"));
  assert.equal(home(married, "friend"), home(married, "cousin"));
  assert.equal(member(married, "friend").layoutOrder, 1024);
  assert.deepEqual(member(married, "cousin").parentIds, cousin.parentIds);
  assert.deepEqual(
    automaticHouseholds(validateData(JSON.parse(JSON.stringify(married)))),
    married,
  );
});

test("shared children group their parents without creating a marriage", () => {
  const data = createDemo();
  member(data, "uncle").partnerId = "";
  member(data, "aunt-in-law").partnerId = "";
  const organized = automaticHouseholds(data);
  assert.equal(home(organized, "uncle"), home(organized, "aunt-in-law"));
  assert.equal(home(organized, "uncle"), home(organized, "cousin"));
  assert.equal(member(organized, "uncle").partnerId, "");
  assert.equal(member(organized, "uncle").maritalStatus, undefined);
});

test("the network gives grandparents to the eldest child's family only, without losing other links", () => {
  const data = createDemo();
  const dad = member(data, "dad");
  dad.birthday = "";
  dad.birthdayParts = { year: "1959", month: "", day: "" };
  const grandpa = member(data, "grandpa");
  data.people.push({
    ...grandpa,
    id: "grandpa-friend",
    kind: "friend",
    friendOfId: grandpa.id,
    parentIds: [],
    partnerId: "",
  });
  const tree = automaticHouseholds(data);
  const network = automaticHouseholds(tree, true);
  assert.notEqual(home(tree, "grandpa"), home(tree, "dad"));
  for (const elder of ["grandpa", "grandma", "grandpa-friend"])
    assert.equal(home(network, elder), home(network, "dad"));
  assert.notEqual(home(network, "grandpa"), home(network, "uncle"));
  assert.deepEqual(
    member(network, "uncle").parentIds,
    member(tree, "uncle").parentIds,
  );
  assert.equal(network.people.length, tree.people.length);
  assert.deepEqual(automaticHouseholds(network, true), network);
});
