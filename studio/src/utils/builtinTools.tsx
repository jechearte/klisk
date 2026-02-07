/**
 * Utilities for OpenAI built-in tool display (icons & formatted names).
 */

const BUILTIN_PREFIX = "builtin:";

/**
 * Normalize a raw tool id to its canonical snake_case form.
 *
 * Python's `builtin_tool_name()` produces two formats:
 *   - String shortcuts:  "web_search"        → "builtin:web_search"
 *   - Object instances:  WebSearch().__name__ → "builtin:websearch"
 *
 * This map converts both variants to a single canonical key.
 */
const CANONICAL: Record<string, string> = {
  web_search: "web_search",
  websearch: "web_search",
  code_interpreter: "code_interpreter",
  codeinterpreter: "code_interpreter",
  file_search: "file_search",
  filesearch: "file_search",
  image_generation: "image_generation",
  imagegeneration: "image_generation",
};

/** Display labels for each canonical tool. */
const DISPLAY_NAMES: Record<string, string> = {
  web_search: "Web search",
  code_interpreter: "Code interpreter",
  file_search: "File search",
  image_generation: "Image generation",
};

/** Strip the "builtin:" prefix if present. */
function stripPrefix(name: string): string {
  return name.startsWith(BUILTIN_PREFIX)
    ? name.slice(BUILTIN_PREFIX.length)
    : name;
}

/** Resolve to canonical key, or null if not a built-in tool. */
function toCanonical(name: string): string | null {
  return CANONICAL[stripPrefix(name)] ?? null;
}

/** Check whether a tool name refers to an OpenAI built-in tool. */
export function isBuiltinTool(name: string): boolean {
  if (name.startsWith(BUILTIN_PREFIX)) return true;
  return toCanonical(name) !== null;
}

/** Return a human-friendly display name for a tool. */
export function formatToolDisplayName(name: string): string {
  const canonical = toCanonical(name);
  if (canonical) return DISPLAY_NAMES[canonical];
  return name;
}

/** Return the raw identifier (strip "builtin:" prefix if present). */
export function rawToolName(name: string): string {
  return stripPrefix(name);
}

/* ── SVG Icons ── */

const iconClass = "w-4 h-4 flex-shrink-0";

function WebSearchIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CodeInterpreterIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function FileSearchIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <circle cx="11.5" cy="14.5" r="2.5" />
      <path d="M13.3 16.3 15 18" />
    </svg>
  );
}

function ImageGenerationIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export function WrenchIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

const ICON_MAP: Record<string, (props: { className?: string }) => JSX.Element> = {
  web_search: WebSearchIcon,
  code_interpreter: CodeInterpreterIcon,
  file_search: FileSearchIcon,
  image_generation: ImageGenerationIcon,
};

/** Return the appropriate icon component for a tool. */
export function ToolIcon({
  name,
  className = iconClass,
}: {
  name: string;
  className?: string;
}) {
  const canonical = toCanonical(name);
  const Icon = canonical ? ICON_MAP[canonical] : WrenchIcon;
  return <Icon className={className} />;
}
