import { useState } from "react";
import HistoryTable from "../components/HistoryTable";
import SummaryCards from "../components/SummaryCards";
import ResultTable from "../components/ResultTable";
import { PageHeader, Card, Button, Badge } from "../components/ui";
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { downloadReport } from "../services/api";

export default function HistoryPage() {
  const [viewJob, setViewJob] = useState(null);

  /* Detail View */
  if (viewJob) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
        <PageHeader
          title={`Detail Job #${viewJob.id}`}
          description={`${viewJob.file_a_name || "Master"} vs ${viewJob.file_b_name || "Snapshot"}`}
          status={
            <div className="flex items-center gap-2">
              <Badge tone="brand">
                {viewJob.bulan}/{viewJob.tahun}
              </Badge>
              <code className="text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-line)] text-[var(--color-ink-body)] px-2 py-0.5 rounded-[var(--radius-control)] font-mono">
                {viewJob.primary_key_col}
              </code>
            </div>
          }
          actions={
            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                icon={ArrowLeftIcon}
                onClick={() => setViewJob(null)}
              >
                Kembali
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={ArrowDownTrayIcon}
                onClick={() => downloadReport(viewJob.id)}
              >
                Export
              </Button>
            </div>
          }
        />

        <SummaryCards
          summary={{
            matched: viewJob.total_matched,
            changed: viewJob.total_changed,
            only_in_a: viewJob.total_only_in_a,
            only_in_b: viewJob.total_only_in_b,
          }}
          totalA={viewJob.total_rows_a}
          totalB={viewJob.total_rows_b}
        />

        <Card title="Detail Perbandingan">
          <ResultTable jobId={viewJob.id} primaryKeyCol={viewJob.primary_key_col} />
        </Card>
      </div>
    );
  }

  /* List View */
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
      <PageHeader
        title="Activity Log"
        description="Riwayat kegiatan pada workspace: upload, scan header, append, dan reconciliation. Semua waktu ditampilkan dalam WIB."
      />

      <Card padding="none">
        <HistoryTable onViewResult={setViewJob} />
      </Card>
    </div>
  );
}
