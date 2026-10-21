/**
 * Top navigation bar.
 */
import { TableCellsIcon } from "@heroicons/react/24/solid";

export default function Navbar({ activePage, onNavigate }) {
  const links = [
    { key: "compare", label: "Bandingkan" },
    { key: "history", label: "Riwayat" },
  ];

  return (
    <header className="bg-gradient-to-r from-blue-700 to-indigo-700 shadow-lg sticky top-0 z-50">
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand */}
        <button
          onClick={() => onNavigate("compare")}
          className="flex items-center gap-2 text-white font-bold text-lg tracking-tight hover:opacity-90 transition-opacity"
          aria-label="Home"
        >
          <TableCellsIcon className="h-7 w-7" aria-hidden="true" />
          <span>ExcelCompare</span>
          <span className="text-blue-200 font-normal text-sm hidden sm:block">| Komparasi Data Reasuransi</span>
        </button>

        {/* Nav links */}
        <nav className="flex gap-1" role="navigation" aria-label="Navigasi utama">
          {links.map((l) => (
            <button
              key={l.key}
              onClick={() => onNavigate(l.key)}
              className={[
                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activePage === l.key
                  ? "bg-white text-blue-700 shadow"
                  : "text-blue-100 hover:bg-white/20",
              ].join(" ")}
              aria-current={activePage === l.key ? "page" : undefined}
            >
              {l.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
