import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, Attachment } from "../types";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/gif,image/webp,application/pdf";

function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    if (file.size > 20 * 1024 * 1024) {
      reject(new Error(`File ${file.name} exceeds 20MB limit`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve({
        type: file.type === "application/pdf" ? "file" : "image",
        name: file.name,
        mime_type: file.type,
        data: base64,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface ChatProps {
  messages: ChatMessage[];
  onSend: (text: string, attachments?: Attachment[]) => void;
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

export default function Chat({ messages, onSend }: ChatProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resetTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const valid = Array.from(files).filter(
      (f) => ACCEPTED_TYPES.split(",").includes(f.type) && f.size <= 20 * 1024 * 1024
    );
    const newAttachments = await Promise.all(valid.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    setInput("");
    onSend(text, attachments.length > 0 ? attachments : undefined);
    setAttachments([]);
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div
        className={`flex-1 overflow-y-auto p-4 space-y-3 ${dragging ? "ring-2 ring-blue-400 ring-inset bg-blue-50/30 dark:bg-blue-900/10" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {messages.length === 0 && (
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
                  <>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.attachments.map((att, ai) =>
                          att.type === "image" && att.data ? (
                            <img
                              key={ai}
                              src={`data:${att.mime_type};base64,${att.data}`}
                              alt={att.name}
                              className="max-w-[200px] max-h-[150px] rounded object-cover"
                            />
                          ) : (
                            <span
                              key={ai}
                              className="inline-flex items-center gap-1 bg-blue-500/30 text-white text-xs px-2 py-1 rounded"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Z" clipRule="evenodd" />
                              </svg>
                              {att.name}
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {msg.content && <span className="whitespace-pre-wrap">{msg.content}</span>}
                  </>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 px-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative group">
                {att.type === "image" ? (
                  <img
                    src={`data:${att.mime_type};base64,${att.data}`}
                    alt={att.name}
                    className="w-16 h-16 rounded-lg object-cover border border-gray-300 dark:border-gray-600"
                  />
                ) : (
                  <div className="h-16 px-3 flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-500">
                      <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Z" clipRule="evenodd" />
                    </svg>
                    <span className="max-w-[80px] truncate">{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-3xl px-4 py-2 focus-within:border-gray-400 dark:focus-within:border-gray-500 transition-colors"
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {/* Attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Attach files"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
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
            className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none max-h-40 leading-6 py-1"
          />
          <button
            type="submit"
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              input.trim() || attachments.length > 0
                ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200"
                : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-default"
            }`}
            disabled={!input.trim() && attachments.length === 0}
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
