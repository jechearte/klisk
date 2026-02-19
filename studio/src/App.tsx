import { useState, useEffect, useRef, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import AgentCanvas from "./components/AgentCanvas";
import AgentListing from "./components/AgentListing";
import AssistantPanel from "./components/AssistantPanel";
import Chat from "./components/Chat";
import AgentModal from "./components/AgentModal";
import ToolModal from "./components/ToolModal";
import EnvModal from "./components/EnvModal";
import OfflineScreen from "./components/OfflineScreen";
import type {
  ProjectSnapshot,
  ChatMessage,
  Attachment,
  AgentInfo,
  ToolInfo,
} from "./types";

const STORAGE_KEY_THEME = "klisk-theme";
const STORAGE_KEY_SPLIT = "klisk-split-percent";

// Legacy keys (pre-agent-scoped) — used for one-time migration
const LEGACY_STORAGE_KEY_MESSAGES = "klisk-chat-messages";
const LEGACY_STORAGE_KEY_RESPONSE_ID = "klisk-chat-response-id";

function messagesKey(agentName: string) {
  return `klisk-chat-messages-${agentName}`;
}
function responseIdKey(agentName: string) {
  return `klisk-chat-response-id-${agentName}`;
}

function loadMessagesFor(agentName: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(messagesKey(agentName));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadResponseIdFor(agentName: string): string | null {
  return localStorage.getItem(responseIdKey(agentName));
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

// One-time migration: move legacy global keys to first agent
function migrateLegacyStorage(firstAgentName: string) {
  const legacyMessages = localStorage.getItem(LEGACY_STORAGE_KEY_MESSAGES);
  const legacyResponseId = localStorage.getItem(LEGACY_STORAGE_KEY_RESPONSE_ID);
  if (legacyMessages || legacyResponseId) {
    if (legacyMessages && !localStorage.getItem(messagesKey(firstAgentName))) {
      localStorage.setItem(messagesKey(firstAgentName), legacyMessages);
    }
    if (legacyResponseId && !localStorage.getItem(responseIdKey(firstAgentName))) {
      localStorage.setItem(responseIdKey(firstAgentName), legacyResponseId);
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY_MESSAGES);
    localStorage.removeItem(LEGACY_STORAGE_KEY_RESPONSE_ID);
  }
}

type ViewState = { page: "listing" } | { page: "detail"; agentName: string };

export default function App() {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>({ page: "listing" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const chatWsRef = useRef<WebSocket | null>(null);
  const reloadWsRef = useRef<WebSocket | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const responseIdRef = useRef<string | null>(null);
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
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

  // Sync dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY_THEME, dark ? "dark" : "light");
  }, [dark]);

  // Run legacy migration once when snapshot loads
  useEffect(() => {
    if (snapshot && Object.keys(snapshot.agents).length > 0) {
      const firstAgent = Object.keys(snapshot.agents)[0];
      migrateLegacyStorage(firstAgent);
    }
  }, [snapshot]);

  // Load/save messages scoped to agent
  useEffect(() => {
    if (currentView.page === "detail") {
      const agentName = currentView.agentName;
      setMessages(loadMessagesFor(agentName));
      responseIdRef.current = loadResponseIdFor(agentName);
    }
  }, [currentView]);

  // Persist messages to localStorage scoped to agent (strip attachment data)
  useEffect(() => {
    if (currentView.page !== "detail") return;
    const agentName = currentView.agentName;
    const toSave = messages.map((m) => {
      if (m.role === "user" && m.attachments) {
        return {
          ...m,
          attachments: m.attachments.map(({ data: _, ...rest }) => rest),
        };
      }
      return m;
    });
    localStorage.setItem(messagesKey(agentName), JSON.stringify(toSave));
  }, [messages, currentView]);

  // Fetch initial project snapshot — detect server availability
  useEffect(() => {
    fetch("/api/project")
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then((data) => {
        setSnapshot(data);
        setServerOnline(true);
      })
      .catch(() => {
        setServerOnline(false);
      });
  }, []);

  // Connect to reload WebSocket (auto-reconnects)
  useEffect(() => {
    let active = true;
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (!active) return;
      ws = new WebSocket(`ws://${window.location.host}/ws/reload`);
      reloadWsRef.current = ws;

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "reload") {
          setSnapshot(data.snapshot);
          setToast("Project reloaded");
          setTimeout(() => setToast(null), 2000);
        }
      };

      ws.onclose = () => {
        if (!active) return;
        retryTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      active = false;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  // Connect to chat WebSocket (auto-reconnects)
  useEffect(() => {
    let active = true;
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (!active) return;
      ws = new WebSocket(`ws://${window.location.host}/ws/chat`);
      chatWsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setServerOnline(true);
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        chatWsRef.current = null;
        fetch("/api/project")
          .then((r) => { if (!r.ok) throw new Error(); })
          .catch(() => setServerOnline(false));
        retryTimer = setTimeout(connect, 2000);
      };

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);

        switch (data.type) {
          case "thinking":
            setMessages((prev) => {
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
            setMessages((prev) =>
              prev.map((m) =>
                m.role === "tool_call" && m.status === "running"
                  ? { ...m, status: "done" as const }
                  : m
              )
            );
            if (data.response_id) {
              responseIdRef.current = data.response_id;
              setCurrentView((cv) => {
                if (cv.page === "detail") {
                  localStorage.setItem(responseIdKey(cv.agentName), data.response_id);
                }
                return cv;
              });
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
    };

    connect();

    return () => {
      active = false;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  // Safety: navigate back to listing if selected agent is removed during hot reload
  useEffect(() => {
    if (currentView.page === "detail" && snapshot && !snapshot.agents[currentView.agentName]) {
      setCurrentView({ page: "listing" });
    }
  }, [snapshot, currentView]);

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
      // Include agent_name so the backend uses the correct agent
      setCurrentView((cv) => {
        if (cv.page === "detail") {
          payload.agent_name = cv.agentName;
        }
        chatWsRef.current!.send(JSON.stringify(payload));
        return cv;
      });
    },
    []
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    responseIdRef.current = null;
    // Clear scoped storage
    setCurrentView((cv) => {
      if (cv.page === "detail") {
        localStorage.removeItem(messagesKey(cv.agentName));
        localStorage.removeItem(responseIdKey(cv.agentName));
      }
      return cv;
    });
    // Tell the server to reset conversation context
    if (chatWsRef.current && chatWsRef.current.readyState === WebSocket.OPEN) {
      chatWsRef.current.send(JSON.stringify({ type: "clear" }));
    }
  }, []);

  const navigateToAgent = useCallback((agentName: string) => {
    setCurrentView({ page: "detail", agentName });
  }, []);

  const navigateToListing = useCallback(() => {
    setCurrentView({ page: "listing" });
  }, []);

  // --- API calls for saving ---

  const saveAgent = useCallback(
    async (originalName: string, updates: Record<string, unknown>) => {
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(originalName)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );
        if (!res.ok) {
          setToast(`Error: ${res.status} ${res.statusText}`);
          setTimeout(() => setToast(null), 3000);
          return;
        }
        const data = await res.json();
        if (data.error) {
          setToast(`Error: ${data.error}`);
          setTimeout(() => setToast(null), 3000);
        } else {
          setToast("Agent updated");
          setTimeout(() => setToast(null), 2000);
        }
      } catch (err) {
        setToast(`Error: ${String(err)}`);
        setTimeout(() => setToast(null), 3000);
      }
    },
    []
  );

  const saveTool = useCallback(
    async (originalName: string, updates: Record<string, unknown>) => {
      try {
        const res = await fetch(
          `/api/tools/${encodeURIComponent(originalName)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );
        if (!res.ok) {
          setToast(`Error: ${res.status} ${res.statusText}`);
          setTimeout(() => setToast(null), 3000);
          return;
        }
        const data = await res.json();
        if (data.error) {
          setToast(`Error: ${data.error}`);
          setTimeout(() => setToast(null), 3000);
        } else {
          setToast("Tool updated");
          setTimeout(() => setToast(null), 2000);
        }
      } catch (err) {
        setToast(`Error: ${String(err)}`);
        setTimeout(() => setToast(null), 3000);
      }
    },
    []
  );

  const config = snapshot?.config ?? {};
  const isDetail = currentView.page === "detail";

  // Show offline screen while loading or when server is unavailable
  if (serverOnline === false) {
    return (
      <OfflineScreen
        onServerReady={() => {
          fetch("/api/project")
            .then((r) => r.json())
            .then((data) => {
              setSnapshot(data);
              setServerOnline(true);
            })
            .catch(() => {});
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Shared Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          {isDetail && (
            <button
              onClick={navigateToListing}
              className="p-1.5 -ml-1 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Back to agents"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </button>
          )}
          <img src="/favicon.png" alt="Klisk" className="w-5 h-5" />
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
            {isDetail ? currentView.agentName : "Klisk Studio"}
          </h1>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-400" : "bg-red-400"
              }`}
            />
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {connected ? "Connected" : "Disconnected"}
            </span>
            {typeof config.name === "string" && !config.workspace && (
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
          {/* Env settings */}
          <button
            onClick={() => setShowEnvModal(true)}
            className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Environment Variables"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
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
          {/* Reset conversation — only show in detail view when on Chat tab */}
          {isDetail && !showAssistant && (
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
          )}
        </div>
      </div>

      {/* Main Content */}
      {currentView.page === "listing" ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Listing nav */}
          <div className="flex gap-1 px-8 pt-6 flex-shrink-0">
            <button
              onClick={() => setShowAssistant(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !showAssistant
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
                <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121ZM19.573 14.573a.563.563 0 0 0 .338.45 9.687 9.687 0 0 1-1.764.44 8.287 8.287 0 0 0-1.308-5.135 6.798 6.798 0 0 1 2.735 4.245Z" />
              </svg>
              Agents
            </button>
            <button
              onClick={() => setShowAssistant(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showAssistant
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z" clipRule="evenodd" />
              </svg>
              Assistant
            </button>
          </div>
          {/* Listing content */}
          {showAssistant ? (
            <div className="flex-1 flex items-stretch justify-center min-h-0 p-4">
              <div className="w-full max-w-[700px] flex flex-col min-h-0">
                <AssistantPanel active={showAssistant} />
              </div>
            </div>
          ) : (
            <AgentListing snapshot={snapshot} onSelect={navigateToAgent} />
          )}
        </div>
      ) : (
        <div ref={containerRef} className="flex flex-1 min-h-0">
          {/* Left column — Agent Canvas */}
          <div style={{ width: `${splitPercent}%` }} className="flex-shrink-0 min-w-0">
            <ReactFlowProvider>
              <AgentCanvas
                snapshot={snapshot}
                agentName={currentView.agentName}
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

          {/* Right column — Tabbed Chat / Assistant */}
          <div style={{ width: `${100 - splitPercent}%` }} className="flex flex-col min-h-0 min-w-0">
            {/* Tab bar */}
            <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
              <button
                onClick={() => setShowAssistant(false)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                  !showAssistant
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" />
                </svg>
                Chat
              </button>
              <button
                onClick={() => setShowAssistant(true)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                  showAssistant
                    ? "border-violet-500 text-violet-600 dark:text-violet-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z" clipRule="evenodd" />
                </svg>
                Assistant
              </button>
            </div>
            {/* Tab content */}
            <div className={`flex-1 flex flex-col min-h-0 ${showAssistant ? "hidden" : ""}`}>
              <Chat messages={messages} onSend={sendMessage} />
            </div>
            <div className={`flex-1 flex flex-col min-h-0 ${showAssistant ? "" : "hidden"}`}>
              <AssistantPanel active={showAssistant} />
            </div>
          </div>
        </div>
      )}

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

      {/* Env Modal */}
      {showEnvModal && (
        <EnvModal
          isWorkspace={!!config.workspace}
          initialProject={
            currentView.page === "detail"
              ? snapshot?.agents[currentView.agentName]?.project ?? undefined
              : undefined
          }
          onClose={() => setShowEnvModal(false)}
          onToast={(msg) => {
            setToast(msg);
            setTimeout(() => setToast(null), 2000);
          }}
        />
      )}

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 px-4 py-4 flex items-center justify-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
        <span>Built with</span>
        <span className="text-red-400">&#9829;</span>
        <span>by</span>
        <a
          href="https://www.linkedin.com/in/echeverriajuan/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          Juan Echeverria
        </a>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
