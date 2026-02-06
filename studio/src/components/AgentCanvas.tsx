import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeMouseHandler,
  BackgroundVariant,
} from "@xyflow/react";
import AgentNode from "./AgentNode";
import ToolNode from "./ToolNode";
import type { ProjectSnapshot, AgentInfo, ToolInfo } from "../types";

interface AgentCanvasProps {
  snapshot: ProjectSnapshot | null;
  agentName?: string;
  onSelectAgent: (agent: AgentInfo) => void;
  onSelectTool: (tool: ToolInfo) => void;
}

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
};

export default function AgentCanvas({
  snapshot,
  agentName,
  onSelectAgent,
  onSelectTool,
}: AgentCanvasProps) {
  const { nodes, edges } = useMemo(() => {
    if (!snapshot) return { nodes: [] as Node[], edges: [] as Edge[] };

    // If agentName is provided, show only that agent; otherwise show all
    const agents = agentName && snapshot.agents[agentName]
      ? [snapshot.agents[agentName]]
      : Object.values(snapshot.agents);
    const toolMap = snapshot.tools;
    const allNodes: Node[] = [];
    const allEdges: Edge[] = [];

    // Collect unique tools referenced by agents
    const usedToolNames = new Set<string>();
    agents.forEach((a) => a.tools.forEach((t) => usedToolNames.add(t)));

    const totalAgents = agents.length;
    const totalTools = usedToolNames.size;

    // Layout: agents on top row, tools on bottom row
    const agentSpacing = 300;
    const toolSpacing = 280;
    const agentStartX =
      totalAgents > 1 ? -((totalAgents - 1) * agentSpacing) / 2 : 0;
    const toolStartX =
      totalTools > 1 ? -((totalTools - 1) * toolSpacing) / 2 : 0;

    // Create agent nodes
    agents.forEach((agent, i) => {
      allNodes.push({
        id: `agent-${agent.name}`,
        type: "agent",
        position: { x: agentStartX + i * agentSpacing, y: 0 },
        data: { ...agent, label: agent.name },
      });
    });

    // Create tool nodes
    const toolNames = Array.from(usedToolNames);
    toolNames.forEach((toolName, i) => {
      const toolInfo = toolMap[toolName];
      allNodes.push({
        id: `tool-${toolName}`,
        type: "tool",
        position: { x: toolStartX + i * toolSpacing, y: 250 },
        data: {
          name: toolName,
          description: toolInfo?.description ?? "",
          parameters: toolInfo?.parameters ?? {},
          source_file: toolInfo?.source_file ?? null,
          label: toolName,
        },
      });
    });

    // Create edges: agent -> tool
    agents.forEach((agent) => {
      agent.tools.forEach((toolName) => {
        allEdges.push({
          id: `${agent.name}-${toolName}`,
          source: `agent-${agent.name}`,
          target: `tool-${toolName}`,
          type: "smoothstep",
          style: { stroke: "#9ca3af", strokeWidth: 1.5 },
        });
      });
    });

    return { nodes: allNodes, edges: allEdges };
  }, [snapshot, agentName]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (!snapshot) return;

      if (node.type === "agent") {
        const agentName = node.id.replace("agent-", "");
        const agent = snapshot.agents[agentName];
        if (agent) onSelectAgent(agent);
      } else if (node.type === "tool") {
        const toolName = node.id.replace("tool-", "");
        const tool = snapshot.tools[toolName];
        if (tool) onSelectTool(tool);
      }
    },
    [snapshot, onSelectAgent, onSelectTool]
  );

  return (
    <div className="h-full">
      <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          className="bg-gray-50 dark:bg-gray-950"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#d1d5db"
            className="dark:[&>pattern>circle]:!fill-[#1f2937]"
          />
          <Controls
            className="!bg-white dark:!bg-gray-800 !border-gray-300 dark:!border-gray-700 !rounded-lg [&>button]:!bg-white dark:[&>button]:!bg-gray-800 [&>button]:!border-gray-300 dark:[&>button]:!border-gray-700 [&>button]:!text-gray-500 dark:[&>button]:!text-gray-400 [&>button:hover]:!bg-gray-100 dark:[&>button:hover]:!bg-gray-700"
          />
        </ReactFlow>
    </div>
  );
}
