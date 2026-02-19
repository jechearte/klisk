import { useState, useEffect, useCallback } from "react";
import type { EnvVariable } from "../types";

const SENSITIVE_PATTERNS = /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i;

interface EnvPageProps {
  project?: string;
  onToast: (msg: string) => void;
}

export default function EnvPage({
  project,
  onToast,
}: EnvPageProps) {
  const [variables, setVariables] = useState<EnvVariable[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchEnv = useCallback(async () => {
    setLoading(true);
    try {
      const params = project ? `?project=${encodeURIComponent(project)}` : "";
      const res = await fetch(`/api/env${params}`);
      const data = await res.json();
      if (data.error) {
        onToast(`Error: ${data.error}`);
        return;
      }
      setVariables(data.variables ?? []);
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [project, onToast]);

  useEffect(() => {
    fetchEnv();
  }, [fetchEnv]);

  const updateVariable = (index: number, field: "key" | "value", val: string) => {
    setVariables((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: val } : v))
    );
  };

  const addVariable = () => {
    setVariables((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeVariable = (index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
    setRevealed((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      }
      return next;
    });
  };

  const toggleReveal = (index: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const isSensitive = (key: string) => SENSITIVE_PATTERNS.test(key);

  const duplicateKeys = new Set<string>();
  const seenKeys = new Map<string, number>();
  variables.forEach((v, i) => {
    const k = v.key.trim();
    if (!k) return;
    if (seenKeys.has(k)) {
      duplicateKeys.add(k);
    }
    seenKeys.set(k, i);
  });

  const hasDuplicates = duplicateKeys.size > 0;
  const canSave = !saving && !hasDuplicates;

  const handleSave = async () => {
    setSaving(true);
    try {
      const params = project
        ? `?project=${encodeURIComponent(project)}`
        : "";
      const res = await fetch(`/api/env${params}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
      });
      const data = await res.json();
      if (data.error) {
        onToast(`Error: ${data.error}`);
      } else {
        onToast("Environment variables saved");
      }
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Environment Variables
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Manage API keys and environment variables for your project.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
              Loading...
            </div>
          )}

          {/* Variable list */}
          {!loading && (
            <>
              {variables.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    No environment variables configured.
                  </p>
                  <button
                    onClick={addVariable}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                  >
                    + Add your first variable
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {variables.map((variable, index) => {
                    const isDup = duplicateKeys.has(variable.key.trim());
                    const sensitive = isSensitive(variable.key);
                    const isRevealed = revealed.has(index);

                    return (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={variable.key}
                          onChange={(e) =>
                            updateVariable(index, "key", e.target.value)
                          }
                          placeholder="KEY"
                          className={`w-1/3 font-mono bg-gray-50 dark:bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 ${
                            isDup
                              ? "border-red-500 dark:border-red-500"
                              : "border-gray-300 dark:border-gray-700"
                          }`}
                        />
                        <input
                          type={sensitive && !isRevealed ? "password" : "text"}
                          value={variable.value}
                          onChange={(e) =>
                            updateVariable(index, "value", e.target.value)
                          }
                          placeholder="value"
                          className="flex-1 font-mono bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                        />
                        {sensitive && (
                          <button
                            onClick={() => toggleReveal(index)}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
                            title={isRevealed ? "Hide value" : "Show value"}
                          >
                            {isRevealed ? (
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
                          onClick={() => removeVariable(index)}
                          className="p-2 text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors flex-shrink-0"
                          title="Remove variable"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}

                  <button
                    onClick={addVariable}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors mt-2"
                  >
                    + Add Variable
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
