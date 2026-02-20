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

  // Check availability
  useEffect(() => {
    if (!active) return;
    fetch("/api/assistant/status")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data.status ?? (data.available ? "ready" : "not_installed"));
      })
      .catch(() => {
        setStatus("not_installed");
      });
  }, [active]);

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
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {status === "not_installed" ? (
          <div className="text-center max-w-sm">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="w-6 h-6 text-gray-500 dark:text-gray-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-1">
              Claude Code required
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              The assistant requires Claude Code to be installed on your machine.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              You can use any AI coding agent to build your Klisk agent.{" "}
              <a
                href="https://github.com/jechearte/skills/tree/main/skills/klisk-guide"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
              >
                Install the Klisk skill
              </a>{" "}
              to get started.
            </p>
          </div>
        ) : status === "sdk_missing" ? (
          <div className="text-center max-w-sm">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="w-6 h-6 text-amber-600 dark:text-amber-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-1">
              Missing dependency
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              The assistant SDK is not installed. Run:
            </p>
            <code className="block text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 font-mono">
              pip install 'klisk[assistant]'
            </code>
          </div>
        ) : status === "not_authenticated" ? (
          <div className="text-center max-w-sm">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="w-6 h-6 text-amber-600 dark:text-amber-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-1">
              Sign in to Claude
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              You need to authenticate with Claude Code first. Run:
            </p>
            <code className="block text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 font-mono">
              claude auth login
            </code>
          </div>
        ) : status === "ready" ? (
          <>
            <div className="text-center text-gray-400 dark:text-gray-500 mb-6">
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
              <p className="text-sm">Ask the assistant to help build your agent</p>
              <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">
                It can create projects, write tools, fix errors, and more
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
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors"
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
          </>
        ) : null}
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
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors"
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
