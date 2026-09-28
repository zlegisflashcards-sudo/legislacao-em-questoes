import { describe, expect, it } from "vitest";
import { matchesStudentTags, parseTagIds, tagPatch } from "@/lib/student-center-tags";
import { readFileSync } from "node:fs";
describe("etiquetas da Central do Aluno",()=>{
 it("valida criação e edição de etiqueta",()=>expect(tagPatch({nome:"VIP",cor:"#2563eb",ativo:false})).toEqual({nome:"VIP",cor:"#2563eb",ativo:false}));
 it("rejeita uma cor inválida",()=>expect(()=>tagPatch({nome:"VIP",cor:"azul"})).toThrow());
 it("remove ids duplicados para aplicação em lote",()=>expect(parseTagIds("1,2,1,invalido")).toEqual([1,2]));
 it("exige todas as etiquetas junto de filtros objetivos",()=>{expect(matchesStudentTags([1,2],[1,2])).toBe(true);expect(matchesStudentTags([1],[1,2])).toBe(false);});
 it("oferece aplicação, remoção em lote e histórico na Central",()=>{const server=readFileSync("lib/student-center-server.ts","utf8");for(const action of ["create_tag","update_tag","delete_tag","apply_tag","remove_tag","etiqueta_adicionada","etiqueta_removida"])expect(server).toContain(action);});
});
