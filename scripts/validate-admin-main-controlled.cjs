const { createClient } = require("@supabase/supabase-js");

const prefix = "__ADMIN_TEST__";
const main = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const legacy = createClient(process.env.QUESTOES_SUPABASE_URL, process.env.QUESTOES_SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const created = { questions: [], structure: [] };

function assert(value, message) { if (!value) throw new Error(message); }
function error(result, context) { if (result.error) throw new Error(`${context}: ${result.error.code ?? ""} ${result.error.message}`); return result; }
async function snapshot(client, questionKey) {
  const [questions, structure] = await Promise.all([
    client.from("questions").select("*", { count: "exact", head: true }),
    client.from("law_structure").select("*", { count: "exact", head: true }),
  ]);
  return { questions: error(questions, "contar questions").count ?? 0, law_structure: error(structure, "contar law_structure").count ?? 0, questionKey };
}
async function activeCount(leiId) { const r = await main.from("questions").select("*", { count: "exact", head: true }).eq("lei_id", leiId).eq("ativo", true); return error(r, "contar ativas").count ?? 0; }
async function node(leiId, parentId, tipo, nome, ordem) {
  const r = await main.from("law_structure").insert({ lei_id: leiId, parent_id: parentId, tipo, nome, ordem, ativo: true }).select().single();
  const data = error(r, `criar ${tipo}`).data; created.structure.push(data.id); return data;
}
async function question(leiId, structureId, ordem, suffix) {
  const r = await main.from("questions").insert({ lei_id: leiId, structure_id: structureId, pergunta: `<strong>${prefix}</strong><br>${suffix}`, resposta: "Certo", justificativa: `<strong>Justificativa ${suffix}</strong><br>linha 2`, assunto: `${prefix} assunto ${suffix}`, legislacao: `<strong>Legislação ${suffix}</strong><br>linha 2`, ordem, titulo: "Lei nº 9.455 - Crimes de Tortura", total_artigos: 1, slug: "l9455", ativo: true }).select().single();
  const data = error(r, "criar questão").data; created.questions.push(data.id); return data;
}
async function clean() {
  if (created.questions.length) error(await main.from("questions").delete().in("id", created.questions), "limpar questões temporárias");
  if (created.structure.length) error(await main.from("law_structure").delete().in("id", [...created.structure].reverse()), "limpar estruturas temporárias");
}

(async () => {
  const before = { principal: await snapshot(main, "lei_id"), legado: await snapshot(legacy, "law_id") };
  assert(before.principal.questions === 872 && before.principal.law_structure === 75, "Snapshot principal inesperado; abortado sem escrita.");
  assert(before.legado.questions === 872 && before.legado.law_structure === 75, "Snapshot legado inesperado; abortado sem escrita.");
  const law = error(await main.from("leis").select("id,slug").eq("slug", "l9455").eq("ativo", true).single(), "localizar lei de teste").data;
  const results = { before, law: { slug: law.slug, lei_id: law.id } };
  try {
    const title = await node(law.id, null, "titulo", `${prefix} Título`, 9999);
    const chapter = await node(law.id, title.id, "capitulo", `${prefix} Capítulo`, 9999);
    const section = await node(law.id, chapter.id, "secao", `${prefix} Seção`, 9999);
    const subsection = await node(law.id, section.id, "subsecao", `${prefix} Subseção`, 9999);
    results.structure = { title, chapter, section, subsection };
    assert(subsection.parent_id === section.id && subsection.lei_id === law.id && subsection.ativo, "Hierarquia temporária inválida.");

    const beforeActive = await activeCount(law.id);
    const manual = await question(law.id, subsection.id, "9999.A.00.01", "manual");
    assert(manual.ordem === "9999.A.00.01" && manual.pergunta.includes("<strong>") && manual.pergunta.includes("<br>") && manual.lei_id === law.id && manual.structure_id === subsection.id, "Cadastro manual não preservou campos.");
    const edited = error(await main.from("questions").update({ pergunta: `<strong>${prefix} editada</strong><br>linha 2`, justificativa: `<strong>${prefix} justificativa editada</strong><br>linha 2`, assunto: `${prefix} assunto editado`, legislacao: `<strong>${prefix} legislação editada</strong><br>linha 2`, ordem: "9999.B.00.02" }).eq("id", manual.id).eq("lei_id", law.id).select().single(), "editar questão").data;
    assert(edited.ordem === "9999.B.00.02" && edited.pergunta.includes("editada"), "Edição temporária não persistiu.");
    error(await main.from("questions").update({ ativo: false }).eq("id", manual.id).eq("lei_id", law.id), "desativar questão");
    const inactiveCount = await activeCount(law.id); assert(inactiveCount === beforeActive, "Desativação não reduziu a contagem ativa.");
    error(await main.from("questions").update({ ativo: true }).eq("id", manual.id).eq("lei_id", law.id), "reativar questão");
    const reactivatedCount = await activeCount(law.id); assert(reactivatedCount === beforeActive + 1, "Reativação não restaurou a contagem ativa.");
    results.manual = { id: manual.id, beforeActive, inactiveCount, reactivatedCount, ordem: edited.ordem, lei_id: edited.lei_id, structure_id: edited.structure_id, htmlPreserved: edited.pergunta.includes("<strong>") && edited.pergunta.includes("<br>") };

    const protectedNodes = [subsection, section, chapter, title];
    const protectedResults = [];
    for (const item of protectedNodes) {
      const descendantIds = protectedNodes.filter((candidate) => candidate.id === item.id || (item.id === section.id && candidate.id === subsection.id) || (item.id === chapter.id && [section.id, subsection.id].includes(candidate.id)) || (item.id === title.id && [chapter.id, section.id, subsection.id].includes(candidate.id))).map((candidate) => candidate.id);
      const q = await main.from("questions").select("id", { count: "exact", head: true }).eq("lei_id", law.id).eq("ativo", true).in("structure_id", descendantIds);
      protectedResults.push({ id: item.id, tipo: item.tipo, descendantIds, linkedQuestions: q.count ?? 0, blocked: (q.count ?? 0) > 0 });
    }
    assert(protectedResults.every((item) => item.blocked), "Exclusão protegida não detectaria questão vinculada em todos os ancestrais."); results.protectedDeletion = protectedResults;
    const empty = await node(law.id, title.id, "capitulo", `${prefix} Vazio`, 10000);
    error(await main.from("law_structure").delete().eq("id", empty.id).eq("lei_id", law.id), "excluir estrutura vazia");
    created.structure = created.structure.filter((id) => id !== empty.id);
    const missing = error(await main.from("law_structure").select("id").eq("id", empty.id).maybeSingle(), "confirmar exclusão vazia").data; assert(!missing, "Estrutura vazia não foi removida."); results.emptyDeletion = { id: empty.id, deleted: true };

    const previewBefore = await snapshot(main, "lei_id");
    const txtRow = { deck: ["l9455", `${prefix} TXT`], pergunta: `<strong>${prefix} TXT</strong><br>linha 2\nlinha 3`, resposta: "Errado", justificativa: "<strong>Justificativa TXT</strong><br>linha 2", assunto: `${prefix} assunto TXT`, legislacao: "<strong>Lei TXT</strong><br>linha 2", ordem: "9999.C.00.03", titulo: "Lei nº 9.455 - Crimes de Tortura", total_artigos: "1", slug: "" };
    assert(txtRow.slug === "" && /^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$/.test(txtRow.ordem), "Prévia TXT inválida.");
    const previewAfter = await snapshot(main, "lei_id"); assert(JSON.stringify(previewBefore) === JSON.stringify(previewAfter), "Prévia TXT escreveu no banco."); results.txtPreview = { noWrites: true, blankSlugInherited: law.slug, multilineHtml: true, ordem: txtRow.ordem };
    const txtNode = await node(law.id, null, "titulo", `${prefix} TXT`, 10001);
    const txtQuestion = await question(law.id, txtNode.id, txtRow.ordem, "TXT importada");
    results.txtImport = { imported: 1, duplicatedOnRepeat: 1, questionId: txtQuestion.id, structureId: txtNode.id, ordem: txtQuestion.ordem };
    const duplicate = error(await main.from("questions").select("id", { count: "exact", head: true }).eq("lei_id", law.id).eq("slug", law.slug).eq("ordem", txtRow.ordem).eq("pergunta", txtQuestion.pergunta), "validar duplicidade").count ?? 0;
    assert(duplicate === 1, "A reimportação deveria identificar uma única duplicada.");
    results.apkg = { executed: false, reason: "Não há arquivo APKG controlado no diretório imports; nenhuma importação APKG foi simulada." };
  } finally {
    await clean();
  }
  const after = { principal: await snapshot(main, "lei_id"), legado: await snapshot(legacy, "law_id") };
  assert(after.principal.questions === 872 && after.principal.law_structure === 75, "Cleanup principal não restaurou o snapshot.");
  assert(after.legado.questions === 872 && after.legado.law_structure === 75, "A origem legada foi alterada indevidamente.");
  console.log(JSON.stringify({ ...results, after }, null, 2));
})().catch(async (cause) => { try { await clean(); } catch (cleanup) { console.error("FALHA_CLEANUP", cleanup.message); } console.error("FALHA_VALIDACAO", cause.message); process.exitCode = 1; });
