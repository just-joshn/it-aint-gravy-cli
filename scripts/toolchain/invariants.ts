/**
 * Every rule here states one way the three tools must agree. A violation means the tools
 * disagree about the same file, the same syntax, or the same output.
 */

import type { ToolchainFacts } from "./facts.ts";
import { isRecord } from "./facts.ts";

export type Violation = {
  readonly invariant: string;
  readonly detail: string;
};

const violation = (invariant: string, detail: string): Violation => ({ invariant, detail });

const readOption = (options: Readonly<Record<string, unknown>>, key: string): boolean =>
  options[key] === true;

const readRule = (config: unknown, group: string, rule: string): "on" | "off" | "unset" => {
  const rules = isRecord(config) ? config.linter : undefined;
  const ruleSet = isRecord(rules) ? rules.rules : undefined;
  const groupRules = isRecord(ruleSet) ? ruleSet[group] : undefined;
  const value = isRecord(groupRules) ? groupRules[rule] : undefined;

  if (typeof value === "string") {
    return value === "off" || value === "none" ? "off" : "on";
  }
  if (isRecord(value) && typeof value.level === "string") {
    const level = value.level;
    return level === "off" || level === "none" ? "off" : "on";
  }
  return "unset";
};

const missing = (
  expected: ReadonlySet<string>,
  actual: ReadonlySet<string>,
  label: string,
): readonly Violation[] => {
  const violations: Violation[] = [];
  for (const file of expected) {
    if (!actual.has(file)) {
      violations.push(
        violation("code-file-parity", `${label} covers ${file}, the other tool does not`),
      );
    }
  }
  return violations;
};

/** Both tools must resolve the same set of code files from their own configuration. */
const codeFileParity = (facts: ToolchainFacts): readonly Violation[] => {
  const typescript = new Set(facts.typescriptFiles);
  const biome = new Set(facts.biomeFiles);
  return [...missing(typescript, biome, "TypeScript"), ...missing(biome, typescript, "Biome")].sort(
    (left, right) => left.detail.localeCompare(right.detail),
  );
};

/** `bun check` must report exactly the diagnostics `tsc` reports, and fail on the same tree. */
const typeVerdictParity = (facts: ToolchainFacts): readonly Violation[] => {
  const { tsc, bun, tscFailed, bunFailed } = facts.typeDiagnostics;
  const violations: Violation[] = [];

  if (tscFailed !== bunFailed) {
    violations.push(
      violation(
        "type-verdict-parity",
        `tsc ${tscFailed ? "failed" : "passed"} while bun check ${bunFailed ? "failed" : "passed"}`,
      ),
    );
  }

  const fromTsc = new Set(tsc);
  const fromBun = new Set(bun);
  for (const diagnostic of fromTsc) {
    if (!fromBun.has(diagnostic)) {
      violations.push(violation("type-verdict-parity", `tsc only: ${diagnostic}`));
    }
  }
  for (const diagnostic of fromBun) {
    if (!fromTsc.has(diagnostic)) {
      violations.push(violation("type-verdict-parity", `bun only: ${diagnostic}`));
    }
  }
  return violations;
};

const SECOND_FORMATTER = /\b(prettier|eslint|oxlint|dprint)\b|bun fmt|deno fmt/;

/** Exactly one formatter may be wired up. */
const singleFormatter = (facts: ToolchainFacts): readonly Violation[] => {
  const violations: Violation[] = [];

  for (const [name, command] of Object.entries(facts.packageScripts)) {
    if (SECOND_FORMATTER.test(command)) {
      violations.push(
        violation("single-formatter", `script "${name}" runs a second formatter: ${command}`),
      );
    }
  }

  const formatter = isRecord(facts.biomeConfig.formatter) ? facts.biomeConfig.formatter : undefined;
  if (formatter?.enabled === false) {
    violations.push(violation("single-formatter", "biome formatter is disabled"));
  }

  for (const key of ["fmt", "format"]) {
    if (facts.bunfig[key] !== undefined) {
      violations.push(violation("single-formatter", `bunfig.toml defines [${key}]`));
    }
  }
  return violations;
};

const ruleDisagreement = (group: string, rule: string, reason: string): Violation =>
  violation("strictness-parity", `${group}/${rule} must be on because ${reason}`);

/**
 * No tsconfig option may be contradicted by an enabled Biome rule, and no syntax TypeScript
 * rejects may be accepted by the linter.
 */
const strictnessParity = (facts: ToolchainFacts): readonly Violation[] => {
  const options = facts.typescriptOptions;
  const config = facts.biomeConfig;
  const violations: Violation[] = [];

  if (!readOption(options, "isolatedModules")) {
    violations.push(
      violation("strictness-parity", "isolatedModules must be true: Bun transpiles file by file"),
    );
  }

  if (readOption(options, "erasableSyntaxOnly")) {
    for (const rule of ["noEnum", "noNamespace", "noParameterProperties"]) {
      if (readRule(config, "style", rule) !== "on") {
        violations.push(ruleDisagreement("style", rule, "erasableSyntaxOnly is enabled"));
      }
    }
  }

  if (readOption(options, "verbatimModuleSyntax")) {
    for (const rule of ["useImportType", "useExportType"]) {
      if (readRule(config, "style", rule) !== "on") {
        violations.push(ruleDisagreement("style", rule, "verbatimModuleSyntax is enabled"));
      }
    }
  }

  if (readOption(options, "noPropertyAccessFromIndexSignature")) {
    if (readRule(config, "complexity", "useLiteralKeys") === "on") {
      violations.push(
        violation(
          "strictness-parity",
          "complexity/useLiteralKeys rewrites index-signature access that noPropertyAccessFromIndexSignature forbids",
        ),
      );
    }
  }

  if (readOption(options, "allowJs") !== readOption(options, "checkJs")) {
    violations.push(
      violation(
        "strictness-parity",
        "allowJs and checkJs differ: Biome lints JavaScript files TypeScript does not check",
      ),
    );
  }

  if (readOption(options, "allowImportingTsExtensions")) {
    if (readRule(config, "correctness", "useImportExtensions") === "on") {
      violations.push(
        violation(
          "strictness-parity",
          "correctness/useImportExtensions rewrites .ts specifiers that allowImportingTsExtensions permits",
        ),
      );
    }
  }

  return violations;
};

const forceIgnoredDirectories = (
  config: Readonly<Record<string, unknown>>,
): ReadonlySet<string> => {
  const files = isRecord(config.files) ? config.files : undefined;
  const includes = files?.includes;
  if (!Array.isArray(includes)) return new Set();

  const directories = includes
    .filter((entry): entry is string => typeof entry === "string")
    .filter((entry) => entry.startsWith("!!"))
    .map((entry) =>
      entry
        .replace(/^!!/, "")
        .replace(/^\*\*\//, "")
        .replace(/\/$/, ""),
    )
    .filter((entry) => !entry.includes("*"));
  return new Set(directories);
};

/** Build output must be excluded from both tools, and Biome must honour .gitignore. */
const ignoreParity = (facts: ToolchainFacts): readonly Violation[] => {
  const violations: Violation[] = [];
  const biomeIgnores = forceIgnoredDirectories(facts.biomeConfig);

  const vcs = isRecord(facts.biomeConfig.vcs) ? facts.biomeConfig.vcs : undefined;
  if (vcs?.useIgnoreFile !== true) {
    violations.push(
      violation(
        "ignore-parity",
        "vcs.useIgnoreFile must be on: .gitignore is the single ignore list",
      ),
    );
  }

  for (const excluded of facts.typescriptExclude) {
    if (!biomeIgnores.has(excluded)) {
      violations.push(
        violation("ignore-parity", `tsconfig excludes ${excluded} but Biome still indexes it`),
      );
    }
  }
  for (const ignored of biomeIgnores) {
    if (!facts.typescriptExclude.includes(ignored)) {
      violations.push(
        violation("ignore-parity", `Biome force-ignores ${ignored} but tsconfig includes it`),
      );
    }
  }
  return violations;
};

export const findViolations = (facts: ToolchainFacts): readonly Violation[] => [
  ...codeFileParity(facts),
  ...typeVerdictParity(facts),
  ...singleFormatter(facts),
  ...strictnessParity(facts),
  ...ignoreParity(facts),
];
