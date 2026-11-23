# It Ain't Gravy CLI product specification

Release 1. This document defines the product contract. The companion `architecture-contract.md`
defines the internal invariants that keep the contract true.

**Goal.** Define one testable product for `gravy` covering the command surface, supported platforms,
execution modes, tool contracts, session lifecycle and the criteria a first release must pass.

| Topic | Where it is defined | Cross-reference in the contract |
|---|---|---|
| Command surface | §4 | C-2, C-3, §3, INV-11 |
| Supported platforms | §3 | C-5, §6.8, AC-27 |
| Execution modes | §5 | §4 `SessionHandle`, §7 INV-14 and INV-17, §9 |
| Tool contracts | §6 | §4 shapes, §6.5 to §6.8, INV-4 and INV-6 |
| Session lifecycle | §7 | INV-1, INV-2, INV-12, INV-14, §6.3 |
| First-release acceptance | §8, §9 | §12, §13 |

## 1. Product definition

`gravy` is a terminal coding agent. One executable is an interactive terminal application, a
non-interactive prompt runner, an editor protocol server, a local daemon and a remote-control host.
The agent reads code, edits files, runs commands, calls MCP tools, delegates to subagents and
schedules work. It authenticates an account or an API key and talks to several model families
through one model gateway.

### 1.1 What ships

| Property | Value |
|---|---|
| Executable | `gravy` |
| Release | 1 |
| Distribution | One statically linked executable per platform |
| Product layers | Entry points, terminal app, local daemon, agent runtime |
| Optional runtimes | Python for workflows, Node.js for sidecars, a browser for DevTools tools |

The CLI carries the terminal user interface, the agent runtime, the daemon, the ACP server, the MCP
client and host, the plugin loader and the updater. It is not a thin client over a hosted API.

### 1.2 What the product is not

- Not a code editor. It opens files and shows diffs, and an external editor is reachable, but it does
  not own a buffer model.
- Not a hosted service. The client contract is in scope. Server-side quota, entitlement policy and
  backend semantics are out of scope.
- Not a marketplace publisher. Validation predicts publishability; no publish verb exists.

## 2. Terms

| Term | Meaning |
|---|---|
| Driver mode | The entry point that owns input and output: terminal, print, ACP, agent API, remote control |
| Permission mode | What the agent may do without asking: `default`, `accept-edits`, `auto`, `plan` |
| Session | One conversation bound to one client, with at most one active turn |
| Step | One recorded unit of a conversation: input, model text, thinking, tool call, tool result, checkpoint |
| Tool | A named capability the model can call, with a schema and required permissions |
| Extension | A skill, agent, rule, hook, plugin, workflow or MCP server loaded from disk |
| Conformance | Passing every acceptance criterion in §9 |

**Requirement**, **Decision** and **Open** mark the status of a statement. A requirement is binding.
A decision settles a question the product design leaves open. An open item is recorded in the
architecture contract and is not a release blocker unless an acceptance criterion names it.

## 3. Supported platforms

### 3.1 Operating systems

Three operating systems ship from one release. Each is a first-class target.

| OS | Architecture | Support | Mechanism |
|---|---|---|---|
| macOS | arm64 | Full | Seatbelt profile through `/usr/bin/sandbox-exec`; Keychain; launchd for the remote-control daemon |
| Linux | arm64, x64 | Static target | Landlock plus user namespaces; Secret Service with a no-D-Bus bypass |
| Windows | x64 | Static target | Low-privilege token plus DACL; `cmd.exe` and PowerShell; OSC 52 clipboard |

Runtime verification on Linux and Windows is a non-goal for Release 1. The mechanism must be present
and the build must pass the platform criteria in §9.

### 3.2 Host requirements per capability

| Capability | Requirement | Failure behaviour |
|---|---|---|
| Terminal sandbox on macOS | `/usr/bin/sandbox-exec` | Falls back to asking before each command; mode `auto` becomes unavailable |
| Terminal sandbox on Linux | Unprivileged user namespaces and a Landlock-capable kernel | Three separate diagnostics: `user.max_user_namespaces = 0`, `kernel.unprivileged_userns_clone = 0`, `kernel.apparmor_restrict_unprivileged_userns = 1` |
| Terminal sandbox on Windows | Windows 11 version 24H2 or later | Sandbox is turned off and commands ask for review |
| `auto` mode on Windows | Personal account and Windows 11 24H2 or later | Not offered; `Agent` remains the default |
| Keyring | macOS Keychain, Linux Secret Service, Windows Credential Manager | File-backed token storage with a recorded keyring timeout |
| Live voice | In-process language server and a microphone | Unavailable in print mode and for remote agents |
| Python workflows | Python 3.x | `run_workflow` fails with a version message |
| Swarm web board | Node.js sidecar | Board is read-only and optional; the Go TUI board still works |
| Browser DevTools tools | `browser-devtools-mcp@1.12.0` through `npx` or a pinned archive | Gated to evaluation runs |

The CLI does not embed Python. It resolves `GRAVY_PYTHON`, then a bundled directory, then `python3`
and `python` on `PATH`, then four fixed macOS paths, then `py -3` on Windows.

### 3.3 Terminal requirements

| Capability | Requirement | Degradation |
|---|---|---|
| Interactive mode | A TTY on stdin and stdout | Without a TTY the process fails instead of rendering |
| Alternate screen | Optional | `altScreenMode` values `default`, `always`, `never` |
| Inline images | Kitty graphics or sixel | Falls back to ASCII or Mermaid text |
| Clipboard | OSC 52, `wl-paste` or `xclip` on Linux, native calls on Windows | Copy reports failure |
| Tab status | OSC 7501, gated by support detection | `GRAVY_CLI_OSC7501` accepts `on` or `off` |
| Color | Truecolor preferred, `NO_COLOR`, `CLICOLOR`, `CLICOLOR_FORCE` honored | Plugin commands print no escape codes when output is piped |
| Wide characters | Grapheme-cluster width handling for CJK and emoji | Cursor and wrap width must follow grapheme clusters, not code units |

### 3.4 Filesystem locations by OS

| Item | macOS | Linux | Windows |
|---|---|---|---|
| State root | `~/.it-aint-gravy/cli/` | same | same |
| App data | `~/Library/Application Support/it-aint-gravy/` | `--app_data_dir` | `--app_data_dir` |
| Admin policy | `/Library/Application Support/it-aint-gravy/admin_settings.json` | `/etc/it-aint-gravy/admin_settings.json` | `…\it-aint-gravy\admin_settings.json` |
| OAuth paste source | `/dev/tty` | `/dev/tty` | `CONIN$` |

## 4. Command surface

The command surface has four namespaces. Each has one owner and one discovery path. No command may
exist in two namespaces with different behaviour.

| Namespace | Owner | Count | Discovery |
|---|---|---:|---|
| Process commands | The CLI entry point | 13 tokens, 11 distinct commands, plus 1 hidden | `gravy help` |
| Launch flags | The flag parser | 24 visible, 14 or more hidden | `gravy --help` and source |
| Session commands | three registries | 62 invokable names plus dynamic skills | `/help`, completion, ACP `available_commands_update` |
| Configuration keys | The settings loader | 33 documented keys plus extras | `/config`, `settings.json` |

### 4.1 Entry point and process modes

`gravy` with no subcommand starts the terminal application. The process dispatches in this order.

1. The router checks `os.Args[1]` against hidden entry points.
2. Auth actions run for `--login` and logout paths.
3. The updater runs **before** the user-visible CLI. An update therefore cannot be seen or declined
   by the current invocation.
4. The launcher selects terminal, print or protocol mode from the flags.
5. A language-server child starts and binds two random localhost ports, one HTTPS with gRPC and one
   plain HTTP.

The process fails closed. An unknown flag, an invalid enum value or an unavailable mode exits non-zero
before a model call is made.

### 4.2 Process commands

| Command | Purpose | Contract notes |
|---|---|---|
| `acp` | ACP stdio JSON-RPC server | `--process-per-session`, `--worker`, `--login`, `--cloud_code_endpoint`, `--use_stubby_auth`, `--ide-mcp-port`, `--state-dir`, `--app-data-dir`, `--disable-telemetry`, `--override_user_agent_name` |
| `agent` | List available custom agents | Alias of `agents` |
| `agents` | List available custom agents | Prints nothing when none are defined |
| `changelog` | Fetch and print release notes | Fetches the project release notes |
| `help` | Subcommand help | Hand-rolled usage |
| `install` | Configure `PATH` and shell aliases | `--dir`, `--skip-aliases`, `--skip-path` |
| `mcp` | Manage MCP servers | `add`, `remove`, `list`, `enable`, `disable` |
| `mic-serve` | Serve this machine's microphone | `--addr`, default `127.0.0.1:4713` |
| `models` | List models available to the account | Network fetch, one row per model |
| `plugin` | Manage plugins | `list`, `import`, `install`, `uninstall`, `enable`, `disable`, `validate`, `link`, `help` |
| `plugins` | Alias of `plugin` | Same handler |
| `remote-control` | Background remote-control daemon | `start`, `status`, `stop`; `start` takes `--name` and `--session` |
| `update` | Self-update | No flags |
| `agentapi` (hidden) | Local agent API | `new-conversation`, `send-message`, `get-conversation-metadata` |

Not supported: `multicall` and `plugin-cli`. Their routes must not dispatch.

### 4.3 Launch flags

Visible flags, 24 entries counting short aliases separately:

```
--add-dir (repeatable)   --agent                  -c / --continue
--conversation           --dangerously-skip-permissions
--disable-slash-commands --effort                 --input-format
-i / --prompt-interactive --json-schema           --log-file
--mode                   --model                  --new-project
--output-format          -p / --print             --prompt
--prompt-interactive     --project                --remote-agent
--remote-control         --sandbox                --settings
```

Hidden but supported flags that form part of the contract:

| Flag | Contract |
|---|---|
| `--settings` | Inline JSON object or file path. Applies `settings.json` keys to one session and is never persisted. Must be a JSON object |
| `--remote-control-name` | Instance name for remote control |
| `--app_data_dir`, `--state_dir` | State root overrides, relative to the default root |
| `--bg-updater` | Runs the process as the background update worker |
| `--cdp_port`, `--local_browser_user_data_dir`, `--local_browser_headless`, `--use_local_browser` | Browser agent transport wiring |
| `--release_base_url` | Updater manifest base |
| `--csrf_token` | CSRF token for the local daemon |
| `--host_bridge_url`, `--read_host_bridge_token_from_stdin`, `--use_host_auth` | Host bridge authentication |
| `--enable_product_api` | Serve the product API |
| `--disable-telemetry` | Disable telemetry for the process |
| `--logtostderr` | glog compatibility |

`gravy --version` prints the release. Help lists every supported flag.

### 4.4 In-session commands

Three registries feed session commands. Conflating them produces wrong answers about what exists,
because a name can be a command type, a system prompt command or a skill.

#### Terminal command types

The terminal command registry holds 39 concrete types. Their names and aliases produce 48 invokable
names, including the two names of the dictation command (`voice` and `record`) and ten aliases.

```
add-dir      agents      artifact    btw         changelog   clear       codesearch
config       context     copy        credits     diff        effort      exit
feedback     fork        help        hooks       keybindings logout      mcp
model        open        permissions plugin      projects    remote-control
rename       resume      rewind      skills      statusline  tasks       thinking
title        usage       voice       record
```

Aliases: `new` to `clear`, `quit` to `exit`, `branch` to `fork`, `switch` and `conversation` to
`resume`, `undo` to `rewind`, `cs` and `search` to `codesearch`, `settings` to `config`, `quota` to
`usage`.

Aliases that do not exist: `/plugins`, `/add-workspace-dir`. The real command is `add-dir`.

Argument hints exist on three commands only: `model [model]`, `thinking [on|off]`, `plugin []`.
`/thinking` is shipped. The remote-control command hides itself when `GRAVY_AMBIENT_AUTH` is set.

#### System prompt commands

A statically initialised `[]Definition` with 14 entries. Names, in order: `goal`, `compact`,
`schedule`, `browser`, `computer`, `browser-vision`, `plan`, `grill-me`, `teamwork`, `learn`,
`boost`, `deepagent`, `review-agent`, `help`. Nine of them carry a "Recommend this when…" string
that steers the model to propose the command itself. `grill-me` carries a prompt block. Schedule
arguments are a structured record, not free text.

#### Skills and workflows

Skill and workflow discovery reads `SKILL.md` frontmatter `name:`. Sixteen built-in skills are
present, including `swarm`,
`run-workflow`, `cli-guide`, `gravy-customizations`, `automation`, `plugin`, `swarm_monitor`,
`swarm_narrator`, `swarm_pane`, `permissioned-github`, `migrate-agent-settings`,
`migrate-workflows`, `conversations`, `generative_ui`, `mcp-app-development`,
`ui-plugin-navigation`.

Resolution rules:

- `models` is reserved and cannot be claimed by a skill, case-insensitively.
- A skill that would shadow an existing command is refused at registration.
- Workflow commands hide legacy workflow claims.
- `disable-slash-command: true` removes a skill from the menu and from name resolution while leaving
  it available to the model.

A default session advertises 13 commands: `goal`, `compact`, `schedule`, `browser`, `plan`,
`grill-me`, `learn`, `gravy-customizations`, `mobile-cli`, `cli-guide`, `run-workflow`, `swarm`,
`testing-setup`. The list depends on workspace skills, so it is not a constant.

**Gated commands.** `teamwork`, `boost`, `deepagent`, `review-agent` and `browser-vision` are
compiled into the release and absent from a default session. Each is gated by a predicate that reads
a runtime feature flag. A release must ship the code and the gate, and must not advertise a gated
command until its gate is on.

### 4.5 Keybindings

44 default keys map to 39 actions, with five alias groups. `ctrl+c` is bound and also hard
intercepted, so a remap is ignored with a warning. Key bindings that form part of the contract:

| Key | Action |
|---|---|
| `shift+tab` | Cycle permission modes. The hint text lists three; `auto` is cycled when available |
| `ctrl+g` | Open the external editor |
| `alt+s` | Open the swarm board, rebindable as `swarm.board` |
| `f5` | Start dictation |
| `alt+m` | Send with the opposite of the `Queued Messages` setting |
| `ctrl+o` | Toggle trajectory detail globally; fold expansion inside `/diff` |

Per-view maps are hardcoded, including `/diff`. A release must publish one table of keys per view
rather than one global table with exceptions.

### 4.6 Settings keys

`~/.it-aint-gravy/cli/settings.json`. All 33 documented keys parse. Unknown keys warn, and a value of
the wrong type falls back to the default with a logged reason.

| Group | Keys |
|---|---|
| Modes and permission | `agentMode`, `toolPermission`, `artifactReviewPolicy`, `allowNonWorkspaceAccess`, `enableTerminalSandbox`, `permissions` |
| Model | `model`, `modelProvider`, `customModelsConfig`, `useCredits`, `cloud` |
| Workspace | `trustedWorkspaces` |
| Terminal | `colorScheme`, `altScreenMode`, `notifications`, `verbosity`, `runningLightSpeed`, `copyOnSelect`, `hideActiveItems`, `pickerGrouping`, `queuedMessages`, `clearScrollbackOnResize`, `useTerminalCursor`, `statusLine`, `title`, `editor`, `editorMode`, `vimInsertFirst`, `historySize` |
| Behavior | `showTips`, `showFeedbackSurvey`, `disableSlashCommands` |
| Network | `sandboxProxy` |

The schema also carries keys that the documentation omits. They parse and are part of the contract.

| Extra key | Meaning |
|---|---|
| `voice` | Voice mode, voice name, speed and volume |
| `remoteControlEnabled` | Persisted remote-control opt-in |
| `enableTelemetry` | Per-file telemetry switch |
| `seasonalThemesOptIn`, `seasonalThemesOff` | Seasonal theme rotation |
| `customModels[]` | Bring-your-own model entries under `customModelsConfig` |
| `sandboxProxy.http{address, certFile, username, password}` | Proxy settings, validated in pairs |

Closed enums:

| Key | Values |
|---|---|
| `colorScheme` | `terminal`, `light`, `solarized light`, `colorblind-friendly light`, `dark`, `solarized dark`, `colorblind-friendly dark`, `tokyo night` |
| `verbosity` | `low`, `medium`, `high` |
| `altScreenMode` | `default`, `always`, `never` |
| `artifactReviewPolicy` | `asks-for-review`, `agent-decides`, `always-proceed` |
| `toolPermission` | `request-review`, `always-proceed`, plus the `ask` and `proceed` spellings the app uses |
| `editorMode` | `default`, `vim` |
| `pickerGrouping` | `grouped`, `none` |
| `historySize` | Integer at least `-1`. `-1` keeps all, `0` disables |

`--settings` accepts only a JSON object. An existing path is read as a file. No JSON Schema is
embedded, so validation is the loader's job.

### 4.7 Environment variables

| Variable | Effect |
|---|---|
| `MODEL_API_KEY`, `MODEL_API_KEY_ALT` | Developer API key. `MODEL_API_KEY_ALT` wins when both are set |
| `MODEL_BASE_URL` | Custom model endpoint when `modelProvider` is `direct` |
| `GRAVY_AMBIENT_AUTH` | Use ambient credentials. Blocks remote control and changes sign-in |
| `GRAVY_LS_ADDRESS` | Attach to an existing language server |
| `GRAVY_CSRF_TOKEN` | CSRF token for the local daemon |
| `GRAVY_PYTHON` | Interpreter for `run_workflow` |
| `GRAVY_MIC` | Microphone source for `mic-serve` |
| `GRAVY_CLI_AUTO_COMPACT_OVERRIDE` | Compaction threshold. Accepts an integer, `K` or `M` shorthand, or a percentage |
| `GRAVY_CLI_OSC7501` | `on` or `off` for terminal status reporting |
| `GRAVY_LLM_GATEWAY_API_KEY`, `GRAVY_LLM_GATEWAY_HEADERS`, `GRAVY_LLM_GATEWAY_WIRE_PROTOCOL`, `GRAVY_LLM_GATEWAY_PROXY_URL` | Enterprise gateway mode |
| `GRAVY_CA_CERT`, `GRAVY_CA_CERTS` | Extra CA for the gateway |
| `NO_COLOR`, `CLICOLOR`, `CLICOLOR_FORCE` | Color policy |
| `SSH_CONNECTION` | Detects a remote session and switches sign-in to code paste |
| `GRAVY_SIDECAR_WEB_PORT` | Sidecar web UI port |
| `GRAVY_CONVERSATION_ID`, `PLUGIN_ROOT`, `PLUGIN_DATA` | Injected into hook command environments |
| `INTERNAL_*` | Internal and QE hooks. Not a public contract |

### 4.8 Local state

| Path under `~/.it-aint-gravy/cli/` | Contents | Lifecycle |
|---|---|---|
| `settings.json` | User settings | Written on change |
| `keybindings.json` | Key overrides | Written on demand |
| `history.jsonl` | Prompt history | Appended per prompt |
| `conversations/<uuid>.db` | Per-conversation SQLite | Created on first turn |
| `conversation_summaries.db` | SQLite with an FTS5 index over conversation chunks | Maintained on resume and search |
| `brain/<uuid>/` | `scratch`, `.user_uploaded`, `.system_generated` | Per conversation |
| `brain/<uuid>/.system_generated/logs/transcript.jsonl` | Full transcript | Appended per step |
| `implicit/<uuid>.pb` | Implicit context snapshot | Per conversation |
| `annotations/<uuid>.pbtxt` | Step annotations | Per conversation |
| `presence/<uuid>.lock` | Conversation lock | Held while a process owns the conversation |
| `state.pbtxt` | Onboarding, installation id, schema migrations, flags | Written on migration |
| `installation_id` | Installation UUID | Written once |
| `builtin/` | Extracted built-in skills and plugin | Written on version change |
| `skills/`, `mcp/`, `updater/`, `crashes/` | User skills, MCP cache, staged updates, crash dumps | Mixed |

Credentials live in the OS keyring, or in a file when the keyring is unavailable. The keyring service
name is `keyring`. Marker files record a keyring timeout so later writes skip the keyring for a
bounded period.

### 4.9 Output and exit codes

| Mode | stdout | stderr |
|---|---|---|
| Interactive | Terminal rendering | Diagnostics |
| `--output-format text` | Response text | Diagnostics and `GRAVY_ERROR: {"short_error":…}` |
| `--output-format json` | One JSON object | Diagnostics |
| `--output-format stream-json` | NDJSON events | Diagnostics and errors |

Exit codes are 0, 1, 2 and 3. 0 means success, including a completed result that reports
`status: "ERROR"`. 1 is a generic failure. 2 means one of two sentinel configuration errors. 3 means
one specific error type. Non-interactive callers must read the result envelope, not the exit code
alone.

### 4.10 Help and discovery

`gravy help` lists the subcommands. `gravy <command> --help` lists per-command flags. Session help
is `/help` plus the `?` shortcut.

### 4.11 Status line, title, diff and themes

The status line is a scripting interface. A user command receives one JSON object on stdin and the
first lines of stdout are rendered.

The payload carries the session state: `cwd`, `session_id`, `conversation_id`, `conversation_title`,
`transcript_path`, `model`, `workspace`, `version`, `agent`, `product`, `context_window`,
`exceeds_200k_tokens`, `quota`, `agent_state`, `vcs`, `cycle_mode`, `sandbox`, `subagents`,
`artifact_count`, `plan_tier`, `email`, `pending_input_count`, `tool_confirmation_pending`,
`task_count`, `terminal_width`, `vim` and `cost{estimated}`. `agent_state` is one of `idle`,
`working`, `tool_use`, `initializing`, `reviewing`, `authenticating`, `error`.

| Rule | Value |
|---|---|
| Refresh throttle | 300 ms |
| Command timeout | 5 s |
| Auto-disable | After 30 consecutive failures, with the last error reported |
| `/statusline` subcommands | Toggle, `<command>`, `delete`, `on`, `enable`, `off`, `disable`, `help` |
| Reset | `/statusline delete`. There is no `none` and no `reset` subcommand |
| `/title` | Same payload, rendered on one line, control characters stripped. Takes `on` or `off` |

`/diff` detects version control in a fixed order: `.jj`, `.git`, `.hg`, `.repo`. Jujutsu and
Mercurial support are CLI-local shell-outs, not language-server services. The eight color schemes
are fixed names. A seasonal theme scheduler can override the choice inside a date window.

## 5. Execution modes

Two independent axes define a run. The driver owns input and output. The permission mode decides what
the agent may do without asking. Sandbox policy and model effort are separate inputs.

### 5.1 Driver modes

| Driver | Selected by | Input | Output | Terminal needed |
|---|---|---|---|---|
| Interactive | Default on a TTY | Keystrokes, paste, attachments | Rendered TUI | Yes |
| Print, text | `-p` or `--prompt` | One prompt, or stdin when piped | Text | No |
| Print, JSON | `--output-format json` with `-p` | One prompt | One JSON object | No |
| Print, stream JSON | `--input-format stream-json --output-format stream-json` | NDJSON lines on stdin | NDJSON on stdout | No |
| ACP server | `gravy acp` | JSON-RPC on stdin | JSON-RPC on stdout | No |
| Agent API | `gravy agentapi` | Local HTTP with CSRF | HTTP | No |
| Remote control host | `--remote-control` or `/remote-control on` | Browser or WebRTC client | Browser UI and events | Optional |
| Remote agent client | `--remote-agent` | Local prompt, server-side execution | Events | No |

Rules:

- `--input-format stream-json` requires `--output-format stream-json`.
- `--print` and `--prompt-interactive` are mutually exclusive.
- Print mode requires `-p`, `--prompt-interactive`, or `--input-format stream-json`. `--output-format
  json` alone is a usage error.
- ACP over stdio is the default transport. `--process-per-session` isolates each session in a worker
  process. `--worker` is internal.
- `--remote-agent` refuses `--print`, `--conversation-path` and local conversations.
- `--remote-control` and `--remote-agent` exit with code 2 under a `MODEL_API_KEY`.

### 5.2 Permission modes

| Mode | Advertised | Behaviour | Preconditions |
|---|---|---|---|
| `default` | Yes | Ask before edits and commands, per the permission rules | None |
| `accept-edits` | Yes | Approve workspace file edits without asking. Commands still follow rules | None |
| `auto` | Yes | Approve edits and safe commands. Ask before irreversible actions | An OS terminal sandbox, and no enterprise policy that forbids it |
| `plan` | Yes | Research and plan only. Workspace writes are refused | None |
| Best-of-N | No | Fork parallel arms and pick a winner | Not in the ACP `modes` array. A banner and the Shift+Tab cycle exist |

Mode texts are fixed:

- `default`: "Ask before edits and commands, per your permission settings."
- `accept-edits`: "Approve file edits in the workspace without asking."
- `auto`: "Approve edits and safe commands; ask before irreversible actions."
- `plan`: "Plan carefully before executing a task."

Mode rules:

- `plan` is read-only. A write attempt returns a refusal that names the execution model as the actor.
- `accept-edits` covers workspace paths only. An edit outside the workspace still prompts.
- `auto` requires the terminal sandbox. Without it the server returns "Auto mode is not available: it
  needs the OS terminal sandbox and may not be rolled out to you yet" and falls back to `default`.
- `auto` is not offered to enterprise accounts that follow an admin permission policy.
- A `strict` tool permission outranks `auto` and `accept-edits`, so edits still ask.
- `--dangerously-skip-permissions` removes prompts but never overrides an explicit `deny` rule.
- Headless runs that cannot honour a mode print a warning and continue in `default`.

### 5.3 Sandbox policies

`commandExecutionPolicy` is a closed four-value enum: `off`, `auto`, `eager`, `sandbox`. It decides
when a command runs inside the OS sandbox.

| Value | Meaning |
|---|---|
| `off` | Never sandbox |
| `auto` | Sandbox when the mode or the rules call for it |
| `eager` | Sandbox whenever the host can |
| `sandbox` | Require the sandbox. Refuse or ask when unavailable |

**Decision.** The per-value meanings above are fixed here. They are not inferred from the enum name.

The sandbox report is part of every command result. The command result's `sandbox_details` carries
`ran_in_sandbox` and `sandbox_errors`. A command that ran outside the sandbox must say so, and a
command that asked for an escape must record the approval that allowed it.

Mechanisms:

- macOS: a generated Seatbelt profile run through `/usr/bin/sandbox-exec`. Filesystem, process,
  network and pty rules are SBPL statements. Denial text is shown to the model.
- Linux: Landlock rules plus user namespaces. The three ways a host blocks them have distinct
  diagnostics.
- Windows: a low-privilege token and a DACL. AppContainer is not used.
- Network: a local HTTP and RPC proxy evaluates a CEL policy per request, including GraphQL, JSON,
  URL-encoded and git-receive-pack bodies. CEL does not govern the filesystem.

### 5.4 Model and effort resolution

The CLI ships a built-in catalog and fetches the catalog for the signed-in account. Only the fetched
catalog is selectable.

Effort is not independent of the model. `--effort` selects an effort-suffixed variant of a base model
id. Passing an already-suffixed id with any `--effort` fails with `--model X conflicts with --effort=Y`.
Models without effort control reject every effort value. `xhigh` is reachable only on the two
reasoning variants.

| Model class | Accepted effort |
|---|---|
| Standard models | `low`, `medium`, `high` |
| Reasoning models (two variants) | `low`, `medium`, `high`, `xhigh` |
| Single-tier models | `medium` |
| Models without effort control | None |

Tier aliases `lite`, `fast` and `pro` resolve to concrete ids before the call. An unknown id is
rejected with `model X is not recognized as a known model or custom model in settings`. A persisted
display name that the account no longer serves must be handled without a crash.

### 5.5 Mode compatibility

| Combination | Result |
|---|---|
| `--mode auto` without a sandbox | Warning, continue in `default` |
| `--mode auto` on an enterprise account | Warning, continue in `default` |
| `--mode <any>` in print mode | Warning when unsupported, continue in `default` |
| `--sandbox` with `plan` | Sandbox flag is accepted, plan still refuses writes |
| `--effort` with a suffixed model id | Exit with a conflict error |
| `--effort` with a model without effort control | Exit with `--effort is not supported for model` |
| `--remote-agent` with `--print` | Exit with a usage error |
| `--remote-control` with ambient credentials | Exit with an unsupported-credential error |
| Live voice in print mode | Unavailable with an explanatory message |

## 6. Tool contracts

### 6.1 Tool identity

A tool has one model-facing name. Hook matchers, permission rules and telemetry all use that name.

- Canonical names come from the tool registry.
- Hook matcher names derive from step type names by lowercasing. The step type set declares 118
  values, and 140 distinct names are recognized. Only some have standalone string literals.
- An alias table overrides derivation for imported tool names. `Bash` maps to `run_command`, `Read`
  to `view_file`, `Write` to `write_to_file`, `Edit` to `replace_file_content`, `MultiEdit` to
  `multi_replace_file_content`, `Grep` to `grep_search`, `Glob` to `find_by_name`, `LS` to
  `list_dir`, `WebFetch` to `read_url_content`, `WebSearch` to `search_web`, `Task` to
  `invoke_subagent`, `NotebookEdit` to `notebook_edit`. `read_file`, `write_file` and `edit_file`
  are accepted aliases of the native names.
- A matcher is an anchored regular expression, `^(?:pattern)$`. An invalid pattern never matches and
  raises a validation warning.
- The model-facing name for the swarm tool is `swarm`. Sibling tools are `post_message`,
  `read_board` and `swarm_wait`.

### 6.2 Invocation envelope

Every call carries a tool name, an argument object validated against the tool schema, and the set of
permissions the tool requires. Validation happens at the boundary. A schema violation returns a tool
error, never a crash.

Unknown arguments fail validation. `strictArgumentValidation` tightens this per MCP server and per
custom agent. A missing required permission produces a permission request, not a tool error.

### 6.3 Result envelope

Every result reports one of four outcomes: `ok`, `error`, `denied`, `timeout`. A denied call records
the rule and the scope that denied it. A timed-out call records whether the process was killed.

The result content is text, structured JSON, an image reference, a file reference or a diff. Large
structured output is subject to a per-step token limit. Truncation sets a flag; it must not silently
count the full payload against the context.

### 6.4 Core tools

| Tool | Request fields | Result fields |
|---|---|---|
| `view_file` | `path`, `start_line`, `end_line`, `line_range_bytes` | `file_num_lines`, `file_num_bytes` plus content |
| `write_to_file`, `replace_file_content`, `multi_replace_file_content` | Shared file edit payload: `kind` in `CREATE`, `OVERWRITE`, `EDIT`, `path`, replacement or full content | `diff`, `diff_stats`, artifact metadata |
| `run_command` | `command_line`, `cwd`, `shell_name` | `exit_code`, `timed_out`, `exit_code_unknown`, `sandbox_details{ran_in_sandbox, sandbox_errors}`, `is_trusted_cli`, `trusted_cli_control_outputs` |
| `read_url_content` | URL | Content, after redaction and denylist checks |
| `search_web` | `query`, `domain` | `web_documents`, `summary`, `third_party_config` |
| `generate_image` | `prompt`, `image_paths`, `aspect_ratio`, `model_name` | `image_uri`, `retry_infos` |
| `ask_question` | `questions[]` | Answers |
| `ask_permission` | tool call and reason | `ALLOW_ONCE`, `ALLOW_CONVERSATION`, `ALLOW_WORKSPACE`, `ALLOW_GLOBAL`, `ALLOW_PROJECT`, `DENY` |
| `invoke_subagent` | `subagents[]`, each with `task`, `role`, `model_tier`, `workspace`, `fork`, `count` | `results[]`, `task_mode` |
| `define_subagent` | `name`, `description`, `agent_config` | Definition written as Markdown |
| `manage_subagents` | `action` in `list`, `kill`, `kill_all`, `conversation_ids` | Subagent states |
| `send_message` | `recipient`, `recipient_name`, `message` | Delivery result |
| `manage_task` | `action`, `task_ids`, `input` | Task states |
| `schedule` | `duration_seconds`, `cron_expression`, `max_iterations`, `timer_condition`, `prompt`, `is_daemon` | `mode`, `outcome`, `iterations`, `cancelled_by`, `fire_time` |
| `finish` | `arguments_json` | `has_result_schema` |
| `list_resources` | `server_name` | Resource list |
| `read_resource` | `server_name`, `uri` | Contents |
| `call_mcp_tool` | `server_name`, `tool_call`, progress fields | `result_string` or `result_uri`, app view |
| `run_workflow` | Script path or inline script, arguments | Phase log, result, background flag |

Registry tools that appear in no documentation and are part of the contract: `enter_plan_mode`,
`exit_plan_mode`, `update_steps`, `update_focus`, `submit_verdict`, `search_transcript`,
`list_directory`, `search_files`, `computer_sandbox_read`, `desktop`, `webview_browser`,
`list_plugin_accounts`, `search_marketplace`, `ask_custom_permission`, `wait`, `notebook_edit`,
`swarm`, `post_message`, `read_board`, `swarm_wait`.

The print-mode `init` event exports 60 tool names. A release must expose the tool list in `init` and
must keep the list stable within a protocol version.

### 6.5 Permission contract

Ten actions exist, each with its own target grammar and match rule.

| Action | Target | Match rule |
|---|---|---|
| `read_file` | Absolute file or directory | The literal path, or everything under a directory |
| `write_file` | Absolute file or directory | Same as `read_file`, and it implies read for that path |
| `read_url` | Domain or `*` | The domain and all subdomains. No path match |
| `execute_url` | Domain or `*` | Same as `read_url` |
| `download_url` | Domain or `*` | Same domain rule, for downloads |
| `command` | Command prefix or `*` | Each token matched as a full word. `git` matches `git add` |
| `unsandboxed` | Command prefix | Retired. Accepted to warn, rewritten to `command` |
| `mcp` | `server/tool`, `server/*`, or `*` | Server and tool name |
| `escalate_admin` | Admin operation | Never auto-approved. Always prompts |
| `custom` | Tool-defined | Tool-owned matcher |

Rules live under `permissions.allow`, `permissions.deny` and `permissions.ask`. Resolution is
positional and total.

1. Build the grant list in the order deny, ask, allow.
2. Sort by the documented precedence order.
3. Return the first match.
4. Deny wins over ask, and ask wins over allow.
5. Peer scope order is project, workspace, global, shared. Project rules are highest. The
   intermediate order is decided here.

Two precedence systems work together. Verdict precedence is positional and comes from the sorted
grant list. Scope precedence is separate and is what `/permissions` shows as "Rules that apply only
to this project (highest priority)". A resolver that implements one and not the other is incomplete.

Grants are scoped `ONCE`, `CONVERSATION`, `WORKSPACE`, `GLOBAL` or `PROJECT`. An admin policy can
raise a ceiling and inject rules. The injected rules are additive, so a user can end up with more
denies than they wrote.

`--dangerously-skip-permissions` skips prompts and keeps explicit denies. Headless runs cannot
prompt, so a required approval becomes an automatic deny recorded in the result.

### 6.6 Sandbox contract

- A sandboxed command runs with the generated policy for the host OS.
- The policy allows the workspace, temporary directories, and network destinations the rules permit.
- Protected paths are denied even when the workspace contains them. This includes credential
  directories such as `~/.docker`, `~/.kube`, `~/.config` and `~/Library/Application Support` on
  macOS.
- A denied network destination surfaces as a message the model can read.
- Leaving the sandbox requires explicit approval with the text "Confirm the command is safe to run
  outside of the sandbox with full network and disk access."
- A command that mixes safe and unsafe parts must be split. `BypassSandbox` applies to the whole
  command or not at all.
- `disable_sandbox_bypass` and the `BypassSandbox` setting can forbid escapes.

### 6.7 MCP tools

Two transports are supported: local stdio and remote streamable HTTP. A legacy HTTP plus SSE
transport is not a client mode. Standalone SSE inside streamable HTTP exists and can be disabled per
server with `disableStandaloneSse`.

Configuration layers: global `~/.it-aint-gravy/config/mcp_config.json` and per-plugin `mcp_config.json`
or `mcp.json`. A workspace `.agents/mcp_config.json` layer does not exist. It is a non-goal for
Release 1.

Server keys form a closed set. The authoritative set includes `command`, `args`, `env`, `cwd`,
`url`, `headers`, `authProviderType`, `oauth`, `disabled`, `enabledTools`, `disabledTools`,
`toolConfig`, `timeoutSeconds`, `skipToolNamePrefix`, `skipToolDescriptionPrefix`,
`strictArgumentValidation`, `omitFromSystemPrompt`, `forceAllToolsEager`, `disableStandaloneSse`,
`variables`, `serverIndex`. An unknown key is ignored with a suggestion, for example
`unknown field "httpUrl" is ignored (did you mean "url"?)`.

Tools are discovered at connect time. Each tool gets a permission id of the form `mcp:<server>:<tool>`.
Per-tool config controls lazy or eager loading and background execution. MCP servers can authenticate
with OAuth, with credentials, or with static headers. Credentials are minted per plugin and revoked
through the daemon.

### 6.8 Subagent contract

- A subagent is a separate conversation with its own step list and its own model choice.
- Default maximum nesting depth is 10. Exceeding it fails with `maximum subagent nesting depth (%d)
  exceeded`.
- Model tiers are `inherit`, `lite`, `fast`, `pro`, or a named model.
- Workspace modes are `inherit`, `branch`, `share`, `workspace_uri`. A branch mode uses a git
  worktree.
- Message delivery strategies are chosen per agent. A parked agent costs nothing and wakes on a
  message or on a board event.
- States are `ALIVE`, `KILLED`, plus runtime `waiting`, `working` and `stopped`.
- Killing an agent is permanent. Its name stays reserved in the swarm roster.
- A subagent's context does not enter its parent except through a tool result, a message or a
  summary.

### 6.9 Hook contract

Six events: `SessionStart`, `PreInvocation`, `PostInvocation`, `Stop`, `PreToolUse`, `PostToolUse`.
Two handler kinds: `command` and `prompt`. HTTP handlers do not exist.

```jsonc
{
  "<hook-name>": {
    "enabled": true,
    "SessionStart":   [{"type": "command", "command": "…", "timeout": 30}],
    "PreInvocation":  [{"type": "prompt", "prompt": "…", "model": "inherit"}],
    "PreToolUse":     [{"matcher": "run_command|view_file",
                        "hooks": [{"type": "command", "command": "…", "timeout": 5}]}],
    "PostToolUse":    [{"matcher": ".*", "hooks": [{"type": "command", "command": "…"}]}]
  }
}
```

Input is JSON on stdin. The common block carries `conversationId`, `workspacePaths`,
`transcriptPath`, `artifactDirectoryPath`, `executionId`, `modelName`, `isBattleMode`,
`lastUserInput`, `agentName`, `parentConversationId`, `callerContext`, `rootConversationId`,
`hookEventName`, `cwd` and `trajectorySource`. Tool hooks add `toolCall{name, args, id}`. Stop hooks
add `executionNum`, `terminationReason`, `error`, `fullyIdle`, `finalModelOutput` and
`continuationActive`.

Output is JSON on stdout.

| Event | Accepted output |
|---|---|
| `PreToolUse` | `decision` in `allow`, `deny`, `ask`, `force_ask`, `deny_unless_prior_grant`; `reason`; `permissionOverrides[]`; `overwrite` |
| `PostToolUse` | `overwriteResult` |
| `SessionStart` | `injectSteps[]` |
| `PreInvocation` | `injectSteps[]`, `terminationBehavior` in `""` or `terminate` |
| `PostInvocation` | Same as `PreInvocation`, plus `forceContinue` |
| `Stop` | `decision` in `stop`, `continue`, `block`, with `reason` |

Handler rules:

- A handler must set exactly one of `command` or `prompt`.
- `type: prompt` is rejected for `PostToolUse`.
- A prompt hook `model` is one of `inherit`, `fast`, `pro`, `lite`.
- A command hook inherits `GRAVY_CONVERSATION_ID`, `PLUGIN_ROOT` and `PLUGIN_DATA`.
- A timeout kills the whole process group.
- Hook output has one encoding: camelCase for every event and handler kind.
- An invalid handler is rejected on its own. The rest of the file loads, with the file and line
  reported.
- Hooks run synchronously and block the agent loop.

### 6.10 Tool inventory

| Group | Names |
|---|---|
| Files and search | `view_file`, `view_content_chunk`, `view_file_outline`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `list_directory`, `search_files`, `grep_search`, `find_by_name`, `notebook_edit`, `write_blob`, `move`, `delete_directory` |
| Execution | `run_command`, `read_terminal`, `send_command_input`, `wait`, `lint_diff` |
| Web | `read_url_content`, `search_web`, `webview_browser` plus the browser step family |
| Delegation | `invoke_subagent`, `define_subagent`, `manage_subagents`, `send_message`, `submit_verdict`, `search_transcript` |
| Swarm | `swarm`, `post_message`, `read_board`, `swarm_wait` |
| Planning | `enter_plan_mode`, `exit_plan_mode`, `update_steps`, `update_focus` |
| Media | `generate_image`, `clipboard` |
| MCP | `call_mcp_tool`, `list_resources`, `read_resource` |
| Workflow | `run_workflow` |
| Permission | `ask_permission`, `ask_custom_permission` |
| Plugin | `list_plugin_accounts`, `search_marketplace` |
| Data | `code_search`, `trajectory_search`, `tool_search`, `notify_user`, `git_commit`, `computer_sandbox_read`, `desktop` |

Every step type value is matcher-visible through the derivation rule, so the name set is a
superset of the registry.

## 7. Session lifecycle

### 7.1 Process lifecycle

| Phase | Action | Failure behaviour |
|---|---|---|
| 1 | Route hidden entry points | Falls through to the CLI |
| 2 | Auth action if requested | Exits with the auth error |
| 3 | Background update check | Update stages, applies on restart |
| 4 | Launch mode selection | Usage error, exit 2 |
| 5 | Daemon spawn | Fatal error with the log path |
| 6 | Auth ensure | `auth_required` until sign-in completes |
| 7 | Model resolve | Fatal error listing valid ids |
| 8 | Session create or resume | New conversation on a missing id |
| 9 | Turn loop | Result event per turn |
| 10 | Shutdown | Flush trajectory, release lock, stop daemon |

The updater runs first by design. A release must keep the update invisible to the current run and
must apply it on the next start.

### 7.2 Conversation identity and persistence

A conversation is a UUID. It is created before the first model call and written to
`conversations/<uuid>.db` before the first assistant step is emitted.

Per-conversation tables: `steps`, `trajectory_meta`, `trajectory_metadata_blob`,
`parent_references`, `battle_mode_infos`, `gen_metadata`, `executor_metadata`. The summaries database
holds `conversations_fts`, an FTS5 virtual table over conversation chunks with workspace, project and
title columns.

A conversation holds a presence lock in `presence/<uuid>.lock`. The lock is advisory. A stale lock is
recovered on startup. Two processes may not own the same conversation for writing at the same time.

Conversation identity fields are stable across resume: conversation id, project id, workspace
directories, created time, parent conversation for a fork, and the transcript path.

### 7.3 Turn lifecycle

1. Input is accepted, trimmed and normalized. Empty input is rejected.
2. Session start hooks run once per session.
3. Pre-invocation hooks run. They may inject steps, terminate the turn, or fail.
4. The context is assembled from rules, skills, history and implicit context.
5. The model streams a response. Text deltas and thinking deltas are steps.
6. Tool calls are validated, permission-checked, executed and recorded.
7. Pre-tool hooks run before execution. Post-tool hooks run after and may overwrite the result.
8. The loop repeats until the model stops calling tools or a limit applies.
9. Stop hooks decide whether to continue. Goal mode uses this to keep a turn loop alive.
10. A result event is emitted. Exactly one result event per turn.

Termination reasons are `NO_TOOL_CALL`, `MAX_INVOCATIONS`, `MAX_FORCED_INVOCATIONS`,
`MAX_TOKEN_BUDGET_EXCEEDED`, `ERROR`, `USER_CANCELED`, `TERMINAL_STEP_TYPE`,
`TERMINAL_CUSTOM_HOOK`, `INJECTED_RESPONSE`.

### 7.4 ACP session state machine

```
Absent
  | session/new, session/resume
  v
Creating --fail--> LoadFailed
  | success
  v
Ready --session/prompt--> Busy(turnGen) --result--> Ready
  |                          | session/cancel
  |                          v
  |                        Cancelling --> Ready
  | session/load (replays history, then Ready)
  | session/close
  v
Closed
```

Rules:

- `initialize` returns protocol version 1, `loadSession`, `promptCapabilities{image, audio:false,
  embeddedContext}`, `sessionCapabilities{resume, close, load, list, additionalDirectories}`,
  `auth{logout}`, `_meta.cli{tier, systemPrompt.append}` and four auth methods.
- `session/new` returns a session id, `models.availableModels`, `modes.availableModes`,
  `configOptions` for `model`, `thought_level` and `mode`, and `_meta.cli.tier`.
- `session/load` replays history before it returns. It must fail with `-32002` for an unknown
  session and must not reply before replay finishes.
- `session/close` on an unknown session returns `-32002`.
- `session/cancel` is idempotent. After it returns, no turn for that session remains `RUNNING`.
- A second `session/prompt` while a turn is active is queued or refused, never run concurrently.
- `session/new` before sign-in completes returns `-32000 "Authentication required"`. Clients must
  serialize on sign-in.
- Unknown methods return `-32601`. Internal failures return `-32603`.
- Every capability key is emitted once.
- `fs/read_text_file` and `terminal/*` are not implemented. The agent uses its own tools.

### 7.5 Headless session lifecycle

One process serves one session. `init` is emitted once, before the first turn. Each stdin line is one
turn. EOF ends the process after the current turn. A per-turn `result` event ends the turn.

The accepted stdin grammar is closed.

```jsonc
{"event": "user", "message": { /* content blocks */ }}
```

Rejections:

| Input | Result |
|---|---|
| No `event` field | `stream input message is missing the "event" field` |
| `event` not `user` | `stream input message event %q is not supported yet` |
| `event` is `control_request` | Recognised and refused |
| `user` without `message` | `stream input "user" message is missing the "message" field` |
| Empty prompt after trim | `Error: empty prompt. Usage: gravy --print "your prompt here"` |
| Non-text content block | Rejected |

Output events are `init`, `step_update` and `result`. The step discriminator is `step_type`, not
`step_kind`. `step_update` carries `text_delta`, `tool_info`, `subagent_info`, `duration_seconds` and
`step_index`. `result` carries `conversation_id`, `status`, `response`, `error`, `duration_seconds`,
`num_turns`, `usage{input_tokens, output_tokens, thinking_tokens, cache_read_tokens, total_tokens}`,
`finished_reason`, and optional `structured_output` and `json_schema`.

Result status values are `SUCCESS`, `ERROR`, `FATAL`, `INVALID`, `WAITING` and `RUNNING`. There is no
`CANCELED` or `INTERRUPTED` status. `finished_reason` is `print_timeout`, `error` or `interrupted`.

`--print-timeout` ends a turn with a partial result and `finished_reason: "print_timeout"`.
`--json-schema` validates the final structured output. The schema root must be a JSON object with
`type: object`.

### 7.6 Subagent lifecycle

```
Defined -> Spawned -> Alive(working) <-> Alive(waiting)
                          |                   |
                          +------ kill -------+--> Killed
                          |                   |
                    task complete ------> Stopped
```

A parked agent is asleep on the board. A message, a board event or a parent wake moves it back to
`working`. A stopped agent can be resumed by a new turn. A killed agent cannot. Nesting beyond 10
fails the spawn.

### 7.7 Scheduled task lifecycle

A schedule is created by the `schedule` tool, not by a TUI command. Fields are `duration_seconds`,
`cron_expression`, `max_iterations`, `timer_condition`, `prompt` and `is_daemon`. Exactly one of
duration or cron is required. `max_iterations` cannot be combined with a duration. `timer_condition`
cannot be combined with cron.

States are pending, firing, completed and cancelled. A firing task sends a notification whose prompt
wakes the agent. The agent ends its turn to wait. Recurring cron schedules fire at a stable
per-schedule offset inside their period, not on the exact boundary. `/tasks` lists state, duration
and a kill action.

### 7.8 Remote control and remote agent lifecycle

Remote control has two modes. Attached mode starts with `--remote-control` or `/remote-control on` and
ends with the terminal session. Daemon mode starts with `gravy remote-control start`, registers a
launchd job on macOS, and survives the terminal.

The browser client is served by the CLI at `/remote-control`. It uses WebRTC with DTLS channel binding
for the mesh transport. Approvals reuse `session/request_permission`. `/remote-control off` and closing
the page end the session.

Remote agents execute on the server. The client resolves a project, opens a remote conversation and
streams remote-agent events. Local paths are replaced by a remote workspace. `-c` and
`--conversation` resume a remote conversation. A local conversation is refused.

### 7.9 Compaction and context

Compaction summarizes history when the context crosses a threshold. The threshold comes from
`GRAVY_CLI_AUTO_COMPACT_OVERRIDE`, which accepts an integer token count, `K` or `M` shorthand, or a
percentage. `/compact` compacts on demand. `/context` shows usage. Compaction keeps tool declarations
so the model provider reuses the cached prompt prefix, and it keeps subagent identity, role and result
rather than full subagent prompts.

Long sessions keep recent steps in memory and reload older steps from disk on demand. A step header
load failure is logged with the trajectory, conversation, step count and whether the step was
ephemeral.

### 7.10 Resume, fork and rewind

| Operation | Command | Effect |
|---|---|---|
| Continue latest | `-c` or `--continue` | Opens the most recent conversation |
| Resume by id | `--conversation <id>` | Opens that conversation. A missing id warns and ignores the flag |
| Browse and resume | `/resume`, aliases `/switch`, `/conversation` | Picker |
| Clear | `/clear`, alias `/new` | New conversation |
| Fork | `/fork [project_id]` | Branches at the current point, optionally into another project |
| Rewind | `/rewind`, alias `/undo` | Moves the conversation back to an earlier message |
| Rename | `/rename` | Sets the conversation title |
| Restore | ACP `session/load` and `session/resume` | Replays history to the client |

A fork is a new conversation with a parent reference. A cross-project fork requires a supported VCS
and fails otherwise.

### 7.11 Failure, cancellation and recovery

| Failure | Required behaviour |
|---|---|
| Model call fails | Retry with backoff on transport errors, then a result with `status: "ERROR"` |
| Content safety block | One visible refusal. No silent unbounded retry |
| Tool timeout | Result `timeout`, process group killed |
| Hook failure | Logged. The tool result is preserved. A PostToolUse failure must not fail the tool |
| Sandbox denial | Readable message to the model. No retry loop |
| Daemon crash | CLI reports the log path. Session state is recovered from the database |
| Conversation lock held | Second process opens read-only or refuses with a message |
| Update interrupted | Staged update is discarded. Previous executable stays |
| Auth expired | `auth_required` until sign-in. No partial turn |
| Client disconnect in ACP | Turn is cancelled and the session is marked detached |
| Process kill during a turn | On restart the turn is not resumed. The last completed step is the resume point |

## 8. Release scope

### 8.1 In scope

- Every requirement in this document.
- All four command namespaces, including the hidden `agentapi` entry point.
- Three driver modes at minimum: interactive, print with stream JSON, ACP over stdio.
- macOS arm64, Linux arm64 and Windows x64 builds from one source version.
- The permission and sandbox model, including the four sandbox policies.
- The hook, MCP, skill, rule, agent and plugin extension points.
- Conversation persistence, resume, fork, rewind and compaction.
- Telemetry with an off switch and an admin lock.

### 8.2 Deferred and excluded

| Item | Why |
|---|---|
| Plugin marketplace publishing | No publish verb or submit path exists |
| An inventory-only image model | Not in the catalog. The catalog has three image ids, two production and one preview |
| MCP connection log view | No log surface exists |
| Editor-specific ACP clients | The agent is generic. Each editor decides |
| Server-side remote-agent tier gating | Entitlement is a server field |
| Wire-level model to provider routing | Only partly defined |
| Linux and Windows runtime execution | Static verification only |
| Workspace `.agents/mcp_config.json` | No reader is specified |
| Automatic task decomposition by code | Decomposition is a coordinator prompt and a role, not a function |
| Embedded Python | The resolver uses an external interpreter |

### 8.3 Gated features

`teamwork`, `boost`, `deepagent`, `review-agent` and `browser-vision` ship behind runtime flags. A
release must compile them, must keep them out of a default session, and must turn them on only
through the documented gate. Best-of-N is compiled and cycled by `shift+tab`, but it is not advertised
in the ACP `modes` array. Acceptance for these features is the gate contract, not the default-session
surface.

## 9. Acceptance criteria

Each criterion names a check that produces a pass or a fail. A check may be a command, a test fixture
under `conformance/`, or a static assertion over the build. The release passes only when every
criterion passes on every shipped platform, or is marked platform-exempt with a reason.

| ID | Criterion | Check |
|---|---|---|
| AC-1 | The executable reports its version and build identity | `gravy --version` prints a semver. `gravy --version` exits 0 |
| AC-2 | Help lists every supported flag and subcommand | Diff `gravy help` and `gravy --help` against §4.3. Every non-hidden flag and every subcommand is listed. No listed item fails to parse |
| AC-3 | All 13 subcommand tokens dispatch | Invoke each with `--help`. `agent` and `agents` share a handler. `plugin` and `plugins` share a handler |
| AC-4 | Hidden entry points behave as specified | `gravy agentapi --help` lists three verbs. `gravy multicall` and `gravy plugin-cli` fail |
| AC-5 | Visible and hidden flags parse with the documented types | Table-driven test over §4.3, including repeatable `--add-dir` and enum rejection for `--mode` and `--effort` |
| AC-6 | Invalid input fails before a model call | Unknown flag exits non-zero. Invalid enum prints the valid set. `--input-format stream-json` without stream output exits non-zero |
| AC-7 | Settings load with the documented precedence | 33-key fixture parses. `--settings` object overrides the file for one session and is not persisted. A non-object exits non-zero |
| AC-8 | Session command resolution is total and deterministic | 48 terminal names, 14 system names, dynamic skills. Aliases resolve. `models` is reserved. A duplicate skill is refused |
| AC-9 | A default session advertises its command set | ACP `available_commands_update` matches the workspace's expected set. No gated command appears |
| AC-10 | Print mode emits text and exits correctly | `gravy -p "…"` writes text to stdout, diagnostics to stderr, exit 0 |
| AC-11 | `init` is emitted once and carries the full context | Exactly one `init` per process. Carries `conversation_id`, `model`, `effort`, `agent`, `cwd`, `tools[]`, `permission_mode` |
| AC-12 | The stream input grammar rejects every unsupported shape | Six rejection fixtures from §7.5. Each produces its documented message and no turn |
| AC-13 | The result envelope is complete | Status, usage, `finished_reason`, structured output when a schema is supplied. Every turn emits exactly one result |
| AC-14 | ACP handshake matches the contract | Version 1, all capabilities, four auth methods, four modes, three config options. No duplicate keys |
| AC-15 | ACP session operations converge | `new`, `prompt`, `cancel`, `load`, `resume`, `list`, `close`. Cancel is idempotent. A second prompt does not run concurrently |
| AC-16 | ACP error codes are stable | `-32601` unknown method, `-32002` unknown session, `-32000` unauthenticated, `-32603` internal. `close` on an unknown session returns `-32002` |
| AC-17 | The daemon is localhost-only and CSRF-gated | Two random ports. `/healthz` 200. An RPC without CSRF returns 401. No route binds off-host |
| AC-18 | Permission resolution is pure and total | Table test over 10 actions, 3 verdicts and 5 scopes. Deny beats allow. `escalate_admin` always prompts. `unsandboxed` warns with the rewrite |
| AC-19 | The sandbox reports what happened | Every `run_command` result carries `ran_in_sandbox` and `sandbox_errors`. A denial is readable. An escape requires approval |
| AC-20 | Hooks implement the full contract | Six events, two handler types, five `PreToolUse` decisions, `overwriteResult`, anchored matchers, process-group kill on timeout |
| AC-21 | MCP connects, lists tools and enforces permissions | stdio and streamable HTTP servers. Tool ids of the form `mcp:server:tool`. OAuth flow completes. Unknown key warns with a suggestion |
| AC-22 | Sessions persist and resume after a kill | Kill the process mid-turn. Resume the conversation. The last completed step is present and the partial turn is not claimed |
| AC-23 | Compaction honours the override grammar | Integer, `K`, `M` and percentage forms. `/context` reflects the threshold. `/compact` runs on demand |
| AC-24 | Subagents are isolated and bounded | Two subagents with separate conversations. Depth 11 fails. A kill is final. A parked agent wakes on a message |
| AC-25 | Model and effort resolution fails closed | Suffixed id plus `--effort` conflicts. A model without effort control plus effort fails. An unknown id lists valid ids |
| AC-26 | Telemetry obeys its controls | `--disable-telemetry` stops emission. An admin lock prevents enabling. Payloads carry a hashed identifier and no content for enterprise sign-in |
| AC-27 | Three platforms build from one version | macOS arm64, Linux arm64, Windows x64. Each build passes AC-1 to AC-6. Sandbox mechanism differs by platform and is reported |
| AC-28 | The status line contract holds | A fixture command receives a JSON object on stdin. Throttle, timeout and auto-disable match §4.11. `/statusline delete` restores the built-in line |
| AC-29 | The full conformance suite passes | Every criterion in this table passes on every shipped platform, and the fixture set covers every public command and protocol message |

### 9.1 Conformance suite

The suite needs three drivers and one fixture set.

| Driver | Talks to | Covers |
|---|---|---|
| Process | The executable | Flags, exit codes, help, version, settings |
| Stdio | `gravy acp` and `gravy --input-format stream-json` | Handshake, events, error codes, grammar |
| HTTP | The daemon on its reported HTTP port | CSRF, `/healthz`, route table |

Fixtures are stored as JSON. A fixture holds the request bytes, the expected response bytes and the
comparator. Comparators normalize volatile fields: UUIDs, timestamps, ports, durations and token
counts. Every fixture names its acceptance criterion.
