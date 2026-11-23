import { describe, expect, test } from "bun:test";
import type {
  Agent,
  Conversation,
  ConversationId,
  ModelConfig,
  PermissionDecision,
  PermissionGrant,
  PermissionRequest,
  RuntimeEvent,
  Session,
  SessionId,
  Step,
  StepIndex,
  Subagent,
  ToolCall,
  ToolCallId,
  ToolResult,
  Turn,
  TurnGen,
  UserMessage,
} from "../src/domain/types.ts";
import {
  AGENT_KINDS,
  AGENT_SOURCES,
  AGENT_STATES,
  DRIVER_MODES,
  FINISHED_REASONS,
  MESSAGE_ROLES,
  MODEL_CLASSES,
  MODEL_EFFORTS,
  MODEL_SOURCES,
  MODEL_TIERS,
  MODEL_TRANSPORTS,
  PERMISSION_ACTIONS,
  PERMISSION_MODES,
  PERMISSION_REASONS,
  PERMISSION_SCOPES,
  PERMISSION_SOURCES,
  PERMISSION_VERDICTS,
  RUNTIME_EVENT_NAMES,
  SESSION_STATES,
  STEP_STATUSES,
  STEP_TYPES,
  TERMINATION_REASONS,
  TOOL_OUTCOMES,
  WORKSPACE_MODES,
} from "../src/domain/types.ts";

const conversationId = "00000000-0000-4000-8000-000000000001" as ConversationId;
const sessionId = "00000000-0000-4000-8000-000000000002" as SessionId;
const callId = "call-1" as ToolCallId;
const stepIndex = 0 as StepIndex;
const turnGen = 1 as TurnGen;

const model: ModelConfig = {
  id: "standard",
  class: "standard",
  source: "catalog",
  transport: "http-sse",
  efforts: ["low", "medium", "high"],
  capabilities: { tools: true, images: true, thinking: false },
};

const permissionRequest: PermissionRequest = {
  action: "read_file",
  target: "/workspace/a.ts",
  toolName: "view_file",
  callId,
};

const grant: PermissionGrant = {
  action: "read_file",
  target: "/workspace",
  verdict: "allow",
  scope: "WORKSPACE",
  source: "settings",
};

const decision: PermissionDecision = {
  verdict: "allow",
  matched: grant,
  scope: grant.scope,
  reason: "rule",
};

const toolCall: ToolCall = {
  id: callId,
  name: "view_file",
  args: { path: "/workspace/a.ts" },
  requiredPermissions: [permissionRequest],
};

const toolResult: ToolResult = {
  callId,
  outcome: "ok",
  content: [{ type: "text", text: "file" }],
  sandbox: { ranInSandbox: true, sandboxErrors: "" },
};

const input: UserMessage = {
  role: "user",
  content: [{ type: "text", text: "hello" }],
};

const agent: Agent = {
  name: "main",
  description: "Primary agent",
  kind: "main",
  source: "builtin",
  model,
  tools: ["view_file"],
  workspace: { mode: "inherit" },
  hidden: false,
  disabled: false,
  conversationId,
  nestingDepth: 0,
  state: "working",
};

const subagent: Subagent = {
  name: "research",
  description: "Research agent",
  kind: "subagent",
  source: "builtin",
  model: "inherit",
  tools: [],
  workspace: { mode: "branch", branch: "research" },
  hidden: false,
  disabled: false,
  conversationId: "00000000-0000-4000-8000-000000000003" as ConversationId,
  parentConversationId: conversationId,
  nestingDepth: 1,
  state: "waiting",
};

const conversation: Conversation = {
  id: conversationId,
  projectId: "project",
  workspaceDirs: ["/workspace"],
  createdAt: "2026-01-01T00:00:00Z",
  rootId: conversationId,
  mode: "default",
  transcriptPath: "/workspace/.transcript.jsonl",
};

const turn: Turn = {
  gen: turnGen,
  conversationId,
  input,
  startStepIndex: stepIndex,
  startedAt: "2026-01-01T00:00:00Z",
  status: "RUNNING",
  finishedReason: "",
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
  },
};

const session: Session = {
  id: sessionId,
  conversationId,
  agentName: agent.name,
  driver: "interactive",
  permissionMode: conversation.mode,
  state: "busy",
  turnGen,
  activeTurn: turn,
  detached: false,
  model,
};

const step: Step = {
  index: stepIndex,
  type: "tool_call",
  startedAt: "2026-01-01T00:00:00Z",
  status: "RUNNING",
  payload: toolCall,
};

const initEvent: RuntimeEvent = {
  event: "init",
  conversation_id: conversationId,
  init: {
    cwd: "/workspace",
    tools: ["view_file"],
    permission_mode: "default",
  },
};

const stepEvent: RuntimeEvent = {
  event: "step_update",
  step_type: "tool_call",
  step_index: stepIndex,
  tool_info: { name: toolCall.name, id: callId, args: toolCall.args },
  duration_seconds: 0,
};

const resultEvent: RuntimeEvent = {
  event: "result",
  result: {
    conversation_id: conversationId,
    status: "SUCCESS",
    response: "done",
    error: "",
    duration_seconds: 1,
    num_turns: 1,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      thinking_tokens: 0,
      cache_read_tokens: 0,
      total_tokens: 2,
    },
    finished_reason: "",
  },
};

const VOCABULARIES: readonly (readonly [string, readonly string[], number])[] = [
  ["permission modes", PERMISSION_MODES, 4],
  ["driver modes", DRIVER_MODES, 8],
  ["session states", SESSION_STATES, 6],
  ["agent states", AGENT_STATES, 5],
  ["agent kinds", AGENT_KINDS, 2],
  ["agent sources", AGENT_SOURCES, 2],
  ["workspace modes", WORKSPACE_MODES, 4],
  ["step types", STEP_TYPES, 9],
  ["step statuses", STEP_STATUSES, 6],
  ["finished reasons", FINISHED_REASONS, 4],
  ["termination reasons", TERMINATION_REASONS, 9],
  ["tool outcomes", TOOL_OUTCOMES, 4],
  ["permission actions", PERMISSION_ACTIONS, 10],
  ["permission verdicts", PERMISSION_VERDICTS, 3],
  ["permission scopes", PERMISSION_SCOPES, 5],
  ["permission sources", PERMISSION_SOURCES, 5],
  ["permission reasons", PERMISSION_REASONS, 9],
  ["message roles", MESSAGE_ROLES, 4],
  ["model efforts", MODEL_EFFORTS, 5],
  ["model classes", MODEL_CLASSES, 4],
  ["model tiers", MODEL_TIERS, 3],
  ["model sources", MODEL_SOURCES, 3],
  ["model transports", MODEL_TRANSPORTS, 3],
  ["runtime events", RUNTIME_EVENT_NAMES, 3],
];

describe("domain vocabularies", () => {
  test("each vocabulary has its contract size and no duplicates", () => {
    for (const [name, values, size] of VOCABULARIES) {
      expect(values, name).toHaveLength(size);
      expect(new Set(values).size, name).toBe(size);
    }
  });
});

describe("domain composition", () => {
  test("a session binds its agent, conversation, turn and model", () => {
    expect(session.agentName).toBe(agent.name);
    expect(subagent.parentConversationId).toBe(agent.conversationId);
    expect(subagent.model).toBe("inherit");
    expect(session.conversationId).toBe(conversation.id);
    expect(session.activeTurn).toBe(turn);
    expect(session.model).toBe(model);
    expect(turn.input).toBe(input);
  });

  test("a tool call carries permissions and a result carries sandbox truth", () => {
    expect(toolCall.requiredPermissions).toEqual([permissionRequest]);
    expect(toolResult.callId).toBe(toolCall.id);
    expect(toolResult.sandbox?.ranInSandbox).toBe(true);
    expect(step.payload).toBe(toolCall);
  });

  test("a permission decision names the matched grant", () => {
    expect(decision.matched).toBe(grant);
    expect(decision.scope).toBe("WORKSPACE");
    expect(decision.reason).toBe("rule");
  });

  test("the runtime event set has one member per discriminator", () => {
    expect([initEvent, stepEvent, resultEvent].map((event) => event.event)).toEqual([
      "init",
      "step_update",
      "result",
    ]);
  });
});

describe("branded identifiers", () => {
  test("session and conversation ids cannot be interchanged", () => {
    // @ts-expect-error A ConversationId is not a SessionId.
    const mismatched: SessionId = conversationId;
    expect(String(mismatched)).toBe(String(conversationId));
  });
});

describe("tool result variants", () => {
  test("each outcome carries only its required fields", () => {
    const error: ToolResult = {
      callId,
      outcome: "error",
      content: [],
      error: { code: "TOOL_FAILED", message: "failed", retryable: false },
    };
    const denied: ToolResult = {
      callId,
      outcome: "denied",
      content: [],
      denials: [{ action: "command", target: "git push", reason: "denied", matched: null }],
    };
    const timeout: ToolResult = {
      callId,
      outcome: "timeout",
      content: [],
    };

    expect([toolResult, error, denied, timeout]).toHaveLength(4);
  });
});
