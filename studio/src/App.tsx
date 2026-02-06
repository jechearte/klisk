import { useState, useEffect, useRef, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import AgentCanvas from "./components/AgentCanvas";
import Chat from "./components/Chat";
import AgentModal from "./components/AgentModal";
import ToolModal from "./components/ToolModal";
import type {
  ProjectSnapshot,
  ChatMessage,
  Attachment,
  AgentInfo,
  ToolInfo,
} from "./types";

const STORAGE_KEY_MESSAGES = "agentkit-chat-messages";
const STORAGE_KEY_RESPONSE_ID = "agentkit-chat-response-id";
const STORAGE_KEY_THEME = "agentkit-theme";
const STORAGE_KEY_SPLIT = "agentkit-split-percent";

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MESSAGES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadResponseId(): string | null {
  return localStorage.getItem(STORAGE_KEY_RESPONSE_ID);
}

function loadDark(): boolean {
  return localStorage.getItem(STORAGE_KEY_THEME) !== "light";
}

function loadSplit(): number {
  const v = localStorage.getItem(STORAGE_KEY_SPLIT);
  if (v) {
    const n = parseFloat(v);
    if (n >= 20 && n <= 80) return n;
  }
  return 50;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [connected, setConnected] = useState(false);
  const chatWsRef = useRef<WebSocket | null>(null);
  const reloadWsRef = useRef<WebSocket | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const responseIdRef = useRef<string | null>(loadResponseId());
  const [dark, setDark] = useState(loadDark);

  // Resizable split
  const [splitPercent, setSplitPercent] = useState(loadSplit);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SPLIT, String(splitPercent));
  }, [splitPercent]);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(20, pct)));
    };
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Modal state
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null);

  // Sync dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY_THEME, dark ? "dark" : "light");
  }, [dark]);

  // Persist messages to localStorage (strip attachment data to save space)
  useEffect(() => {
    const toSave = messages.map((m) => {
      if (m.role === "user" && m.attachments) {
        return {
          ...m,
          attachments: m.attachments.map(({ data: _, ...rest }) => rest),
        };
      }
      return m;
    });
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(toSave));
  }, [messages]);

  // Fetch initial project snapshot
  useEffect(() => {
    fetch("/api/project")
      .then((r) => r.json())
      .then(setSnapshot)
      .catch(() => {});
  }, []);

  // Connect to reload WebSocket
  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws/reload`);
    reloadWsRef.current = ws;

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "reload") {
        setSnapshot(data.snapshot);
        setToast("Project reloaded");
        setTimeout(() => setToast(null), 2000);
      }
    };

    return () => ws.close();
  }, []);

  // Connect to chat WebSocket
  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws/chat`);
    chatWsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      switch (data.type) {
        case "thinking":
          setMessages((prev) => {
            // Search backwards for the last thinking message,
            // skipping over empty assistant messages (caused by empty text deltas)
            for (let i = prev.length - 1; i >= 0; i--) {
              const msg = prev[i];
              if (msg.role === "thinking") {
                return [
                  ...prev.slice(0, i),
                  { ...msg, content: msg.content + data.data },
                  ...prev.slice(i + 1),
                ];
              }
              if (msg.role !== "assistant" || msg.content.trim() !== "") {
                break;
              }
            }
            return [...prev, { role: "thinking" as const, content: data.data }];
          });
          break;

        case "token":
          if (!data.data) break;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + data.data },
              ];
            }
            return [...prev, { role: "assistant", content: data.data }];
          });

          break;

        case "tool_call":
          setMessages((prev) => [
            ...prev,
            {
              role: "tool_call" as const,
              tool: data.data.tool,
              arguments: data.data.arguments ?? "",
              output: "",
              status: "running" as const,
            },
          ]);

          break;

        case "tool_result":
          setMessages((prev) => {
            // Find last tool_call that is still running and update it
            const idx = [...prev].reverse().findIndex(
              (m) => m.role === "tool_call" && m.status === "running"
            );
            if (idx === -1) return prev;
            const realIdx = prev.length - 1 - idx;
            const item = prev[realIdx];
            if (item.role !== "tool_call") return prev;
            return [
              ...prev.slice(0, realIdx),
              { ...item, output: data.data.output ?? "", status: "done" as const },
              ...prev.slice(realIdx + 1),
            ];
          });

          break;

        case "done":

          if (data.response_id) {
            responseIdRef.current = data.response_id;
            localStorage.setItem(STORAGE_KEY_RESPONSE_ID, data.response_id);
          }
          break;

        case "error":
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `Error: ${data.data}` },
          ]);

          break;
      }
    };

    return () => ws.close();
  }, []);

  const sendMessage = useCallback(
    (text: string, attachments?: Attachment[]) => {
      if (!chatWsRef.current || chatWsRef.current.readyState !== WebSocket.OPEN)
        return;

      setMessages((prev) => [
        ...prev,
        { role: "user" as const, content: text, ...(attachments ? { attachments } : {}) },
      ]);
      const payload: Record<string, unknown> = { message: text };
      if (responseIdRef.current) {
        payload.previous_response_id = responseIdRef.current;
      }
      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }
      chatWsRef.current.send(JSON.stringify(payload));
    },
    []
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    responseIdRef.current = null;
    localStorage.removeItem(STORAGE_KEY_MESSAGES);
    localStorage.removeItem(STORAGE_KEY_RESPONSE_ID);
    // Tell the server to reset conversation context
    if (chatWsRef.current && chatWsRef.current.readyState === WebSocket.OPEN) {
      chatWsRef.current.send(JSON.stringify({ type: "clear" }));
    }
  }, []);

  // --- API calls for saving ---

  const saveAgent = useCallback(
    async (originalName: string, updates: Record<string, unknown>) => {
      try {
        console.log("[Studio] Saving agent", originalName, updates);
        const res = await fetch(
          `/api/agents/${encodeURIComponent(originalName)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );
        console.log("[Studio] Response status:", res.status);
        if (!res.ok) {
          const text = await res.text();
          console.error("[Studio] Error response:", text);
          setToast(`Error: ${res.status} ${res.statusText}`);
          setTimeout(() => setToast(null), 3000);
          return;
        }
        const data = await res.json();
        console.log("[Studio] Response data:", data);
        if (data.error) {
          setToast(`Error: ${data.error}`);
          setTimeout(() => setToast(null), 3000);
        } else {
          setToast("Agent updated");
          setTimeout(() => setToast(null), 2000);
        }
      } catch (err) {
        console.error("[Studio] saveAgent failed:", err);
        setToast(`Error: ${String(err)}`);
        setTimeout(() => setToast(null), 3000);
      }
    },
    []
  );

  const saveTool = useCallback(
    async (originalName: string, updates: Record<string, unknown>) => {
      try {
        console.log("[Studio] Saving tool", originalName, updates);
        const res = await fetch(
          `/api/tools/${encodeURIComponent(originalName)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );
        console.log("[Studio] Response status:", res.status);
        if (!res.ok) {
          const text = await res.text();
          console.error("[Studio] Error response:", text);
          setToast(`Error: ${res.status} ${res.statusText}`);
          setTimeout(() => setToast(null), 3000);
          return;
        }
        const data = await res.json();
        console.log("[Studio] Response data:", data);
        if (data.error) {
          setToast(`Error: ${data.error}`);
          setTimeout(() => setToast(null), 3000);
        } else {
          setToast("Tool updated");
          setTimeout(() => setToast(null), 2000);
        }
      } catch (err) {
        console.error("[Studio] saveTool failed:", err);
        setToast(`Error: ${String(err)}`);
        setTimeout(() => setToast(null), 3000);
      }
    },
    []
  );

  const config = snapshot?.config ?? {};

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Shared Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">AgentKit Studio</h1>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-400" : "bg-red-400"
              }`}
            />
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {connected ? "Connected" : "Disconnected"}
            </span>
            {typeof config.name === "string" && (
              <>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {String(config.name)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={() => setDark((d) => !d)}
            className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0Zm11.394-5.834a.75.75 0 0 0-1.06-1.06l-1.591 1.59a.75.75 0 1 0 1.06 1.061l1.591-1.59Zm-12.728.53a.75.75 0 1 0 1.06-1.06l-1.59-1.591a.75.75 0 0 0-1.061 1.06l1.59 1.591ZM12 18a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-2.25A.75.75 0 0 1 12 18ZM7.758 17.303a.75.75 0 0 0-1.061-1.06l-1.591 1.59a.75.75 0 0 0 1.06 1.061l1.591-1.59Zm9.544-1.06a.75.75 0 0 0-1.06 1.06l1.59 1.591a.75.75 0 1 0 1.061-1.06l-1.59-1.591ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5H21a.75.75 0 0 1 .75.75ZM5.25 12a.75.75 0 0 1-.75.75H2.25a.75.75 0 0 1 0-1.5H4.5a.75.75 0 0 1 .75.75Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          {/* Reset conversation */}
          <button
            onClick={clearChat}
            className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Reset conversation"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div ref={containerRef} className="flex flex-1 min-h-0">
        {/* Left column — Agent Canvas */}
        <div style={{ width: `${splitPercent}%` }} className="flex-shrink-0 min-w-0">
          <ReactFlowProvider>
            <AgentCanvas
              snapshot={snapshot}
              onSelectAgent={setSelectedAgent}
              onSelectTool={setSelectedTool}
            />
          </ReactFlowProvider>
        </div>

        {/* Draggable divider */}
        <div
          onMouseDown={onDividerMouseDown}
          className="splitter-divider flex-shrink-0"
        />

        {/* Right column — Chat */}
        <div style={{ width: `${100 - splitPercent}%` }} className="flex flex-col min-h-0 min-w-0">
          <Chat messages={messages} onSend={sendMessage} />
        </div>
      </div>

      {/* Agent Modal */}
      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onSave={saveAgent}
        />
      )}

      {/* Tool Modal */}
      {selectedTool && (
        <ToolModal
          tool={selectedTool}
          onClose={() => setSelectedTool(null)}
          onSave={saveTool}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
