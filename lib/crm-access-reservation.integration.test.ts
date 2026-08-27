import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

const localDatabaseUrl =
  process.env.CRM_LOCAL_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const runLocalIntegration = process.env.RUN_CRM_LOCAL_INTEGRATION === "1";

function assertLocalDatabase(url: string) {
  const parsed = new URL(url);
  const localHosts = new Set(["127.0.0.1", "localhost"]);

  if (
    !localHosts.has(parsed.hostname) ||
    parsed.port !== "54322" ||
    url.includes("yndtmpgxvqdpedskydil")
  ) {
    throw new Error("A integração CRM só pode usar PostgreSQL local em 127.0.0.1:54322.");
  }
}

type Fixture = {
  alunoId: string;
  compraId: string;
  produtoId: string;
};

const fixtures: Fixture[] = [];

async function connect() {
  assertLocalDatabase(localDatabaseUrl);
  const client = new Client({ connectionString: localDatabaseUrl });
  await client.connect();
  return client;
}

async function createFixture(client: Client, suffix: string): Promise<Fixture> {
  const fixture: Fixture = {
    alunoId: randomUUID(),
    compraId: randomUUID(),
    produtoId: randomUUID(),
  };
  const email = `crm-reservation-${suffix}-${fixture.alunoId}@example.test`;

  await client.query(
    `insert into public.produtos (id, nome, tipo, tipo_produto, slug, ativo)
     values ($1, $2, $3, $4, $5, true)`,
    [fixture.produtoId, `Produto local ${suffix}`, "teste", "outro", `crm-local-${suffix}-${fixture.produtoId.slice(0, 8)}`],
  );
  await client.query(
    `insert into public.alunos (id, nome, email)
     values ($1, $2, $3)`,
    [fixture.alunoId, `Aluno fictício ${suffix}`, email],
  );
  await client.query(
    `insert into public.compras
       (id, aluno_id, produto_id, status, origem, status_acesso, identificador_externo)
     values ($1, $2, $3, 'aprovada', 'administrativo', 'ativo', $4)`,
    [fixture.compraId, fixture.alunoId, fixture.produtoId, `crm-local-${suffix}-${fixture.compraId}`],
  );
  fixtures.push(fixture);
  return fixture;
}

async function claim(client: Client, fixture: Fixture) {
  const response = await client.query<{ result: { status: string; idempotency_key?: string } }>(
    "select public.claim_crm_access_email($1, $2, $3) as result",
    [fixture.compraId, fixture.alunoId, "Teste local de concorrência"],
  );
  return response.rows[0].result;
}

async function cleanupFixtures() {
  const client = await connect();
  try {
    for (const fixture of fixtures.splice(0)) {
      await client.query("delete from public.alunos_notificacoes_acesso where aluno_id = $1", [fixture.alunoId]);
      await client.query("delete from public.compras where id = $1", [fixture.compraId]);
      await client.query("delete from public.alunos where id = $1", [fixture.alunoId]);
      await client.query("delete from public.produtos where id = $1", [fixture.produtoId]);
    }
  } finally {
    await client.end();
  }
}

afterEach(async () => {
  if (runLocalIntegration) await cleanupFixtures();
});

describe.skipIf(!runLocalIntegration)("reserva CRM E3 com duas conexões PostgreSQL reais", () => {
  it("permite uma única reserva, bloqueia duplicidade, mantém already_sent e permite retry após falha", async () => {
    assertLocalDatabase(localDatabaseUrl);
    const setup = await connect();
    const primary = await createFixture(setup, "primary");
    const retry = await createFixture(setup, "retry");
    await setup.end();

    // Clientes A e B são sockets PostgreSQL independentes, não uma conexão compartilhada.
    const connectionA = await connect();
    const connectionB = await connect();
    let resultA: Awaited<ReturnType<typeof claim>>;
    let resultB: Awaited<ReturnType<typeof claim>>;
    try {
      [resultA, resultB] = await Promise.all([claim(connectionA, primary), claim(connectionB, primary)]);
    } finally {
      await Promise.all([connectionA.end(), connectionB.end()]);
    }

    const concurrentStatuses = [resultA!.status, resultB!.status];
    expect(concurrentStatuses.filter((status) => status === "claimed")).toHaveLength(1);
    expect(concurrentStatuses.filter((status) => status === "processing")).toHaveLength(1);
    const winner = resultA!.status === "claimed" ? resultA! : resultB!;
    expect(winner.idempotency_key).toBe(`administrativo:${primary.compraId}`);

    const verification = await connect();
    try {
      const notifications = await verification.query<{ status: string; idempotency_key: string }>(
        "select status, idempotency_key from public.alunos_notificacoes_acesso where aluno_id = $1 order by criado_em",
        [primary.alunoId],
      );
      expect(notifications.rows).toEqual([{ status: "reservado", idempotency_key: winner.idempotency_key }]);

      const finalized = await verification.query<{ finished: boolean }>(
        "select public.finish_crm_access_email($1, true, null) as finished",
        [winner.idempotency_key],
      );
      expect(finalized.rows[0].finished).toBe(true);
      expect((await claim(verification, primary)).status).toBe("already_sent");

      const initialRetry = await claim(verification, retry);
      expect(initialRetry.status).toBe("claimed");
      const failed = await verification.query<{ finished: boolean }>(
        "select public.finish_crm_access_email($1, false, $2) as finished",
        [initialRetry.idempotency_key, "falha simulada"],
      );
      expect(failed.rows[0].finished).toBe(true);
      const retried = await claim(verification, retry);
      expect(retried).toEqual({ status: "claimed", idempotency_key: initialRetry.idempotency_key });
    } finally {
      await verification.end();
    }
  });
});
