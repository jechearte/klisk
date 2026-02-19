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
  },
  api: {
    cors_origins: ["*"],
  },
};

type DeployTab = "chat" | "widget" | "api";

const TABS: { id: DeployTab; label: string }[] = [
  { id: "chat", label: "Chat Page" },
  { id: "widget", label: "Widget" },
  { id: "api", label: "API" },
];

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

// ---- Preview Components ----

function ChatPreview({
  config,
  projectName,
}: {
  config: DeployConfig;
  projectName?: string;
}) {
  const title = config.chat.title || projectName || "My Agent";
  const welcome = config.chat.welcome_message || "Send a message to start chatting";

  if (!config.chat.enabled) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
        Chat page is disabled
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="w-full max-w-[320px] h-[420px] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</span>
        </div>
        {/* Messages area */}
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">{welcome}</p>
        </div>
        {/* Input */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2">
            {config.chat.attachments && (
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
              </svg>
            )}
            <span className="text-xs text-gray-400 flex-1">Message...</span>
            <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function WidgetPreview({ config }: { config: DeployConfig }) {
  const [open, setOpen] = useState(false);
  const isLeft = config.widget.position === "bottom-left";
  const color = config.widget.color || "#2563eb";
  const placeholder = config.widget.placeholder || "Type a message...";
  const welcome = config.widget.welcome_message;

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
        className="absolute bottom-4 flex flex-col items-end gap-3"
        style={{ [isLeft ? "left" : "right"]: "16px" }}
      >
        {/* Panel */}
        {open && (
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
            style={{ width: "240px", height: "320px" }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: color }}>
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-900 dark:text-white">Chat</span>
            </div>
            <div className="flex-1 flex items-center justify-center px-3">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
                {welcome || "How can we help you?"}
              </p>
            </div>
            <div className="px-2.5 pb-2.5">
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] text-gray-400 flex-1 truncate">{placeholder}</span>
                <svg className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Floating button */}
        <button
          onClick={() => setOpen(!open)}
          className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105"
          style={{
            background: color,
            alignSelf: isLeft ? "flex-start" : "flex-end",
          }}
        >
          {open ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<DeployTab>("chat");

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
      }
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setSaving(false);
    }
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
            {activeTab === "chat" && (
              <>
                <Toggle
                  label="Enabled"
                  checked={config.chat.enabled}
                  onChange={(v) => updateChat("enabled", v)}
                />
                <Field label="Title">
                  <input
                    type="text"
                    value={config.chat.title}
                    onChange={(e) => updateChat("title", e.target.value)}
                    placeholder={projectName || "Agent name"}
                    className={inputClass}
                  />
                </Field>
                <Field label="Welcome message">
                  <textarea
                    value={config.chat.welcome_message}
                    onChange={(e) => updateChat("welcome_message", e.target.value)}
                    placeholder="Send a message to start chatting"
                    rows={2}
                    className={inputClass + " resize-none"}
                  />
                </Field>
                <Toggle
                  label="File attachments"
                  checked={config.chat.attachments}
                  onChange={(v) => updateChat("attachments", v)}
                />
              </>
            )}

            {activeTab === "widget" && (
              <>
                <Toggle
                  label="Enabled"
                  checked={config.widget.enabled}
                  onChange={(v) => updateWidget("enabled", v)}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Button color">
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
                      <svg
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Width">
                    <input
                      type="text"
                      value={config.widget.width}
                      onChange={(e) => updateWidget("width", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Height">
                    <input
                      type="text"
                      value={config.widget.height}
                      onChange={(e) => updateWidget("height", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Welcome message">
                  <textarea
                    value={config.widget.welcome_message}
                    onChange={(e) => updateWidget("welcome_message", e.target.value)}
                    placeholder="Hi! How can I help you?"
                    rows={2}
                    className={inputClass + " resize-none"}
                  />
                </Field>
                <Field label="Input placeholder">
                  <input
                    type="text"
                    value={config.widget.placeholder}
                    onChange={(e) => updateWidget("placeholder", e.target.value)}
                    className={inputClass}
                  />
                </Field>
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
                      onClick={() => {
                        navigator.clipboard.writeText(widgetSnippet);
                        onToast("Snippet copied to clipboard");
                      }}
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      title="Copy"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                      </svg>
                    </button>
                  </div>
                </Field>
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
        <div className="flex justify-end px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Right: Live Preview */}
      <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-950 flex flex-col">
        <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Preview</span>
        </div>
        <div className="flex-1 min-h-0">
          {activeTab === "chat" && <ChatPreview config={config} projectName={projectName} />}
          {activeTab === "widget" && <WidgetPreview config={config} />}
          {activeTab === "api" && <ApiPreview config={config} />}
        </div>
      </div>
    </div>
  );
}
