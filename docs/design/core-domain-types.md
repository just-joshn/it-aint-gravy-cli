# Core domain types

## Goal

Give every runtime component one typed model for agents, sessions, conversations, turns, messages,
tool calls, tool results, permission requests, model configs and runtime events. The module contains
types and vocabulary only. It has no I/O and no state transitions.

The architecture contract in `docs/architecture-contract.md` §4 remains the authority. This note
records the implementation choices that the contract leaves to the code.

## Shape

| Entity | Role |
|---|---|
| `Agent` | A main agent or a subagent, with its model choice, tool set, workspace mode and runtime state |
| `Session` | One conversation bound to a client, with at most one active turn |
| `Conversation` | Persisted identity, workspace directories, permission mode and transcript path |
| `Turn` | One admitted input, its starting step, status, termination reason and usage |
| `Message` | A role and an ordered list of content parts |
| `ToolCall` | A call id, canonical tool name, validated arguments and required permissions |
| `ToolResult` | One of four outcomes, content parts, sandbox truth and any denial records |
| `PermissionRequest` | One of ten actions, a target, the tool name and the call id |
| `ModelConfig` | A served or custom model, its transport, capabilities and allowed effort set |
| `RuntimeEvent` | The closed `init`, `step_update` and `result` event set |

The module also defines the supporting permission grant, decision and denial shapes, step records,
usage counters, content parts and result payload.

## Decisions

IDs are branded. A `SessionId` cannot be assigned to a `ConversationId`, and a `TurnGen` cannot be
assigned to a `StepIndex`. The wire form stays a string or a number. Each boundary parses the raw
value once and returns the branded type.

`Agent` is a discriminated union. A `MainAgent` cannot select `inherit`, must have nesting depth 0
and has no parent conversation. A `Subagent` must name its parent conversation and may select
`inherit`, a tier alias or a concrete model.

`Step` is a discriminated union keyed by `type`. A `tool_call` step can only carry a `ToolCall`, and
a `tool_result` step can only carry a `ToolResult`. The compiler rejects a mismatched payload.

`ToolResult` is a discriminated union keyed by `outcome`. An `error` result must carry a
`ToolError`. A `denied` result must carry its denials. An `ok` result cannot carry either.

`ModelConfig` is a discriminated union keyed by `class`. Each class owns its effort set. A standard
model accepts `low`, `medium` and `high`. A reasoning model adds `xhigh`. A single-tier model accepts
only `medium`. A model without effort control accepts no effort.

`RuntimeEvent` is closed. A new event requires a protocol version change. Event field names stay
snake_case because clients consume them directly. Domain field names stay camelCase.

## Boundaries

The core `StepType` names the nine event-level step kinds in the architecture contract. The tool
registry owns the larger tool-step vocabulary, its aliases and its matcher names. A registry entry
maps to a `ToolCall.name`, so the core model does not duplicate the registry.

The extension loader owns discovery fields such as skills, plugins and MCP server specs. `Agent`
carries the identity and runtime fields that the session manager needs. The loader attaches the rest
when it resolves an agent.

Persistence, migrations and event emission are separate components. This module only defines the
values they exchange.

## Verification

`src/domain/types.ts` is type checked by both `tsc` and `bun check`. `test/domain-types.test.ts`
checks every vocabulary for its contract size and uniqueness, composes the full entity graph and
proves that a conversation id cannot be used as a session id. `bun run check` and `bun run verify`
must pass before the module is used by another component.
