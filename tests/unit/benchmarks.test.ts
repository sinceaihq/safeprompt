import { describe, expect, it } from "vitest";
import { evaluate, loadJsonl } from "../../eval/bench/metrics";

// Guards against regressions on both benchmarks. The engine deliberately
// differs from EuroPII Guard in label handling (see docs/ENGINE.md), so it is
// compared on outcomes, not finding by finding. Floors are set just below the
// scores measured when the change was made; raise them when you improve.
describe("benchmark scores", () => {
  it("EuroPII benchmark (test split, 2,075 messages)", () => {
    const { result } = evaluate(loadJsonl("tests/fixtures/europii-bench-test.jsonl.gz"));
    expect(result.overall.precision).toBeGreaterThanOrEqual(97.0);
    expect(result.overall.recall).toBeGreaterThanOrEqual(96.7);
  });

  it("SafePrompt-Bench (dev split, secrets masked)", () => {
    // Secrets are covered by unit tests; the repository holds no token-shaped strings.
    const { result } = evaluate(loadJsonl("tests/fixtures/safeprompt-bench-dev-masked.jsonl.gz"), {
      labels: ["EMAIL", "PHONE", "IBAN", "PAYMENT_CARD", "IP_ADDRESS", "VAT_ID", "NATIONAL_ID"],
    });
    expect(result.overall.precision).toBeGreaterThanOrEqual(99.1);
    expect(result.overall.recall).toBeGreaterThanOrEqual(97.1);
    expect(result.negative_documents_flagged).toBeLessThanOrEqual(1);
  });
});
