import { describe, expect, it } from "vitest";
import { planLawDuplicateCleanup } from "./admin-law-duplicate-cleanup";

import { row } from "./admin-law-duplicate-cleanup.fixture";

describe("whole-law duplicate cleanup plan", () => {
  it("groups only assertion and law, ignoring answer, explanation, order and structure", () => {
    const p = planLawDuplicateCleanup([row(3,"<b>Assertiva.</b>",{ resposta:"Errado",justificativa:"Different",structure_id:4,ordem:"99" }),row(1),row(2)],1,"l8429");
    expect(p.total).toBe(2); expect(p.groups[0].retained.id).toBe(row(1).id);
  });
  it("never touches another law or inactive questions", () => {
    const p = planLawDuplicateCleanup([row(1),row(2),row(3,"Assertiva.",{lei_id:2}),row(4,"Assertiva.",{ativo:false}),row(5,"Assertiva.",{slug:"outra"})],1,"l8429");
    expect(p.total).toBe(1); expect(p.snapshot).toHaveLength(2);
  });
  it("covers over 1000 rows and over 100 groups, not a UI page", () => {
    const p=planLawDuplicateCleanup(Array.from({length:1202},(_,i)=>row(i+1,`Assertiva ${Math.floor(i/2)}`)),1,"l8429");
    expect(p.groups).toHaveLength(601); expect(p.total).toBe(601);
  });
  it("has deterministic preview/keeper independent of input order", () => {
    expect(planLawDuplicateCleanup([row(3),row(1),row(2)],1,"l8429")).toEqual(planLawDuplicateCleanup([row(2),row(3),row(1)],1,"l8429"));
  });
  it("invalidates a preview on any relevant edit, addition or inactivation", () => {
    const p=planLawDuplicateCleanup([row(1),row(2)],1,"l8429");
    for (const changed of [[row(1),row(2,"Changed")],[row(1),row(2,"Assertiva.",{justificativa:"edited"})],[row(1),row(2),row(3,"new")],[row(1)]]) expect(planLawDuplicateCleanup(changed,1,"l8429").token).not.toBe(p.token);
  });
  it("ignores blank assertions and returns an empty plan when already clean", () => {
    const p=planLawDuplicateCleanup([row(1,""),row(2,"<br>"),row(3,"Unique")],1,"l8429");
    expect(p.total).toBe(0); expect(p.groups).toEqual([]);
  });
});
