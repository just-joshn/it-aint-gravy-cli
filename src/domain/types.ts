type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type ConversationId = Brand<string, "ConversationId">;
export type SessionId = Brand<string, "SessionId">;
export type StepIndex = Brand<number, "StepIndex">;
export type TurnGen = Brand<number, "TurnGen">;
export type ToolCallId = Brand<string, "ToolCallId">;

export const PERMISSION_MODES = ["default", "accept-edits", "auto", "plan"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const DRIVER_MODES = [
  "interactive",
  "print-text",
  "print-json",
  "print-stream-json",
  "acp",
  "agent-api",
  "remote-control",
  "remote-agent",
] as const;
export type DriverMode = (typeof DRIVER_MODES)[number];

export const SESSION_STATES = [
  "creating",
  "ready",
  "busy",
  "cancelling",
  "closed",
  "load_failed",
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const AGENT_STATES = ["ALIVE", "KILLED", "waiting", "working", "stopped"] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const AGENT_KINDS = ["main", "subagent"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const AGENT_SOURCES = ["builtin", "custom"] as const;
export type AgentSource = (typeof AGENT_SOURCES)[number];

export const WORKSPACE_MODES = ["inherit", "branch", "share", "workspace_uri"] as const;
export type WorkspaceMode = (typeof WORKSPACE_MODES)[number];

export const STEP_TYPES = [
  "user_input",
  "agent_response",
  "thinking",
  "tool_call",
  "tool_result",
  "checkpoint",
  "system_message",
  "command_output",
  "subagent_result",
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const STEP_STATUSES = [
  "RUNNING",
  "SUCCESS",
  "ERROR",
  "FATAL",
  "INVALID",
  "WAITING",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
export type ResultStatus = StepStatus;
export const RESULT_STATUSES = STEP_STATUSES;

export const FINISHED_REASONS = ["print_timeout", "error", "interrupted", ""] as const;
export type FinishedReason = (typeof FINISHED_REASONS)[number];

export const TERMINATION_REASONS = [
  "NO_TOOL_CALL",
  "MAX_INVOCATIONS",
  "MAX_FORCED_INVOCATIONS",
  "MAX_TOKEN_BUDGET_EXCEEDED",
  "ERROR",
  "USER_CANCELED",
  "TERMINAL_STEP_TYPE",
  "TERMINAL_CUSTOM_HOOK",
  "INJECTED_RESPONSE",
] as const;
export type TerminationReason = (typeof TERMINATION_REASONS)[number];

export const TOOL_OUTCOMES = ["ok", "error", "denied", "timeout"] as const;
export type ToolOutcome = (typeof TOOL_OUTCOMES)[number];

export const PERMISSION_ACTIONS = [
  "read_file",
  "write_file",
  "read_url",
  "execute_url",
  "download_url",
  "command",
  "unsandboxed",
  "mcp",
  "escalate_admin",
  "custom",
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_VERDICTS = ["allow", "ask", "deny"] as const;
export type PermissionVerdict = (typeof PERMISSION_VERDICTS)[number];

export const PERMISSION_SCOPES = [
  "ONCE",
  "CONVERSATION",
  "WORKSPACE",
  "GLOBAL",
  "PROJECT",
] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export const PERMISSION_SOURCES = ["settings", "conversation", "hook", "admin", "builtin"] as const;
export type PermissionSource = (typeof PERMISSION_SOURCES)[number];

export const PERMISSION_REASONS = [
  "rule",
  "hook_deny",
  "hook_force_ask",
  "hook_force_ask_unattended",
  "hook_deny_unless_prior_grant",
  "hook_auto_approve",
  "always_proceed",
  "auto",
  "no_match",
] as const;
export type PermissionReason = (typeof PERMISSION_REASONS)[number];

export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MODEL_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ModelEffort = (typeof MODEL_EFFORTS)[number];

export const MODEL_CLASSES = ["standard", "reasoning", "single-tier", "none"] as const;
export type ModelClass = (typeof MODEL_CLASSES)[number];

export const STANDARD_EFFORTS = ["low", "medium", "high"] as const;
export type StandardEffort = (typeof STANDARD_EFFORTS)[number];

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const MODEL_TIERS = ["lite", "fast", "pro"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const MODEL_SOURCES = ["catalog", "custom", "persisted"] as const;
export type ModelSource = (typeof MODEL_SOURCES)[number];

export const MODEL_TRANSPORTS = ["http-sse", "grpc", "responses"] as const;
export type ModelTransport = (typeof MODEL_TRANSPORTS)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface TextPart {
  readonly type: "text";
  readonly text: string;
}

export interface JsonPart {
  readonly type: "json";
  readonly value: JsonValue;
}

export interface ImageRef {
  readonly type: "image";
  readonly uri: string;
  readonly mimeType?: string;
}

export interface FileRef {
  readonly type: "file";
  readonly path: string;
}

export interface DiffPart {
  readonly type: "diff";
  readonly path: string;
  readonly diff: string;
}

export type ContentPart = TextPart | JsonPart | ImageRef | FileRef | DiffPart;

export interface PermissionRequest {
  readonly action: PermissionAction;
  readonly target: string;
  readonly toolName: string;
  readonly callId: ToolCallId;
  readonly reason?: string;
}

export interface PermissionGrant {
  readonly action: PermissionAction;
  readonly target: string;
  readonly verdict: PermissionVerdict;
  readonly scope: PermissionScope;
  readonly source: PermissionSource;
}

export interface PermissionDecision {
  readonly verdict: PermissionVerdict;
  readonly matched: PermissionGrant | null;
  readonly scope: PermissionScope | null;
  readonly reason: PermissionReason;
}

export interface PermissionDenial {
  readonly action: PermissionAction;
  readonly target: string;
  readonly reason: string;
  readonly matched: PermissionGrant | null;
}

export interface SandboxReport {
  readonly ranInSandbox: boolean;
  readonly sandboxErrors: string;
}

export interface ToolError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ToolCall {
  readonly id: ToolCallId;
  readonly name: string;
  readonly args: unknown;
  readonly requiredPermissions: readonly PermissionRequest[];
}

interface ToolResultBase {
  readonly callId: ToolCallId;
  readonly content: readonly ContentPart[];
  readonly sandbox?: SandboxReport;
  readonly truncated?: boolean;
}

export type ToolResult =
  | (ToolResultBase & { readonly outcome: "ok" })
  | (ToolResultBase & { readonly outcome: "error"; readonly error: ToolError })
  | (ToolResultBase & {
      readonly outcome: "denied";
      readonly denials: readonly PermissionDenial[];
    })
  | (ToolResultBase & { readonly outcome: "timeout"; readonly error?: ToolError });

export interface ModelCapabilities {
  readonly tools: boolean;
  readonly images: boolean;
  readonly thinking: boolean;
}

interface ModelConfigBase {
  readonly id: string;
  readonly tier?: ModelTier;
  readonly source: ModelSource;
  readonly transport: ModelTransport;
  readonly contextWindow?: number;
  readonly capabilities: ModelCapabilities;
}

export type ModelConfig =
  | (ModelConfigBase & {
      readonly class: "standard";
      readonly effort?: StandardEffort;
      readonly efforts: readonly [StandardEffort, ...StandardEffort[]];
    })
  | (ModelConfigBase & {
      readonly class: "reasoning";
      readonly effort?: ReasoningEffort;
      readonly efforts: readonly [ReasoningEffort, ...ReasoningEffort[]];
    })
  | (ModelConfigBase & {
      readonly class: "single-tier";
      readonly effort?: "medium";
      readonly efforts: readonly ["medium"];
    })
  | (ModelConfigBase & {
      readonly class: "none";
      readonly effort?: never;
      readonly efforts: readonly [];
    });

export type ModelSelection = "inherit" | ModelTier | ModelConfig;

export type AgentWorkspace =
  | { readonly mode: "inherit" }
  | { readonly mode: "branch"; readonly branch: string }
  | { readonly mode: "share"; readonly workspaceUri: string }
  | { readonly mode: "workspace_uri"; readonly uri: string };

interface AgentBase {
  readonly name: string;
  readonly description: string;
  readonly source: AgentSource;
  readonly tools: readonly string[];
  readonly workspace: AgentWorkspace;
  readonly hidden: boolean;
  readonly disabled: boolean;
  readonly conversationId: ConversationId;
  readonly state: AgentState;
}

export interface MainAgent extends AgentBase {
  readonly kind: "main";
  readonly model: ModelTier | ModelConfig;
  readonly nestingDepth: 0;
  readonly parentConversationId?: never;
}

export interface Subagent extends AgentBase {
  readonly kind: "subagent";
  readonly model: ModelSelection;
  readonly nestingDepth: number;
  readonly parentConversationId: ConversationId;
}

export type Agent = MainAgent | Subagent;

export interface Conversation {
  readonly id: ConversationId;
  readonly projectId: string;
  readonly workspaceDirs: readonly string[];
  readonly createdAt: string;
  readonly parentId?: ConversationId;
  readonly rootId: ConversationId;
  readonly title?: string;
  readonly model?: string;
  readonly mode: PermissionMode;
  readonly transcriptPath: string;
}

export interface Message {
  readonly role: MessageRole;
  readonly content: readonly ContentPart[];
  readonly createdAt?: string;
}

export type UserMessage = Message & { readonly role: "user" };

export interface Checkpoint {
  readonly checkpointIndex: number;
  readonly includedStepIndexStart: StepIndex;
  readonly includedStepIndexEnd: StepIndex;
  readonly userIntent: string;
  readonly sessionSummary: string;
  readonly codeChangeSummary: string;
}

export interface SystemMessage {
  readonly message: string;
  readonly eventType: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface UserInput {
  readonly message: UserMessage;
  readonly clientMessageId?: string;
  readonly queued: boolean;
}

export interface AgentResponse {
  readonly text: string;
  readonly thinking?: string;
  readonly toolCalls: readonly ToolCall[];
  readonly stopReason?: string;
}

export interface CommandOutput {
  readonly commandLine: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
}

export interface SubagentResult {
  readonly conversationId: ConversationId;
  readonly logUri: string;
  readonly workspaceUris: readonly string[];
}

interface StepBase<Type extends StepType, Payload> {
  readonly index: StepIndex;
  readonly type: Type;
  readonly startedAt: string;
  readonly durationMs?: number;
  readonly status: StepStatus;
  readonly payload: Payload;
}

export type Step =
  | StepBase<"user_input", UserInput>
  | StepBase<"agent_response", AgentResponse>
  | StepBase<"thinking", AgentResponse>
  | StepBase<"tool_call", ToolCall>
  | StepBase<"tool_result", ToolResult>
  | StepBase<"checkpoint", Checkpoint>
  | StepBase<"system_message", SystemMessage>
  | StepBase<"command_output", CommandOutput>
  | StepBase<"subagent_result", SubagentResult>;

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly thinkingTokens: number;
  readonly cacheReadTokens: number;
  readonly totalTokens: number;
}

export interface WireUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly thinking_tokens: number;
  readonly cache_read_tokens: number;
  readonly total_tokens: number;
}

export interface Turn {
  readonly gen: TurnGen;
  readonly conversationId: ConversationId;
  readonly input: UserMessage;
  readonly startStepIndex: StepIndex;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: ResultStatus;
  readonly terminationReason?: TerminationReason;
  readonly finishedReason: FinishedReason;
  readonly usage: Usage;
}

export interface Session {
  readonly id: SessionId;
  readonly conversationId: ConversationId;
  readonly agentName: string;
  readonly driver: DriverMode;
  readonly permissionMode: PermissionMode;
  readonly state: SessionState;
  readonly turnGen: TurnGen;
  readonly activeTurn: Turn | null;
  readonly detached: boolean;
  readonly model: ModelConfig;
}

export interface InitPayload {
  readonly model?: string;
  readonly effort?: ModelEffort;
  readonly agent?: string;
  readonly cwd: string;
  readonly tools: readonly string[];
  readonly permission_mode: PermissionMode;
}

export interface ToolInfo {
  readonly name: string;
  readonly id: ToolCallId;
  readonly args?: unknown;
}

export interface SubagentInfo {
  readonly conversation_id: ConversationId;
  readonly name?: string;
  readonly state?: AgentState;
  readonly result?: SubagentResult;
}

export interface StepUpdate {
  readonly step_type: StepType;
  readonly step_index: StepIndex;
  readonly text_delta?: string;
  readonly tool_info?: ToolInfo;
  readonly subagent_info?: SubagentInfo;
  readonly duration_seconds: number;
}

export interface ResultPayload {
  readonly conversation_id: ConversationId;
  readonly status: ResultStatus;
  readonly response: string;
  readonly error: string;
  readonly duration_seconds: number;
  readonly num_turns: number;
  readonly usage: WireUsage;
  readonly finished_reason: FinishedReason;
  readonly structured_output?: unknown;
  readonly json_schema?: unknown;
}

export const RUNTIME_EVENT_NAMES = ["init", "step_update", "result"] as const;
export type RuntimeEventName = (typeof RUNTIME_EVENT_NAMES)[number];

export type RuntimeEvent =
  | {
      readonly event: "init";
      readonly conversation_id: ConversationId;
      readonly init: InitPayload;
    }
  | ({ readonly event: "step_update" } & StepUpdate)
  | { readonly event: "result"; readonly result: ResultPayload };
