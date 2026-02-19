import { useState, useEffect, useCallback } from "react";
import type { DeployConfig } from "../types";

interface DeploySettingsProps {
  isWorkspace: boolean;
  project?: string;
  projectName?: string;
  onToast: (msg: string) => void;
}

const DEFAULT_CONFIG: DeployConfig = {
  chat: {
    enabled: true,
    title: "",
    welcome_message: "",
    attachments: true,
  },
  widget: {
    enabled: true,
    color: "#2563eb",
    position: "bottom-right",
    width: "380px",
    height: "560px",
    welcome_message: "",
    placeholder: "Type a message...",
    auto_open: false,
    user_message_color: "#2563eb",
    header_color: "",
    bubble_icon: "chat",
  },
  api: {
    cors_origins: ["*"],
  },
};

type DeployTab = "interfaces" | "api";

const TABS: { id: DeployTab; label: string }[] = [
  { id: "interfaces", label: "Interfaces" },
  { id: "api", label: "API" },
];

type PreviewMode = "chat" | "widget";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </button>
    </label>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500";

const selectClass =
  "w-full appearance-none bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 pr-10 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500";

// ---- Helpers ----

function luminance(hex: string): number {
  const c = hex.replace("#", "");
  if (c.length !== 6) return 1;
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function isDark(hex: string): boolean {
  return luminance(hex) < 0.4;
}

const BUBBLE_ICONS: Record<string, React.ReactNode> = {
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.09 6.26L20.18 10l-6.09 1.74L12 18l-2.09-6.26L3.82 10l6.09-1.74L12 2z"/>
      <path d="M19 15l1.04 3.13L23.18 19l-3.14.87L19 23l-1.04-3.13L14.82 19l3.14-.87L19 15z" opacity=".6"/>
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
};

function BubbleIcon({ icon, className }: { icon: string; className?: string }) {
  return <span className={className} style={{ display: "inline-flex" }}>{BUBBLE_ICONS[icon] || BUBBLE_ICONS.chat}</span>;
}

// ---- Preview Components ----

type ChatMessage = { role: "user" | "assistant"; text: string };

const MOCK_RESPONSE =
  "This is a preview response so you can see the style of the chat. To interact with your agent, go to Playground.";

function ChatPreview({
  config,
  projectName,
}: {
  config: DeployConfig;
  projectName?: string;
}) {
  const title = config.chat.title || projectName || "My Agent";
  const welcome = config.chat.welcome_message || "Send a message to start chatting";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useCallback((node: HTMLDivElement | null) => {
    node?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "assistant", text: MOCK_RESPONSE },
    ]);
  };

  const handleClear = () => {
    setMessages([]);
    setInput("");
  };

  if (!config.chat.enabled) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
        Chat page is disabled
      </div>
    );
  }

  return (
    <div
      className="h-full flex items-center justify-center p-5"
      style={{
        background: "var(--tw-bg, #f3f4f6)",
        backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="w-full max-w-[520px] h-[580px] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0"
          style={config.widget.header_color ? { background: config.widget.header_color } : undefined}
        >
          <span
            className="text-[15px] font-semibold flex-1 truncate"
            style={{ color: config.widget.header_color && isDark(config.widget.header_color) ? "#ffffff" : undefined }}
          >
            {title}
          </span>
          <div className="flex items-center gap-1">
            {/* Theme button */}
            <div
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600"
              style={{ color: config.widget.header_color && isDark(config.widget.header_color) ? "rgba(255,255,255,0.6)" : undefined, borderColor: config.widget.header_color && isDark(config.widget.header_color) ? "rgba(255,255,255,0.2)" : undefined }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z" clipRule="evenodd" />
              </svg>
            </div>
            {/* Clear button */}
            <button
              onClick={handleClear}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 hover:opacity-80 transition-colors"
              style={{ color: config.widget.header_color && isDark(config.widget.header_color) ? "rgba(255,255,255,0.6)" : undefined, borderColor: config.widget.header_color && isDark(config.widget.header_color) ? "rgba(255,255,255,0.2)" : undefined }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          {messages.length === 0 ? (
            <div className="flex items-start justify-center pt-20">
              <p className="text-[15px] text-gray-400 dark:text-gray-500 text-center">{welcome}</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[85%] px-3.5 py-2 rounded-xl text-sm leading-relaxed break-words"
                  style={
                    msg.role === "user"
                      ? { background: config.widget.user_message_color || "#2563eb", color: "#ffffff" }
                      : { background: "#f3f4f6", color: "#1f2937" }
                  }
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        {/* Input area */}
        <div className="px-4 pb-1.5 flex-shrink-0">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-3xl px-4 py-2"
          >
            {config.chat.attachments && (
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 text-gray-400">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </div>
            )}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none py-1"
            />
            <button
              type="submit"
              className="w-8 h-8 rounded-full bg-gray-800 dark:bg-white flex items-center justify-center flex-shrink-0"
            >
              <svg className="w-4 h-4 text-white dark:text-gray-800" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
              </svg>
            </button>
          </form>
        </div>
        {/* Footer */}
        <div className="pb-1.5 text-center flex-shrink-0">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Built with{" "}
            <a href="https://klisk.productomania.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium no-underline hover:opacity-80">Klisk</a>
          </span>
        </div>
      </div>
    </div>
  );
}

function WidgetPreview({ config, projectName }: { config: DeployConfig; projectName?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const isLeft = config.widget.position === "bottom-left";
  const color = config.widget.color || "#2563eb";
  const placeholder = config.widget.placeholder || "Type a message...";
  const welcome = config.chat.welcome_message || "Send a message to start chatting";
  const title = config.chat.title || projectName || "My Agent";
  const messagesEndRef = useCallback((node: HTMLDivElement | null) => {
    node?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "assistant", text: MOCK_RESPONSE },
    ]);
  };

  const handleClear = () => {
    setMessages([]);
    setInput("");
  };

  if (!config.widget.enabled) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
        Widget is disabled
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Mock webpage background */}
      <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800/50">
        <div className="p-6 space-y-3 opacity-30">
          <div className="h-6 w-48 bg-gray-300 dark:bg-gray-600 rounded" />
          <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-5/6 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-4/6 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-20 w-full bg-gray-200 dark:bg-gray-700 rounded mt-4" />
          <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>

      {/* Widget container */}
      <div
        className="absolute bottom-6 flex flex-col items-end gap-3"
        style={{ [isLeft ? "left" : "right"]: "24px" }}
      >
        {/* Panel — embeds the same chat page UI */}
        {open && (
          <div
            className="bg-white dark:bg-gray-900 rounded-xl flex flex-col overflow-hidden"
            style={{
              width: "380px",
              height: "500px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
            }}
          >
            {/* Header — same as chat page */}
            <div
              className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0"
              style={config.widget.header_color ? { background: config.widget.header_color } : undefined}
            >
              <span
                className="text-[15px] font-semibold flex-1 truncate"
                style={{ color: config.widget.header_color && isDark(config.widget.header_color) ? "#ffffff" : undefined }}
              >
                {title}
              </span>
              <div className="flex items-center gap-1">
                <div
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600"
                  style={{ color: config.widget.header_color && isDark(config.widget.header_color) ? "rgba(255,255,255,0.6)" : undefined, borderColor: config.widget.header_color && isDark(config.widget.header_color) ? "rgba(255,255,255,0.2)" : undefined }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z" clipRule="evenodd" />
                  </svg>
                </div>
                <button
                  onClick={handleClear}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 hover:opacity-80 transition-colors"
                  style={{ color: config.widget.header_color && isDark(config.widget.header_color) ? "rgba(255,255,255,0.6)" : undefined, borderColor: config.widget.header_color && isDark(config.widget.header_color) ? "rgba(255,255,255,0.2)" : undefined }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Messages area — same as chat page */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="flex items-start justify-center pt-16">
                  <p className="text-[15px] text-gray-400 dark:text-gray-500 text-center">{welcome}</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className="max-w-[85%] px-3.5 py-2 rounded-xl text-sm leading-relaxed break-words"
                      style={
                        msg.role === "user"
                          ? { background: config.widget.user_message_color || "#2563eb", color: "#ffffff" }
                          : { background: "#f3f4f6", color: "#1f2937" }
                      }
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            {/* Input area — same as chat page */}
            <div className="px-4 pb-1.5 flex-shrink-0">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-3xl px-4 py-2"
              >
                {config.chat.attachments && (
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 text-gray-400">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </div>
                )}
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none py-1"
                />
                <button
                  type="submit"
                  className="w-8 h-8 rounded-full bg-gray-800 dark:bg-white flex items-center justify-center flex-shrink-0"
                >
                  <svg className="w-4 h-4 text-white dark:text-gray-800" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                </button>
              </form>
            </div>
            {/* Footer */}
            <div className="pb-1.5 text-center flex-shrink-0">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                Built with{" "}
                <a href="https://klisk.productomania.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium no-underline hover:opacity-80">Klisk</a>
              </span>
            </div>
          </div>
        )}

        {/* Floating button — matches real widget: 56px, same shadow */}
        <button
          onClick={() => setOpen(!open)}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-transform hover:scale-105"
          style={{
            background: color,
            alignSelf: isLeft ? "flex-start" : "flex-end",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {open ? (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <BubbleIcon icon={config.widget.bubble_icon || "chat"} className="w-6 h-6" />
          )}
        </button>
      </div>
    </div>
  );
}

function ApiPreview({ config }: { config: DeployConfig }) {
  const origins = config.api.cors_origins;
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="w-full max-w-[320px] space-y-4">
        {/* Endpoint card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">POST</span>
            <span className="text-xs font-mono text-gray-700 dark:text-gray-300">/api/chat</span>
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">CORS Origins</div>
            <div className="flex flex-wrap gap-1.5">
              {origins.map((o, i) => (
                <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  {o}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Sample request */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sample Request</span>
          </div>
          <pre className="px-4 py-3 text-[10px] font-mono text-gray-600 dark:text-gray-400 leading-relaxed overflow-x-auto">
{`curl -X POST /api/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $KEY" \\
  -d '{"message": "Hello"}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ---- Main Component ----

export default function DeploySettings({
  isWorkspace,
  project,
  projectName,
  onToast,
}: DeploySettingsProps) {
  const [config, setConfig] = useState<DeployConfig>(DEFAULT_CONFIG);
  const [savedConfig, setSavedConfig] = useState<DeployConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<DeployTab>("interfaces");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("chat");

  const hasChanges = JSON.stringify(config) !== JSON.stringify(savedConfig);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const params = isWorkspace && project ? `?project=${encodeURIComponent(project)}` : "";
      const res = await fetch(`/api/deploy-config${params}`);
      const data = await res.json();
      if (data.error) {
        onToast(`Error: ${data.error}`);
        return;
      }
      setConfig(data);
      setSavedConfig(data);
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isWorkspace, project, onToast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const params = isWorkspace && project ? `?project=${encodeURIComponent(project)}` : "";
      const res = await fetch(`/api/deploy-config${params}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.error) {
        onToast(`Error: ${data.error}`);
      } else {
        onToast("Deploy settings saved");
        setSavedConfig(config);
      }
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // Shared fields synced to both chat and widget
  const SHARED_MAP: Record<string, { chat?: string; widget?: string }> = {
    title: { chat: "title" },
    welcome_message: { chat: "welcome_message", widget: "welcome_message" },
    placeholder: { widget: "placeholder" },
  };

  const updateShared = (field: string, value: unknown) => {
    const map = SHARED_MAP[field];
    setConfig((prev) => {
      const next = { ...prev };
      if (map?.chat) next.chat = { ...prev.chat, [map.chat]: value };
      if (map?.widget) next.widget = { ...prev.widget, [map.widget]: value };
      return next;
    });
  };

  const updateChat = (field: string, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      chat: { ...prev.chat, [field]: value },
    }));
  };

  const updateWidget = (field: string, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      widget: { ...prev.widget, [field]: value },
    }));
  };

  const updateCorsOrigins = (text: string) => {
    const origins = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setConfig((prev) => ({
      ...prev,
      api: { ...prev.api, cors_origins: origins },
    }));
  };

  const widgetSnippet = `<script src="https://your-domain.com/widget.js"></script>`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
        Loading deploy settings...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Settings */}
      <div className="w-[420px] flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col min-h-0">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
              )}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-5 space-y-4">
            {activeTab === "interfaces" && (
              <>
                {/* Shared settings */}
                <Field label="Title">
                  <input
                    type="text"
                    value={config.chat.title}
                    onChange={(e) => updateShared("title", e.target.value)}
                    placeholder={projectName || "Agent name"}
                    className={inputClass}
                  />
                </Field>
                <Field label="Welcome message">
                  <textarea
                    value={config.chat.welcome_message}
                    onChange={(e) => updateShared("welcome_message", e.target.value)}
                    placeholder="Send a message to start chatting"
                    rows={2}
                    className={inputClass + " resize-none"}
                  />
                </Field>
                <Field label="Input placeholder">
                  <input
                    type="text"
                    value={config.widget.placeholder}
                    onChange={(e) => updateShared("placeholder", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="User message color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.widget.user_message_color || "#2563eb"}
                      onChange={(e) => updateWidget("user_message_color", e.target.value)}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-700 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={config.widget.user_message_color}
                      onChange={(e) => updateWidget("user_message_color", e.target.value)}
                      className={inputClass + " flex-1"}
                    />
                  </div>
                </Field>
                <Field label="Header background">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.widget.header_color || "#ffffff"}
                      onChange={(e) => updateWidget("header_color", e.target.value)}
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-700 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={config.widget.header_color}
                      onChange={(e) => updateWidget("header_color", e.target.value)}
                      placeholder="Default"
                      className={inputClass + " flex-1"}
                    />
                  </div>
                </Field>
                <Toggle
                  label="File attachments"
                  checked={config.chat.attachments}
                  onChange={(v) => updateChat("attachments", v)}
                />

                {/* Chat Page section */}
                <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Chat Page</h3>
                  <Toggle
                    label="Enabled"
                    checked={config.chat.enabled}
                    onChange={(v) => updateChat("enabled", v)}
                  />
                </div>

                {/* Widget section */}
                <div className="pt-2 border-t border-gray-200 dark:border-gray-800 space-y-4">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Widget</h3>
                  <Toggle
                    label="Enabled"
                    checked={config.widget.enabled}
                    onChange={(v) => updateWidget("enabled", v)}
                  />
                  <Field label="Bubble color">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.widget.color}
                        onChange={(e) => updateWidget("color", e.target.value)}
                        className="w-8 h-8 rounded border border-gray-300 dark:border-gray-700 cursor-pointer p-0"
                      />
                      <input
                        type="text"
                        value={config.widget.color}
                        onChange={(e) => updateWidget("color", e.target.value)}
                        className={inputClass + " flex-1"}
                      />
                    </div>
                  </Field>
                  <Field label="Bubble icon">
                    <div className="flex gap-2">
                      {(["chat", "sparkle", "help"] as const).map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => updateWidget("bubble_icon", icon)}
                          className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${
                            config.widget.bubble_icon === icon
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                              : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
                          }`}
                          title={icon.charAt(0).toUpperCase() + icon.slice(1)}
                        >
                          <BubbleIcon icon={icon} className="w-5 h-5" />
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Position">
                      <div className="relative">
                        <select
                          value={config.widget.position}
                          onChange={(e) => updateWidget("position", e.target.value)}
                          className={selectClass}
                        >
                          <option value="bottom-right">Bottom right</option>
                          <option value="bottom-left">Bottom left</option>
                        </select>
                        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </Field>
                    <div />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Width">
                      <input type="text" value={config.widget.width} onChange={(e) => updateWidget("width", e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Height">
                      <input type="text" value={config.widget.height} onChange={(e) => updateWidget("height", e.target.value)} className={inputClass} />
                    </Field>
                  </div>
                  <Toggle
                    label="Auto-open on page load"
                    checked={config.widget.auto_open}
                    onChange={(v) => updateWidget("auto_open", v)}
                  />
                  <Field label="Embed snippet">
                    <div className="relative">
                      <pre className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-600 dark:text-gray-400 font-mono overflow-x-auto">
                        {widgetSnippet}
                      </pre>
                      <button
                        onClick={() => { navigator.clipboard.writeText(widgetSnippet); onToast("Snippet copied to clipboard"); }}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        title="Copy"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                        </svg>
                      </button>
                    </div>
                  </Field>
                </div>
              </>
            )}

            {activeTab === "api" && (
              <>
                <Field label="CORS Origins (one per line)">
                  <textarea
                    value={config.api.cors_origins.join("\n")}
                    onChange={(e) => updateCorsOrigins(e.target.value)}
                    placeholder="*"
                    rows={3}
                    className={inputClass + " resize-none font-mono"}
                  />
                </Field>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Use <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">*</code> to allow all origins, or specify domains like <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">https://example.com</code>.
                  API keys can be managed in the .env tab.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
          {hasChanges && (
            <button
              onClick={() => setConfig(savedConfig)}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Right: Live Preview */}
      <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-950 flex flex-col">
        <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Preview</span>
          {activeTab === "interfaces" && (
            <div className="flex items-center bg-gray-200 dark:bg-gray-800 rounded-lg p-0.5">
              {(["chat", "widget"] as PreviewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    previewMode === mode
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {mode === "chat" ? "Chat Page" : "Widget"}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0">
          {activeTab === "interfaces" && previewMode === "chat" && <ChatPreview config={config} projectName={projectName} />}
          {activeTab === "interfaces" && previewMode === "widget" && <WidgetPreview config={config} projectName={projectName} />}
          {activeTab === "api" && <ApiPreview config={config} />}
        </div>
      </div>
    </div>
  );
}
