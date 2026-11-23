# It Ain't Gravy CLI architecture contract

Release 1. Companion to `product-spec.md`. The product specification says what the product does.
This document says which component owns each behaviour, which shapes cross each boundary, and which
invariants a change must not break.

A contract clause is binding when it carries **MUST**, **MUST NOT** or **SHOULD**, and every
invariant in §7 is binding without a keyword. Every clause is normative, or is marked **DECIDED**
where the design leaves a question open and this contract picks one answer.

## 1. Contract terms

| Term | Meaning |
|---|---|
| Surface | A process entry point that accepts input and produces output: terminal, print, ACP, agent API, remote control, MCP host |
| Runtime | The agent loop that turns a prompt into steps, tool calls and a result |
| Daemon | The local language server that owns auth, model catalog, MCP connections, plugins and indexing |
| Session | One conversation bound to one client, with at most one active turn |
| Step | One recorded unit of a trajectory: input, model text, thinking, tool call, tool result, checkpoint |
| Extension | A skill, agent, rule, hook, plugin, workflow or MCP server loaded from disk |
| Conformance | Passing every acceptance criterion in `product-spec.md` §9 |

Conformance requires two things. The observable behaviour matches the product specification. The
internal boundaries match this document, checked by the structural tests in §12.

## 2. Layer model

```
cmd/                      process entry, flags, dispatch only
  |
surfaces/                 terminal, print, acp, agentapi, remote-control, mcp host
  |            \
runtime/       daemon client
  |            |
  |          daemon/  ---- auth store, model catalog, mcp, plugins, index, vcs
  |
  +-- tools/ ------------ sandbox/ (leaf)
  +-- permissions/ (pure)
  +-- trajectory/ (storage)
  +-- model gateway/ ---- transports/ (http+sse, grpc, vendor SDKs)
  +-- extensions/ (loader, read-only)
```

**C-1** Dependencies point downward only. A lower layer MUST NOT import a higher layer. The runtime
MUST NOT import a surface. The daemon MUST NOT import the terminal.

**C-2** `cmd/` holds flag definitions and dispatch. It MUST NOT hold product logic. Every flag maps
to a typed value passed inward.

**C-3** A surface MUST NOT implement tool execution, model calls, permission decisions, MCP
connections or persistence. It renders events and sends commands.

**C-4** The daemon is an authority for state that must be shared across processes: credentials, model
catalog, MCP sessions, plugin state, index. It MUST NOT own the prompt, the keyboard or the render.

**C-5** `sandbox/` is a leaf. It depends on the host OS only. Tool executors call it through one
interface. Nothing else may spawn a sandboxed process.

**C-6** `permissions/` is pure. It MUST NOT perform IO, read settings, inspect the filesystem or call
a model. It receives a resolved grant list and a request, and returns a decision.

**C-7** Transport codecs know bytes, not tools. A codec MUST NOT import the tool registry or the
session manager.

## 3. Component responsibilities

| Component | Owns | Must not own |
|---|---|---|
| Entry point | Flag parsing, mode selection, exit codes, updater launch | Session state, tool policy |
| Terminal surface | Input editing, rendering, keybindings, panels | Conversation writes, model calls |
| Print surface | NDJSON framing, result envelope, timeout, exit code | Rendering, interactive prompts |
| ACP surface | JSON-RPC framing, session handles, capability negotiation, permission round-trips | Tool policy, model routing |
| Agent API | Local HTTP verbs with CSRF, conversation metadata | Auth decisions |
| Remote control | WebChannel, WebRTC mesh, browser asset serving | Conversation logic |
| Session manager | Conversation identity, locks, turn admission, cancellation | Model transport details |
| Runtime | Turn loop, step recording, hook dispatch, tool orchestration, stop conditions | Surface formatting, credential storage |
| Tool registry | Tool schema, name, required permissions, executor binding | Permission resolution, sandbox policy |
| Command registry | Name, alias, argument hint, visibility, resolution order | Executing the command |
| Permission engine | Grant parsing, precedence, match, decision | Reading files, prompting the user |
| Sandbox | Policy generation, process launch, denial reporting | Deciding whether to sandbox |
| Extension loader | Discovery, parse, validate, precedence, budgets | Executing extension code |
| Model gateway | Model resolve, effort resolve, streaming, retry, usage accounting | Permission decisions, conversation writes |
| Trajectory store | Durable steps, metadata, summaries, lazy load | Rendering, summarisation policy |
| Credential store | Token read and write, keyring plus file fallback, migration | Feature entitlement |
| Telemetry | Event assembly, redaction, transport, opt-out | Product decisions |

The command registry is the only place that resolves a session command name. It MUST merge the
terminal registry, the system prompt registry, skills and workflows into one result. The order is
reserved names, terminal commands, system commands, skills, workflows. **DECIDED** on the order
between terminal and system commands. A skill cannot shadow an existing command, and workflow claims
hide legacy workflow commands.

## 4. Core data shapes

The shapes below are the contract. Field names match the wire where one exists. A field marked
optional may be absent. Unknown fields on input are ignored with a warning.
Payload types that a tool or hook schema owns (`UserInput`, `AgentResponse`, `Checkpoint`,
`SystemMessage`, `ToolInfo`, `SubagentInfo`, `InjectedStep`, `PermissionDenial` and the content parts)
are defined by those schemas in §6 and are not repeated here.

```ts
type PermissionMode = "default" | "accept-edits" | "auto" | "plan";
type ConversationId = string;   // UUID, stable for the life of the conversation
type StepIndex = number;         // monotonic within a conversation
type TurnGen = number;           // increments per admitted turn

interface Conversation {
  id: ConversationId;
  projectId: string;
  workspaceDirs: string[];       // absolute, ordered
  createdAt: string;             // RFC 3339
  parentId?: ConversationId;     // set by fork
  title?: string;
  model?: string;
  mode: PermissionMode;
}
```

A conversation is created before the first model call. `workspaceDirs[0]` is the primary workspace
and the anchor for relative paths and rule discovery.

```ts
type StepType =
  | "user_input" | "agent_response" | "thinking" | "tool_call" | "tool_result"
  | "checkpoint" | "system_message" | "command_output" | "subagent_result";

interface Step {
  index: StepIndex;
  type: StepType;
  startedAt: string;
  durationMs?: number;
  status: "RUNNING" | "SUCCESS" | "ERROR" | "FATAL" | "INVALID" | "WAITING";
  payload: UserInput | AgentResponse | ToolCall | ToolResult | Checkpoint | SystemMessage;
}
```

A step's status is the only success signal. There is no separate `ok` boolean. A step that is not
terminal keeps `RUNNING`. A tool call and its result are separate steps so a crash between them is
representable.

```ts
interface ToolCall {
  id: string;                    // stable, echoed to hooks and results
  name: string;                  // canonical model-facing name
  args: unknown;                 // validated against the tool schema
  requiredPermissions: PermissionRequest[];
}

interface SandboxReport {
  ranInSandbox: boolean;
  sandboxErrors: string;         // empty when clean
}

interface ToolResult {
  callId: string;
  outcome: "ok" | "error" | "denied" | "timeout";
  content: Array<TextPart | JsonPart | ImageRef | FileRef | DiffPart>;
  sandbox?: SandboxReport;       // required for command execution
  error?: { code: string; message: string; retryable: boolean };
  denials?: PermissionDenial[];
  truncated?: boolean;
}
```

**C-8** A command result MUST carry `sandbox`. A result without it is a contract violation, not a
default.

**C-9** A truncation MUST set `truncated` and MUST NOT count the full payload against the context
budget.

```ts
type PermissionAction =
  | "read_file" | "write_file" | "read_url" | "execute_url" | "download_url"
  | "command" | "unsandboxed" | "mcp" | "escalate_admin" | "custom";

interface PermissionRequest {
  action: PermissionAction;
  target: string;                // absolute path, domain, command prefix, server/tool
  toolName: string;
  callId: string;
  reason?: string;
}

interface PermissionGrant {
  action: PermissionAction;
  target: string;
  verdict: "allow" | "ask" | "deny";
  scope: "ONCE" | "CONVERSATION" | "WORKSPACE" | "GLOBAL" | "PROJECT";
  source: "settings" | "conversation" | "hook" | "admin" | "builtin";
}

interface PermissionDecision {
  verdict: "allow" | "ask" | "deny";
  matched: PermissionGrant | null;
  scope: PermissionGrant["scope"] | null;
  reason:
    | "rule" | "hook_deny" | "hook_force_ask" | "hook_force_ask_unattended"
    | "hook_deny_unless_prior_grant" | "hook_auto_approve"
    | "always_proceed" | "auto" | "no_match";
}
```

The decision is the only thing a caller may branch on. A caller MUST NOT re-implement matching.

```ts
interface ModelRef {
  id: string;                    // concrete served id, never a display name
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

interface SessionHandle {
  sessionId: string;             // protocol-level id, distinct from conversation id
  conversationId: ConversationId;
  turnGen: TurnGen;
  state: "creating" | "ready" | "busy" | "cancelling" | "closed" | "load_failed";
  detached: boolean;
}
```

`sessionId` and `conversationId` are different identifiers and MUST NOT be used interchangeably. A
client resumes by `sessionId`, and the store keys by `conversationId`.

```ts
type Event =
  | { event: "init"; conversation_id: ConversationId; init: InitPayload }
  | { event: "step_update"; step_type: StepType; step_index: StepIndex;
      text_delta?: string; tool_info?: ToolInfo; subagent_info?: SubagentInfo;
      duration_seconds: number }
  | { event: "result"; result: ResultPayload };

interface InitPayload {
  model?: string;                // present when pinned
  effort?: string;               // tightening T2
  agent?: string;                // tightening T2
  cwd: string;
  tools: string[];
  permission_mode: string;
}

interface ResultPayload {
  conversation_id: ConversationId;
  status: "SUCCESS" | "ERROR" | "FATAL" | "INVALID" | "WAITING" | "RUNNING";
  response: string;
  error: string;
  duration_seconds: number;
  num_turns: number;
  usage: { input_tokens: number; output_tokens: number; thinking_tokens: number;
           cache_read_tokens: number; total_tokens: number };
  finished_reason: "print_timeout" | "error" | "interrupted" | "";
  structured_output?: unknown;
  json_schema?: unknown;
}
```

The event set is closed per protocol version (INV-8).

```ts
interface HookInvocation {
  hookEventName: "SessionStart" | "PreInvocation" | "PostInvocation" | "Stop"
                 | "PreToolUse" | "PostToolUse";
  conversationId: ConversationId;
  workspacePaths: string[];
  transcriptPath: string;
  cwd: string;
  modelName: string;
  toolCall?: { name: string; args: unknown; id: string };
  // event-specific fields follow
}

interface HookOutcome {
  decision?: "allow" | "deny" | "ask" | "force_ask" | "deny_unless_prior_grant"
            | "stop" | "continue" | "block";
  reason?: string;
  permissionOverrides?: PermissionGrant[];
  injectSteps?: InjectedStep[];
  overwriteResult?: string;
  terminationBehavior?: "" | "terminate";
  forceContinue?: boolean;
}
```

## 5. Authority and ownership

| State | Authority | Everyone else |
|---|---|---|
| Credentials and tokens | Credential store in the daemon | Reads through one interface. Never logs, never echoes |
| Model catalog | Daemon, from `FetchAvailableModels` | Selects only from the served list |
| Entitlement and quota | Server | Displays and retries. Never gates a feature on a guessed tier |
| Conversation content | Trajectory store, one writer per conversation | Reads through the store |
| Permission rules | Settings plus admin policy, resolved per session | Consumes a `PermissionDecision` |
| MCP sessions | Daemon | Calls tools through the registry |
| Plugin and skill state | Extension loader | Asks the loader for the resolved set |
| Turn admission | Session manager | Sends commands, never mutates state |
| Admin policy | Local policy file, validated at load | Applies the ceiling. Invalid policy blocks sign-in |

**C-10** A component MUST NOT cache a value owned by another component past the lifetime of its
request, except the model catalog within one session and the permission decision within one tool call.

**C-11** Entitlement MUST NOT be inferred on the client. A refusal is a server response or a missing
capability. A client that cannot see a capability MUST behave as if the capability is absent, not as
if the user is ineligible.

## 6. Interface contracts

### 6.1 Command line to daemon

- Transport is Connect RPC over HTTPS on a random localhost port, with a second plain HTTP port.
- The client passes a CSRF token. A request without it fails with `401` and the message
  `unauthenticated: missing CSRF token`.
- `/healthz` returns `200` with `{"instanceId": string, "status": "ok"}`.
- The daemon registers only localhost listeners. A listener bound to another interface is a defect.
- The route table is closed. Every advertised route resolves. `/metrics` MUST be registered or the
  string removed.
- Method paths are fully qualified, for example `/rpc/<Service>/<Method>`.
- A version mismatch between CLI and daemon MUST fail the request with a version error, not a parse
  error.

### 6.2 Agent loop events

- The model gateway emits text deltas, thinking deltas, tool calls and usage.
- The runtime converts each into a step before it emits an event.
- A tool call is recorded as `tool_call` before execution and `tool_result` after.
- Usage is accumulated per turn and reported once in the result.
- A transport error retries with backoff. A safety block does not retry indefinitely.
- Cancellation closes the stream and produces `finished_reason: "interrupted"`.

### 6.3 ACP

| Method | Direction | Notes |
|---|---|---|
| `initialize` | client to agent | Returns protocol 1, capabilities, auth methods, agent info |
| `authenticate` | client to agent | Method id plus `_meta.apiKey` where relevant |
| `logout` | client to agent | Clears stored credentials |
| `session/new` | client to agent | Returns session id, models, modes, config options, tier meta |
| `session/load` | client to agent | Replays history before returning |
| `session/resume` | client to agent | Reattaches without a full replay |
| `session/list` | client to agent | Returns sessions and advertised commands |
| `session/close` | client to agent | Idempotent for a known session |
| `session/prompt` | client to agent | One active turn per session |
| `session/cancel` | client to agent | Idempotent |
| `session/update` | agent to client | Streamed steps and `available_commands_update` |
| `session/request_permission` | agent to client | Round-trip approval |
| `session/set_model`, `session/set_mode`, `session/set_config_option` | client to agent | Handlers exist |

Error codes: `-32601` unknown method, `-32000` authentication required, `-32002` session not found,
`-32603` internal. `-32602` is the standard invalid-params code and is reserved for schema failures.
An unknown session on `load` or `close` returns `-32002`. A capability key appears once.

`fs/read_text_file` and `terminal/*` are not implemented. A client that needs them supplies its own
tools.

### 6.4 Stream JSON

Input is NDJSON, one object per line. The discriminator is `event`. Exactly one value is accepted,
`user`. Its payload requires `message`. The prompt is trimmed, and an empty prompt is an error. Every
other event is refused with a stable message. `control_request` is refused as unsupported.

Output is NDJSON with exactly `init`, `step_update` and `result`. Field names are snake_case. The step
discriminator is `step_type`.

**C-12** The input grammar MUST be closed. A new accepted event requires a protocol version bump.

### 6.5 Hook channel

- Input is one JSON object on stdin, then EOF.
- Output is one JSON object on stdout, or nothing.
- Diagnostics go to stderr.
- A non-zero exit is a hook failure. A failed hook does not fail the tool it follows.
- `PreToolUse` may block by exit code or by `decision`.
- Timeout kills the process group.
- The encoding is camelCase for every event and every handler kind (T3).

### 6.6 MCP

- The product is an MCP client and host. It is not an MCP server for model tools, except through the
  IDE bridge port.
- Transports are stdio and streamable HTTP. Legacy HTTP plus SSE is not a transport.
- Tool names may be prefixed per server. `skipToolNamePrefix` disables it.
- Each tool gets a permission id `mcp:<server>:<tool>`.
- Resources are exposed as `list_resources` and `read_resource`.
- OAuth is per server, with a code paste flow. Tokens are stored by the credential store.
- A server that fails to connect is `ERROR`, never `READY`. A dead server is removed from the session.
- Unknown configuration keys warn with a nearest-key suggestion.

### 6.7 Model gateway

- Resolution order is explicit id, tier alias, custom model, then the persisted model. An unresolvable
  id fails before the first token. **DECIDED** on the order. Each step exists; the order is fixed
  here.
- `--effort` selects a variant of a base id. A suffixed id plus an effort is a conflict.
- Provider choice is by model family, and the wire path is one of HTTP plus SSE, gRPC, or a provider's
  native responses transport.
- Usage is reported per turn and must reconcile with the provider response within a documented
  tolerance.
- A retry never replays a tool call that already executed.

### 6.8 Sandbox boundary

```
tool executor
  -> policy request {action, target, mode, host}
  -> sandbox driver {darwin seatbelt | linux landlock+userns | windows token+dacl}
  -> process {exit_code, stdout, stderr, timed_out, sandbox_errors}
```

- The driver returns a `SandboxReport` on every command.
- A policy denial is text the model can read.
- An escape requires a permission decision with scope at least `ONCE`.
- The network proxy is a separate enforcement point. CEL decides per proxied request. It MUST NOT be
  presented as the filesystem policy.

### 6.9 Sidecars

- A sidecar is a plugin-owned process, started and stopped by the plugin host.
- It receives `PLUGIN_ROOT` and `PLUGIN_DATA`.
- A sidecar that renders state MUST open the state read-only. Only tools write state.
- A sidecar crash does not fail the session. The restart policy is declared in `sidecar.json`.

## 7. Invariants

Each invariant is falsifiable and has one owner. A change that breaks an invariant is a contract
change, not a bug fix.

| ID | Invariant | Why | Check | Owner |
|---|---|---|---|---|
| INV-1 | One writer per conversation at a time | Two processes would interleave steps and corrupt the trajectory | Acquire `presence/<id>.lock` before the first write. A second writer refuses or opens read-only | Session manager |
| INV-2 | A step is durable before it is emitted | A crash must not lose a step the client already saw | Emit only after the store write returns | Trajectory store |
| INV-3 | A turn has exactly one terminal result | Clients key on the result to end the turn | Count result events per turn. Exactly one | Runtime |
| INV-4 | Permission resolution is pure, total and deterministic | Scattered checks produce bypasses | Property test over 10 actions, 3 verdicts, 5 scopes. Same input, same output, no IO | Permission engine |
| INV-5 | Deny outranks allow at every scope | A narrower allow must not defeat a broad deny | Fixture: global deny plus project allow denies | Permission engine |
| INV-6 | Sandbox truth is in the result | The model cannot reason about a command it cannot classify | Every `run_command` result has `sandbox.ranInSandbox` | Tool executor |
| INV-7 | Secrets stay out of records | Logs, events, hooks and telemetry leave the process | Scan fixtures for token patterns. Zero hits | Credential store |
| INV-8 | The event set is closed per protocol version | Silent additions break strict clients | Schema test rejects an unknown event | Surface owner |
| INV-9 | Extension failure is contained | One bad plugin must not end a session | Load 20 broken extensions. Session still starts. Each failure is reported | Extension loader |
| INV-10 | Extension precedence is total and stable | Nondeterministic loading produces different prompts per run | Same tree, two runs, identical resolved set and order | Extension loader |
| INV-11 | Reserved names cannot be claimed | A skill must not override a product command | Register a skill named `models`. Refused | Command registry |
| INV-12 | Every step boundary is a resume point | A kill must not lose completed work | Kill at each boundary. Resume. All prior steps present | Session manager |
| INV-13 | Compaction preserves the tool contract and delegation identity | Losing tool declarations breaks caching and tool calls | Compact, then call a tool. Tool list and subagent ids survive | Runtime |
| INV-14 | Cancellation converges | A cancelled turn must not keep running | Cancel twice. No step after the second ack. State is not `busy` | Session manager |
| INV-15 | Subagent context does not leak into the parent | Leakage breaks isolation and inflates context | Two subagents with distinct secrets. Parent sees neither, only declared results | Runtime |
| INV-16 | Local interfaces are localhost-only and authenticated | A local port is reachable by any local process | Bind test. Request without CSRF returns 401 | Daemon |
| INV-17 | Model selection resolves before the first token and fails closed | A mid-turn model swap corrupts usage and caching | Invalid model produces a result with no model call | Model gateway |
| INV-18 | Exit status describes transport and result status describes the task | Scripts must be able to trust one signal, and callers must know which | Table test over success, error, denial, timeout, cancel | Print surface |
| INV-19 | Update is atomic and applies on restart only | A failed update must not brick the install | Interrupt a download. Previous executable still runs | Updater |
| INV-20 | Rendering is a pure function of the event stream | A TUI that owns state cannot resume, and a status line that reads the screen cannot be trusted | Replay a recorded event stream. The render matches. The status line payload is built from state, not from the render | Terminal surface |

INV-18 needs a precise rule, because the CLI exits 0 on an `ERROR` result.

| Situation | Result status | Exit code |
|---|---|---|
| Turn completed | `SUCCESS` | 0 |
| Turn completed with tool errors the model handled | `SUCCESS` | 0 |
| Model or config error before a turn | `ERROR` | 0 with a complete result envelope, 1 when the envelope cannot be written |
| Fatal process error | `FATAL` | 3 |
| Invalid request | `INVALID` | 2 |
| Timeout with a partial response | `SUCCESS` with `finished_reason: "print_timeout"` | 0 |
| Interrupted by signal | `SUCCESS` with `finished_reason: "interrupted"` | 0 |
| Approval required and headless | `SUCCESS` plus a denial record | 0 |

The rule is that the exit code describes transport and configuration. The result envelope describes
the task. A caller that needs task success reads `status`.

## 8. Failure and recovery model

| Failure class | Detection | Recovery | Idempotent |
|---|---|---|---|
| Transport error | Socket, HTTP status, stream error | Retry with backoff up to a bound | Yes, if no tool executed |
| Model refusal | Safety block signal | Surface the refusal once. Do not retry unbounded | Yes |
| Tool error | Non-zero exit or thrown error | Result `error`, model decides | Depends on the tool |
| Tool timeout | Deadline | Kill the process group, result `timeout` | Yes |
| Permission denial | Decision `deny` | Result `denied`, model may ask the user | Yes |
| Sandbox denial | Policy violation | Readable error, no automatic retry | Yes |
| Hook failure | Exit code, timeout, invalid JSON | Log, keep the tool result | Yes |
| Extension parse failure | Loader diagnostic | Skip the extension, keep the session | Yes |
| Conversation lock held | Lock file | Read-only view or refusal | Yes |
| Daemon crash | Health check | Restart, re-read state from the store | Yes |
| Client disconnect | Transport close | Cancel the turn, mark detached | Yes |
| Process kill | Startup scan | Resume from the last completed step | Yes |
| Update interrupted | Staged file check | Discard the stage, keep the running executable | Yes |
| Schema migration interrupted | Migration record | Re-run the migration from the last recorded key | Yes |

Two rules govern recovery.

**C-13** A recovery path MUST converge to the same end state as the uninterrupted path. Running the
recovery twice MUST produce the same state as running it once.

**C-14** A recovery path MUST NOT re-execute a side effect that already ran. The record of the side
effect is the source of truth, not the presence of a step.

## 9. Security contract

### 9.1 Trust boundaries

| Input | Trust | Rule |
|---|---|---|
| Model output | Untrusted | Never executed as a command without the tool path and permission check |
| Web page content | Untrusted | Sanitize before it reaches the model. A browser subagent reply is data, not instruction |
| MCP server output | Untrusted | Same treatment as web content |
| Hook stdout | Untrusted | Validate against the event schema. Invalid output is dropped |
| Repository files, rules, skills | Untrusted | A workspace rule cannot raise the permission ceiling |
| Plugin code | Untrusted | Runs with the user's privileges. Validation is advisory. Install requires user action |
| User paste and attachments | Untrusted | Validate media type and size. No implicit execution |
| Settings, admin policy | Trusted, validated | Invalid admin policy blocks sign-in |
| Conversation database | Trusted for integrity | Read-only validation on load |

### 9.2 Rules

- Credentials are read and written only through the credential store. The store tries the keyring,
  records a timeout marker, and falls back to a file. Logout clears both.
- A token MUST NOT appear in a log, an event, a hook payload, a telemetry payload or an error message.
- Telemetry carries a hashed account identifier, a redacted payload and a per-event opt-out. Enterprise
  sign-in never collects prompt content.
- The local daemon binds localhost and requires a CSRF token. A cross-origin request cannot reach it
  without the token.
- URL policy allows `http`, `https` and `about:blank`. Other schemes are refused with a message.
- A hard policy block is un-approvable. The model must tell the user to perform the step.
- Plan mode refuses workspace writes. The refusal names the execution model as the actor.
- `escalate_admin` always prompts, regardless of mode.
- A sandbox escape requires an explicit approval whose text names full network and disk access.
- An untrusted workspace restricts plugins to their rules and skills.

## 10. Extensibility contract

### 10.1 Discovery roots

| Kind | Workspace roots | User roots |
|---|---|---|
| Skills | `.agents/skills/`, `.agents/skills.json` | `~/.it-aint-gravy/config/skills/`, `~/.it-aint-gravy/skills/`, `~/.it-aint-gravy/cli/skills/` |
| Agents | `.agents/agents/`, `.agents/agents.json` | Not proven as a separate user path. Workspace and plugin paths only |
| Rules | `AGENTS.md`, `GRAVY.md`, `.agents/rules/`, `.agents/rules.json` | global config directory |
| Hooks | `.agents/hooks.json` | `~/.it-aint-gravy/config/hooks.json` |
| Plugins | `.agents/plugins/`, `.agents/plugins.json` | `~/.it-aint-gravy/config/plugins/` |
| Workflows | `.agents/workflows/`, `.agents/workflows.json` | global config directory |
| MCP | per plugin only | `~/.it-aint-gravy/config/mcp_config.json` |
| Built-in | extracted to `builtin/` | n/a |

Legacy dot directories `.agent/`, `_agents/` and `_agent/` are also walked. `.agents` is primary.
The rule files `AGENTS.md` and `GRAVY.md` are read from the workspace root and from parent
directories up to the repository root. Global rules come from the user config directory.

### 10.2 Precedence and budgets

**C-15** The loader produces one ordered list per kind. Order is workspace, plugin, user, built-in.
**DECIDED.** Earlier roots win on a duplicate name and workspace rules have the highest priority.
The order above is the contract.

**C-16** A duplicate name is skipped, not merged. The skip is reported.

**C-17** Rules are capped at 24 KB per file and 20,000 tokens per aggregate. An over-budget rule is
replaced by its path and description. Built-in rules are exempt.

**C-18** A skill body over 24 KB is reported by validation. A skill without `name` is named after
its directory with a warning. A skill without `description` loads but is unlikely to be selected.

**C-19** A plugin declares metadata only. Components are discovered from fixed paths: `skills/`,
`agents/`, `rules/`, `hooks.json`, `sidecars/`, `workflows/`, `themes/`. A manifest that lists
components is accepted with warnings and the list is ignored.

**C-20** Plugin install is atomic. Stage, validate, swap, restore on failure. A symlinked plugin
directory is refused.

**C-21** Hook matchers are anchored regular expressions. A matcher that is not a valid expression
never matches and raises a diagnostic.

**C-22** `plugin.json` validation runs the same loader rules as load time. It reports file and line.
`--strict` turns warnings into a non-zero exit.

### 10.3 Extension failure containment

- A broken extension is skipped. The session starts.
- A broken hook file is reported. The rest of the file loads (T4).
- A broken MCP server is `ERROR`. Its tools are absent. The session starts.
- A broken sidecar is restarted up to its policy limit, then left stopped.
- A broken plugin is disabled with a reason. The reason is visible in `plugin list`.

## 11. Compatibility and change rules

**C-23** Version is semantic. A breaking change to a public interface bumps the major or the protocol
version.

**C-24** A protocol change is additive within a version. A new event, field or capability is advertised,
not assumed. A client that does not understand an addition ignores it.

**C-25** Removing a method, event, field or command requires a version bump and a changelog entry.
A removal also needs a compatibility shim for the deprecated name.

**C-26** Capability negotiation replaces environment sniffing. A surface advertises what it supports,
and the other side adapts. The ACP `initialize` exchange is the pattern.

**C-27** Persisted schemas migrate forward only. Each migration records its key in
`state.pbtxt`. A migration is idempotent and safe to re-run.

**C-28** A model id, tool name, permission action or enum value is part of the wire contract. Renaming
one requires a compatibility shim and a deprecation window.

**C-29** Documentation shipped inside the product is generated from the same source as the validator,
or it will drift. When the docs and the loader disagree, the loader wins and the docs are wrong. The
contract requires the loader to be the only authority and the docs to be tested.

## 12. Conformance map

| Acceptance criterion | Invariants it proves | Structural test |
|---|---|---|
| AC-1, AC-2, AC-3 | INV-8 | Process driver, help diff |
| AC-4, AC-5, AC-6 | INV-8, INV-18 | Process driver, flag matrix |
| AC-7 | INV-10 | Settings fixture, override check |
| AC-8, AC-9 | INV-10, INV-11 | Registry enumeration, duplicate skill fixture |
| AC-10, AC-11, AC-12, AC-13 | INV-3, INV-8, INV-18 | Stdio driver, grammar fixtures |
| AC-14, AC-15, AC-16 | INV-3, INV-14 | ACP driver, state machine fixtures |
| AC-17 | INV-16 | HTTP driver, CSRF fixture, bind check |
| AC-18 | INV-4, INV-5 | Pure function property test |
| AC-19 | INV-6 | Command fixture on each platform |
| AC-20 | INV-9 | Hook fixtures, including a broken file |
| AC-21 | INV-9, INV-16 | MCP fixture server |
| AC-22 | INV-1, INV-2, INV-12 | Kill and resume fixture |
| AC-23 | INV-13 | Compact and call a tool |
| AC-24 | INV-15 | Two-subagent isolation fixture |
| AC-25 | INV-17 | Model and effort matrix |
| AC-26 | INV-7 | Log and payload scan |
| AC-27 | INV-19 | Three platform builds |
| AC-28 | INV-20 | Status line fixture, throttle and timeout check |
| AC-29 | All | Full suite |

Structural tests, run in CI and not only in the conformance suite:

| Test | Assertion |
|---|---|
| Layer check | No import from a lower layer to a higher layer. `permissions/` has no IO import |
| Surface check | No surface package imports the tool registry or a model transport |
| Closed set check | Enum values in code match the schema and the spec |
| Secret scan | Log, event and hook fixtures contain no token-shaped string |
| Route check | Every advertised local route resolves |
| Doc check | Every flag, setting and command in the docs exists in the code and vice versa |

## 13. Questions this contract does not settle

These are recorded so a later change does not treat an open question as settled.

1. Which model id uses which provider transport on the wire.
2. The full semantics of the daemon RPC surface.
3. The server-side rule for remote-agent entitlement.
4. Runtime behaviour of the Linux and Windows sandboxes. Release 1 verifies static presence only.
5. The exact ordered membership of the 60 tools in a default session. The count is fixed; the order
   is not.
6. The exact composition of every hook matcher name.
7. Whether `/metrics` belongs on the daemon listener.
