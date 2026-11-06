import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { doctrineRowsFromTransfer, type DoctrineTransferPayload } from "./doctrine-import-contract";
import { buildDoctrineApkg } from "./doctrine-apkg-export";

const source = process.env.DADM_TRANSFER_JSON;
const run = source && existsSync(source) ? describe : describe.skip;
run("APKG DADM real local", () => {
  it("mantém as 282 notas e os 11 baralhos sem legisbotUrl", async () => {
    const payload = JSON.parse(readFileSync(source!, "utf8")) as DoctrineTransferPayload;
    const exported = await buildDoctrineApkg({ slug: "direito-administrativo", titulo: "Direito Administrativo", notes: doctrineRowsFromTransfer(payload) });
    expect(exported.notes).toBe(282);
    expect(exported.decks).toHaveLength(11);
    expect(exported.bytes.byteLength).toBeGreaterThan(10_000);
  }, 30_000);
});
