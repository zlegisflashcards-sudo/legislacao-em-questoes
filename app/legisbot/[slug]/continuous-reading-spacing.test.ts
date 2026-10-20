import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("app/legisbot/[slug]/continuous-reading.module.css", "utf8");
const globalStyles = readFileSync("app/globals.css", "utf8");

describe("espaçamento do texto legal na leitura contínua", () => {
  it("ignora quebras de formatação entre tags e preserva quebras dentro dos blocos", () => {
    expect(styles).toMatch(/\.legalHtml\s*\{[\s\S]*?white-space:\s*normal;/);
    expect(styles).toMatch(/\.legalHtml :where\(p, div, li, blockquote, th, td\)\s*\{[\s\S]*?white-space:\s*pre-wrap;/);
  });
});

describe("espaçamento do texto legal no aprofundamento", () => {
  it("ignora quebras entre tags sem perder quebras internas dos blocos", () => {
    expect(globalStyles).toMatch(/\.legisbot-legal-html\{[^}]*white-space:normal;/);
    expect(globalStyles).toMatch(/\.legisbot-legal-html p,[^{]*\.legisbot-legal-html td\{white-space:pre-wrap\}/);
  });
});
