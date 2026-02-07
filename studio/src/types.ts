export interface AgentInfo {
  name: string;
  instructions: string | null;
  model: string | null;
  tools: string[];
  temperature: number | null;
  reasoning_effort: string | null;
  source_file: string | null;
  project?: string | null;
}

export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  source_file: string | null;
  project?: string | null;
}

export interface ProjectSnapshot {
  agents: Record<string, AgentInfo>;
  tools: Record<string, ToolInfo>;
  config: Record<string, unknown>;
}

export interface Attachment {
  type: "image" | "file";
  name: string;
  mime_type: string;
  data: string; // base64, no data URL prefix
}

export interface ModelsResponse {
  providers: Record<string, string[]>;
}

export type ChatMessage =
  | { role: "user"; content: string; attachments?: Attachment[] }
  | { role: "assistant"; content: string }
  | { role: "system"; content: string }
  | { role: "tool_call"; tool: string; arguments: string; output: string; status: "running" | "done" }
  | { role: "thinking"; content: string };
