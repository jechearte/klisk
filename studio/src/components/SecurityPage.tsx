import { useState, useEffect, useCallback } from "react";
import type { SecurityConfig } from "../types";

interface SecurityPageProps {
  project?: string;
  isWorkspace: boolean;
  onToast: (msg: string) => void;
}

const DEFAULT_CONFIG: SecurityConfig = {
  interfaces: { chat_enabled: true, widget_enabled: true },
  keys: { api_key: "", chat_key: "", widget_key: "" },
};

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between ${disabled ? "opacity-50" : ""}`}>
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
        } ${disabled ? "cursor-not-allowed" : ""}`}
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

function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function KeyField({
  label,
  value,
  onChange,
  disabled,
  onToast,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onToast: (msg: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type={revealed || !value ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Not set"
          className="flex-1 font-mono bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
        />
        {value && (
          <button
            onClick={() => setRevealed(!revealed)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
            title={revealed ? "Hide" : "Show"}
          >
            {revealed ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            )}
          </button>
        )}
        <button
          onClick={() => {
            if (value) {
              navigator.clipboard.writeText(value);
              onToast("Key copied to clipboard");
            }
          }}
          disabled={!value}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0 disabled:opacity-30"
          title="Copy"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
          </svg>
        </button>
        <button
          onClick={() => onChange(generateKey())}
          className="px-3 py-2 text-xs font-medium text-blue-600 hover:text-blue-500 border border-blue-600 hover:border-blue-500 rounded-lg transition-colors flex-shrink-0"
          title={value ? "Regenerate random key" : "Generate random key"}
        >
          {value ? "Regenerate" : "Generate"}
        </button>
      </div>
    </div>
  );
}

export default function SecurityPage({
  project,
  isWorkspace,
  onToast,
}: SecurityPageProps) {
  const [config, setConfig] = useState<SecurityConfig>(DEFAULT_CONFIG);
  const [savedConfig, setSavedConfig] = useState<SecurityConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(savedConfig);

  const authEnabled =
    config.keys.api_key !== "" ||
    config.keys.chat_key !== "" ||
    config.keys.widget_key !== "";

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const params = isWorkspace && project ? `?project=${encodeURIComponent(project)}` : "";
      const res = await fetch(`/api/security${params}`);
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
      const res = await fetch(`/api/security${params}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.error) {
        onToast(`Error: ${data.error}`);
      } else {
        onToast("Security settings saved");
        setSavedConfig(config);
      }
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleAuth = (enabled: boolean) => {
    if (enabled) {
      setConfig((prev) => ({
        ...prev,
        keys: { api_key: generateKey(), chat_key: "", widget_key: "" },
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        keys: { api_key: "", chat_key: "", widget_key: "" },
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Loading security settings...
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Interfaces */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Interfaces
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Control which interfaces are available for your agent.
                </p>
              </div>
              <a href="https://klisk.productomania.io/docs/guides/interfaces.html" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 flex-shrink-0 mt-0.5" title="Documentation">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </a>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* REST API — always on */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">REST API</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Always on
                </span>
              </div>
              <Toggle
                label="Chat page"
                checked={config.interfaces.chat_enabled}
                onChange={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    interfaces: { ...prev.interfaces, chat_enabled: v },
                  }))
                }
              />
              <Toggle
                label="Widget"
                checked={config.interfaces.widget_enabled}
                onChange={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    interfaces: { ...prev.interfaces, widget_enabled: v },
                  }))
                }
              />
            </div>
          </div>

          {/* API Keys */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  API Keys
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Protect your endpoints with API keys when deployed.
                </p>
              </div>
              <a href="https://klisk.productomania.io/docs/guides/interfaces.html#protecting-your-interfaces" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 flex-shrink-0 mt-0.5" title="Documentation">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </a>
            </div>
            <div className="px-6 py-4 space-y-4">
              <Toggle
                label="Require authentication"
                checked={authEnabled}
                onChange={toggleAuth}
              />
              <KeyField
                label="API Key"
                value={config.keys.api_key}
                onChange={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    keys: { ...prev.keys, api_key: v },
                  }))
                }
                disabled={!authEnabled}
                onToast={onToast}
              />
              <KeyField
                label="Chat Key"
                value={config.keys.chat_key}
                onChange={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    keys: { ...prev.keys, chat_key: v },
                  }))
                }
                disabled={!authEnabled}
                onToast={onToast}
              />
              <KeyField
                label="Widget Key"
                value={config.keys.widget_key}
                onChange={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    keys: { ...prev.keys, widget_key: v },
                  }))
                }
                disabled={!authEnabled}
                onToast={onToast}
              />
              {!authEnabled && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Set at least one key to enable authentication.
                </p>
              )}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex justify-end gap-2">
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
      </div>
    </div>
  );
}
