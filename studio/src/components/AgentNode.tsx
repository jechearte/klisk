import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentInfo } from "../types";

type AgentNodeData = AgentInfo & { label: string };

export default function AgentNode({ data }: NodeProps) {
  const agent = data as unknown as AgentNodeData;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[200px] max-w-[260px] shadow-lg cursor-pointer hover:border-blue-500 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
        <span className="font-semibold text-sm text-blue-600 dark:text-blue-400 truncate">
          {agent.name}
        </span>
      </div>

      {agent.model && (
        <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">{agent.model}</div>
      )}

      {agent.instructions && (
        <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
          {agent.instructions}
        </div>
      )}

      {agent.tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.tools.map((t) => (
            <span
              key={t}
              className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Bottom handle to connect to tools */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-400 !w-2 !h-2 !border-0"
      />
    </div>
  );
}
