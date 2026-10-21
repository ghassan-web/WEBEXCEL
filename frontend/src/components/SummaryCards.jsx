/**
 * Summary stat cards — green/white theme
 */
export default function SummaryCards({ summary, totalA, totalB }) {
  const cards = [
    { label: "Total Baris File A", value: totalA ?? 0,               bg: "bg-gray-50",      border: "border-gray-200",   text: "text-gray-700"    },
    { label: "Total Baris File B", value: totalB ?? 0,               bg: "bg-gray-50",      border: "border-gray-200",   text: "text-gray-700"    },
    { label: "Matched",            value: summary?.matched   ?? 0,   bg: "bg-emerald-50",   border: "border-emerald-200",text: "text-emerald-700" },
    { label: "Berubah",            value: summary?.changed   ?? 0,   bg: "bg-amber-50",     border: "border-amber-200",  text: "text-amber-700"   },
    { label: "Hanya di File A",    value: summary?.only_in_a ?? 0,   bg: "bg-red-50",       border: "border-red-200",    text: "text-red-600"     },
    { label: "Hanya di File B",    value: summary?.only_in_b ?? 0,   bg: "bg-orange-50",    border: "border-orange-200", text: "text-orange-600"  },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-2xl border ${c.border} ${c.bg} px-4 py-4 flex flex-col items-center gap-1.5 shadow-card`}
        >
          <span className={`text-2xl font-bold tracking-tight ${c.text}`}>
            {c.value.toLocaleString("id-ID")}
          </span>
          <span className="text-xs text-gray-500 text-center leading-tight font-medium">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
