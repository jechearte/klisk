import type { ProjectSnapshot } from "../types";
import { ToolIcon, formatToolDisplayName } from "../utils/builtinTools";

interface SidebarProps {
  snapshot: ProjectSnapshot | null;
  connected: boolean;
}

export default function Sidebar({ snapshot, connected }: SidebarProps) {
  const agents = snapshot ? Object.values(snapshot.agents) : [];
  const tools = snapshot ? Object.values(snapshot.tools) : [];
  const config = snapshot?.config ?? {};

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-white">Klisk Studio</h1>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-green-400" : "bg-red-400"
            }`}
          />
          <span className="text-xs text-gray-400">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Project Config */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Project
        </h2>
        <div className="text-sm space-y-1">
          <div>
            <span className="text-gray-500">Name: </span>
            <span className="text-gray-200">
              {(config.name as string) ?? "Unknown"}
            </span>
          </div>
          {typeof config.defaults === "object" && config.defaults && (
            <>
              <div>
                <span className="text-gray-500">Model: </span>
                <span className="text-gray-200">
                  {(config.defaults as Record<string, unknown>).model as string}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Temperature: </span>
                <span className="text-gray-200">
                  {String(
                    (config.defaults as Record<string, unknown>).temperature
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Agents */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Agents ({agents.length})
        </h2>
        {agents.length === 0 ? (
          <p className="text-sm text-gray-500">No agents found</p>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.name}
                className="bg-gray-900 rounded-lg p-3 border border-gray-800"
              >
                <div className="font-medium text-sm text-blue-400">
                  {agent.name}
                </div>
                {agent.model && (
                  <div className="text-xs text-gray-500 mt-1">
                    {agent.model}
                  </div>
                )}
                {agent.instructions && (
                  <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                    {agent.instructions}
                  </div>
                )}
                {agent.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {agent.tools.map((t) => (
                      <span
                        key={t}
                        className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded"
                      >
                        {formatToolDisplayName(t)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tools */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Tools ({tools.length})
        </h2>
        {tools.length === 0 ? (
          <p className="text-sm text-gray-500">No tools found</p>
        ) : (
          <div className="space-y-2">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="bg-gray-900 rounded-lg p-3 border border-gray-800"
              >
                <div className="flex items-center gap-2 font-medium text-sm text-green-400">
                  <ToolIcon name={tool.name} className="w-3.5 h-3.5" />
                  {formatToolDisplayName(tool.name)}
                </div>
                {tool.description && (
                  <div className="text-xs text-gray-400 mt-1">
                    {tool.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
