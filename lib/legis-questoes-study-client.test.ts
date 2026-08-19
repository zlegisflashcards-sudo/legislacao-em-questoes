import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const player = readFileSync("components/legis-questoes-study-client.tsx", "utf8");

describe("player Legis Questões", () => {
  it("mantém estados de carregamento, erro e baralho vazio antes do layout principal", () => {
    expect(player).toContain('const [loading, setLoading] = useState(true)');
    expect(player).toContain('const [error, setError] = useState("")');
    expect(player.indexOf("if (loading)")).toBeLessThan(player.indexOf("if (!law || !currentQuestion)"));
    expect(player.indexOf("if (!law || !currentQuestion)")).toBeLessThan(player.indexOf('return <main className="min-h-screen bg-white'));
  });

  it("declara o estado calculado apenas uma vez e não acessa a lei fora da guarda", () => {
    expect(player.match(/const currentQuestion =/g)).toHaveLength(1);
    expect(player.match(/const progress =/g)).toHaveLength(1);
    expect(player.match(/const answered =/g)).toHaveLength(1);
    expect(player.match(/const isLastQuestion =/g)).toHaveLength(1);
    expect(player.indexOf("const isLastQuestion")).toBeGreaterThan(player.indexOf("if (!law || !currentQuestion)"));
    expect(player).toContain("{law.titulo}");
  });
});
