import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AssistantMessage, AssistantQuestion } from "../types";

const STORAGE_KEY = "klisk-assistant-messages";

function loadMessages(): AssistantMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export interface AssistantPanelHandle {
  clearChat: () => void;
  sendMessage: (text: string) => void;
}

interface AssistantPanelProps {
  active: boolean;
  onMessagesChange?: (hasMessages: boolean) => void;
}

const AssistantPanel = forwardRef<AssistantPanelHandle, AssistantPanelProps>(
  ({ active, onMessagesChange }, ref) => {
  const [messages, setMessages] = useState<AssistantMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [checks, setChecks] = useState<{ cli_installed: boolean; sdk_installed: boolean; authenticated: boolean } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist messages
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshStatus = useCallback(() => {
    fetch("/api/assistant/status")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data.status ?? (data.available ? "ready" : "not_installed"));
        if (data.checks) setChecks(data.checks);
      })
      .catch(() => {
        setStatus("not_installed");
      });
  }, []);

  // Check availability
  useEffect(() => {
    if (!active) return;
    refreshStatus();
  }, [active, refreshStatus]);

  // Connect WebSocket only when ready
  useEffect(() => {
    if (!active || status !== "ready") return;

    const ws = new WebSocket(`ws://${window.location.host}/ws/assistant`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      switch (data.type) {
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

        case "tool_use":
          setMessages((prev) => [
            ...prev,
            {
              role: "tool_use" as const,
              tool: data.data.tool,
              detail: data.data.detail || "",
            },
          ]);
          break;

        case "permission_request":
          setMessages((prev) => [
            ...prev,
            {
              role: "permission_request" as const,
              tool: data.data.tool,
              command: data.data.command,
              status: "pending" as const,
            },
          ]);
          break;

        case "question":
          setMessages((prev) => [
            ...prev,
            {
              role: "question" as const,
              questions: data.data.questions,
              status: "pending" as const,
            },
          ]);
          break;

        case "done":
          setStreaming(false);
          break;

        case "error":
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `Error: ${data.data}` },
          ]);
          setStreaming(false);
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setStreaming(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [active, status]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      wsRef.current.send(JSON.stringify({ message: text }));
      setStreaming(true);
    },
    []
  );

  const handlePermission = useCallback(
    (allowed: boolean) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(
        JSON.stringify({ type: "permission_response", allowed })
      );
      setMessages((prev) => {
        const idx = prev.findLastIndex(
          (m) => m.role === "permission_request" && m.status === "pending"
        );
        if (idx === -1) return prev;
        const item = prev[idx];
        if (item.role !== "permission_request") return prev;
        return [
          ...prev.slice(0, idx),
          { ...item, status: allowed ? "allowed" as const : "denied" as const },
          ...prev.slice(idx + 1),
        ];
      });
    },
    []
  );

  const handleQuestion = useCallback(
    (questions: AssistantQuestion[], answers: Record<string, string>) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(
        JSON.stringify({ type: "question_response", answers })
      );
      setMessages((prev) => {
        const idx = prev.findLastIndex(
          (m) => m.role === "question" && m.status === "pending"
        );
        if (idx === -1) return prev;
        const item = prev[idx];
        if (item.role !== "question") return prev;
        return [
          ...prev.slice(0, idx),
          { ...item, status: "answered" as const },
          ...prev.slice(idx + 1),
        ];
      });
    },
    []
  );

  const handleStop = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "cancel" }));
    setStreaming(false);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setStreaming(false);
    localStorage.removeItem(STORAGE_KEY);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "clear" }));
    }
  }, []);

  useImperativeHandle(ref, () => ({ clearChat, sendMessage }), [clearChat, sendMessage]);

  useEffect(() => {
    onMessagesChange?.(messages.length > 0);
  }, [messages.length, onMessagesChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    sendMessage(text);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const isEmpty = messages.length === 0;

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto flex flex-col">
        {status !== "ready" && status !== null ? (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {/* About card */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
              <div className="px-6 py-4 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Klisk Assistant
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                    The Klisk Assistant helps you build your agents. It requires a Claude subscription — usage will count against your account limits.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                    If you don't have a Claude subscription, you can use any general-purpose coding agent to build agents with Klisk.
                  </p>
                </div>
                <a
                  href="https://klisk.productomania.io/docs/studio/assistant.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-400 flex-shrink-0 mt-0.5"
                  title="Documentation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Requirements card */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Requirements
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Complete these steps to start using the assistant.
                  </p>
                </div>
                <button
                  onClick={refreshStatus}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                  title="Refresh status"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992" />
                  </svg>
                </button>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                <RequirementRow
                  ok={checks?.sdk_installed}
                  title="Klisk Assistant SDK"
                  okText="Installed"
                  detail="To use the assistant you need to install this extra dependency. Run the command in your terminal or click the button."
                  action={!checks?.sdk_installed && (
                    <>
                      <div className="flex items-center gap-2">
                        <CommandBlock command="pip install 'klisk[assistant]'" />
                        {installing ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 px-3 py-1.5">
                            <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Installing...
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setInstalling(true);
                              setInstallError(null);
                              fetch("/api/assistant/install", { method: "POST" })
                                .then((r) => r.json())
                                .then((data) => {
                                  if (data.ok) {
                                    refreshStatus();
                                  } else {
                                    setInstallError(data.error || "Installation failed");
                                  }
                                })
                                .catch((e) => setInstallError(String(e)))
                                .finally(() => setInstalling(false));
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors flex-shrink-0"
                          >
                            Install
                          </button>
                        )}
                      </div>
                      {installError && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{installError}</p>
                      )}
                    </>
                  )}
                />
                <RequirementRow
                  ok={checks?.cli_installed}
                  title="Claude Code CLI"
                  okText="Installed"
                  detail="The assistant is powered by the Claude Agent SDK, which requires the Claude Code CLI."
                  action={!checks?.cli_installed && (
                    <div className="space-y-2.5">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Download the Claude desktop app (includes the CLI):</p>
                        <a
                          href="https://claude.com/download"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          Download Claude
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3 h-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Or install the CLI manually:</p>
                        <CommandBlock command="npm install -g @anthropic-ai/claude-code" />
                      </div>
                    </div>
                  )}
                />
                <RequirementRow
                  ok={checks?.authenticated}
                  title="Claude authentication"
                  okText="Logged in"
                  detail="You need to log in to your Claude account. The Klisk Assistant will consume usage from your Claude subscription."
                  extraDetail="Open your terminal and run this command:"
                  action={!checks?.authenticated && checks?.cli_installed ? (
                    <CommandBlock command="claude auth login" />
                  ) : !checks?.cli_installed ? undefined : undefined}
                  disabledText={!checks?.cli_installed ? "Install Claude Code first" : undefined}
                />
              </div>
            </div>
          </div>
        ) : status === "ready" ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6 text-blue-500"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="text-base font-medium text-gray-700 dark:text-gray-200">What do you need help with?</p>
              <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
                The Klisk Assistant can help you create agents, tools, or fix errors
              </p>
            </div>
            <div className="w-full max-w-[700px] px-3 pb-3">
              <form
                onSubmit={handleSubmit}
                className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-3xl px-4 py-2 focus-within:border-blue-400 dark:focus-within:border-blue-500 transition-colors"
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    const ta = e.target;
                    ta.style.height = "auto";
                    ta.style.height = `${ta.scrollHeight}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={streaming ? "Waiting for response..." : "Ask the assistant..."}
                  disabled={streaming}
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none max-h-40 leading-6 py-1 disabled:opacity-50"
                />
                {streaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                      input.trim()
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-default"
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                    </svg>
                  </button>
                )}
              </form>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Messages */}
      <div className="flex-1 p-4 pb-2 space-y-3">

        {messages.map((msg, i) => {
          if (msg.role === "tool_use") {
            return (
              <ToolUseChip key={i} tool={msg.tool} detail={msg.detail} />
            );
          }

          if (msg.role === "permission_request") {
            const isPending = msg.status === "pending";
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[90%] rounded-lg text-sm border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-4 h-4 text-amber-500"
                      >
                        <path
                          fillRule="evenodd"
                          d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="font-medium text-amber-800 dark:text-amber-300">
                        Permission required
                      </span>
                    </div>
                    <pre className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap font-mono">
                      {msg.command}
                    </pre>
                    {isPending ? (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handlePermission(true)}
                          className="px-3 py-1 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                        >
                          Allow
                        </button>
                        <button
                          onClick={() => handlePermission(false)}
                          className="px-3 py-1 rounded-md text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          Deny
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <span
                          className={`text-xs font-medium ${
                            msg.status === "allowed"
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {msg.status === "allowed" ? "Allowed" : "Denied"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          if (msg.role === "question") {
            const isPending = msg.status === "pending";
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[90%] rounded-lg text-sm border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 overflow-hidden">
                  <div className="px-3 py-2 space-y-3">
                    {msg.questions.map((q, qi) => (
                      <QuestionCard
                        key={qi}
                        question={q}
                        enabled={isPending}
                        onAnswer={(answer) => {
                          handleQuestion(msg.questions, {
                            [q.question]: answer,
                          });
                        }}
                      />
                    ))}
                    {!isPending && (
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        Answered
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={i}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : msg.role === "system"
                    ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                }`}
              >
                {msg.role === "user" ? (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {streaming && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 px-3 py-2">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {status === "ready" && (
        <div className="sticky bottom-0 pb-3 px-3 bg-gray-50 dark:bg-gray-950">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-3xl px-4 py-2 focus-within:border-blue-400 dark:focus-within:border-blue-500 transition-colors"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const ta = e.target;
                ta.style.height = "auto";
                ta.style.height = `${ta.scrollHeight}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder={streaming ? "Waiting for response..." : "Ask the assistant..."}
              disabled={streaming}
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none max-h-40 leading-6 py-1 disabled:opacity-50"
            />
            {streaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  input.trim()
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-default"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                </svg>
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
  }
);

export default AssistantPanel;

function ToolUseChip({ tool, detail }: { tool: string; detail: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(detail);

  return (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-left transition-colors ${
          hasDetail
            ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
            : "cursor-default"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5 text-blue-500 flex-shrink-0"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="font-medium flex-shrink-0">{tool}</span>
        {hasDetail && (
          <span
            className={`text-gray-400 dark:text-gray-500 ${
              expanded ? "break-all" : "truncate max-w-[200px]"
            }`}
          >
            {detail}
          </span>
        )}
        {hasDetail && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3 h-3 flex-shrink-0 text-gray-400 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

function QuestionCard({
  question,
  enabled,
  onAnswer,
}: {
  question: AssistantQuestion;
  enabled: boolean;
  onAnswer: (answer: string) => void;
}) {
  return (
    <div>
      <p className="font-medium text-blue-800 dark:text-blue-300 mb-1.5">
        {question.question}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {question.options.map((opt, oi) => (
          <button
            key={oi}
            disabled={!enabled}
            onClick={() => onAnswer(opt.label)}
            className="px-2.5 py-1 rounded-md text-xs font-medium border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/50 disabled:opacity-50 disabled:cursor-default transition-colors"
            title={opt.description}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RequirementRow({
  ok,
  title,
  okText,
  detail,
  extraDetail,
  action,
  disabledText,
}: {
  ok?: boolean;
  title: string;
  okText: string;
  detail: string;
  extraDetail?: string;
  action?: React.ReactNode;
  disabledText?: string;
}) {
  const [expanded, setExpanded] = useState(!ok);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-3.5 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        {ok ? (
          <div className="w-5 h-5 flex-shrink-0 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-green-600 dark:text-green-400">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
            </svg>
          </div>
        ) : (
          <div className="w-5 h-5 flex-shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-600" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-700 dark:text-gray-300">{title}</span>
          {ok && (
            <span className="ml-2 text-xs text-green-600 dark:text-green-400">{okText}</span>
          )}
          {!ok && disabledText && (
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{disabledText}</span>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {expanded && (
        <div className="px-6 pb-3.5 ml-8">
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-2">{detail}</p>
          {extraDetail && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-2">{extraDetail}</p>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="relative group">
      <code className="block text-xs bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 pr-8 font-mono whitespace-nowrap">
        {command}
      </code>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(command);
        }}
        title="Copy"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
        </svg>
      </button>
    </div>
  );
}
