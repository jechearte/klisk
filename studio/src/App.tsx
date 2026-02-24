import { useState, useEffect, useRef, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import AgentCanvas from "./components/AgentCanvas";
import AgentListing from "./components/AgentListing";
import AssistantPanel, { type AssistantPanelHandle } from "./components/AssistantPanel";
import Chat from "./components/Chat";
import Sidebar from "./components/Sidebar";
import type { DetailNavItem, ListingNavItem } from "./components/Sidebar";
import AgentModal from "./components/AgentModal";
import ToolModal from "./components/ToolModal";
import EnvPage from "./components/EnvPage";
import DeploySettings from "./components/DeploySettings";
import DeployPage from "./components/DeployPage";
import SecurityPage from "./components/SecurityPage";
import OfflineScreen from "./components/OfflineScreen";
import type {
  ProjectSnapshot,
  ChatMessage,
  Attachment,
  AgentInfo,
  ToolInfo,
  LocalServerStatus,
} from "./types";

const STORAGE_KEY_THEME = "klisk-theme";
const STORAGE_KEY_SPLIT = "klisk-split-percent";
const STORAGE_KEY_SIDEBAR = "klisk-sidebar-collapsed";

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

type ViewState =
  | { page: "listing" }
  | { page: "detail"; agentName: string; tab: "playground" | "env" | "security" | "customize" | "deploy" };

export default function App() {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>({ page: "listing" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [localServerMap, setLocalServerMap] = useState<Record<string, boolean>>({});
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
  const [showAssistant, setShowAssistant] = useState(false);
  const assistantRef = useRef<AssistantPanelHandle>(null);
  const [assistantHasMessages, setAssistantHasMessages] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY_SIDEBAR) === "true"
  );

  // Sync dark class on <html> and PWA theme-color
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY_THEME, dark ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#111827" : "#2563eb");
  }, [dark]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      localStorage.setItem(STORAGE_KEY_SIDEBAR, String(!v));
      return !v;
    });
  }, []);

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

      ws.onopen = () => {
        // Re-fetch snapshot on (re)connect to catch any changes
        // that occurred while the WebSocket was disconnected.
        fetch("/api/project")
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => { if (data) setSnapshot(data); })
          .catch(() => {});
      };

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

  // Poll local server status for every unique project
  useEffect(() => {
    if (!snapshot) return;
    const projects = new Set<string>();
    for (const a of Object.values(snapshot.agents)) {
      projects.add(a.project ?? "");
    }

    let active = true;
    const check = async () => {
      const entries = await Promise.all(
        [...projects].map(async (p) => {
          const qs = p ? `?project=${encodeURIComponent(p)}` : "";
          try {
            const res = await fetch(`/api/local-server/status${qs}`);
            if (!res.ok) return [p, false] as const;
            const data: LocalServerStatus = await res.json();
            return [p, data.running] as const;
          } catch {
            return [p, false] as const;
          }
        })
      );
      if (active) setLocalServerMap(Object.fromEntries(entries));
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [snapshot]);

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
    setCurrentView({ page: "detail", agentName, tab: "playground" });
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteAgent = useCallback(
    async (agentName: string) => {
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(agentName)}`,
          { method: "DELETE" }
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
          setToast("Project deleted");
          setTimeout(() => setToast(null), 2000);
          setCurrentView({ page: "listing" });
        }
      } catch (err) {
        setToast(`Error: ${String(err)}`);
        setTimeout(() => setToast(null), 3000);
      }
    },
    []
  );

  const openAssistantWith = useCallback((message: string) => {
    setCurrentView({ page: "listing" });
    setShowAssistant(true);
    // Small delay to let the panel mount/connect before sending
    setTimeout(() => {
      assistantRef.current?.clearChat();
      // Another small delay after clear so the WS is ready
      setTimeout(() => {
        assistantRef.current?.sendMessage(message);
      }, 300);
    }, 100);
  }, []);

  const config = snapshot?.config ?? {};
  const isDetail = currentView.page === "detail";
  const activeTab = isDetail ? currentView.tab : "playground";

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

  const handleListingNavigate = (item: ListingNavItem) => {
    if (item === "agents") {
      setShowAssistant(false);
      setCurrentView({ page: "listing" });
    } else if (item === "assistant") {
      setShowAssistant(true);
      setCurrentView({ page: "listing" });
    }
  };

  const handleDetailNavigate = (item: DetailNavItem) => {
    if (currentView.page !== "detail") return;
    setCurrentView({ ...currentView, tab: item });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* PWA Window Controls Overlay drag region */}
      <div className="wco-titlebar hidden bg-blue-600 dark:bg-gray-950 border-b border-blue-700 dark:border-gray-800" />
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        mode={isDetail ? "detail" : "listing"}
        activeListingItem={showAssistant ? "assistant" : "agents"}
        activeDetailItem={activeTab}
        onListingNavigate={handleListingNavigate}
        onDetailNavigate={handleDetailNavigate}
        onLogoClick={() => {
          setShowAssistant(false);
          setCurrentView({ page: "listing" });
        }}
      />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header — detail view only */}
        {isDetail && (
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={navigateToListing}
                className="p-1.5 -ml-1 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Back to agents"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
              </button>
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
                {currentView.agentName}
              </h1>
              <div className="flex items-center gap-2">
                {(() => {
                  const proj = snapshot?.agents[currentView.agentName]?.project ?? "";
                  const running = localServerMap[proj] ?? false;
                  return (
                    <>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          running ? "bg-green-400" : "bg-gray-300 dark:bg-gray-600"
                        }`}
                        title={running ? "Local server running" : "Local server not running"}
                      />
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {running ? "Deployed" : "Not deployed"}
                      </span>
                    </>
                  );
                })()}
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
              {/* Reset conversation — only on playground tab */}
              {activeTab === "playground" && (
                <button
                  onClick={clearChat}
                  className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Reset conversation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
              )}
              {/* Delete agent */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Delete agent"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        {currentView.page === "listing" ? (
          showAssistant ? (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Top bar: usage warning + clear */}
              <div className="flex-shrink-0 flex items-center justify-end px-5 pt-3 pb-1 gap-1">
                <div className="group relative">
                  <div className="p-2 rounded-lg text-amber-500 dark:text-amber-400 cursor-default">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                  </div>
                  <div className="absolute right-0 top-full mt-1 hidden group-hover:block pointer-events-none z-20">
                    <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                      Using the assistant consumes your Claude account usage
                    </div>
                  </div>
                </div>
                {assistantHasMessages && (
                  <button
                    onClick={() => assistantRef.current?.clearChat()}
                    className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                    title="Clear conversation"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Scrollable content */}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
                <div className="flex-1 flex flex-col items-center px-4 pb-4">
                  <div className="w-full max-w-[700px] flex-1 flex flex-col">
                    <AssistantPanel
                      ref={assistantRef}
                      active={showAssistant}
                      onMessagesChange={setAssistantHasMessages}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 pt-2">
              <AgentListing snapshot={snapshot} onSelect={navigateToAgent} localServerMap={localServerMap} />
            </div>
          )
        ) : activeTab === "playground" ? (
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

            {/* Right column — Chat */}
            <div style={{ width: `${100 - splitPercent}%` }} className="flex flex-col min-h-0 min-w-0">
              <Chat messages={messages} onSend={sendMessage} />
            </div>
          </div>
        ) : activeTab === "env" ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-4 py-6">
              <EnvPage
                project={
                  snapshot?.agents[currentView.agentName]?.project ?? undefined
                }
                onToast={showToast}
              />
            </div>
          </div>
        ) : activeTab === "security" ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <SecurityPage
              isWorkspace={!!config.workspace}
              project={
                snapshot?.agents[currentView.agentName]?.project ?? undefined
              }
              onToast={showToast}
            />
          </div>
        ) : activeTab === "customize" ? (
          <div className="flex-1 min-h-0">
            <DeploySettings
              isWorkspace={!!config.workspace}
              project={
                snapshot?.agents[currentView.agentName]?.project ?? undefined
              }
              projectName={typeof config.name === "string" ? config.name : undefined}
              onToast={showToast}
            />
          </div>
        ) : (
          <DeployPage
            project={
              snapshot?.agents[currentView.agentName]?.project ?? undefined
            }
            agentName={currentView.agentName}
            sourceFile={
              snapshot?.agents[currentView.agentName]?.source_file ?? undefined
            }
            isWorkspace={!!config.workspace}
            onToast={showToast}
            onDeployWithAssistant={(msg) => openAssistantWith(msg)}
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && isDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
              Delete agent
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              Are you sure you want to delete{" "}
              <span className="font-medium text-gray-900 dark:text-white">
                {currentView.agentName}
              </span>
              ? This will permanently delete the entire project directory, including all source files, tools, and configuration. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  deleteAgent(currentView.agentName);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
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
