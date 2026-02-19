import { useState, useEffect, useCallback } from "react";
import type { GlobalConfig } from "../types";

interface SettingsPageProps {
  onToast: (msg: string) => void;
}

export default function SettingsPage({ onToast }: SettingsPageProps) {
  const [config, setConfig] = useState<GlobalConfig>({ gcloud: { project: "", region: "" } });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/global-config");
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
  }, [onToast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/global-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.error) {
        onToast(`Error: ${data.error}`);
      } else {
        onToast("Settings saved");
      }
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 py-6">
        <div className="w-full max-w-2xl mx-auto">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Settings
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Global configuration shared across all projects.
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-6">
              {loading ? (
                <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                  Loading...
                </div>
              ) : (
                <>
                  {/* Section: Google Cloud */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                      Google Cloud
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Project ID
                        </label>
                        <input
                          type="text"
                          value={config.gcloud.project}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              gcloud: { ...c.gcloud, project: e.target.value },
                            }))
                          }
                          placeholder="my-gcp-project"
                          className="w-full font-mono bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Region
                        </label>
                        <input
                          type="text"
                          value={config.gcloud.region}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              gcloud: { ...c.gcloud, region: e.target.value },
                            }))
                          }
                          placeholder="us-central1"
                          className="w-full font-mono bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
