import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260826180000_revalidate_crm_email_identity_in_reservation.sql", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");

describe("reserva transacional de e-mail CRM", () => {
  it("protege a reserva com lock, identidade e estados idempotentes", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("auth.users");
    expect(migration).toContain("email_conflict");
    expect(migration).toContain("already_sent");
    expect(migration).toContain("processing");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path=pg_catalog");
  });

  it("processa o lote em ordem sequencial e finaliza sucesso ou falha", () => {
    const batch = server.slice(server.indexOf("async function sendPostSaleAccessEmails"), server.indexOf("function logCommercialDbError"));
    expect(batch).toContain("for (const compraId of purchaseIds)");
    expect(batch).not.toContain("Promise.all");
    expect(batch).toContain("finish_crm_access_email");
    expect(batch).toContain('p_success: true');
    expect(batch).toContain('p_success: false');
  });
});
