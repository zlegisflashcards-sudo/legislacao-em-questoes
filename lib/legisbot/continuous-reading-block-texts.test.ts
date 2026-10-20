import { describe, expect, it, vi } from "vitest";
import { getContinuousReadingBlockTexts } from "./continuous-reading-block-texts-core";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

describe("textos paginados da leitura contínua", () => {
  it("consulta apenas a lei ativa e o lote canônico de textos", async () => {
    const findActiveLaw = vi.fn().mockResolvedValue({ id: 7 });
    const findPreparedBlocks = vi.fn().mockResolvedValue([{ id: second, legislation: "<p>Segundo</p>" }, { id: first, legislation: "<p>Primeiro</p>" }]);
    const result = await getContinuousReadingBlockTexts("l1416sgrj", [first, second, first], { findActiveLaw, findPreparedBlocks });
    expect(findActiveLaw).toHaveBeenCalledTimes(1);
    expect(findPreparedBlocks).toHaveBeenCalledTimes(1);
    expect(findPreparedBlocks).toHaveBeenCalledWith(7, [first, second]);
    expect(result).toEqual([{ id: second, legislation: "<p>Segundo</p>" }, { id: first, legislation: "<p>Primeiro</p>" }]);
  });

  it("não consulta blocos para IDs inválidos e não expõe texto de outro lote", async () => {
    const findActiveLaw = vi.fn();
    const findPreparedBlocks = vi.fn();
    const invalid = await getContinuousReadingBlockTexts("l1416sgrj", ["não-é-uuid"], { findActiveLaw, findPreparedBlocks });
    expect(invalid).toEqual([]);
    expect(findActiveLaw).not.toHaveBeenCalled();
    expect(findPreparedBlocks).not.toHaveBeenCalled();

    findActiveLaw.mockResolvedValue({ id: 7 });
    findPreparedBlocks.mockResolvedValue([{ id: "33333333-3333-4333-8333-333333333333", legislation: "<p>Fora do lote</p>" }]);
    const scoped = await getContinuousReadingBlockTexts("l1416sgrj", [first], { findActiveLaw, findPreparedBlocks });
    expect(scoped).toEqual([]);
  });

  it("interrompe quando a lei não é pública ativa", async () => {
    const findActiveLaw = vi.fn().mockResolvedValue(null);
    const findPreparedBlocks = vi.fn();
    await expect(getContinuousReadingBlockTexts("l1416sgrj", [first], { findActiveLaw, findPreparedBlocks })).resolves.toBeNull();
    expect(findPreparedBlocks).not.toHaveBeenCalled();
  });
});
