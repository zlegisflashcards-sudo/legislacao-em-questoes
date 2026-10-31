import { describe, expect, it } from "vitest";
import { questionConflictProvenance } from "./question-conflict-provenance";
const row = (id: string, assunto="Art. 3º", ordem="0003.0.00.0.00.0") => ({id,slug:"L9099",ordem,assunto,structure_id:3});
describe("individual structural evidence",()=>{
  it("keeps the offending subject, order, structure and destination from one UUID in a 13-member group",()=>{
    const id="f129c629-3a13-490c-af58-7b5c75601ec3";
    const result=questionConflictProvenance([...Array.from({length:12},(_,i)=>row(`valid-${i}`)),{...row(id,"Art. 35"),structure_id:35}]);
    expect(result.total).toBe(13); expect(result.affected).toHaveLength(1);
    expect(result.affected[0]).toMatchObject({id,assunto:"Art. 35",ordem:"0003.0.00.0.00.0",structureId:35,validation:{expectedOrder:"0035.0.00.0.00.0"}});
    expect(new URL(result.affected[0].editorUrl,"https://test.invalid").searchParams.get("question_id")).toBe(id);
    expect(result.batchEligible).toBe(false);
  });
  it("does not manufacture conflicts from ordinal 3º",()=>{
    expect(questionConflictProvenance([row("a","Art. 3º"),row("b","Art. 3"),row("c","Art. 3o")]).affected).toEqual([]);
  });
  it("preserves all conflicts and their different destinations",()=>{
    const r=questionConflictProvenance([row("a","Art. 35"),row("b","Art. 36"),row("valid")]);
    expect(r.affected.map(q=>[q.id,q.validation.expectedOrder])).toEqual([["a","0035.0.00.0.00.0"],["b","0036.0.00.0.00.0"]]);expect(r.batchEligible).toBe(false);
  });
  it("keeps possible and objective indications independently",()=>{
    const r=questionConflictProvenance([row("possible","Anexo"),row("objective","Art. 35")]);
    expect(r.hasConflict).toBe(true);expect(r.hasPossibleConflict).toBe(true);expect(r.affected).toHaveLength(2);expect(r.batchEligible).toBe(false);
  });
  it("enables context-wide batch only when every row has the same deterministic correction",()=>{
    expect(questionConflictProvenance([row("a","Art.35"),row("b","Art.35")]).batchEligible).toBe(true);
    expect(questionConflictProvenance([row("a","Art.35"),row("b")]).batchEligible).toBe(false);
    expect(questionConflictProvenance([]).batchEligible).toBe(false);
  });
});
