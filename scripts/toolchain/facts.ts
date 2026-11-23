/**
 * Gathers what each tool actually resolves, rather than what the config files say they should.
 * The invariants in `invariants.ts` compare these facts.
 */

const CODE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const;

type CommandResult = {
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type ToolchainFacts = {
  readonly versions: {
    readonly bun: string;
    readonly biome: string;
    readonly typescript: string;
  };
  /** Repository-relative code files TypeScript resolves from tsconfig.json. */
  readonly typescriptFiles: readonly string[];
  readonly typescriptOptions: Readonly<Record<string, unknown>>;
  /** Directories tsconfig.json excludes, normalised to repository-relative paths. */
  readonly typescriptExclude: readonly string[];
  /** Repository-relative code files Biome resolves from biome.jsonc. */
  readonly biomeFiles: readonly string[];
  readonly biomeConfig: Readonly<Record<string, unknown>>;
  readonly packageScripts: Readonly<Record<string, string>>;
  readonly bunfig: Readonly<Record<string, unknown>>;
  readonly typeDiagnostics: {
    readonly tsc: readonly string[];
    readonly bun: readonly string[];
    readonly tscFailed: boolean;
    readonly bunFailed: boolean;
  };
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isString = (value: unknown): value is string => typeof value === "string";

/** Drops a leading `./` so tool output and config paths compare equal. */
export const repoPath = (path: string): string => path.replace(/^\.\//, "");

export const isCodeFile = (path: string): boolean =>
  CODE_EXTENSIONS.some((extension) => path.endsWith(extension));

const run = (command: readonly string[]): CommandResult => {
  const result = Bun.spawnSync({ cmd: [...command], stdout: "pipe", stderr: "pipe" });
  return {
    command: command.join(" "),
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
};

const runOrThrow = (command: readonly string[]): CommandResult => {
  const result = run(command);
  if (result.exitCode !== 0) {
    throw new Error(
      `${result.command} exited ${result.exitCode}\n${result.stderr || result.stdout}`,
    );
  }
  return result;
};

const parseObject = (source: string, label: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed)) {
    throw new Error(`${label} did not parse to an object`);
  }
  return parsed;
};

const codeFiles = (paths: readonly string[]): readonly string[] =>
  paths.map(repoPath).filter(isCodeFile);

/**
 * Reads `tsc --showConfig`, which is the compiler's own resolved view: inherited options,
 * include/exclude expansions, and the final file list.
 */
const readTypeScript = (): Pick<
  ToolchainFacts,
  "typescriptFiles" | "typescriptOptions" | "typescriptExclude"
> => {
  const { stdout } = runOrThrow(["bun", "run", "tsc", "--showConfig"]);
  const config = parseObject(stdout, "tsc --showConfig");
  const files = Array.isArray(config.files) ? config.files.filter(isString) : [];
  const exclude = Array.isArray(config.exclude) ? config.exclude.filter(isString) : [];
  const options = isRecord(config.compilerOptions) ? config.compilerOptions : {};
  return {
    typescriptFiles: codeFiles(files),
    typescriptOptions: options,
    typescriptExclude: exclude.map((entry) => repoPath(entry).replace(/\/$/, "")),
  };
};

/**
 * Reads the `Files processed` block that `biome check --verbose` prints. Biome exits non-zero
 * while diagnostics exist, so the block is parsed regardless of the exit code.
 */
export const parseProcessedFiles = (output: string): readonly string[] => {
  const lines = output.split("\n");
  const header = lines.findIndex((line) => line.includes("Files processed:"));
  if (header === -1) {
    throw new Error("biome --verbose did not print a `Files processed` block");
  }

  const files: string[] = [];
  for (const line of lines.slice(header + 1)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const entry = /^- (.+)$/.exec(trimmed);
    if (entry?.[1] === undefined) break;
    files.push(repoPath(entry[1]));
  }
  return files;
};

const readBiome = (): Pick<ToolchainFacts, "biomeFiles" | "biomeConfig"> => {
  const { stdout, stderr } = run([
    "bun",
    "run",
    "biome",
    "check",
    "--verbose",
    "--colors=off",
    ".",
  ]);
  const configText = runOrThrow(["bun", "run", "biome", "inspect", "config"]).stdout;
  const config = parseObject(extractJson(configText), "biome inspect config");
  const processed = parseProcessedFiles(stdout + stderr);
  return { biomeFiles: codeFiles(processed), biomeConfig: config };
};

/** `biome inspect config` prints prose plus the resolved config object. */
const extractJson = (output: string): string => {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("biome inspect config did not print a JSON object");
  }
  return output.slice(start, end + 1);
};

const readPackageScripts = async (): Promise<Readonly<Record<string, string>>> => {
  const parsed: unknown = await Bun.file("package.json").json();
  const scripts = isRecord(parsed) ? parsed.scripts : undefined;
  if (!isRecord(scripts)) return {};

  const entries = Object.entries(scripts).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return Object.fromEntries(entries);
};

const readBunfig = async (): Promise<Readonly<Record<string, unknown>>> => {
  const text = await Bun.file("bunfig.toml").text();
  const parsed: unknown = Bun.TOML.parse(text);
  return isRecord(parsed) ? parsed : {};
};

const DIAGNOSTIC = /^.*\(\d+,\d+\): error TS\d+: /;

const normalizeDiagnostics = (output: string): readonly string[] =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => DIAGNOSTIC.test(line))
    .map((line) => line.replaceAll(`${process.cwd()}/`, ""))
    .sort();

/**
 * Runs both type checkers over the same tsconfig. `bun check --no-script` skips the
 * `package.json#scripts.check` hand-off, so the raw checker is what gets compared.
 */
const readTypeDiagnostics = (): ToolchainFacts["typeDiagnostics"] => {
  const tsc = run(["bun", "run", "tsc", "--noEmit", "--pretty", "false"]);
  const bun = run(["bun", "check", "--no-script", "--no-pretty"]);
  return {
    tsc: normalizeDiagnostics(tsc.stdout + tsc.stderr),
    bun: normalizeDiagnostics(bun.stdout + bun.stderr),
    tscFailed: tsc.exitCode !== 0,
    bunFailed: bun.exitCode !== 0,
  };
};

const versions = (raw: string): string => /\d+\.\d+\.\d+\S*/.exec(raw)?.[0] ?? raw.trim();

const readVersions = (): ToolchainFacts["versions"] => ({
  bun: versions(runOrThrow(["bun", "--version"]).stdout),
  biome: versions(runOrThrow(["bun", "run", "biome", "--version"]).stdout),
  typescript: versions(runOrThrow(["bun", "run", "tsc", "--version"]).stdout),
});

export const collectFacts = async (): Promise<ToolchainFacts> => ({
  versions: readVersions(),
  ...readTypeScript(),
  ...readBiome(),
  packageScripts: await readPackageScripts(),
  bunfig: await readBunfig(),
  typeDiagnostics: readTypeDiagnostics(),
});
