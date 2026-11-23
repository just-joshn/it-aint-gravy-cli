#!/usr/bin/env bun

import { collectFacts } from "./toolchain/facts.ts";
import { findViolations, INVARIANTS } from "./toolchain/invariants.ts";

const report = (label: string, value: string): void => {
  console.log(`  ${label.padEnd(18)} ${value}`);
};

const facts = await collectFacts();
const violations = findViolations(facts);

console.log("Toolchain");
report("bun", facts.versions.bun);
report("biome", facts.versions.biome);
report("typescript", facts.versions.typescript);

console.log("\nResolved scope");
report("tsc code files", String(facts.typescriptFiles.length));
report("biome code files", String(facts.biomeFiles.length));
report("tsc diagnostics", String(facts.typeDiagnostics.tsc.length));
report("bun diagnostics", String(facts.typeDiagnostics.bun.length));

const invariants = new Set(violations.map((entry) => entry.invariant));

console.log("\nInvariants");
for (const invariant of INVARIANTS) {
  console.log(`  ${invariants.has(invariant) ? "FAIL" : "pass"}  ${invariant}`);
}

if (violations.length === 0) {
  console.log("\nAll three tools agree.");
  process.exit(0);
}

console.log("\nViolations");
for (const { invariant, detail } of violations) {
  console.log(`  ${invariant}: ${detail}`);
}
process.exit(1);
