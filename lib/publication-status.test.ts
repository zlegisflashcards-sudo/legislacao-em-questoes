import { describe, expect, it } from "vitest";
import { isPublished, isVisibleInRecords, publicationStatusFromActive } from "@/lib/publication-status";

describe("publication status", () => {
  it("preserves legacy active values", () => {
    expect(publicationStatusFromActive(true)).toBe("ativa");
    expect(publicationStatusFromActive(false)).toBe("inativa");
  });
  it("keeps upcoming only in Records", () => {
    expect(isPublished("em_breve")).toBe(false);
    expect(isVisibleInRecords("em_breve")).toBe(true);
    expect(isVisibleInRecords("inativa")).toBe(false);
  });
});
