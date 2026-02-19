import { useState, useEffect, useCallback } from "react";
import type { LocalServerStatus, CloudDeployStatus } from "../types";

interface DeployPageProps {
  project?: string;
  isWorkspace?: boolean;
  onToast: (msg: string) => void;
}

export default function DeployPage({ project, isWorkspace, onToast }: DeployPageProps) {
  // --- Local server state ---
  const [localStatus, setLocalStatus] = useState<LocalServerStatus>({
    running: false,
    port: null,
    pid: null,
    url: null,
  });
  const [localLoading, setLocalLoading] = useState(true);
  const [localActing, setLocalActing] = useState(false);

  // --- Cloud state ---
  const [cloudStatus, setCloudStatus] = useState<CloudDeployStatus | null>(null);
  const [cloudChecking, setCloudChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const qs = project ? `?project=${encodeURIComponent(project)}` : "";

  // Fetch local server status
  const fetchLocalStatus = useCallback(async () => {
    setLocalLoading(true);
    try {
      const res = await fetch(`/api/local-server/status${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      setLocalStatus(data);
    } catch {
      // Server may not support this endpoint yet
    } finally {
      setLocalLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    fetchLocalStatus();
  }, [fetchLocalStatus]);

  const handleStartServer = async () => {
    setLocalActing(true);
    try {
      const res = await fetch(`/api/local-server/start${qs}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        onToast("Server started");
        await fetchLocalStatus();
      } else {
        onToast(`Error: ${data.error}`);
      }
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setLocalActing(false);
    }
  };

  const handleStopServer = async () => {
    setLocalActing(true);
    try {
      const res = await fetch(`/api/local-server/stop${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        onToast("Server stopped");
        await fetchLocalStatus();
      } else {
        onToast(`Error: ${data.error || "Failed to stop"}`);
      }
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setLocalActing(false);
    }
  };

  const handleCheckCloud = async () => {
    setCloudChecking(true);
    try {
      const res = await fetch(`/api/deploy/cloud-status${qs}`);
      if (!res.ok) {
        onToast("Failed to check cloud status");
        return;
      }
      const data = await res.json();
      setCloudStatus(data);
    } catch (err) {
      onToast(`Error: ${String(err)}`);
    } finally {
      setCloudChecking(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 pt-10 pb-6 space-y-6">
        <div className="w-full max-w-2xl mx-auto space-y-6">

          {/* ---- LOCAL SERVER ---- */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Local Server
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Run your agent locally as a production server.
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {localLoading ? (
                <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                  Loading...
                </div>
              ) : localStatus.running ? (
                /* Running state */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Running on port {localStatus.port}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <code className="text-sm text-blue-600 dark:text-blue-400 font-mono">
                      {localStatus.url}
                    </code>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={localStatus.url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        Open
                      </a>
                      <button
                        onClick={handleStopServer}
                        disabled={localActing}
                        className="px-3 py-1.5 text-xs font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 rounded-lg transition-colors"
                      >
                        {localActing ? "Stopping..." : "Stop"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Not running state */
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Not running
                    </span>
                  </div>
                  <button
                    onClick={handleStartServer}
                    disabled={localActing}
                    className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {localActing ? "Starting..." : "Start Server"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ---- GOOGLE CLOUD ---- */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Google Cloud
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Deploy to Google Cloud Run.
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-6">
              {/* Requirements */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Requirements
                </h3>
                <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0 text-xs">1.</span>
                    <span>
                      Install <a href="https://cloud.google.com/sdk/docs/install" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Google Cloud CLI</a> (gcloud)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0 text-xs">2.</span>
                    <span>
                      Authenticate: <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">gcloud auth login</code>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0 text-xs">3.</span>
                    <span>Configure a GCP project with billing enabled</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0 text-xs">4.</span>
                    <span>
                      Set API keys in <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">.env</code>
                    </span>
                  </li>
                </ol>
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Then run from terminal:
                  </p>
                  <code className="text-sm font-mono text-gray-900 dark:text-gray-100 mt-1 block">
                    klisk deploy{isWorkspace && project ? ` ${project}` : ""}
                  </code>
                </div>
              </div>

              {/* Deployment status */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Deployment
                  </h3>
                  <button
                    onClick={handleCheckCloud}
                    disabled={cloudChecking}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {cloudChecking ? "Checking..." : "Check Status"}
                  </button>
                </div>

                {cloudStatus === null ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Click "Check Status" to query your deployment.
                  </p>
                ) : cloudStatus.deployed ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-500 flex-shrink-0">
                        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Deployed
                      </span>
                    </div>
                    <div className="space-y-1 pl-6">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-8">URL</span>
                        <code className="text-sm text-blue-600 dark:text-blue-400 font-mono truncate">
                          {cloudStatus.url}
                        </code>
                        <button
                          onClick={() => handleCopy(cloudStatus.url!)}
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                          title="Copy URL"
                        >
                          {copied ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-green-500">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
                              <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-8">API</span>
                        <code className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">
                          {cloudStatus.url}/api/chat
                        </code>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {cloudStatus.message || "Not deployed yet"}
                    </p>
                    {cloudStatus.message !== "Service not deployed yet" && cloudStatus.message && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Run <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded font-mono">klisk deploy</code> from your terminal to deploy.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
