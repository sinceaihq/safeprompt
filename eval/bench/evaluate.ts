// Evaluate the SafePrompt engine on SafePrompt-Bench (or other span-annotated JSONL).
//
//   npx tsx eval/bench/evaluate.ts --data eval/bench/data/dev.jsonl [--threshold 0.5] [--countries FI,SE] [--out r.json] [--errors 30]

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEFAULT_LABELS, evaluate, loadJsonl, loadPredictions } from "./metrics";

const { values: args } = parseArgs({
  options: {
    data: { type: "string" },
    threshold: { type: "string", default: "0.5" },
    countries: { type: "string", default: "" },
    out: { type: "string" },
    errors: { type: "string", default: "0" },
    labels: { type: "string" },
    pred: { type: "string" },
  },
});

const { result, errors } = evaluate(loadJsonl(args.data!), {
  threshold: Number(args.threshold),
  countries: args.countries ? args.countries.split(",") : [],
  labels: args.labels ? args.labels.split(",") : DEFAULT_LABELS,
  errors: Number(args.errors),
  predictions: args.pred ? loadPredictions(args.pred) : undefined,
});
const output = { data: args.data, ...result };
console.log(JSON.stringify(output, null, 2));
if (errors.length) console.log(errors.join("\n"));
if (args.out) writeFileSync(args.out, JSON.stringify(output, null, 2) + "\n");
