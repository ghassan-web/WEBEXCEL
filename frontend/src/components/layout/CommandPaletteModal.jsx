import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  MagnifyingGlassIcon,
  SunIcon,
  MoonIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon,
  XMarkIcon,
  Squares2X2Icon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { NAVIGATION_GROUPS } from "./Sidebar";

function CommandPaletteDialog({ onClose, onNavigate, theme, onToggleTheme }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const navItems = useMemo(() => {
    const items = [];
    NAVIGATION_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        items.push({
          id: item.id,
          key: item.key,
          type: "nav",
          title: item.label,
          category: group.title,
          description: item.description,
          icon: item.icon || Squares2X2Icon,
        });
      });
    });
    return items;
  }, []);

  const quickActions = useMemo(
    () => [
      {
        id: "action-upload",
        type: "action",
        title: "Upload OS Claim / InfoPack Excel",
        category: "Quick Actions",
        description: "Unggah file Excel baru dan petakan kolom otomatis ke Master Data",
        icon: ArrowUpTrayIcon,
        action: () => onNavigate("upload"),
      },
      {
        id: "action-reconcile",
        type: "action",
        title: "Run OSCLN Reconciliation",
        category: "Quick Actions",
        description: "Buka halaman rekonsiliasi dua arah antara Master Data dan snapshot CSV OSCLN",
        icon: ArrowsRightLeftIcon,
        action: () => onNavigate("oscln"),
      },
      {
        id: "action-theme",
        type: "action",
        title: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        category: "Quick Actions",
        description: "Ubah tema tampilan ruang kerja (Terang / Gelap)",
        icon: theme === "dark" ? SunIcon : MoonIcon,
        action: () => onToggleTheme?.(),
      },
      {
        id: "action-refresh",
        type: "action",
        title: "Refresh Workspace Data",
        category: "Quick Actions",
        description: "Muat ulang data terbaru dari server",
        icon: ArrowPathIcon,
        action: () => window.location.reload(),
      },
    ],
    [theme, onToggleTheme, onNavigate]
  );

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...quickActions, ...navItems];
    }

    const matchedActions = quickActions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q))
    );

    const matchedNav = navItems.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.description && n.description.toLowerCase().includes(q)) ||
        (n.category && n.category.toLowerCase().includes(q))
    );

    return [...matchedActions, ...matchedNav];
  }, [query, quickActions, navItems]);

  const executeItem = useCallback(
    (item) => {
      onClose();
      if (item.action) {
        item.action();
      } else if (item.key) {
        onNavigate(item.key);
      }
    },
    [onNavigate, onClose]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredResults.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + filteredResults.length) % Math.max(1, filteredResults.length)
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = filteredResults[selectedIndex];
        if (selected) {
          executeItem(selected);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredResults, selectedIndex, executeItem, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-[var(--color-ink-solid)]/45 backdrop-blur-xs">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick Search"
        className="relative w-full max-w-xl bg-[var(--color-surface)] rounded-[var(--radius-surface)] border border-[var(--color-line)] shadow-[var(--shadow-overlay)] overflow-hidden z-10 flex flex-col max-h-[75vh]"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-[var(--color-line)] gap-3 bg-[var(--color-surface)]">
          <MagnifyingGlassIcon className="w-4.5 h-4.5 text-[var(--color-brand)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search modules or quick actions... (e.g. upload, master, oscln, mapping)"
            className="flex-1 bg-transparent text-[var(--color-ink)] text-sm placeholder-[var(--color-ink-muted)] outline-hidden font-medium"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 rounded-md text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-ink-muted)] bg-[var(--color-surface-sunken)] border border-[var(--color-line)] rounded">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-0.5 sidebar-scroll">
          {filteredResults.length === 0 ? (
            <div className="py-12 text-center text-[var(--color-ink-muted)] text-sm space-y-1">
              <p className="font-semibold text-[var(--color-ink)]">No results found</p>
              <p className="text-xs">
                Try another keyword such as &ldquo;Upload&rdquo;, &ldquo;Master&rdquo;, or &ldquo;OSCLN&rdquo;.
              </p>
            </div>
          ) : (
            filteredResults.map((item, idx) => {
              const IconComp = item.icon || Squares2X2Icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.id}-${idx}`}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-control)] cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                      : "hover:bg-[var(--color-surface-sunken)] text-[var(--color-ink)]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                        isSelected
                          ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]"
                          : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] border-[var(--color-line)]"
                      }`}
                    >
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold truncate leading-tight">
                          {item.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)]">
                          {item.category}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-[var(--color-ink-muted)] truncate mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pl-2 shrink-0">
                    {isSelected && (
                      <span className="flex items-center gap-1 text-[10.5px] text-[var(--color-brand)] font-semibold">
                        Open ↵
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--color-line)] bg-[var(--color-surface-sunken)]/60 flex items-center justify-between text-[11px] text-[var(--color-ink-muted)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded text-[9px] font-mono">
                ↑
              </kbd>
              <kbd className="px-1 py-0.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded text-[9px] font-mono">
                ↓
              </kbd>{" "}
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded text-[9px] font-mono">
                ↵
              </kbd>{" "}
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded text-[9px] font-mono">
                ESC
              </kbd>{" "}
              Close
            </span>
          </div>
          <span className="font-medium text-[var(--color-ink-muted)]">Workspace Quick Search</span>
        </div>
      </div>
    </div>
  );
}

export default function CommandPaletteModal({ isOpen, onClose, onNavigate, theme, onToggleTheme }) {
  if (!isOpen) return null;
  return (
    <CommandPaletteDialog
      onClose={onClose}
      onNavigate={onNavigate}
      theme={theme}
      onToggleTheme={onToggleTheme}
    />
  );
}
