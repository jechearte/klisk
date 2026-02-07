import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ToolInfo } from "../types";
import { ToolIcon, formatToolDisplayName, isBuiltinTool } from "../utils/builtinTools";

type ToolNodeData = ToolInfo & { label: string };

export default function ToolNode({ data }: NodeProps) {
  const tool = data as unknown as ToolNodeData;
  const builtin = isBuiltinTool(tool.name);
  const displayName = formatToolDisplayName(tool.name);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[180px] max-w-[240px] shadow-lg cursor-pointer hover:border-green-500 transition-colors">
      {/* Top handle to receive connections from agents */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-green-400 !w-2 !h-2 !border-0"
      />

      <div className="flex items-center gap-2 mb-1">
        <span className={builtin ? "text-green-500 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}>
          <ToolIcon name={tool.name} className="w-3.5 h-3.5" />
        </span>
        <span className="font-semibold text-sm text-green-600 dark:text-green-400 truncate">
          {displayName}
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
