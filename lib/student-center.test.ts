import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd(); const read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
describe("Central do Aluno",()=>{
 it("mantém compras, acessos e estudo como fontes existentes",()=>{const server=read("lib/student-center-server.ts");expect(server).toContain('from("compras")');expect(server).toContain('from("liberacoes_leis")');expect(server).toContain('from("campanhas_leis_alunos")');});
 it("oferece os filtros operacionais e ações em lote solicitados",()=>{const ui=read("components/admin/student-center.tsx");for(const term of ["Pós-venda recente","Nunca acessou","Situação comercial","Pesquisar produto ou combo","Exportar CSV","Pós-venda realizado","WhatsApp","Sem telefone","event.stopPropagation()","Progresso por lei/campanha","Campanhas em andamento","Score competitivo","Comentários","Preparado para entrar futuramente.","Abrir WhatsApp","Marcar como feito","Pendente","Feito","name=\"post-sale\""])expect(ui).toContain(term);});
 it("cria somente estruturas manuais complementares",()=>{const migration=read("supabase/migrations/20260927100000_create_student_center_operations.sql");expect(migration).toContain("mensagens_alunos_salvas");expect(migration).toContain("acoes_alunos_historico");expect(migration).not.toContain("create table public.compras");});
 it("centraliza modelos e avisos sem duplicar o fluxo de comunicação",()=>{const control=read("components/admin/student-communication-control.tsx"),notices=read("components/admin/law-update-notices-admin.tsx"),server=read("lib/law-update-notices-server.ts");expect(control).toContain("LawUpdateNoticesAdmin");expect(control).toContain("Duplicar");expect(notices).toContain("Revisar destinatários");expect(server).toContain("law_update_notice_recipient_exclusions");});
});
