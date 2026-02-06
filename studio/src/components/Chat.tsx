import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "../types";

interface ChatProps {
  messages: ChatMessage[];
  status: string | null;
  onSend: (text: string) => void;
}

function CollapsibleItem({
  icon,
  label,
  badge,
  children,
  spinning,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  children: React.ReactNode;
  spinning?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg text-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <span className={spinning ? "animate-spin" : ""}>{icon}</span>
          <span className="text-gray-600 dark:text-gray-300 font-medium">{label}</span>
          {badge && (
            <span className="text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-gray-400 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {open && (
          <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-4 h-4 text-blue-500 ${spinning ? "animate-spin" : ""}`}
    >
      {spinning ? (
        <>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </>
      ) : (
        <>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </>
      )}
    </svg>
  );
}

function ThinkingIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4 text-purple-500"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export default function Chat({ messages, status, onSend }: ChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const resetTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    onSend(text);
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
        {messages.length === 0 && !status && (
          <div className="text-center text-gray-400 dark:text-gray-500 mt-20">
            <p className="text-lg">Send a message to test your agent</p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "tool_call") {
            const isRunning = msg.status === "running";
            return (
              <CollapsibleItem
                key={i}
                icon={<ToolCallIcon spinning={isRunning} />}
                label={msg.tool}
                badge={isRunning ? "running" : "done"}
                spinning={false}
              >
                {msg.arguments && (
                  <div className="mb-2">
                    <div className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wide">Arguments</div>
                    <pre className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap font-mono">{msg.arguments}</pre>
                  </div>
                )}
                {msg.output && (
                  <div>
                    <div className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wide">Output</div>
                    <pre className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{msg.output}</pre>
                  </div>
                )}
                {!msg.arguments && !msg.output && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 italic">
                    {isRunning ? "Waiting for result..." : "No data"}
                  </div>
                )}
              </CollapsibleItem>
            );
          }

          if (msg.role === "thinking") {
            return (
              <CollapsibleItem
                key={i}
                icon={<ThinkingIcon />}
                label="Thinking"
              >
                <pre className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">{msg.content}</pre>
              </CollapsibleItem>
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
                className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
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
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {status && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              {status}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4">
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-3xl px-4 py-2 focus-within:border-gray-400 dark:focus-within:border-gray-500 transition-colors"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              resetTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none max-h-40 leading-6 py-0"
          />
          <button
            type="submit"
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              input.trim()
                ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200"
                : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-default"
            }`}
            disabled={!input.trim()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
