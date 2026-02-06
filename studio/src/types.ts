export interface AgentInfo {
  name: string;
  instructions: string | null;
  model: string | null;
  tools: string[];
  temperature: number | null;
  source_file: string | null;
}

export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  source_file: string | null;
}

export interface ProjectSnapshot {
  agents: Record<string, AgentInfo>;
  tools: Record<string, ToolInfo>;
  config: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "system"; content: string }
  | { role: "tool_call"; tool: string; arguments: string; output: string; status: "running" | "done" }
  | { role: "thinking"; content: string };
