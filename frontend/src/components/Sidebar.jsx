/**
 * OS Claim Hub — left sidebar (green / white theme)
 * Sections: WORKSPACE (5 items) + ADMINISTRATION (1 item)
 */
import {
  HomeIcon,
  ArrowUpTrayIcon,
  AdjustmentsHorizontalIcon,
  TableCellsIcon,
  ArrowsRightLeftIcon,
  ClockIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";

const WORKSPACE = [
  { key: "overview", label: "Overview",            icon: HomeIcon                  },
  { key: "upload",   label: "Upload",               icon: ArrowUpTrayIcon           },
  { key: "mapping",  label: "Mapping Rules",        icon: AdjustmentsHorizontalIcon },
  { key: "master",   label: "Master",               icon: TableCellsIcon            },
  { key: "oscln",    label: "OSCLN Reconciliation", icon: ArrowsRightLeftIcon       },
  { key: "library",  label: "Library",              icon: BookOpenIcon              },
];

const ADMIN = [
  { key: "history", label: "Activity Log", icon: ClockIcon },
];

function NavItem({ item, active, onNavigate }) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => onNavigate(item.key)}
      aria-current={active ? "page" : undefined}
      className={`nav-item ${active ? "nav-item-active" : "nav-item-idle"}`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col sidebar-scroll overflow-y-auto"
      style={{ backgroundColor: "#166534", minHeight: "100vh" }}
      aria-label="Sidebar navigasi"
    >
      {/* ── Brand ── */}
      <div className="px-4 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.15)" }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="white">
              <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight">OS Claim Hub</p>
            <p className="text-xs leading-tight text-brand-200 mt-0.5">Claims Data Integration</p>
          </div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 flex flex-col gap-6 pb-6">
        <div className="flex flex-col gap-1">
          <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-brand-300">
            Workspace
          </p>
          {WORKSPACE.map((item) => (
            <NavItem
              key={item.key}
              item={item}
              active={activePage === item.key}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-brand-300">
            Administration
          </p>
          {ADMIN.map((item) => (
            <NavItem
              key={item.key}
              item={item}
              active={activePage === item.key}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      {/* ── Footer ── */}
      <div
        className="mx-3 mb-4 px-3 py-3 rounded-xl text-xs text-brand-300"
        style={{ background: "rgba(0,0,0,0.15)" }}
      >
        <p className="font-semibold text-white mb-0.5">Reference mapping</p>
        <p className="leading-relaxed opacity-80">Read only · Google Sheets</p>
      </div>
    </aside>
  );
}
