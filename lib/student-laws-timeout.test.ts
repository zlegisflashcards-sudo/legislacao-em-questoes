import { describe, expect, it, vi } from "vitest";
import { withStudentLawsTimeout } from "@/lib/student-laws-timeout";

class TimeoutError extends Error {
  status = 503;
}

describe("timeout da biblioteca do aluno", () => {
  it("retorna 503 quando a dependência não responde e remove o timer", async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const result = withStudentLawsTimeout(pending, () => new TimeoutError(), 100);
    const rejection = expect(result).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("preserva respostas rápidas e limpa timers de requisições concorrentes", async () => {
    vi.useFakeTimers();
    const first = withStudentLawsTimeout(Promise.resolve("primeira"), () => new TimeoutError(), 100);
    const second = withStudentLawsTimeout(Promise.resolve("segunda"), () => new TimeoutError(), 100);
    await expect(Promise.all([first, second])).resolves.toEqual(["primeira", "segunda"]);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
