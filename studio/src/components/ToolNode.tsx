import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ToolInfo } from "../types";

type ToolNodeData = ToolInfo & { label: string };

export default function ToolNode({ data }: NodeProps) {
  const tool = data as unknown as ToolNodeData;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[180px] max-w-[240px] shadow-lg cursor-pointer hover:border-green-500 transition-colors">
      {/* Top handle to receive connections from agents */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-green-400 !w-2 !h-2 !border-0"
      />

      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
        <span className="font-semibold text-sm text-green-600 dark:text-green-400 truncate">
          {tool.name}
        </span>
      </div>

      {tool.description && (
        <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">
          {tool.description}
        </div>
      )}
    </div>
  );
}
