import { describe, expect, it } from "vitest";
import { descendantsForScope, questionsInScope } from "./law-question-scope-resolution";

const cp = "3e03d11b-cf6e-43f3-9d35-760fd3034d9b";
const cf = "69639148-cc8b-4de1-ba87-53fe18a0a8b1";
const je = "01fd3157-dcc6-4c4a-92ca-e8af4b549c40";
const question = (lei_id: number, structure_id: number | null, ordem: string, assunto: string) => ({ id: assunto, lei_id, structure_id, ordem, assunto });
describe("recortes TJSP por artigo, dentro da estrutura", () => {
  it("não puxa artigos seguintes, órfãs, e questões de outra lei", () => {
    const inRange = question(14, 450, "0092.0.00.0.00.0", "Art. 92, CF");
    expect(questionsInScope([inRange, question(14, 450, "0093.0.00.0.00.0", "Art. 93, CF"), {...inRange,structure_id:499}, {...inRange,structure_id:null}, {...inRange,lei_id:58}, {...inRange,assunto:""}], [450], cf)).toEqual([inRange]);
  });
  it("só admite 311-A e não 311 ou uma referência divergente", () => {
    const suffix = question(58, 424, "0311.a.03.0.00.0", "Art. 311-A, § 3º, CP");
    const plain = question(58, 423, "0311.0.03.0.00.0", "Art. 311, § 3º, CP");
    expect(questionsInScope([suffix, plain, {...suffix,ordem:plain.ordem}], [423,424], cp)).toEqual([suffix]);
  });
  it("refere-se a todos os artigos da questão composta, não só ao primeiro", () => {
    const correct = question(27, 972, "0064.0.00.0.00.0", "Arts. 64 e 65, § 3º, Lei 9.099/1995");
    const wrong = {...correct, assunto:"Arts. 64 e 90"};
    const indirect = {...correct, assunto:"Art. 64 c/c art. 90"};
    const range = {...correct, assunto:"Arts. 64 a 90"};
    expect(questionsInScope([correct,wrong,indirect,range], [972], je)).toEqual([correct]);
  });
  it("ignora vínculos apontados para estruturas que não estão mais ativas", () => {
    expect(descendantsForScope([{id: 2, parent_id: 1}, {id: 3, parent_id: null}], [1, 3])).toEqual([3]);
  });
  it("não aplica o filtro à lei inteira nem a recorte de outro pacote", () => {
    const item = question(14, 450, "0093.0.00.0.00.0", "Art. 93, CF");
    expect(questionsInScope([item], null)).toEqual([item]);
    expect(questionsInScope([item], [450], "recorte-antigo")).toEqual([item]);
    expect(questionsInScope([item], [], cf)).toEqual([]);
  });
});
