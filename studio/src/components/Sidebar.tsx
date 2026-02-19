const LISTING_ITEMS = [
  {
    id: "agents" as const,
    label: "Agents",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
        <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121ZM19.573 14.573a.563.563 0 0 0 .338.45 9.687 9.687 0 0 1-1.764.44 8.287 8.287 0 0 0-1.308-5.135 6.798 6.798 0 0 1 2.735 4.245Z" />
      </svg>
    ),
  },
  {
    id: "assistant" as const,
    label: "Assistant",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z" clipRule="evenodd" />
      </svg>
    ),
  },
] as const;

const DETAIL_ITEMS = [
  {
    id: "playground" as const,
    label: "Playground",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M10.5 3.798v5.02a3 3 0 0 1-.879 2.121l-2.377 2.377a9.845 9.845 0 0 1 5.091 1.013 8.315 8.315 0 0 0 5.713.636l.285-.071-3.954-3.955a3 3 0 0 1-.879-2.121v-5.02a23.614 23.614 0 0 0-3 0Zm4.5.138a.75.75 0 0 0 .093-1.495A24.837 24.837 0 0 0 12 2.25a25.048 25.048 0 0 0-3.093.191A.75.75 0 0 0 9 3.936v4.882a1.5 1.5 0 0 1-.44 1.06l-6.293 6.294c-1.62 1.621-.903 4.475 1.471 4.88 2.686.46 5.447.698 8.262.698 2.816 0 5.576-.239 8.262-.697 2.373-.406 3.092-3.26 1.471-4.881L15.44 9.879A1.5 1.5 0 0 1 15 8.818V3.936Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "env" as const,
    label: ".env",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M15.75 1.5a6.75 6.75 0 0 0-6.651 7.906c.067.39-.032.717-.221.906l-6.5 6.499a3 3 0 0 0-.878 2.121v2.818c0 .414.336.75.75.75H6a.75.75 0 0 0 .75-.75v-1.5h1.5A.75.75 0 0 0 9 19.5V18h1.5a.75.75 0 0 0 .53-.22l2.658-2.658c.19-.189.517-.288.906-.22A6.75 6.75 0 1 0 15.75 1.5Zm0 3a.75.75 0 0 0 0 1.5A2.25 2.25 0 0 1 18 8.25a.75.75 0 0 0 1.5 0 3.75 3.75 0 0 0-3.75-3.75Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "deploy" as const,
    label: "Deploy",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
        <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
      </svg>
    ),
  },
] as const;

export type ListingNavItem = (typeof LISTING_ITEMS)[number]["id"];
export type DetailNavItem = (typeof DETAIL_ITEMS)[number]["id"];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  dark: boolean;
  onToggleDark: () => void;
  mode: "listing" | "detail";
  activeListingItem?: ListingNavItem;
  activeDetailItem?: DetailNavItem;
  onListingNavigate?: (item: ListingNavItem) => void;
  onDetailNavigate?: (item: DetailNavItem) => void;
}

export default function Sidebar({
  collapsed,
  onToggle,
  dark,
  onToggleDark,
  mode,
  activeListingItem,
  activeDetailItem,
  onListingNavigate,
  onDetailNavigate,
}: SidebarProps) {
  const items = mode === "detail" ? DETAIL_ITEMS : LISTING_ITEMS;
  const activeId = mode === "detail" ? activeDetailItem : activeListingItem;

  return (
    <aside
      className={`flex flex-col flex-shrink-0 bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-[width] duration-200 ease-in-out overflow-hidden ${
        collapsed ? "w-[52px]" : "w-[220px]"
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center h-[57px] flex-shrink-0 ${
          collapsed ? "justify-center" : "px-3 gap-2"
        }`}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            title="Open sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>
        ) : (
          <>
            <img src="/favicon.png" alt="Klisk" className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate flex-1">
              Klisk Studio
            </span>
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
              title="Close sidebar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 4.5v15m-6-15h16.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75V5.25A.75.75 0 0 1 3 4.5Z"
                />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Nav items */}
      <nav className={`flex flex-col gap-0.5 mt-2 ${collapsed ? "px-1.5" : "px-2"}`}>
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (mode === "detail" && onDetailNavigate) {
                  onDetailNavigate(item.id as DetailNavItem);
                } else if (mode === "listing" && onListingNavigate) {
                  onListingNavigate(item.id as ListingNavItem);
                }
              }}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-2.5 rounded-lg transition-colors ${
                collapsed ? "justify-center p-2.5" : "px-3 py-2"
              } ${
                isActive
                  ? "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {item.icon}
              {!collapsed && (
                <span className="text-sm font-medium truncate">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <div className={`flex-shrink-0 mb-3 ${collapsed ? "px-1.5" : "px-2"}`}>
        <button
          onClick={onToggleDark}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          className={`flex items-center gap-2.5 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200 ${
            collapsed ? "justify-center p-2.5" : "px-3 py-2 w-full"
          }`}
        >
          {dark ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0Zm11.394-5.834a.75.75 0 0 0-1.06-1.06l-1.591 1.59a.75.75 0 1 0 1.06 1.061l1.591-1.59Zm-12.728.53a.75.75 0 1 0 1.06-1.06l-1.59-1.591a.75.75 0 0 0-1.061 1.06l1.59 1.591ZM12 18a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-2.25A.75.75 0 0 1 12 18ZM7.758 17.303a.75.75 0 0 0-1.061-1.06l-1.591 1.59a.75.75 0 0 0 1.06 1.061l1.591-1.59Zm9.544-1.06a.75.75 0 0 0-1.06 1.06l1.59 1.591a.75.75 0 1 0 1.061-1.06l-1.59-1.591ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5H21a.75.75 0 0 1 .75.75ZM5.25 12a.75.75 0 0 1-.75.75H2.25a.75.75 0 0 1 0-1.5H4.5a.75.75 0 0 1 .75.75Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z" clipRule="evenodd" />
            </svg>
          )}
          {!collapsed && (
            <span className="text-sm font-medium">{dark ? "Light mode" : "Dark mode"}</span>
          )}
        </button>
      </div>
    </aside>
  );
}
