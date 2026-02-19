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
  | { page: "detail"; agentName: string; tab: "playground" | "env" | "deploy" };

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
      if (showAssistant && currentView.page === "listing") return;
      setCurrentView({ page: "listing" });
    } else {
      setShowAssistant(true);
      setCurrentView({ page: "listing" });
    }
  };

  const handleDetailNavigate = (item: DetailNavItem) => {
    if (currentView.page !== "detail") return;
    setCurrentView({ ...currentView, tab: item === "playground" ? "playground" : item === "env" ? "env" : "deploy" });
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
            </div>
          </div>
        )}

        {/* Main Content */}
        {currentView.page === "listing" ? (
          showAssistant ? (
            <div className="flex-1 relative min-h-0">
              {/* Clear button at page top-right */}
              {assistantHasMessages && (
                <button
                  onClick={() => assistantRef.current?.clearChat()}
                  className="absolute top-3 right-5 z-10 p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  title="Clear conversation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
              )}
              {/* Scrollable content */}
              <div className="h-full overflow-y-auto flex flex-col">
                <div className="flex-1 flex flex-col items-center px-4 pt-6 pb-4">
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
              <AgentListing snapshot={snapshot} onSelect={navigateToAgent} />
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
        ) : (
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
