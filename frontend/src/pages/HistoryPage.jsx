// Activity Log Page — redesigned teal style
import { useState } from "react";
import HistoryTable from "../components/HistoryTable";
import SummaryCards from "../components/SummaryCards";
import ResultTable  from "../components/ResultTable";
import {
  ArrowLeftIcon,
  ClockIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { downloadReport } from "../services/api";

export default function HistoryPage() {
  const [viewJob, setViewJob] = useState(null);

  /* ── Detail view ── */
  if (viewJob) {
    return (
      <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">
        <div className="page-header">
          <button
            onClick={() => setViewJob(null)}
            className="flex items-center gap-1.5 text-teal-600 hover:text-teal-800 text-sm font-semibold"
            aria-label="Kembali"
          >
            <ArrowLeftIcon className="h-4 w-4" /> Kembali
          </button>
          <div className="h-4 w-px bg-gray-200 mx-2" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">Activity Log</p>
            <h1 className="text-base font-bold text-gray-800 leading-tight">
              Detail Job <span className="font-mono text-teal-700">#{viewJob.id}</span>
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden sm:block">
              {viewJob.file_a_name} <span className="text-gray-300">vs</span> {viewJob.file_b_name}
            </span>
            <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-full font-medium">
              {viewJob.bulan}/{viewJob.tahun}
            </span>
            <code className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-mono">
              {viewJob.primary_key_col}
            </code>
            <button
              onClick={() => downloadReport(viewJob.id)}
              className="flex items-center gap-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">
          <SummaryCards
            summary={{
              matched:   viewJob.total_matched,
              changed:   viewJob.total_changed,
              only_in_a: viewJob.total_only_in_a,
              only_in_b: viewJob.total_only_in_b,
            }}
            totalA={viewJob.total_rows_a}
            totalB={viewJob.total_rows_b}
          />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Detail Perbandingan</h2>
            <ResultTable jobId={viewJob.id} primaryKeyCol={viewJob.primary_key_col} />
          </div>
        </div>
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <ClockIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">AUDIT &amp; VERSION HISTORY</p>
          <h1 className="text-base font-bold text-gray-800 leading-tight">Activity Log</h1>
        </div>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5 max-w-7xl w-full">
        {/* Section title */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-0.5">AUDIT &amp; VERSION HISTORY</p>
            <h2 className="text-2xl font-extrabold text-gray-800">Activity Log</h2>
            <p className="text-xs text-gray-400 mt-1">
              Riwayat kegiatan pada workspace: upload, replace, archive, import folder, scan, append, dan reconciliation. Semua waktu ditampilkan dalam WIB.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <HistoryTable onViewResult={setViewJob} />
        </div>
      </div>
    </div>
  );
}
