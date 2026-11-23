import { useState } from "react";
import indoreWhiteLogo from "../../assets/indore-white.png";
import {
  HomeIcon,
  ArrowUpTrayIcon,
  AdjustmentsHorizontalIcon,
  TableCellsIcon,
  ArrowsRightLeftIcon,
  ClockIcon,
  BookOpenIcon,
  UsersIcon,
  QuestionMarkCircleIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

const moduleUrl = import.meta.env.VITE_MODULE_URL?.trim() || "";

const footerButtonBaseClass =
  "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[var(--radius-control)] border transition-all duration-150 cursor-pointer text-[14px] leading-[20px] font-medium";
const moduleButtonClass = `${footerButtonBaseClass} text-white/95 bg-white/[0.08] border-white/15 hover:text-white hover:border-white/30 hover:bg-white/[0.14]`;

export const NAVIGATION_GROUPS = [
  {
    id: "home",
    title: "Overview",
    items: [
      {
        id: "overview",
        key: "overview",
        label: "Overview",
        icon: HomeIcon,
        breadcrumb: "Overview / Dashboard",
        description: "Ringkasan operasional, panduan alur kerja, dan aktivitas job terbaru",
      },
    ],
  },
  {
    id: "workspace",
    title: "Claims Workspace",
    items: [
      {
        id: "upload",
        key: "upload",
        label: "Upload Data",
        icon: ArrowUpTrayIcon,
        breadcrumb: "Claims Workspace / Upload Data",
        description: "Unggah workbook Excel OS Claim Cedant atau InfoPack ke Master Data",
      },
      {
        id: "master",
        key: "master",
        label: "Master Data",
        icon: TableCellsIcon,
        breadcrumb: "Claims Workspace / Master Data",
        description: "Data konsolidasi OS Claim Cedant dan InfoPack yang tersimpan di PostgreSQL",
      },
      {
        id: "oscln",
        key: "oscln",
        label: "OSCLN Reconciliation",
        icon: ArrowsRightLeftIcon,
        breadcrumb: "Claims Workspace / OSCLN Reconciliation",
        description: "Rekonsiliasi dua arah antara Master Data dengan snapshot CSV sistem OSCLN",
      },
      {
        id: "library",
        key: "library",
        label: "Library",
        icon: BookOpenIcon,
        breadcrumb: "Claims Workspace / Library",
        description: "Manajemen riwayat berkas yang telah diunggah ke dalam tabel Master",
      },
    ],
  },
  {
    id: "standards",
    title: "Standards & Audit",
    items: [
      {
        id: "mapping",
        key: "mapping",
        label: "Mapping Rules",
        icon: AdjustmentsHorizontalIcon,
        breadcrumb: "Standards & Audit / Mapping Rules",
        description: "Kamus referensi pemetaan kolom Excel per cedant dan sheet dari database",
      },
      {
        id: "history",
        key: "history",
        label: "Activity Log",
        icon: ClockIcon,
        breadcrumb: "Standards & Audit / Activity Log",
        description: "Jejak audit komparasi, rekonsiliasi, dan unduhan laporan hasil pemeriksaan",
      },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    items: [
      {
        id: "users",
        key: "users",
        label: "User Management",
        icon: UsersIcon,
        breadcrumb: "Administration / User Management",
        description: "Kelola akun pengguna, peran otorisasi (RBAC), dan status aktivasi workspace",
      },
      {
        id: "guide",
        key: "guide",
        label: "User Guide",
        icon: QuestionMarkCircleIcon,
        breadcrumb: "Administration / User Guide",
        description: "Panduan operasional alur upload, pemetaan kolom, master data, dan rekonsiliasi OSCLN",
      },
    ],
  },
];

export function getPageMeta(activeKey) {
  for (const group of NAVIGATION_GROUPS) {
    for (const item of group.items) {
      if (item.key === activeKey) {
        return item;
      }
      if (item.subItems) {
        for (const sub of item.subItems) {
          if (sub.key === activeKey) {
            return sub;
          }
        }
      }
    }
  }
  return NAVIGATION_GROUPS[0].items[0];
}

export default function Sidebar({
  activePage,
  onNavigate,
  collapsed = false,
  onExpandSidebar,
  isBlocked = false,
  isMobileDrawer = false,
}) {
  const [openDropdown, setOpenDropdown] = useState("");
  const effectiveCollapsed = isMobileDrawer ? false : collapsed;

  return (
    <aside
      className={`relative h-full flex flex-col font-sans select-none transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] text-white border-r border-white/10 ${
        effectiveCollapsed ? "w-[72px]" : "w-[252px]"
      } ${isBlocked ? "pointer-events-none opacity-60" : ""}`}
      style={{
        background: "linear-gradient(180deg, #17365D 0%, #132C4E 55%, #0F233F 100%)",
      }}
      aria-label="Main Navigation"
    >
      {/* Brand Lockup — Logo tanpa box, nama OS Claims Hub® dan subjudul RU Claims */}
      <div className="h-[68px] flex items-center px-4 border-b border-white/10 shrink-0 overflow-hidden">
        <button
          type="button"
          onClick={() => onNavigate("overview")}
          className={`flex items-center gap-3 w-full text-left transition-opacity hover:opacity-90 cursor-pointer ${
            effectiveCollapsed ? "justify-center" : ""
          }`}
          title="OS Claims Hub® — RU Claims"
        >
          <img
            src={indoreWhiteLogo}
            alt="Indonesia Re"
            className="h-7 w-auto object-contain shrink-0"
          />
          {!effectiveCollapsed && (
            <div className="flex flex-col min-w-0 transition-opacity duration-150">
              <span className="font-semibold text-white text-[13.5px] tracking-tight leading-tight truncate">
                Indonesia Re®
              </span>
              <span className="text-[10.5px] text-slate-300/80 font-medium tracking-wide mt-0.5 truncate">
                RU Claims
              </span>
            </div>
          )}
        </button>
      </div>

      {/* Grouped Navigation */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-5 sidebar-scroll">
        {NAVIGATION_GROUPS.map((group, groupIdx) => (
          <div key={group.id} className="space-y-1">
            {effectiveCollapsed ? (
              groupIdx > 0 && <div className="border-t border-white/10 my-2 mx-2" />
            ) : (
              <p className="px-3 text-[10.5px] uppercase tracking-[0.06em] text-slate-300/60 font-semibold mb-1.5">
                {group.title}
              </p>
            )}

            <nav className="space-y-0.5">
              {group.items.map((item) => {
                const IconComp = item.icon;
                const hasSubItems = item.subItems && item.subItems.length > 0;

                const isActive = hasSubItems
                  ? item.subItems.some((sub) => activePage === sub.key)
                  : activePage === item.key;

                const isOpen = openDropdown === item.id || (openDropdown === "" && isActive);

                const handleToggle = (e) => {
                  e.preventDefault();
                  if (isBlocked) return;
                  if (effectiveCollapsed) {
                    onExpandSidebar?.();
                    setOpenDropdown(item.id);
                  } else {
                    setOpenDropdown(isOpen ? "" : item.id);
                  }
                };

                /* Selaras dengan example/Sidebar.jsx: clean soft pill tanpa border, shadow, atau garis samping */
                const itemStateClass = isActive
                  ? "bg-white/15 text-white font-semibold"
                  : "text-slate-300/80 font-medium hover:text-white hover:bg-white/[0.08]";

                return (
                  <div key={item.id} className="relative group/navitem space-y-0.5">
                    {hasSubItems ? (
                      <button
                        type="button"
                        onClick={handleToggle}
                        tabIndex={isBlocked ? -1 : 0}
                        aria-expanded={isOpen}
                        aria-label={item.label}
                        className={`w-full h-9 flex items-center justify-between px-3 rounded-[var(--radius-control)] text-[13px] transition-colors duration-150 cursor-pointer ${itemStateClass} ${
                          effectiveCollapsed ? "justify-center px-0" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <IconComp
                            className={`w-[17px] h-[17px] shrink-0 transition-colors ${
                              isActive
                                ? "text-white"
                                : "text-slate-300/75 group-hover/navitem:text-white"
                            }`}
                          />
                          {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
                        </div>
                        {!effectiveCollapsed && (
                          <ChevronDownIcon
                            className={`w-3.5 h-3.5 text-slate-300/75 transition-transform duration-200 ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => !isBlocked && onNavigate(item.key)}
                        tabIndex={isBlocked ? -1 : 0}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={item.label}
                        className={`w-full h-9 flex items-center gap-2.5 px-3 rounded-[var(--radius-control)] text-[13px] transition-colors duration-150 cursor-pointer ${itemStateClass} ${
                          effectiveCollapsed ? "justify-center px-0" : ""
                        }`}
                      >
                        <IconComp
                          className={`w-[17px] h-[17px] shrink-0 transition-colors ${
                            isActive
                              ? "text-white"
                              : "text-slate-300/75 group-hover/navitem:text-white"
                          }`}
                        />
                        {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    )}

                    {/* Collapsed Desktop Tooltip */}
                    {effectiveCollapsed && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 hidden group-hover/navitem:block group-focus-within/navitem:block z-50 bg-[var(--color-ink-solid)] text-[var(--color-on-ink-solid)] text-[11px] font-medium px-2.5 py-1.5 rounded-[var(--radius-control)] shadow-[var(--shadow-overlay)] whitespace-nowrap pointer-events-none">
                        {item.label}
                      </div>
                    )}

                    {/* Sub-menu Links */}
                    {hasSubItems && isOpen && !effectiveCollapsed && (
                      <div className="ml-5 pl-3 border-l border-white/15 py-1 space-y-0.5">
                        {item.subItems.map((sub) => {
                          const isSubActive = activePage === sub.key;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => !isBlocked && onNavigate(sub.key)}
                              tabIndex={isBlocked ? -1 : 0}
                              aria-label={sub.label}
                              className={`w-full text-left block px-2.5 py-1.5 rounded-[var(--radius-control)] text-[12.5px] transition-colors cursor-pointer ${
                                isSubActive
                                  ? "text-white bg-white/15 font-semibold"
                                  : "text-slate-300/75 font-medium hover:text-white hover:bg-white/[0.08]"
                              }`}
                            >
                              {sub.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Bottom Footer: Back to Portal (ukuran & perilaku sama dengan example/Sidebar.jsx) */}
      <div className="p-3 border-t border-white/10 shrink-0">
        {moduleUrl ? (
          <a
            href={moduleUrl}
            aria-label="Back to Portal"
            title="Return to Main Portal"
            className={`${moduleButtonClass} ${effectiveCollapsed ? "px-0 justify-center" : ""}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 shrink-0 text-slate-300"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            {!effectiveCollapsed && <span>Back to Portal</span>}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate("overview")}
            aria-label="Back to Portal"
            title="Back to Portal"
            className={`${moduleButtonClass} ${
              effectiveCollapsed ? "px-0 justify-center" : ""
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 shrink-0 text-white/75"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            {!effectiveCollapsed && <span>Back to Portal</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
