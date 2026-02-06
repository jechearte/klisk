import { useState, useEffect } from "react";
import type { ToolInfo } from "../types";

interface ToolModalProps {
  tool: ToolInfo;
  onClose: () => void;
  onSave: (originalName: string, updates: Record<string, unknown>) => void;
}

export default function ToolModal({ tool, onClose, onSave }: ToolModalProps) {
  const [name, setName] = useState(tool.name);
  const [description, setDescription] = useState(tool.description ?? "");
  const [sourceCode, setSourceCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch source code on mount
  useEffect(() => {
    fetch(`/api/tools/${encodeURIComponent(tool.name)}/source`)
      .then((r) => r.json())
      .then((data) => {
        setSourceCode(data.source_code ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tool.name]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (name !== tool.name) updates.name = name;
      if (description !== (tool.description ?? ""))
        updates.description = description;

      console.log("[ToolModal] updates:", updates);

      if (Object.keys(updates).length > 0) {
        await onSave(tool.name, updates);
      }
    } catch (err) {
      console.error("[ToolModal] save error:", err);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Edit Tool</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 resize-vertical"
            />
          </div>

          {/* Source Code (read-only) */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Source Code
              <span className="ml-2 text-[10px] text-gray-400 dark:text-gray-500 font-normal">
                read-only
              </span>
            </label>
            {loading ? (
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-4 text-sm text-gray-400 dark:text-gray-500 text-center">
                Loading...
              </div>
            ) : (
              <pre className="bg-gray-100 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-3 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto font-mono whitespace-pre leading-relaxed max-h-64 overflow-y-auto">
                {sourceCode || "No source code available"}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
