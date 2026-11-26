// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LawScopesPanel } from "./admin-question-scopes";

afterEach(() => vi.unstubAllGlobals());

describe("Recortes no painel", () => {
  it("edita as faixas, mostra a contagem e salva sem mudar hierarquia ou status", async () => {
    const scope = { id:"scope", nome:"simulado", nome_exibicao:"CPP simulado", descricao:null,
      ativo:false, status_publicacao:"inativa", acesso_gratuito:false, structure_ids:[644], artigos_filtro:"", question_count:4 };
    const payload = { structure:[{id:644,parent_id:null,tipo:"capitulo",nome:"Do Acusado e Seu Defensor"}],
      questions:[259,260,261,267].map(n=>({id:String(n),structure_id:644,ordem:`0${n}.0.00.0.00.0`})),
      recortes:[scope], unstructured_questions:0 };
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        Object.assign(scope, {artigos_filtro:body.artigos_filtro, question_count:2});
        return {ok:true,json:async()=>({id:scope.id})};
      }
      return {ok:true,json:async()=>payload};
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const el = document.createElement("div"); document.body.appendChild(el);
    const root = createRoot(el);
    try {
      await act(async () => root.render(<LawScopesPanel lawSlug="cpp" />));
      const button = (name: string) => [...el.querySelectorAll("button")].find(b=>b.textContent===name)!;
      await act(async () => button("Editar").click());
      const field = el.querySelector<HTMLInputElement>('input[placeholder^="Ex."]')!;
      const set = async (value: string) => act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(field,value);
        field.dispatchEvent(new Event("input",{bubbles:true}));
      });
      expect(el.textContent).toContain("Questões alcançadas: 4");
      await set("267-261");
      expect(button("Salvar recorte").disabled).toBe(true);
      expect(el.textContent).toContain("Faixa invertida");
      await set("261-267");
      expect(el.textContent).toContain("Questões alcançadas: 2");
      await act(async () => button("Salvar recorte").click());
      const post = fetchMock.mock.calls.find(([,init])=>init?.method==="POST")![1]!;
      expect(JSON.parse(String(post.body))).toMatchObject({id:"scope",artigos_filtro:"261-267",structure_ids:[644],status_publicacao:"inativa"});
      expect(el.textContent).toContain("Artigos: 261-267");
      await act(async () => button("Editar").click());
      expect(el.querySelector<HTMLInputElement>('input[placeholder^="Ex."]')!.value).toBe("261-267");
    } finally { await act(async () => root.unmount()); el.remove(); }
  });
});
