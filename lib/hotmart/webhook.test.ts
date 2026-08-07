import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diagnosticoHottok, normalizarEventoHotmart, registrarEventoHotmart } from "./webhook";

const payload = {
  id: "evt-123",
  event: "PURCHASE_APPROVED",
  buyer: { email: "Aluno@Exemplo.com" },
  product: { id: 987 },
  purchase: { transaction: "HP123", status: "APPROVED" },
};

const payloadV2 = {
  id: "evt-v2-123",
  event: "PURCHASE_APPROVED",
  data: {
    buyer: { email: "Aluno.V2@Exemplo.com", name: "Aluno V2", checkout_phone: "+5511999999999" },
    product: { id: 456, name: "Vade Mecum" },
    purchase: { transaction: "HPV2-123", status: "APPROVED", approved_date: 1720000000 },
  },
};

function payloadPerda(event: "PURCHASE_CANCELED" | "PURCHASE_REFUNDED" | "PURCHASE_CHARGEBACK") {
  return {
    ...payloadV2,
    id: `evt-${event.toLowerCase()}`,
    event,
    data: { ...payloadV2.data, purchase: { ...payloadV2.data.purchase, status: event.replace("PURCHASE_", "") } },
  };
}

type Step = { data?: unknown; error?: unknown };

function supabaseComRespostas(...steps: Step[]) {
  const calls: Array<{ table: string; operation: "insert" | "update"; value: unknown }> = [];
  const client = {
    from(table: string) {
      const response = steps.shift() ?? {};
      const query = {
        select: () => query,
        eq: () => query,
        ilike: () => query,
        limit: () => query,
        insert: (value: unknown) => { calls.push({ table, operation: "insert", value }); return query; },
        update: (value: unknown) => { calls.push({ table, operation: "update", value }); return query; },
        single: async () => response,
        maybeSingle: async () => response,
        then: <T>(resolve: (value: Step) => T) => Promise.resolve(response).then(resolve),
      };
      return query;
    },
  };
  return { client, calls };
}

describe("recepção de webhook Hotmart", () => {
  it("alinha a tabela legada aos campos registrados pelo receptor", () => {
    const migration = readFileSync("supabase/migrations/20260807190000_align_hotmart_eventos_webhook.sql", "utf8");
    for (const field of ["identificador_evento", "codigo_transacao", "tipo_evento", "status_transacao", "email_comprador", "payload_bruto", "payload_normalizado", "recebido_em"]) {
      expect(migration).toContain(`add column if not exists ${field}`);
    }
    expect(migration).toContain("hotmart_eventos_identificador_evento_unique_idx");
  });

  it("expõe apenas presença e tamanhos no diagnóstico do Hottok", () => {
    expect(diagnosticoHottok("segredo-recebido", "segredo-configurado")).toEqual({
      hottokRecebido: true, hottokConfigurado: true, tamanhoRecebido: 16, tamanhoConfigurado: 19,
    });
    expect(diagnosticoHottok(null, undefined)).toEqual({
      hottokRecebido: false, hottokConfigurado: false, tamanhoRecebido: 0, tamanhoConfigurado: 0,
    });
  });

  it("normaliza os campos de um evento novo no formato legado", () => {
    expect(normalizarEventoHotmart(payload)).toEqual({
      identificador_evento: "evt-123", codigo_transacao: "HP123", hotmart_product_id: "987",
      tipo_evento: "PURCHASE_APPROVED", status_transacao: "APPROVED", email_comprador: "aluno@exemplo.com",
      nome_comprador: null, telefone_comprador: null, aprovada_em: null,
    });
  });

  it("normaliza um payload Hotmart v2.0 com dados dentro de data", () => {
    expect(normalizarEventoHotmart(payloadV2)).toEqual({
      identificador_evento: "evt-v2-123", codigo_transacao: "HPV2-123", hotmart_product_id: "456",
      tipo_evento: "PURCHASE_APPROVED", status_transacao: "APPROVED", email_comprador: "aluno.v2@exemplo.com",
      nome_comprador: "Aluno V2", telefone_comprador: "+5511999999999", aprovada_em: "2024-07-03T09:46:40.000Z",
    });
  });

  it("aceita ausência de campos opcionais e rejeita payload sem identificador", () => {
    expect(normalizarEventoHotmart({ id: "evt-124" })).toMatchObject({ codigo_transacao: null, email_comprador: null });
    expect(() => normalizarEventoHotmart({ event: "PURCHASE_APPROVED" })).toThrow("sem identificador");
    expect(() => normalizarEventoHotmart([])).toThrow("Payload inválido");
  });

  it("registra um evento sem processamento comercial com payload bruto e normalizado", async () => {
    let registro: unknown;
    const supabase = { from: () => ({ insert: (value: unknown) => {
      registro = value;
      return { error: null };
    } }) };
    const payloadPendente = { ...payloadV2, event: "PURCHASE_PENDING", data: { ...payloadV2.data, purchase: { ...payloadV2.data.purchase, status: "PENDING" } } };
    await expect(registrarEventoHotmart(supabase as never, payloadPendente)).resolves.toEqual({ duplicate: false });
    expect(registro).toMatchObject({
      identificador_evento: "evt-v2-123", hotmart_event_id: "evt-v2-123",
      evento: "PURCHASE_PENDING", codigo_transacao: "HPV2-123", hotmart_transaction_id: "HPV2-123",
      payload: payloadPendente, payload_bruto: payloadPendente,
    });
  });

  it("considera reenvio com o mesmo identificador como duplicado", async () => {
    const { client } = supabaseComRespostas({ error: { code: "23505" } }, { data: { processado: true } });
    await expect(registrarEventoHotmart(client as never, payload)).resolves.toEqual({ duplicate: true });
  });

  it("cria aluno, compra e liberações para uma venda aprovada", async () => {
    const { client, calls } = supabaseComRespostas(
      {}, {}, { data: { id: "produto-1", hotmart_product_id: "456", ativo: true } }, {},
      { data: { id: "aluno-1" } }, { data: { id: "compra-1" } }, { data: [{ lei_id: 1 }, { lei_id: 2 }] }, {}, {},
    );
    await expect(registrarEventoHotmart(client as never, payloadV2)).resolves.toEqual({ duplicate: false });
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "alunos", operation: "insert" }),
      expect.objectContaining({ table: "compras", operation: "insert" }),
      expect.objectContaining({ table: "liberacoes_leis", operation: "insert" }),
    ]));
  });

  it("reutiliza aluno existente e não cria liberações para transação já registrada", async () => {
    const { client, calls } = supabaseComRespostas(
      {}, { data: { id: "compra-existente" } }, {},
    );
    await expect(registrarEventoHotmart(client as never, payloadV2)).resolves.toEqual({ duplicate: false });
    expect(calls.some((call) => call.table === "alunos" && call.operation === "insert")).toBe(false);
    expect(calls.some((call) => call.table === "liberacoes_leis" && call.operation === "insert")).toBe(false);
  });

  it("reutiliza aluno existente ao registrar uma nova transação", async () => {
    const { client, calls } = supabaseComRespostas(
      {}, {}, { data: { id: "produto-1", hotmart_product_id: "456", ativo: true } },
      { data: { id: "aluno-existente", nome: "Aluno V2", telefone: "+5511999999999" } },
      { data: { id: "compra-2" } }, { data: [] }, {},
    );
    await expect(registrarEventoHotmart(client as never, payloadV2)).resolves.toEqual({ duplicate: false });
    expect(calls.some((call) => call.table === "alunos" && call.operation === "insert")).toBe(false);
    expect(calls).toContainEqual(expect.objectContaining({ table: "compras", operation: "insert" }));
  });

  it("registra erro quando o produto Hotmart é desconhecido", async () => {
    const { client, calls } = supabaseComRespostas({}, {}, { data: null }, {});
    await expect(registrarEventoHotmart(client as never, payloadV2)).rejects.toThrow("Produto interno não encontrado");
    expect(calls).toContainEqual(expect.objectContaining({ table: "hotmart_eventos", operation: "update", value: expect.objectContaining({ processado: false }) }));
  });

  it("registra erro e não cria dados comerciais sem e-mail ou transação", async () => {
    const semEmail = { ...payloadV2, data: { ...payloadV2.data, buyer: { ...payloadV2.data.buyer, email: undefined } } };
    const { client, calls } = supabaseComRespostas({}, {});
    await expect(registrarEventoHotmart(client as never, semEmail)).rejects.toThrow("sem e-mail");
    expect(calls.some((call) => ["alunos", "compras", "liberacoes_leis"].includes(call.table))).toBe(false);

    const semTransacao = { ...payloadV2, data: { ...payloadV2.data, purchase: { ...payloadV2.data.purchase, transaction: undefined } } };
    const semTransacaoMock = supabaseComRespostas({}, {});
    await expect(registrarEventoHotmart(semTransacaoMock.client as never, semTransacao)).rejects.toThrow("sem código da transação");
    expect(semTransacaoMock.calls.some((call) => ["alunos", "compras", "liberacoes_leis"].includes(call.table))).toBe(false);
  });

  it.each([
    ["PURCHASE_CANCELED", "cancelada", "cancelado"],
    ["PURCHASE_REFUNDED", "reembolsada", "reembolsado"],
    ["PURCHASE_CHARGEBACK", "chargeback", "reembolsado"],
  ] as const)("revoga a compra ativa para %s", async (event, statusCompra, statusLiberacao) => {
    const { client, calls } = supabaseComRespostas(
      {}, { data: { id: "produto-1" } }, { data: { id: "compra-1", status: "aprovada" } }, {}, {}, {},
    );
    await expect(registrarEventoHotmart(client as never, payloadPerda(event))).resolves.toEqual({ duplicate: false });
    expect(calls).toContainEqual(expect.objectContaining({ table: "compras", operation: "update", value: expect.objectContaining({ status: statusCompra }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: "liberacoes_leis", operation: "update", value: expect.objectContaining({ status: statusLiberacao }) }));
  });

  it("registra erro se a compra de perda de acesso não existe", async () => {
    const { client, calls } = supabaseComRespostas({}, { data: { id: "produto-1" } }, { data: null }, {});
    await expect(registrarEventoHotmart(client as never, payloadPerda("PURCHASE_CANCELED"))).rejects.toThrow("Compra Hotmart não encontrada");
    expect(calls).toContainEqual(expect.objectContaining({ table: "hotmart_eventos", operation: "update", value: expect.objectContaining({ processado: false }) }));
    expect(calls.some((call) => call.operation === "insert" && ["alunos", "compras", "liberacoes_leis"].includes(call.table))).toBe(false);
  });

  it("mantém evento de produto não mapeado sem alterar acessos", async () => {
    const { client, calls } = supabaseComRespostas({}, { data: null }, {});
    await expect(registrarEventoHotmart(client as never, payloadPerda("PURCHASE_CANCELED"))).resolves.toEqual({ duplicate: false });
    expect(calls.some((call) => ["compras", "liberacoes_leis"].includes(call.table))).toBe(false);
    expect(calls).toContainEqual(expect.objectContaining({ table: "hotmart_eventos", operation: "update", value: expect.objectContaining({ processado: true }) }));
  });

  it("não altera a compra novamente quando ela já está revogada", async () => {
    const { client, calls } = supabaseComRespostas(
      {}, { data: { id: "produto-1" } }, { data: { id: "compra-1", status: "cancelada" } }, {}, {},
    );
    await expect(registrarEventoHotmart(client as never, payloadPerda("PURCHASE_CANCELED"))).resolves.toEqual({ duplicate: false });
    expect(calls.some((call) => call.table === "compras" && call.operation === "update")).toBe(false);
    expect(calls).toContainEqual(expect.objectContaining({ table: "liberacoes_leis", operation: "update" }));
  });

  it("revoga somente liberações vinculadas à compra, preservando outras origens", async () => {
    const { client, calls } = supabaseComRespostas(
      {}, { data: { id: "produto-1" } }, { data: { id: "compra-1", status: "aprovada" } }, {}, {}, {},
    );
    await registrarEventoHotmart(client as never, payloadPerda("PURCHASE_REFUNDED"));
    expect(calls.filter((call) => call.table === "liberacoes_leis" && call.operation === "update")).toHaveLength(1);
    expect(calls.some((call) => call.operation === "insert" && call.table === "liberacoes_leis")).toBe(false);
  });
});
