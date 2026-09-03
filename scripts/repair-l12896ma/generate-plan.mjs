import fs from "node:fs";
import path from "node:path";

const root = path.resolve("scripts/repair-l12896ma");
const historicPath = "C:/Users/User/Downloads/Lei 12.896 (Organização Básica da Polícia Militar do Maranhão).txt";
const lawId = 5;
const removedId = "05bb7f3e-86cb-4c8b-bad0-16f4dba22a5e";
const ambiguousGroups = {
  "0010.0.00.00": ["04620c51-6ba1-4be4-91b7-b3ca1ba2af73", "07c24eb0-8c73-419e-ab1f-7d624df2d313", "845b02b7-854e-4657-aa17-9f206bbfdbda", "8af9a577-1f1e-45dd-9604-fbc87be71a8f"],
  "0011.0.00.00": ["2b4d1bf0-df98-4804-b9dc-e90b12f233d4", "61d7a9fc-1543-41fc-80b8-4069082d53ec", "8538bbba-772d-479d-9205-d3ac8679ea7b", "cc3c73c3-1594-4420-9d39-385e016b2756"],
  "0015.0.00.00": ["3d3b12a4-b46c-4be4-af57-adc80a61fe8f", "47bb187a-8a27-4237-a336-1d8fb0abe72d"],
};
const ambiguous = new Set(Object.values(ambiguousGroups).flat());
const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/coamandante/g, "comandante").replace(/ooperacional/g, "operacional").replace(/\s+/g, " ").trim();
function parseTsv(source) { const rows=[]; let row=[], field="", quote=false; for(let i=0;i<source.length;i++){const c=source[i]; if(c==='"'){ if(quote && source[i+1]==='"'){field+='"';i++;} else quote=!quote; } else if(c==='\t'&&!quote){row.push(field);field="";} else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&source[i+1]==='\n')i++;row.push(field);field="";if(row.length&&row.some(Boolean))rows.push(row);row=[];} else field+=c;} if(field||row.length){row.push(field);rows.push(row);} return rows; }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Variáveis de conexão ausentes no ambiente; nenhum arquivo foi gerado.");
async function get(endpoint) { const res=await fetch(`${url}/rest/v1/${endpoint}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}}); if(!res.ok) throw new Error(await res.text()); return res.json(); }
const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;
function replaceDeterministic(ids,map){return ids.filter(id=>id!==removedId).map(id=>map.get(id)??id);}
function groupCurrent(questions, ordem){return questions.filter(q=>q.structure_id===135&&q.ordem===ordem).sort((a,b)=>a.id.localeCompare(b.id)).map(q=>q.id);}
function operationalGroupRepair(q,p,pos,oldGroup,newGroup,needed,partial){ if(!needed)return {q,p,pos}; const places=q.map((id,i)=>oldGroup.includes(id)?i:-1).filter(i=>i>=0); const before=places.filter(i=>i<pos).length; const without=q.filter(id=>!oldGroup.includes(id)); const nextPos=pos-before; const first=places[0]; const insertion=partial ? nextPos : first - places.filter(i=>i<first).length; const nextQ=[...without.slice(0,insertion),...newGroup,...without.slice(insertion)]; return {q:nextQ,p:p.filter(id=>!oldGroup.includes(id)),pos:nextPos}; }
const historicRows=parseTsv(fs.readFileSync(historicPath,"utf8")).filter(r=>r.length>=3);
const [campaigns, questions] = await Promise.all([
  get(`campanhas_leis_alunos?select=id,aluno_id&lei_id=eq.${lawId}&concluida=eq.false&abandonada=eq.false`),
  get(`questions?select=id,structure_id,ordem,pergunta,resposta,lei_id,ativo&lei_id=eq.${lawId}&ativo=eq.true`),
]);
if(questions.length!==159||historicRows.length!==160) throw new Error(`Pré-condição falhou: atuais=${questions.length}, históricas=${historicRows.length}`);
const ids=campaigns.map(c=>c.id).join(",");
const [levels, students] = await Promise.all([
  get(`campanhas_leis_niveis?select=id,campanha_id,ordem,chave_origem,nome,questoes_ids,pendencias_ids,proxima_posicao,concluido&campanha_id=in.(${ids})&order=campanha_id,ordem`),
  get(`alunos?select=id,nome&id=in.(${campaigns.map(c=>c.aluno_id).join(",")})`),
]);
const names=new Map(students.map(x=>[x.id,x.nome]));
const currentIds=new Set(questions.map(q=>q.id));
const affectedCampaigns=campaigns.filter(c=>levels.filter(l=>l.campanha_id===c.id).some(l=>(l.questoes_ids??[]).some(id=>!currentIds.has(id))));
if(affectedCampaigns.length!==23) throw new Error(`Esperadas 23 campanhas afetadas, recebidas ${affectedCampaigns.length}.`);
const reference=affectedCampaigns[0]; const refLevels=levels.filter(l=>l.campanha_id===reference.id).sort((a,b)=>a.ordem-b.ordem);
if(refLevels.flatMap(l=>l.questoes_ids).length!==160) throw new Error("Snapshot de referência não tem 160 UUIDs.");
const currentByText=new Map(), currentByQuestion=new Map(); for(const q of questions){const k=`${normalize(q.pergunta)}|${normalize(q.resposta)}`; currentByText.set(k,[...(currentByText.get(k)??[]),q]); const questionKey=normalize(q.pergunta); currentByQuestion.set(questionKey,[...(currentByQuestion.get(questionKey)??[]),q]);}
const orderOf=row=>(row.find(value=>/^\d{4}(?:\.\d+){3}$/.test(value.trim()))??"").trim();
const map=new Map(), mapEntries=[];
for(const level of refLevels){const historic=historicRows.filter(row=>row[0].endsWith(level.nome)).sort((a,b)=>orderOf(a).localeCompare(orderOf(b))); if(historic.length!==level.questoes_ids.length) throw new Error(`TSV/snapshot divergente no nível ${level.nome}: ${historic.length}/${level.questoes_ids.length}`); for(let i=0;i<level.questoes_ids.length;i++){const oldId=level.questoes_ids[i], row=historic[i]; if(oldId===removedId||ambiguous.has(oldId))continue; let candidates=currentByText.get(`${normalize(row[1])}|${normalize(row[2])}`)??[]; if(candidates.length!==1)candidates=currentByQuestion.get(normalize(row[1]))??[]; if(candidates.length!==1) throw new Error(`Mapa não determinístico para ${oldId}: ${candidates.length} candidatos.`); const q=candidates[0]; map.set(oldId,q.id); mapEntries.push({old_id:oldId,new_id:q.id,ordem:q.ordem,structure_id:q.structure_id}); }}
if(mapEntries.length!==149) throw new Error(`Esperados 149 pares, recebidos ${mapEntries.length}.`);
const snapshot={law_slug:"l12896ma",law_id:lawId,generated_at:new Date().toISOString(),campaigns:affectedCampaigns.map(c=>c.id),levels:levels.filter(l=>affectedCampaigns.some(c=>c.id===l.campanha_id)).map(l=>({...l,questoes_ids:l.questoes_ids??[],pendencias_ids:l.pendencias_ids??[]}))};
const plan=[]; const classes={A:0,B:0,C:0};
for(const campaign of affectedCampaigns){const campaignLevels=levels.filter(l=>l.campanha_id===campaign.id).sort((a,b)=>a.ordem-b.ordem); const active=campaignLevels.find(l=>!l.concluido); let conservative=false;
 for(const level of campaignLevels){const before={questoes_ids:level.questoes_ids??[],pendencias_ids:level.pendencias_ids??[],proxima_posicao:level.proxima_posicao}; let q=replaceDeterministic(before.questoes_ids,map), p=replaceDeterministic(before.pendencias_ids,map); let pos=before.proxima_posicao-before.questoes_ids.slice(0,before.proxima_posicao).filter(id=>id===removedId).length; const restarted=[];
  if(!level.concluido){for(const [ordem, oldGroup] of Object.entries(ambiguousGroups)){const originalPositions=before.questoes_ids.map((id,i)=>oldGroup.includes(id)?i:-1).filter(i=>i>=0); const hasPending=before.pendencias_ids.some(id=>oldGroup.includes(id)); const future=originalPositions.some(i=>i>=before.proxima_posicao); if(!future&&!hasPending)continue; const current=groupCurrent(questions,ordem); if(current.length!==oldGroup.length)throw new Error(`Grupo ${ordem} atual inválido.`); const partial=hasPending||originalPositions.some(i=>i<before.proxima_posicao); ({q,p,pos}=operationalGroupRepair(q,p,pos,oldGroup,current,true,partial)); restarted.push(ordem); conservative=true;}}
  const after={questoes_ids:q,pendencias_ids:p,proxima_posicao:pos}; if(JSON.stringify(before)!==JSON.stringify(after))plan.push({nivel_id:level.id,campanha_id:campaign.id,aluno:names.get(campaign.aluno_id)??campaign.aluno_id,before,after,repair_type:restarted.length?"conservative_group":"deterministic",groups_restarted:restarted});
 }
 classes[conservative?"B":"A"]++;
 const target=plan.find(x=>x.campanha_id===campaign.id&&x.nivel_id===active?.id); const state=target?.after??(active?{questoes_ids:replaceDeterministic(active.questoes_ids??[],map),pendencias_ids:replaceDeterministic(active.pendencias_ids??[],map),proxima_posicao:active.proxima_posicao}:null); const next=state?(state.proxima_posicao<state.questoes_ids.length?state.questoes_ids[state.proxima_posicao]:state.pendencias_ids[0]):null; if(!next||!questions.some(q=>q.id===next)) throw new Error(`Player inválido na campanha ${campaign.id}`);
}
if(classes.A!==9||classes.B!==14||classes.C!==0) throw new Error(`Classes inesperadas ${JSON.stringify(classes)}`);
const questionMap={law_slug:"l12896ma",generated_at:new Date().toISOString(),total_historical_uuids:160,deterministic:mapEntries,removed:[{old_id:removedId,ordem:"0001.0.00.00"}],ambiguous_groups:Object.entries(ambiguousGroups).map(([ordem,old_ids])=>({ordem,structure_id:135,old_ids,current_ids:groupCurrent(questions,ordem)}))};
const json=v=>JSON.stringify(v).replaceAll("'","''"); const values=plan.map(x=>`(${x.nivel_id},${sql(x.campanha_id)},${sql(JSON.stringify(x.before.questoes_ids))}::jsonb,${sql(JSON.stringify(x.before.pendencias_ids))}::jsonb,${x.before.proxima_posicao},${sql(JSON.stringify(x.after.questoes_ids))}::jsonb,${sql(JSON.stringify(x.after.pendencias_ids))}::jsonb,${x.after.proxima_posicao})`).join(",\n");
const apply=`-- Generated ${new Date().toISOString()}; execute only after independent review.\nBEGIN;\nCREATE TEMP TABLE repair_plan (nivel_id bigint PRIMARY KEY,campanha_id uuid,before_q jsonb,before_p jsonb,before_pos integer,after_q jsonb,after_p jsonb,after_pos integer) ON COMMIT DROP;\nINSERT INTO repair_plan VALUES\n${values};\nDO $$ DECLARE expected_count integer; locked_count integer; bad_count integer; BEGIN SELECT count(*) INTO expected_count FROM repair_plan; PERFORM 1 FROM campanhas_leis_niveis n JOIN repair_plan p ON p.nivel_id=n.id FOR UPDATE; SELECT count(*) INTO locked_count FROM campanhas_leis_niveis n JOIN repair_plan p ON p.nivel_id=n.id; IF locked_count<>expected_count THEN RAISE EXCEPTION 'repair plan row mismatch'; END IF; SELECT count(*) INTO bad_count FROM campanhas_leis_niveis n JOIN repair_plan p ON p.nivel_id=n.id WHERE n.campanha_id<>p.campanha_id OR n.questoes_ids<>p.before_q OR n.pendencias_ids<>p.before_p OR n.proxima_posicao<>p.before_pos; IF bad_count<>0 THEN RAISE EXCEPTION 'repair plan stale: % rows diverged',bad_count; END IF; END $$;\nUPDATE campanhas_leis_niveis n SET questoes_ids=p.after_q,pendencias_ids=p.after_p,proxima_posicao=p.after_pos FROM repair_plan p WHERE n.id=p.nivel_id AND (n.questoes_ids,n.pendencias_ids,n.proxima_posicao) IS DISTINCT FROM (p.after_q,p.after_p,p.after_pos);\n-- Postcondition: every next question for an active campaign resolves to a current question.\nDO $$ DECLARE invalid_count integer; BEGIN SELECT count(*) INTO invalid_count FROM progresso_leis_alunos pr JOIN LATERAL (SELECT * FROM campanhas_leis_niveis WHERE campanha_id=pr.campanha_ativa_id AND concluido=false ORDER BY ordem LIMIT 1) n ON true LEFT JOIN questions q ON q.id=CASE WHEN n.proxima_posicao<jsonb_array_length(n.questoes_ids) THEN n.questoes_ids->>n.proxima_posicao ELSE n.pendencias_ids->>0 END AND q.lei_id=${lawId} AND q.ativo=true WHERE pr.campanha_ativa_id IN (SELECT campanha_id FROM repair_plan) AND q.id IS NULL; IF invalid_count<>0 THEN RAISE EXCEPTION 'postcondition failed: % unresolved next questions',invalid_count; END IF; END $$;\nCOMMIT;\n`;
fs.mkdirSync(root,{recursive:true}); fs.writeFileSync(path.join(root,"question-map.json"),JSON.stringify(questionMap,null,2)); fs.writeFileSync(path.join(root,"pre-repair-snapshots.json"),JSON.stringify(snapshot,null,2)); fs.writeFileSync(path.join(root,"repair-plan.json"),JSON.stringify({generated_at:new Date().toISOString(),classes,changes:plan},null,2)); fs.writeFileSync(path.join(root,"apply-repair.sql"),apply);
console.log(JSON.stringify({map:mapEntries.length,removed:1,ambiguous:ambiguous.size,campaigns:affectedCampaigns.length,classes,lines:plan.length,open_campaigns_ignored:campaigns.length-affectedCampaigns.length},null,2));
