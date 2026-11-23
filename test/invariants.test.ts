import { describe, expect, test } from "bun:test";

import type { ToolchainFacts } from "../scripts/toolchain/facts.ts";
import { isRecord } from "../scripts/toolchain/facts.ts";
import { findViolations } from "../scripts/toolchain/invariants.ts";

type Patch = {
  readonly typescriptFiles?: readonly string[];
  readonly typescriptOptions?: Readonly<Record<string, unknown>>;
  readonly typescriptExclude?: readonly string[];
  readonly biomeFiles?: readonly string[];
  readonly biomeConfig?: Readonly<Record<string, unknown>>;
  readonly packageScripts?: Readonly<Record<string, string>>;
  readonly bunfig?: Readonly<Record<string, unknown>>;
  readonly typeDiagnostics?: ToolchainFacts["typeDiagnostics"];
};

const merge = (
  base: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    result[key] = isRecord(current) && isRecord(value) ? merge(current, value) : value;
  }
  return result;
};

const BASE_OPTIONS: Readonly<Record<string, unknown>> = {
  isolatedModules: true,
  erasableSyntaxOnly: true,
  verbatimModuleSyntax: true,
  allowJs: true,
  checkJs: true,
  allowImportingTsExtensions: true,
};

const BASE_BIOME: Readonly<Record<string, unknown>> = {
  files: { includes: ["**", "!!dist", "!!coverage", "!!**/*.md"] },
  vcs: { useIgnoreFile: true },
  formatter: { enabled: true },
  linter: {
    rules: {
      style: {
        noEnum: "error",
        noNamespace: "error",
        noParameterProperties: "error",
        useImportType: "error",
        useExportType: "error",
      },
    },
  },
};

const makeFacts = (patch: Patch = {}): ToolchainFacts => ({
  versions: { bun: "1.4.5", biome: "2.6.8", typescript: "7.0.2" },
  typescriptFiles: patch.typescriptFiles ?? ["src/index.ts"],
  typescriptOptions: merge(BASE_OPTIONS, patch.typescriptOptions ?? {}),
  typescriptExclude: patch.typescriptExclude ?? ["dist", "coverage"],
  biomeFiles: patch.biomeFiles ?? ["src/index.ts"],
  biomeConfig: merge(BASE_BIOME, patch.biomeConfig ?? {}),
  packageScripts: patch.packageScripts ?? { check: "biome check . && bun check --no-script" },
  bunfig: patch.bunfig ?? { install: { exact: true } },
  typeDiagnostics: patch.typeDiagnostics ?? {
    tsc: [],
    bun: [],
    tscFailed: false,
    bunFailed: false,
  },
});

const detailsFor = (patch: Patch): readonly string[] =>
  findViolations(makeFacts(patch)).map((entry) => entry.detail);

const invariantsFor = (patch: Patch): readonly string[] =>
  findViolations(makeFacts(patch)).map((entry) => entry.invariant);

describe("code-file parity", () => {
  test("accepts identical file sets", () => {
    expect(findViolations(makeFacts())).toEqual([]);
  });

  test("reports a file only Biome sees", () => {
    expect(invariantsFor({ biomeFiles: ["src/index.ts", "src/orphan.ts"] })).toEqual([
      "code-file-parity",
    ]);
    expect(detailsFor({ biomeFiles: ["src/index.ts", "src/orphan.ts"] })).toEqual([
      "Biome covers src/orphan.ts, the other tool does not",
    ]);
  });

  test("reports a file only TypeScript sees", () => {
    expect(detailsFor({ typescriptFiles: ["src/only-ts.ts"] })).toContain(
      "TypeScript covers src/only-ts.ts, the other tool does not",
    );
  });
});

describe("type-verdict parity", () => {
  const diagnostic = "src/index.ts(1,1): error TS2322: bad";

  test("reports a diagnostic only one checker finds", () => {
    expect(
      detailsFor({
        typeDiagnostics: { tsc: [diagnostic], bun: [], tscFailed: true, bunFailed: false },
      }),
    ).toContain(`tsc only: ${diagnostic}`);
  });

  test("reports disagreeing exit codes", () => {
    expect(
      detailsFor({
        typeDiagnostics: { tsc: [], bun: [], tscFailed: false, bunFailed: true },
      }),
    ).toContain("tsc passed while bun check failed");
  });

  test("accepts matching failures", () => {
    expect(
      findViolations(
        makeFacts({
          typeDiagnostics: {
            tsc: [diagnostic],
            bun: [diagnostic],
            tscFailed: true,
            bunFailed: true,
          },
        }),
      ),
    ).toEqual([]);
  });
});

describe("single formatter", () => {
  test("reports a second formatter in a script", () => {
    expect(detailsFor({ packageScripts: { fix: "prettier --write ." } })).toEqual([
      'script "fix" runs a second formatter: prettier --write .',
    ]);
  });

  test("reports a disabled biome formatter", () => {
    expect(detailsFor({ biomeConfig: { formatter: { enabled: false } } })).toEqual([
      "biome formatter is disabled",
    ]);
  });

  test("reports a fmt section in bunfig", () => {
    expect(detailsFor({ bunfig: { fmt: { enabled: true } } })).toEqual([
      "bunfig.toml defines [fmt]",
    ]);
  });
});

describe("strictness parity", () => {
  test("reports a missing erasable-syntax rule", () => {
    expect(
      detailsFor({
        biomeConfig: { linter: { rules: { style: { noParameterProperties: "off" } } } },
      }),
    ).toEqual(["style/noParameterProperties must be on because erasableSyntaxOnly is enabled"]);
  });

  test("reports a missing type-only import rule", () => {
    expect(
      detailsFor({ biomeConfig: { linter: { rules: { style: { useImportType: "off" } } } } }),
    ).toEqual(["style/useImportType must be on because verbatimModuleSyntax is enabled"]);
  });

  test("accepts a rule expressed with an explicit level object", () => {
    const violations = findViolations(
      makeFacts({
        biomeConfig: {
          linter: {
            rules: {
              style: {
                noEnum: { level: "error" },
                noNamespace: { level: "error" },
                noParameterProperties: { level: "error" },
                useImportType: { level: "error" },
                useExportType: { level: "error" },
              },
            },
          },
        },
      }),
    );
    expect(violations).toEqual([]);
  });

  test("reports useLiteralKeys next to noPropertyAccessFromIndexSignature", () => {
    expect(
      detailsFor({
        typescriptOptions: { noPropertyAccessFromIndexSignature: true },
        biomeConfig: { linter: { rules: { complexity: { useLiteralKeys: "error" } } } },
      }),
    ).toContain(
      "complexity/useLiteralKeys rewrites index-signature access that noPropertyAccessFromIndexSignature forbids",
    );
  });

  test("reports allowJs without checkJs", () => {
    expect(detailsFor({ typescriptOptions: { checkJs: false } })).toEqual([
      "allowJs and checkJs differ: Biome lints JavaScript files TypeScript does not check",
    ]);
  });

  test("reports useImportExtensions next to allowImportingTsExtensions", () => {
    expect(
      detailsFor({
        biomeConfig: { linter: { rules: { correctness: { useImportExtensions: "error" } } } },
      }),
    ).toContain(
      "correctness/useImportExtensions rewrites .ts specifiers that allowImportingTsExtensions permits",
    );
  });

  test("reports disabled isolatedModules", () => {
    expect(detailsFor({ typescriptOptions: { isolatedModules: false } })).toEqual([
      "isolatedModules must be true: Bun transpiles file by file",
    ]);
  });
});

describe("ignore parity", () => {
  test("reports a directory Biome indexes that tsconfig excludes", () => {
    expect(detailsFor({ typescriptExclude: ["dist", "coverage", "tmp"] })).toContain(
      "tsconfig excludes tmp but Biome still indexes it",
    );
  });

  test("reports a directory Biome force-ignores that tsconfig includes", () => {
    expect(detailsFor({ typescriptExclude: ["dist"] })).toContain(
      "Biome force-ignores coverage but tsconfig includes it",
    );
  });

  test("reports vcs.useIgnoreFile turned off", () => {
    expect(detailsFor({ biomeConfig: { vcs: { useIgnoreFile: false } } })).toEqual([
      "vcs.useIgnoreFile must be on: .gitignore is the single ignore list",
    ]);
  });
});
