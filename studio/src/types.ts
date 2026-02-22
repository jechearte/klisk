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

export interface EnvVariable {
  key: string;
  value: string;
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

export interface ChatDeployConfig {
  enabled: boolean;
  title: string;
  welcome_message: string;
  attachments: boolean;
}

export interface WidgetDeployConfig {
  enabled: boolean;
  color: string;
  position: string;
  width: string;
  height: string;
  welcome_message: string;
  placeholder: string;
  auto_open: boolean;
  user_message_color: string;
  header_color: string;
  bubble_icon: string;
}

export interface ApiDeployConfig {
  cors_origins: string[];
}

export interface DeployConfig {
  chat: ChatDeployConfig;
  widget: WidgetDeployConfig;
  api: ApiDeployConfig;
}

export interface SecurityConfig {
  interfaces: { chat_enabled: boolean; widget_enabled: boolean };
  keys: { api_key: string; chat_key: string; widget_key: string };
}

export interface GCloudConfig {
  project: string;
  region: string;
}

export interface GlobalConfig {
  gcloud: GCloudConfig;
}

export interface LocalServerStatus {
  running: boolean;
  port: number | null;
  pid: number | null;
  url: string | null;
}

export interface CloudDeployStatus {
  deployed: boolean;
  url: string | null;
  service_name: string;
  message: string;
}

export type ChatMessage =
  | { role: "user"; content: string; attachments?: Attachment[] }
  | { role: "assistant"; content: string }
  | { role: "system"; content: string }
  | { role: "tool_call"; tool: string; arguments: string; output: string; status: "running" | "done" }
  | { role: "thinking"; content: string };

// Assistant panel types (Claude Agent SDK powered)

export interface AssistantQuestionOption {
  label: string;
  description?: string;
}

export interface AssistantQuestion {
  question: string;
  options: AssistantQuestionOption[];
}

export type AssistantMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "system"; content: string }
  | { role: "tool_use"; tool: string; detail: string }
  | { role: "permission_request"; tool: string; command: string; status: "pending" | "allowed" | "denied" }
  | { role: "question"; questions: AssistantQuestion[]; status: "pending" | "answered"; answers: Record<string, string> };
