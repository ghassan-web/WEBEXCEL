import { useState, useRef, useEffect, useCallback } from "react";
import Sidebar, { getPageMeta } from "./Sidebar";
import {
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
  QuestionMarkCircleIcon,
  ClockIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";

/* PanelLeft & PanelLeftClose icons matching lucide-react in indonesiare-frontend */
function PanelLeftIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function PanelLeftCloseIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m16 15-3-3 3-3" />
    </svg>
  );
}

export default function MainLayout({
  activePage,
  onNavigate,
  isSidebarBlocked = false,
  children,
}) {
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const menuRef = useRef(null);

  const toggleLeftSidebar = useCallback(() => {
    setIsLeftCollapsed((prev) => !prev);
  }, []);

  /* Keyboard shortcuts (Ctrl+B to toggle sidebar, Escape to close menus) */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleLeftSidebar();
      } else if (e.key === "Escape") {
        setUserMenuOpen(false);
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleLeftSidebar]);

  /* Close user menu when clicking outside */
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavigate = useCallback(
    (key) => {
      setMobileNavOpen(false);
      setUserMenuOpen(false);
      onNavigate(key);
    },
    [onNavigate]
  );

  const pageMeta = getPageMeta(activePage);
  const breadcrumbs = (pageMeta?.breadcrumb || "Overview").split(" / ");

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[var(--color-canvas)]">
      {/* Skip to Main Content Bypass Link (WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--color-brand)] focus:text-white focus:rounded-[var(--radius-control)] focus:shadow-lg focus:outline-hidden"
      >
        Skip to main content
      </a>

      {/* PANEL A: LEFT SIDEBAR */}
      <div className="hidden md:block h-full shrink-0">
        <Sidebar
          activePage={activePage}
          onNavigate={handleNavigate}
          collapsed={isLeftCollapsed}
          onExpandSidebar={() => setIsLeftCollapsed(false)}
          isBlocked={isSidebarBlocked}
        />
      </div>

      {/* MOBILE DRAWER SIDEBAR (< md) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-[var(--color-ink)]/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-[280px] max-w-[85vw] bg-[#17365D] h-full shadow-[var(--shadow-overlay)] flex flex-col z-10">
            <div className="flex items-center justify-between px-5 h-[68px] border-b border-white/10 shrink-0">
              <span className="font-semibold text-white text-sm">Navigation</span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-blue-200 hover:text-white rounded-[var(--radius-control)] hover:bg-white/10 transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto sidebar-scroll">
              <Sidebar
                activePage={activePage}
                onNavigate={handleNavigate}
                isBlocked={isSidebarBlocked}
                isMobileDrawer={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* CENTER WORKSPACE: TOP TOOLBAR + MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {/* TOP TOOLBAR (68px) */}
        <header className="h-[68px] bg-[var(--color-surface)] border-b border-[var(--color-line)] flex items-center justify-between px-4 sm:px-6 shrink-0 gap-3">
          {/* Left Controls & Breadcrumbs */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              aria-label="Open mobile navigation"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] transition-colors cursor-pointer"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>

            <button
              type="button"
              aria-label={
                isLeftCollapsed ? "Expand Navigation (Ctrl+B)" : "Collapse Navigation (Ctrl+B)"
              }
              title={
                isLeftCollapsed ? "Expand Navigation (Ctrl+B)" : "Collapse Navigation (Ctrl+B)"
              }
              onClick={toggleLeftSidebar}
              className="hidden md:flex p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] transition-colors cursor-pointer"
            >
              {isLeftCollapsed ? (
                <PanelLeftIcon className="w-4 h-4 text-[var(--color-ink)]" />
              ) : (
                <PanelLeftCloseIcon className="w-4 h-4" />
              )}
            </button>

            <div className="hidden md:block h-4 w-px bg-[var(--color-line)] mx-0.5" />

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] truncate">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <span key={idx} className="flex items-center gap-1.5 truncate">
                    {idx > 0 && (
                      <span className="text-[var(--color-ink-faint)] select-none">/</span>
                    )}
                    <span
                      className={`truncate ${
                        isLast
                          ? "font-semibold text-[var(--color-ink)]"
                          : "text-[var(--color-ink-muted)]"
                      }`}
                    >
                      {crumb}
                    </span>
                  </span>
                );
              })}
            </nav>
          </div>

          {/* Right Toolbar: Clean User Profile Pill */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-label="User account menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="h-9 flex items-center gap-2.5 pl-1.5 pr-2.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-sunken)] transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-[#17365D]/10 text-[#17365D] border border-[#17365D]/20 flex items-center justify-center font-bold text-xs shrink-0">
                  RU
                </div>
                <div className="text-left hidden sm:block max-w-[140px]">
                  <span className="text-xs font-semibold text-[var(--color-ink)] block leading-tight truncate">
                    RU Claims
                  </span>
                  <span className="text-[10.5px] text-[var(--color-ink-muted)] font-normal capitalize block leading-tight truncate">
                    Operator
                  </span>
                </div>
                <ChevronDownIcon
                  className={`w-3.5 h-3.5 text-[var(--color-ink-muted)] transition-transform duration-150 ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[var(--color-surface)] rounded-[var(--radius-surface)] border border-[var(--color-line)] shadow-[var(--shadow-overlay)] py-1.5 z-50 font-sans">
                  <div className="px-4 py-2.5 border-b border-[var(--color-line)]">
                    <span className="text-xs font-semibold text-[var(--color-ink)] block truncate">
                      RU Claims Workspace
                    </span>
                    <span className="text-[11px] text-[var(--color-ink-muted)] block truncate mt-0.5">
                      OS Claims Hub® · Indonesia Re
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleNavigate("mapping")}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[var(--color-ink-body)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] transition-colors text-left cursor-pointer"
                  >
                    <AdjustmentsHorizontalIcon className="w-4 h-4 text-[var(--color-ink-muted)]" />
                    <span>Mapping Rules</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavigate("history")}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[var(--color-ink-body)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] transition-colors text-left cursor-pointer"
                  >
                    <ClockIcon className="w-4 h-4 text-[var(--color-ink-muted)]" />
                    <span>Activity Log</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavigate("overview")}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[var(--color-ink-body)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] transition-colors text-left cursor-pointer"
                  >
                    <QuestionMarkCircleIcon className="w-4 h-4 text-[var(--color-ink-muted)]" />
                    <span>User Guide &amp; Help</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* PANEL B: MAIN CONTENT WORKSPACE */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 min-h-0 min-w-0 flex flex-col focus:outline-hidden overflow-y-auto app-main-scroll"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
