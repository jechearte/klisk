import { useState, useEffect, useRef, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import AgentCanvas from "./components/AgentCanvas";
import Chat from "./components/Chat";
import AgentModal from "./components/AgentModal";
import ToolModal from "./components/ToolModal";
import type {
  ProjectSnapshot,
  ChatMessage,
  AgentInfo,
  ToolInfo,
} from "./types";

const STORAGE_KEY_MESSAGES = "agentkit-chat-messages";
const STORAGE_KEY_RESPONSE_ID = "agentkit-chat-response-id";
const STORAGE_KEY_THEME = "agentkit-theme";

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

export default function App() {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const chatWsRef = useRef<WebSocket | null>(null);
  const reloadWsRef = useRef<WebSocket | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const responseIdRef = useRef<string | null>(loadResponseId());
  const [dark, setDark] = useState(loadDark);

  // Modal state
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null);

  // Sync dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY_THEME, dark ? "dark" : "light");
  }, [dark]);

  // Persist messages to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
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
            const last = prev[prev.length - 1];
            if (last && last.role === "thinking") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + data.data },
              ];
            }
            return [...prev, { role: "thinking" as const, content: data.data }];
          });
          break;

        case "token":
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
          setStatus(null);
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
          setStatus(null);
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
          setStatus(null);
          break;

        case "done":
          setStatus(null);
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
          setStatus(null);
          break;
      }
    };

    return () => ws.close();
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!chatWsRef.current || chatWsRef.current.readyState !== WebSocket.OPEN)
        return;

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setStatus("Thinking...");
      const payload: Record<string, string> = { message: text };
      if (responseIdRef.current) {
        payload.previous_response_id = responseIdRef.current;
      }
      chatWsRef.current.send(JSON.stringify(payload));
    },
    []
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setStatus(null);
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
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903H14.25a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 .75-.75v-6a.75.75 0 0 0-1.5 0v4.956l-1.903-1.903A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm14.49 3.882a7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h4.955a.75.75 0 0 0 0-1.5h-6a.75.75 0 0 0-.75.75v6a.75.75 0 0 0 1.5 0v-4.956l1.903 1.903A9 9 0 0 0 20.694 14.33a.75.75 0 1 0-1.45-.388Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Left column — Agent Canvas */}
        <div className="w-1/2 border-r border-gray-200 dark:border-gray-800 flex-shrink-0">
          <ReactFlowProvider>
            <AgentCanvas
              snapshot={snapshot}
              onSelectAgent={setSelectedAgent}
              onSelectTool={setSelectedTool}
            />
          </ReactFlowProvider>
        </div>

        {/* Right column — Chat */}
        <div className="w-1/2 flex flex-col min-h-0">
          <Chat messages={messages} status={status} onSend={sendMessage} />
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
