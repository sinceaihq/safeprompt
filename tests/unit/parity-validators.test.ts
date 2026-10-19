import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { check } from "../../src/engine/core";
import { PII_DETECTORS } from "../../src/engine/detectors";

// Differential test against EuroPII Guard (python-stdnum); see eval/parity/make_fixture.py.
interface Case {
  d: string;
  v: string;
  ok: boolean;
}
const fixture = JSON.parse(
  gunzipSync(readFileSync(new URL("../fixtures/parity-validators.json.gz", import.meta.url))).toString("utf-8"),
) as { meta: { generated: string; n: number }; cases: Case[] };
const detectors = new Map(PII_DETECTORS.map((d) => [d.name, d]));
const byDetector = new Map<string, Case[]>();
for (const c of fixture.cases) byDetector.set(c.d, [...(byDetector.get(c.d) ?? []), c]);

describe(`validator parity with ${fixture.meta.n} oracle cases`, () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${fixture.meta.generated}T12:00:00`));
  });
  afterAll(() => vi.useRealTimers());

  it.each([...byDetector.keys()].sort())("%s", (name) => {
    const det = detectors.get(name);
    expect(det, name).toBeDefined();
    const cases = byDetector.get(name)!;
    const mismatches = cases.filter((c) => check(det!, c.v) !== c.ok).map((c) => `${c.v} oracle=${c.ok}`);
    expect(mismatches.slice(0, 20)).toEqual([]);
    expect(cases.some((c) => c.ok)).toBe(true);
  });
});
