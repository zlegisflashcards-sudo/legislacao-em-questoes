import { describe, expect, it } from "vitest";
import { sortLegiscastAudios, type LegiscastAudioOrderable } from "./legiscast-audio-order";

const audio = (id: string, titulo: string, ordem = 0, created_at = "2026-01-01T00:00:00.000Z"): LegiscastAudioOrderable => ({ id, titulo, ordem, created_at });
const titles = (items: LegiscastAudioOrderable[]) => sortLegiscastAudios(items).map((item) => item.titulo);

describe("ordenação da playlist de áudio do LegisCast", () => {
  it("ordena naturalmente títulos automáticos", () => {
    expect(titles([audio("3", "Capítulo 3"), audio("1", "Capítulo 1"), audio("10", "Capítulo 10"), audio("2", "Capítulo 2")])).toEqual(["Capítulo 1", "Capítulo 2", "Capítulo 3", "Capítulo 10"]);
  });

  it("respeita números grandes e acentuação/caixa sem usar ordem alfabética simples", () => {
    expect(titles([audio("100", "CAPÍTULO 100"), audio("9", "capítulo 9"), audio("2", "Capítulo 2"), audio("20", "Capítulo 20"), audio("1", "Capítulo 1"), audio("10", "Capítulo 10")])).toEqual(["Capítulo 1", "Capítulo 2", "capítulo 9", "Capítulo 10", "Capítulo 20", "CAPÍTULO 100"]);
  });

  it("prioriza ordem manual positiva e usa título natural para os automáticos", () => {
    expect(titles([audio("c2", "Capítulo 2"), audio("i", "Introdução", 1), audio("c1", "Capítulo 1"), audio("ci", "Considerações iniciais", 2)])).toEqual(["Introdução", "Considerações iniciais", "Capítulo 1", "Capítulo 2"]);
  });

  it("desempata ordens manuais iguais pelo título natural", () => {
    expect(titles([audio("c10", "Capítulo 10", 1), audio("c2", "Capítulo 2", 1)])).toEqual(["Capítulo 2", "Capítulo 10"]);
  });

  it("usa data de criação e id quando títulos são equivalentes", () => {
    expect(sortLegiscastAudios([
      audio("b", "Capítulo 1", 0, "2026-01-02T00:00:00.000Z"),
      audio("z", "capítulo 1", 0, "2026-01-01T00:00:00.000Z"),
      audio("a", "CAPÍTULO 1", 0, "2026-01-01T00:00:00.000Z"),
    ]).map((item) => item.id)).toEqual(["a", "z", "b"]);
  });
});
