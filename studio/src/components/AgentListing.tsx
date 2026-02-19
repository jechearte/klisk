import { useState } from "react";
import type { ProjectSnapshot } from "../types";

interface AgentListingProps {
  snapshot: ProjectSnapshot | null;
  onSelect: (agentName: string) => void;
  localServerMap: Record<string, boolean>;
}

export default function AgentListing({ snapshot, onSelect, localServerMap }: AgentListingProps) {
  const [search, setSearch] = useState("");

  if (!snapshot || Object.keys(snapshot.agents).length === 0) {
    const error =
      snapshot?.config && typeof snapshot.config === "object" && "error" in snapshot.config
        ? String((snapshot.config as Record<string, unknown>).error)
        : null;

    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-8">
        <span className="text-gray-400 dark:text-gray-500 text-sm">
          No agents found
        </span>
        {error && (
          <div className="max-w-xl w-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
            <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">
              Project load error
            </p>
            <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap break-words font-mono">
              {error}
            </pre>
          </div>
        )}
      </div>
    );
  }

  const allAgents = Object.values(snapshot.agents);
  const isWorkspace = snapshot.config && "workspace" in snapshot.config && snapshot.config.workspace === true;

  const query = search.toLowerCase().trim();
  const agents = query
    ? allAgents.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          (a.project && a.project.toLowerCase().includes(query)) ||
          (a.instructions && a.instructions.toLowerCase().includes(query))
      )
    : allAgents;

  return (
    <div className="h-full overflow-auto p-8">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Agents
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Select an agent to start a conversation
        </p>

        <div className="relative mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>

        {agents.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            No agents match "{search}"
          </p>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <button
              key={agent.name}
              onClick={() => onSelect(agent.name)}
              className="text-left bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-5 py-4 shadow-sm hover:border-blue-500 hover:shadow-md transition-all duration-150 cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${localServerMap[agent.project ?? ""] ? "bg-green-400" : "bg-gray-300 dark:bg-gray-600"}`} />
                <span className="font-semibold text-sm text-blue-600 dark:text-blue-400 truncate">
                  {agent.name}
                </span>
                {isWorkspace && agent.project && (
                  <span className="ml-auto text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded flex-shrink-0">
                    {agent.project}
                  </span>
                )}
              </div>

              {agent.model && (
                <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
                  {agent.model}
                </div>
              )}

              {agent.instructions && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                  {agent.instructions}
                </div>
              )}

              {agent.tools.length > 0 && (
                <div className="flex items-center gap-1.5 mt-auto">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="w-3 h-3 text-gray-400"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
                    />
                  </svg>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {agent.tools.length} tool{agent.tools.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
