import { useState, useEffect } from "react";
import type { AgentInfo, ModelsResponse } from "../types";

const KNOWN_PROVIDERS = ["openai", "anthropic", "gemini"] as const;

interface ParsedModel {
  provider: string;
  model: string;
}

function parseModelString(model: string | null): ParsedModel {
  if (!model || model === "") return { provider: "openai", model: "" };
  if (!model.includes("/")) return { provider: "openai", model };
  const [prefix, ...rest] = model.split("/");
  if ((KNOWN_PROVIDERS as readonly string[]).includes(prefix)) {
    return { provider: prefix, model: rest.join("/") };
  }
  return { provider: "custom", model };
}

function buildModelString(
  provider: string,
  selectedModel: string,
  customModel: string
): string {
  if (provider === "custom") return customModel;
  if (provider === "openai") return selectedModel;
  return selectedModel ? `${provider}/${selectedModel}` : "";
}

interface AgentModalProps {
  agent: AgentInfo;
  onClose: () => void;
  onSave: (originalName: string, updates: Record<string, unknown>) => void;
}

export default function AgentModal({ agent, onClose, onSave }: AgentModalProps) {
  const [name, setName] = useState(agent.name);
  const [instructions, setInstructions] = useState(agent.instructions ?? "");
  const [temperature, setTemperature] = useState<string>(
    agent.temperature != null ? String(agent.temperature) : ""
  );
  const [reasoningEffort, setReasoningEffort] = useState<string>(
    agent.reasoning_effort ?? "medium"
  );
  const [saving, setSaving] = useState(false);

  // Provider + Model state
  const [provider, setProvider] = useState("openai");
  const [selectedModel, setSelectedModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState(true);

  // Fetch models and parse agent.model on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchModels() {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) throw new Error("Failed to fetch models");
        const data: ModelsResponse = await res.json();
        if (cancelled) return;
        setProviderModels(data.providers);

        // Parse the current agent model
        const parsed = parseModelString(agent.model);
        const models = data.providers[parsed.provider];

        if (parsed.provider === "custom" || !models) {
          setProvider("custom");
          setCustomModel(agent.model ?? "");
        } else if (parsed.model && !models.includes(parsed.model)) {
          // Model not in list → custom
          setProvider("custom");
          setCustomModel(agent.model ?? "");
        } else {
          setProvider(parsed.provider);
          setSelectedModel(parsed.model);
        }
      } catch {
        // Fetch failed → custom mode
        if (cancelled) return;
        setProvider("custom");
        setCustomModel(agent.model ?? "");
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }
    fetchModels();
    return () => { cancelled = true; };
  }, [agent.model]);

  // When provider changes, auto-select first model
  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    if (newProvider === "custom") {
      setCustomModel(buildModelString(provider, selectedModel, customModel));
    } else {
      const models = providerModels[newProvider] ?? [];
      setSelectedModel(models[0] ?? "");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (name !== agent.name) updates.name = name;
      if (instructions !== (agent.instructions ?? ""))
        updates.instructions = instructions;

      const modelValue = buildModelString(provider, selectedModel, customModel);
      if (modelValue !== (agent.model ?? "")) updates.model = modelValue;

      const temp = temperature !== "" ? parseFloat(temperature) : null;
      if (temp !== agent.temperature) updates.temperature = temp;
      if (reasoningEffort !== (agent.reasoning_effort ?? "medium"))
        updates.reasoning_effort = reasoningEffort;

      console.log("[AgentModal] updates:", updates);

      if (Object.keys(updates).length > 0) {
        await onSave(agent.name, updates);
      }
    } catch (err) {
      console.error("[AgentModal] save error:", err);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  const currentModels = providerModels[provider] ?? [];

  const chevron = (
    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Edit Agent</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 resize-vertical"
            />
          </div>

          {/* Provider + Model */}
          <div className="grid grid-cols-2 gap-3">
            {/* Provider */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Provider
              </label>
              <div className="relative">
                <select
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  disabled={loadingModels}
                  className="w-full appearance-none bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 pr-10 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                  <option value="custom">Custom</option>
                </select>
                {chevron}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Model
              </label>
              {provider === "custom" ? (
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="provider/model-name"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                />
              ) : (
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={loadingModels}
                    className="w-full appearance-none bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 pr-10 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    {selectedModel === "" && (
                      <option value="">Select a model...</option>
                    )}
                    {currentModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {chevron}
                </div>
              )}
            </div>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Temperature
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="0.7"
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Reasoning Effort */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Reasoning Effort
            </label>
            <div className="relative">
              <select
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(e.target.value)}
                className="w-full appearance-none bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 pr-10 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="none">none</option>
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
              {chevron}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
