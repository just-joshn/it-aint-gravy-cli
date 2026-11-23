import { describe, expect, test } from "bun:test";

import {
  collectFacts,
  isCodeFile,
  isRecord,
  isString,
  parseProcessedFiles,
  repoPath,
} from "../scripts/toolchain/facts.ts";
import { findViolations } from "../scripts/toolchain/invariants.ts";

describe("parseProcessedFiles", () => {
  test("reads the verbose block Biome prints", () => {
    const output = [
      "Checked 3 files in 1ms.",
      "VERBOSE  ━━━━━━━━━━━━━━━━━",
      "  i Files processed:",
      "",
      "  - biome.json",
      "  - src/index.ts",
      "",
      " VERBOSE  ━━━━━━━━━━━━━━━━━",
      "  i Files fixed:",
    ].join("\n");

    expect(parseProcessedFiles(output)).toEqual(["biome.json", "src/index.ts"]);
  });

  test("returns nothing when Biome processed no files", () => {
    const output = ["  i Files processed:", "", "  ! The list is empty."].join("\n");
    expect(parseProcessedFiles(output)).toEqual([]);
  });

  test("fails loudly when the block is missing", () => {
    expect(() => parseProcessedFiles("nothing here")).toThrow("Files processed");
  });
});

describe("path helpers", () => {
  test("drops a leading ./", () => {
    expect(repoPath("./src/index.ts")).toBe("src/index.ts");
  });

  test("recognises code extensions only", () => {
    for (const file of ["a.ts", "b.tsx", "c.mts", "d.cts", "e.js", "f.jsx", "g.mjs", "h.cjs"]) {
      expect(isCodeFile(file)).toBe(true);
    }
    for (const file of ["a.json", "b.md", "c.css", "LICENSE"]) {
      expect(isCodeFile(file)).toBe(false);
    }
  });
});

describe("narrowing helpers", () => {
  test("isRecord rejects null and primitives", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("string")).toBe(false);
  });

  test("isString rejects non-strings", () => {
    expect(isString("")).toBe(true);
    expect(isString(1)).toBe(false);
  });
});

describe("this repository", () => {
  test("collects both tool views and agrees", async () => {
    const facts = await collectFacts();

    expect(facts.typescriptFiles.length).toBeGreaterThan(0);
    expect(facts.biomeFiles).toContain("src/index.ts");
    expect(facts.packageScripts["check:types"]).toContain("--no-script");
    expect(findViolations(facts)).toEqual([]);
  }, 30_000);
});
