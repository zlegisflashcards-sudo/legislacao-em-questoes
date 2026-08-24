import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const player = readFileSync("components/legis-questoes-study-client.tsx", "utf8");
const sanitizer = readFileSync("lib/legis-questoes-html.ts", "utf8");
const campaignServer = readFileSync("lib/law-campaign-server.ts", "utf8");
const campaignMigration = readFileSync("supabase/migrations/20260820100000_add_law_campaign_level_errors.sql", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const legisBotPage = readFileSync("app/legisbot/legisbot-page-client.tsx", "utf8");

describe("player Legis Questões", () => {
  it("mantém estados de carregamento e erro do Estudo Ativo da Lei antes do cartão", () => {
    expect(player).toContain('Carregando Estudo Ativo da Lei…'); expect(player).toContain('if (error)'); expect(player).toContain('Nenhuma questão disponível neste Estudo Ativo da Lei.');
  });

  it("usa o estado retornado pelo POST inicial e não faz GET duplicado", () => {
    const campaignStudy = player.slice(player.indexOf("function CampaignStudy"), player.indexOf("function FreeStudy"));
    expect(campaignStudy).toContain('const state = await api(start ? "POST" : "GET");');
    expect(campaignStudy).not.toContain('const state = initial.status === "concluida"');
  });

  it("separa explicitamente campanha e estudo livre", () => {
    expect(player).toContain('searchParams.get("livre") === "1"'); expect(player).toContain('<CampaignStudy slug={slug} />'); expect(player).toContain('<FreeStudy slug={slug} structureId={searchParams.get("structure_id")} />');
  });

  it("retorna do player para a central da lei atual em qualquer modo", () => {
    expect(player).toContain('StudyLawContext.Provider value={slug}');
    expect(player).toContain('href={`/estudar/lei/${encodeURIComponent(slug)}`}');
    expect(player).not.toContain('href="/questoes">← Voltar');
  });

  it("mostra o selo de atualização acima do card somente quando o campo real existe", () => {
    expect(player).toContain('function UpdateSeal({ question }: { question: Question })');
    expect(player).toContain('question.ultima_alteracao_legislativa?.trim()');
    expect(player).toContain('<UpdateSeal question={question} /><PlayerCard mode="campaign"');
    expect(player).toContain('<UpdateSeal question={currentQuestion} /><PlayerCard mode="free"');
    expect(styles).toContain('.lf-update-seal{display:block;width:fit-content;max-width:100%');
  });

  it("monta o Reportar erro como mailto seguro com apenas campos disponíveis", () => {
    expect(player).toContain('mailto:zlegisflashcards@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}');
    expect(player).toContain('Erro no flashcard - ${order}');
    expect(player).toContain('[["Lei", law], ["Ordem", order], ["Assunto", question.assunto?.trim()]]');
    expect(player).toContain('<ReportError question={question} />');
    expect(player).toContain('<ReportError question={currentQuestion} />');
    expect(styles).toContain('.lf-report-error{display:table;margin:14px auto 0');
  });

  it("renderiza HTML do Anki somente após sanitização", () => {
    expect(player).toContain("sanitizeLegisQuestoesHtml");
    expect(player).toContain("dangerouslySetInnerHTML={{ __html: safe }}");
    expect(sanitizer).toContain('"span"');
    expect(sanitizer).toContain('"background-color"');
    expect(sanitizer).toContain('"script"');
    expect(sanitizer).toContain("normalizeLegacyAnkiHtml");
  });

  it("mostra justificativa somente após responder e reencaminha erros ao nível", () => {
    expect(player).toContain('answer ? <AnswerFeedback'); expect(player).toContain('Esta questão voltará neste nível.'); expect(player).toContain('question.justificativa ?');
  });

  it("limita a caixa colorida ao resultado e deixa comentário e legislação fora dela", () => {
    const feedback = player.slice(player.indexOf("function AnswerFeedback"), player.indexOf("function isPlayerFormTarget"));
    expect(feedback).toContain('<section className={`lf-feedback ${correct ? "is-correct" : "is-wrong"}`}>');
    expect(feedback).toContain('<p className="lf-gabarito">');
    expect(feedback).toContain('<section className="lf-feedback-details">');
    expect(feedback.indexOf('lf-gabarito')).toBeLessThan(feedback.indexOf('lf-feedback-details'));
    expect(styles).toContain('.lf-feedback-details{display:grid;gap:14px;margin-top:18px}');
    expect(styles).toContain('.lf-feedback-details .lf-professor-toggle{border-top:0;padding:0}');
  });

  it("vincula LegisBot, Comunidade e Destaques ao bloco de legislação", () => {
    const feedback = player.slice(player.indexOf("function LawStudyTools"), player.indexOf("function isPlayerFormTarget"));
    expect(feedback).toContain('className="lf-law-tools"');
    expect(feedback).toContain('onOpen("legisbot")');
    expect(feedback).toContain('onOpen("community")');
    expect(feedback).toContain('onOpen("highlights")');
    expect(feedback.indexOf('lf-law-block')).toBeLessThan(feedback.indexOf('LawStudyTools onOpen={onOpenLegisBot}'));
    expect(styles).toContain('.lf-law-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))');
    expect(styles).toContain('@media(max-width:520px){.lf-law-tools{grid-template-columns:1fr}');
  });

  it("abre o LegisBot sobre o jogador sem navegação e mantém as abas no mesmo painel", () => {
    const overlay = player.slice(player.indexOf("function LegisBotOverlay"), player.indexOf("function isPlayerFormTarget"));
    expect(overlay).toContain('<LegisBotPageClient slug={slug} ordem={question.ordem ?? ""}');
    expect(overlay).toContain('initialTab={initialTab} embedded onClose={onClose}');
    expect(overlay).toContain('document.body.style.overflow = "hidden"');
    expect(overlay).toContain('event.key === "Escape"');
    expect(overlay).toContain('role="dialog" aria-modal="true"');
    expect(overlay).toContain('function trapFocus');
    expect(player).not.toContain('QuestionLegisBotTrigger');
    expect(styles).toContain('.lf-legisbot-overlay{position:fixed;z-index:100;inset:0');
    expect(styles).toContain('.lf-legisbot-panel{width:min(50vw,780px);height:100%;overflow-y:auto');
    expect(styles).toContain('@media(max-width:768px){.lf-legisbot-overlay{align-items:flex-end}');
  });

  it("mantém a rota direta do LegisBot e apenas adiciona o modo embutido", () => {
    expect(legisBotPage).toContain('embedded?: boolean;');
    expect(legisBotPage).toContain('onClose?: () => void;');
    expect(legisBotPage).toContain('embedded ? <div className="legisbot-topic-tools">');
    expect(legisBotPage).toContain('<a href={centralLegislacaoUrl} className="legislation-back-link">');
  });

  it("usa assunto como título do trecho legal e reserva Legislação para o fallback", () => {
    const feedback = player.slice(player.indexOf("function AnswerFeedback"), player.indexOf("function isPlayerFormTarget"));
    expect(feedback).toContain('const assunto = question.assunto?.trim() || "Legislação";');
    expect(feedback).toContain('<h2>📜 {assunto}</h2>');
    expect(styles).toContain('.lf-law-block h2{margin:0 0 8px;color:#0b4f9f;font-size:13px;font-weight:850}');
    expect(styles).not.toContain('.lf-law-block h2{margin:0 0 8px;color:#0b4f9f;font-size:13px;text-transform:uppercase}');
  });

  it("desabilita Anterior na campanha e libera navegação no estudo livre", () => {
    expect(player).toContain('<button disabled className="lf-secondary"'); expect(player).toContain('disabled={index === 0}'); expect(player).toContain('disabled={index === questions.length - 1}');
  });

  it("oferece atalhos sem interceptar edição, modificadores ou teclas repetidas", () => {
    expect(player).toContain('function usePlayerKeyboard');
    expect(player).toContain('event.repeat || event.ctrlKey || event.altKey || event.metaKey || isPlayerFormTarget(event.target)');
    expect(player).toContain('target.closest("input, textarea, select, [contenteditable], [role=\'dialog\'], .lf-editor-drawer")');
    expect(player).toContain('if (key === "c") state.onCorrect(); else state.onWrong();');
    expect(player).toContain('key !== "enter" && key !== " " && key !== "arrowright"');
    expect(player).toContain('if (!state.canPrevious || actionLock.current) return;');
    expect(player).toContain('canPrevious: false');
    expect(player).toContain('canPrevious: index > 0');
  });

  it("mantém um único listener estável com estado atual e libera Enter após responder", () => {
    expect(player).toContain('const stateRef = useRef<PlayerKeyboardState>');
    expect(player).toContain('stateRef.current = { answered, canAnswer, canNext, canPrevious, onCorrect, onWrong, onNext, onPrevious }');
    expect(player).toContain('}, [questionId, answered]);');
    expect(player).toContain('}, []); }');
    expect(player).not.toContain('input, textarea, select, button, [contenteditable]');
  });

  it("mostra o avanço global do Estudo Ativo da Lei e oculta a barra na revisão", () => {
    expect(player).toContain('progress={campaign?.progress ?? 0}'); expect(player).toContain('reviewing={campaign?.level?.reviewing ?? false}'); expect(player).toContain('{!reviewing ? <div className="lf-progress-row">'); expect(player).toContain('Revisando questões erradas'); expect(player).toContain('{progress}%'); expect(player).not.toContain('progress={campaign?.level?.firstPassProgress ?? 0}'); expect(player).toContain('progress: result.progress ?? current.progress');
    expect(campaignServer).toContain('const completedBeforeCurrentLevel = levels.filter((item) => item.id !== level.id && item.concluido).flatMap((item) => item.questoes_ids).length;'); expect(campaignServer).toContain('const currentLevelFirstPassCompleted = Math.min(nextPosition, level.questoes_ids.length);'); expect(campaignServer).toContain('const globalCompletedQuestions = completedBeforeCurrentLevel + currentLevelFirstPassCompleted;');
  });

  it("preserva erros no snapshot, mas exibe uma mensagem determinística ao concluir o nível", () => {
    expect(player).not.toContain("Score do módulo");
    expect(player).not.toContain("lf-level-score");
    expect(player).toContain("const LEVEL_COMPLETION_MESSAGE");
    expect(player).toContain("⚡ Parabéns! Mais uma etapa concluída.");
    expect(player).not.toContain('current.levels?.findIndex((level) => level.id === current.level?.id)');
    expect(player).toContain('<LevelCompletion level={levelDone}');
    expect(player).not.toContain('{levelDone.errors}');
    expect(player).not.toContain('const messages = current.completionMessages?.filter');
    expect(player).toContain('setLevelDone({ name: current.level?.nome ?? "" });');
    expect(campaignServer).not.toContain('getActiveLevelCompletionMessages');
    expect(campaignServer).not.toContain('completionMessages, level: { id: level.id');
    expect(campaignServer).toContain('total_erros: levelErrors');
    expect(campaignServer).toContain('levelResult: concludesLevel ? { errors: levelErrors } : null');
    expect(campaignServer).not.toContain('score: score(levelErrors)');
    expect(campaignMigration).toContain('add column if not exists total_erros integer not null default 0');
  });

  it("só celebra a conclusão após a confirmação final do backend", () => {
    expect(player).toContain('if (result.campaignConcluded)');
    expect(player).toContain('setCelebrating(true)');
    expect(player).toContain('if (result.levelConcluded)');
    expect(player).toContain('setLevelDone({ name: current.level?.nome ?? "" });');
    expect(campaignServer).toContain('update({ concluida: true, concluida_em: new Date().toISOString(), score: finalScore })');
    expect(campaignServer).toContain('update({ status_campanha: "concluida", questoes_finalizadas: true, campanha_ativa_id: null })');
  });

  it("oculta a questão anterior enquanto confirma e busca a próxima campanha", () => {
    expect(player).toContain('const answerToSave = answer; const current = campaign; const currentQuestion = campaign.question;');
    expect(player).toContain('answer: answerToSave');
    expect(player).toContain('function QuestionLoading()');
    expect(player).toContain('{transitioning ? <QuestionLoading /> : <div key={question.id} className="lf-question-stage">');
    expect(player).toContain('<QuestionContent question={question} />');
  });

  it("antecipa somente a próxima questão inédita já carregada e preserva skeleton nas transições especiais", () => {
    expect(player).toContain('const nextQuestion = currentLevel && !currentLevel.reviewing ? currentLevel.questions[currentLevel.position + 1] : null;');
    expect(player).toContain('setTransitioning(!nextQuestion);');
    expect(player).toContain('if (nextQuestion && currentLevel) setCampaign');
    expect(player).toContain('{transitioning ? <QuestionLoading /> : <div key={question.id}');
    expect(player).toContain('<AnswerButtons answer={answer} disabled={saving} onChoose={setAnswer} />');
    expect(player).toContain('canAnswer: !saving');
  });

  it("reconcilia a próxima questão confirmada pelo PATCH sem novo GET no fluxo normal", () => {
    expect(player).toContain('const persistedNext = result.next;');
    expect(player).toContain('currentLevel?.questions.find((question) => question.id === persistedNext.questionId)');
    expect(player).toContain('position: persistedNext.position, reviewing: persistedNext.reviewing');
    expect(campaignServer).toContain('next: nextQuestionId ? { questionId: nextQuestionId, position: nextPosition, reviewing:');
  });

  it("mantém respostas e feedback locais no estudo livre sem chamar a campanha", () => {
    expect(player).toContain('function FreeStudy');
    expect(player).toContain('[answer, setAnswer] = useState<Choice | null>(null)');
    expect(player).toContain('usePlayerKeyboard({ questionId: currentQuestion?.id ?? "", answered: answer !== null');
    expect(player).toContain('onCorrect: () => setAnswer("certo"), onWrong: () => setAnswer("errado")');
    expect(player).toContain('<AnswerButtons answer={answer} onChoose={setAnswer} />');
    expect(player).toContain('{answer ? <AnswerFeedback question={currentQuestion} correct={correct} onOpenLegisBot={(tab) => setLegisBot({ question: currentQuestion, tab })} /> : null}');
    expect(player).toContain('function moveTo(nextIndex: number) { setAnswer(null); setIndex(nextIndex); }');
    const freeStudy = player.slice(player.indexOf('function FreeStudy'));
    expect(freeStudy).not.toContain('/campanha');
  });

  it("preserva o structure_id numérico da árvore e reinicia no início do recorte selecionado", () => {
    const freeStudy = player.slice(player.indexOf('function FreeStudy'));
    expect(freeStudy).toContain('structureId && /^\\d+$/.test(structureId)');
    expect(freeStudy).toContain('`?structure_id=${encodeURIComponent(structureId)}`');
    expect(freeStudy).toContain('setQuestions(result.questions); setIndex(0); setAnswer(null);');
  });

  it("mantém o Estudo Livre visualmente concluído mesmo em sessão filtrada", () => {
    const freeStudy = player.slice(player.indexOf('function FreeStudy'));
    expect(freeStudy).toContain('progress={100}');
    expect(freeStudy).not.toContain('totalLawQuestions');
    expect(freeStudy).not.toContain('globalPosition');
    expect(freeStudy).not.toContain('progress={Math.round((index + 1) / questions.length * 100)}');
  });

  it("renderiza somente a questão atual no estudo livre", () => {
    const freeStudy = player.slice(player.indexOf('function FreeStudy'));
    expect(freeStudy).toContain('const currentQuestion = questions[index];');
    expect(freeStudy).toContain('<div key={currentQuestion.id} className="lf-question-stage"><QuestionContent question={currentQuestion} />');
    expect(freeStudy.match(/<QuestionContent/g)).toHaveLength(1);
    expect(freeStudy).not.toContain('questions.map(');
  });

  it("usa uma única key para o estágio dinâmico de cada questão", () => {
    expect(player).not.toContain('<QuestionContent key=');
    expect(player).not.toContain('<AnswerFeedback key=');
    expect(player.match(/className="lf-question-stage"/g)).toHaveLength(2);
    expect(player.match(/key=\{(?:currentQuestion|question)\.id\}/g)).toHaveLength(2);
  });

  it("restaura o contexto da lei e mantém HTML rico dentro de uma única moldura", () => {
    expect(player).toContain('Conforme o(a) <strong>{title}</strong>, julgue o item que se segue.');
    expect(player).toContain('<div className="lf-statement"><Html value={question.pergunta} /></div>');
    for (const selector of ['.lf-question{box-sizing:border-box;min-width:0;max-width:100%;overflow:hidden}', '.lf-statement .legis-questoes-html>div,.lf-statement .legis-questoes-html>p{border:0;background:transparent;padding:0;border-radius:0}', '.lf-statement .legis-questoes-html table{display:block;max-width:100%;overflow-x:auto']) expect(styles).toContain(selector);
  });

  it("normaliza somente o espaçamento do HTML pedagógico, preservando quebras do Anki", () => {
    for (const selector of ['.legis-questoes-html{max-width:100%;overflow-wrap:anywhere;white-space:normal}', '.legis-questoes-html p{margin:0 0 .65em}', '.legis-questoes-html div+div{margin-top:.25em}', '.legis-questoes-html ul,.legis-questoes-html ol{margin:.5em 0', '.legis-questoes-html li{margin:.2em 0', '.legis-questoes-html pre{max-width:100%;overflow:auto']) expect(styles).toContain(selector);
    expect(styles).not.toContain('.legis-questoes-html *{margin:0!important}');
  });

  it("mostra o resultado final, celebração discreta e os dois destinos pedidos", () => {
    expect(player).toContain('⚡ LEI CONCLUÍDA!');
    expect(player).toContain('Score desta tentativa');
    expect(player).toContain('function PersonalRecordSummary');
    expect(player).toContain('Primeiro recorde registrado! Nas próximas tentativas');
    expect(player).toContain('Novo recorde pessoal! Você superou sua melhor pontuação nesta lei.');
    expect(player).toContain('Você igualou seu recorde! Mais uma tentativa nesse nível de desempenho.');
    expect(player).toContain('Seu recorde continua sendo ${score} pontos.');
    expect(player).toContain('<PersonalRecordSummary record={result.personalRecord} />');
    expect(player).toContain('function AttemptDonut');
    expect(player).toContain('campaignAttemptPerformance(result?.totalQuestions ?? 0, result?.errors ?? 0)');
    expect(player).toContain('<AttemptDonut correct={performance.correct} errors={performance.errors} accuracy={performance.accuracy} />');
    expect(player).toContain('Sua posição no ranking:');
    expect(styles).toContain('.lf-attempt-donut{display:grid;width:142px;height:142px');
    expect(styles).toContain('background:conic-gradient(#1eaa5d 0 var(--lf-correct),#e34d4d var(--lf-correct) 100%)');
    expect(player).toContain('href={`/questoes/${encodeURIComponent(useContext(StudyLawContext) ?? "")}/estudar?livre=1`}');
    expect(player).toContain('href="/minhas-leis">Voltar às minhas leis');
    expect(player).toContain('window.matchMedia("(prefers-reduced-motion: reduce)").matches');
    expect(styles).toContain('@media(prefers-reduced-motion:reduce){.lf-celebration-mark,.lf-celebration-particles i{animation:none}}');
    expect(campaignServer).toContain('progress: state.status === "concluida" ? 100 : 0');
  });

  it("calcula o recorde sobre o histórico concluído sem reabrir ou apagar tentativas concluídas", () => {
    expect(campaignServer).toContain('select("score,score_ajustado").eq("aluno_id", context.studentId).eq("lei_id", context.lawId).eq("concluida", true)');
    expect(campaignServer).toContain('personalRecordForAttempt(finalScore, previousCampaigns ?? [])');
    expect(campaignServer).toContain('.delete().eq("id", current.campanha_ativa_id).eq("concluida", false)');
  });
});
