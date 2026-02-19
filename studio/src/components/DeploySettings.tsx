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

function Section({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">{title}</span>
          {description && (
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 py-4 space-y-4">{children}</div>}
    </div>
  );
}

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
            checked ? "translate-x-4.5" : "translate-x-0.5"
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

export default function DeploySettings({
  isWorkspace,
  project,
  projectName,
  onToast,
}: DeploySettingsProps) {
  const [config, setConfig] = useState<DeployConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  // Generate embed snippet
  const widgetSnippet = `<script src="https://your-domain.com/widget.js"></script>`;

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
          Loading deploy settings...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Chat Page */}
      <Section title="Chat Page" description="Configure the standalone chat interface">
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
      </Section>

      {/* Widget */}
      <Section title="Widget" description="Embeddable chat widget for your website">
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
      </Section>

      {/* API */}
      <Section title="API" description="REST API and CORS configuration">
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
      </Section>

      {/* Save button */}
      <div className="flex justify-end pb-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
