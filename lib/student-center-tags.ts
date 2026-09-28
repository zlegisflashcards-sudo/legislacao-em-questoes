export type StudentTag = { id:number; nome:string; cor:string; ativo:boolean };

export function parseTagIds(value: string) { return [...new Set(value.split(",").map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]; }
export function matchesStudentTags(tagIds: number[] = [], required: number[] = []) { return required.every((id) => tagIds.includes(id)); }
export function tagPatch(body: Record<string, unknown>) { const nome=typeof body.nome === "string" ? body.nome.trim() : ""; const cor=typeof body.cor === "string" ? body.cor.trim() : ""; if (!nome || nome.length>60 || !/^#[0-9A-Fa-f]{6}$/.test(cor)) throw new Error("Informe nome e cor válidos para a etiqueta."); return {nome,cor,ativo:body.ativo!==false}; }
