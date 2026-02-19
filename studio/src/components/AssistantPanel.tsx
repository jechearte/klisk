import { useState, useRef, useEffect, useCallback } from "react";
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

interface AssistantPanelProps {
  active: boolean;
}

export default function AssistantPanel({ active }: AssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
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
        setAvailable(data.available);
        setUnavailableReason(data.reason || null);
      })
      .catch(() => {
        setAvailable(false);
        setUnavailableReason("Could not check assistant status");
      });
  }, [active]);

  // Connect WebSocket when active
  useEffect(() => {
    if (!active || available === false) return;
    if (available === null) return; // still checking

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
  }, [active, available]);

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

  const clearChat = useCallback(() => {
    setMessages([]);
    setStreaming(false);
    localStorage.removeItem(STORAGE_KEY);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "clear" }));
    }
  }, []);

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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {available === false && (
          <div className="text-center mt-8 px-4">
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
              Assistant unavailable
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {unavailableReason}
            </p>
          </div>
        )}

        {available !== false && messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 mt-12">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-6 h-6 text-violet-500"
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
        )}

        {messages.map((msg, i) => {
          if (msg.role === "tool_use") {
            return (
              <div key={i} className="flex justify-start">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5 text-blue-500"
                  >
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                  <span className="font-medium">{msg.tool}</span>
                  {msg.detail && (
                    <span className="text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
                      {msg.detail}
                    </span>
                  )}
                </div>
              </div>
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
                <div className="max-w-[90%] rounded-lg text-sm border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 overflow-hidden">
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
                      <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
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
                    ? "bg-violet-600 text-white"
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
              <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {available !== false && (
        <div className="p-3 flex-shrink-0">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-2xl px-3 py-2 focus-within:border-violet-400 dark:focus-within:border-violet-500 transition-colors"
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
              className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none max-h-32 leading-6 py-0.5 disabled:opacity-50"
            />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Clear conversation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                input.trim() && !streaming
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-default"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
              </svg>
            </button>
          </form>
        </div>
      )}
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
      <p className="font-medium text-violet-800 dark:text-violet-300 mb-1.5">
        {question.question}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {question.options.map((opt, oi) => (
          <button
            key={oi}
            disabled={!enabled}
            onClick={() => onAnswer(opt.label)}
            className="px-2.5 py-1 rounded-md text-xs font-medium border border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-800/50 disabled:opacity-50 disabled:cursor-default transition-colors"
            title={opt.description}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
