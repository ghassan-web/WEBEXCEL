import { useState } from "react";
import {
  ArrowUpTrayIcon,
  AdjustmentsHorizontalIcon,
  CheckCircleIcon,
  TableCellsIcon,
  ArrowsRightLeftIcon,
  BookOpenIcon,
  InformationCircleIcon,
  ChevronRightIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { PageHeader, Tabs, Card, Badge, Button } from "../components/ui";

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Upload Excel & Pilih Konteks",
    desc: "Buka menu Upload Data. Pilih Tipe Data (OS Claim Cedant atau InfoPack), tentukan Bulan & Tahun Cut-Off serta Perusahaan Asuransi, lalu unggah file .xlsx, .xls, .xlsm, atau .xlsb.",
    icon: ArrowUpTrayIcon,
    target: "upload",
    actionLabel: "Buka Upload Data",
  },
  {
    step: "02",
    title: "Auto Header Scan & Validasi Mapping",
    desc: "Sistem otomatis memindai seluruh header asli pada workbook, mencocokkannya dengan profil di master_mapping_column, dan menandai kolom target (seperti Loss Ref, Outstanding, DOL) yang belum ditemukan dengan indikator merah.",
    icon: AdjustmentsHorizontalIcon,
    target: "mapping",
    actionLabel: "Lihat Mapping Rules",
  },
  {
    step: "03",
    title: "2-Phase Prepare & Confirm",
    desc: "Tahap Prepare memvalidasi kolom & menampilkan preview baris. Setelah diperiksa, Tahap Confirm menyimpan data ke header hasil dari mapping pertama per field, mencocokkan alias upload berikutnya ke header yang sama tanpa menambah kolom baru, sekaligus mengarsipkan seluruh kolom asli dalam raw JSON.",
    icon: CheckCircleIcon,
    target: "upload",
    actionLabel: "Mulai Upload",
  },
  {
    step: "04",
    title: "Master Data & All Scanned Columns",
    desc: "Telusuri data terkonsolidasi lintas cedant, filter berdasarkan Perusahaan Asuransi, ubah mode tampilan antara Core Columns dan All Scanned Columns, lalu ekspor ke format Excel.",
    icon: TableCellsIcon,
    target: "master",
    actionLabel: "Buka Master Data",
  },
  {
    step: "05",
    title: "OSCLN Two-Way Reconciliation",
    desc: "Unggah snapshot CSV sistem internal OSCLN terbaru dan jalankan pencocokan dua arah tanpa mengubah data Master untuk meninjau status MATCHED_1_TO_1, MATCHED_MULTIPLE, NOT_FOUND, dan INVALID_KEY.",
    icon: ArrowsRightLeftIcon,
    target: "oscln",
    actionLabel: "Buka OSCLN Reconciliation",
  },
  {
    step: "06",
    title: "File Library, Header Library & Audit Log",
    desc: "Kelola riwayat berkas yang telah masuk ke Master Data, telusuri katalog header unik per sheet di Header Library, dan pantau seluruh jejak audit aktivitas pada Activity Log.",
    icon: BookOpenIcon,
    target: "library",
    actionLabel: "Buka Library",
  },
];

const FAQS = [
  {
    q: "Mengapa kolom Date of Loss (DOL) atau kolom lain ditandai merah saat Stage 2 Upload?",
    a: "Indikator merah menandakan header pada file Excel tidak ditemukan kecocokannya dengan daftar alias pada profil master_mapping_column untuk cedant/sheet tersebut. Periksa halaman Mapping Rules atau koreksi nama kolom target secara manual sebelum menekan Confirm.",
  },
  {
    q: "Apakah data Master lama terhapus saat mengunggah file baru?",
    a: "Tidak. Upload ke Master Data bersifat append dengan deduplikasi berbasis Primary Key. Baris dengan kunci yang sama dalam periode/konteks aktif dilewati otomatis agar tidak terjadi duplikasi.",
  },
  {
    q: "Bagaimana jika satu perusahaan asuransi (seperti SOMPO) memiliki beberapa format sheet?",
    a: "Aturan mapping dibedakan berdasarkan daftar sheet pada kolom argument (misalnya FAC OUT, CLAIM / AEGS, atau OS, D/I). Jika daftar sheet pada aturan dikosongkan, aturan mapping tersebut berlaku sebagai fallback untuk semua sheet.",
  },
  {
    q: "Bagaimana penanganan file Excel yang diproteksi password (seperti KB Insurance)?",
    a: "Engine pembaca workbook di backend mendukung format .xlsx, .xls, .xlsm, dan .xlsb termasuk workbook terenkripsi yang memiliki konfigurasi sheet/file password agar header tetap dapat dipindai dengan aman.",
  },
  {
    q: "Apakah mengunggah CSV di OSCLN Reconciliation menimpa data Master OS Claim?",
    a: "Tidak. Upload CSV OSCLN hanya menggantikan snapshot internal OSCLN yang aktif dipakai sebagai pembanding dua arah. Data Master hasil upload cedant tetap utuh.",
  },
];

const TABS = [
  { id: "workflow", label: "Pipeline Workflow" },
  { id: "mapping", label: "Mapping & Storage Rules" },
  { id: "oscln", label: "OSCLN Reconciliation" },
  { id: "shortcuts", label: "Shortcuts & Navigasi" },
  { id: "faq", label: "Frequently Asked Questions (FAQ)" },
];

export default function UserGuidePage({ onNavigate }) {
  const [activeTab, setActiveTab] = useState("workflow");

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
      <PageHeader
        title="User Guide"
        description="Panduan operasional lengkap untuk upload Excel cedant, pemetaan kolom, pengelolaan Master Data, rekonsiliasi OSCLN, dan shortcut produktivitas."
      />

      <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} />

      <div className="min-h-[440px]">
        {activeTab === "workflow" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {WORKFLOW_STEPS.map((item) => {
                const IconComp = item.icon;
                return (
                  <div
                    key={item.step}
                    className="bg-[var(--color-surface)] p-6 rounded-[var(--radius-surface)] border border-[var(--color-line)] shadow-[var(--shadow-card)] space-y-4 flex flex-col justify-between hover:border-[var(--color-line-strong)] transition-all hover:shadow-[var(--shadow-card-hover)]"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 bg-[var(--color-brand-soft)] rounded-[var(--radius-control)] flex items-center justify-center border border-[var(--color-brand-line)]">
                          <IconComp className="w-5 h-5 text-[var(--color-brand)]" />
                        </div>
                        <span className="font-mono font-bold text-[var(--color-ink-faint)] text-lg tabular-nums">
                          {item.step}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--color-ink)] text-sm">
                          {item.title}
                        </h3>
                        <p className="text-[var(--color-ink-muted)] text-xs leading-relaxed mt-1.5">
                          {item.desc}
                        </p>
                      </div>
                    </div>

                    {onNavigate && item.target && (
                      <div className="pt-2 border-t border-[var(--color-line)]/60">
                        <button
                          type="button"
                          onClick={() => onNavigate(item.target)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand)] hover:text-[var(--color-brand-hover)] transition-colors cursor-pointer"
                        >
                          <span>{item.actionLabel}</span>
                          <ChevronRightIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bg-[var(--color-brand-soft)] border border-[var(--color-brand-line)] rounded-[var(--radius-surface)] p-4 flex items-start gap-3">
              <InformationCircleIcon className="w-5 h-5 text-[var(--color-brand)] shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-xs">
                <p className="font-semibold text-[var(--color-brand)]">
                  Multi-Format Workbook &amp; Raw Column Preservation
                </p>
                <p className="text-[var(--color-ink-body)] leading-relaxed">
                  Platform mendukung penuh file Excel (.xlsx, .xls, .xlsm, .xlsb), termasuk workbook yang diproteksi password (seperti KB Insurance). Hanya field inti terstandarisasi yang dipromosikan menjadi kolom utama database, sementara seluruh kolom asli dari file cedant tetap tersimpan utuh dan dapat diakses melalui Master Data &amp; Header Library.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "mapping" && (
          <Card
            title="Aturan Pemetaan Kolom & Penyimpanan Database"
            description="Mekanisme pembacaan profil mapping OS Cedant/Infopack dan penyimpanan data hasil upload."
          >
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-[var(--radius-card)] border border-[var(--color-brand-line)] bg-[var(--color-brand-soft)]/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <AdjustmentsHorizontalIcon className="w-5 h-5 text-[var(--color-brand)]" />
                    <span className="font-semibold text-[var(--color-brand)] text-[13px]">
                      1. Lookup Profil per Cedant &amp; Sheet
                    </span>
                  </div>
                  <p className="text-[var(--color-ink-muted)] text-xs leading-relaxed">
                    Aturan OS Cedant dibaca dari <code className="font-mono text-[var(--color-ink)]">rekonsiliasi.master_mapping_column</code>, sedangkan Infopack dari <code className="font-mono text-[var(--color-ink)]">rekonsiliasi.master_mapping_column_infopack</code>. Aturan memetakan nama sheet pada <code className="font-mono text-[var(--color-ink)]">argument</code> ke field target; jika daftar sheet kosong, aturan berlaku untuk semua sheet.
                  </p>
                </div>

                <div className="p-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] space-y-2">
                  <div className="flex items-center gap-2">
                    <TableCellsIcon className="w-5 h-5 text-[var(--color-ink)]" />
                    <span className="font-semibold text-[var(--color-ink)] text-[13px]">
                      2. Core Fields + Raw JSON Preservation
                    </span>
                  </div>
                  <p className="text-[var(--color-ink-muted)] text-xs leading-relaxed">
                    Saat konfirmasi upload selesai, sistem menyimpan field inti terstruktur sekaligus mempertahankan seluruh pasangan kolom-nilai asli dari Excel di JSONB dan mencatat struktur kolom di <strong>Header Library</strong> beserta versi mapping aktif.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] space-y-3 text-[13px]">
                <h4 className="font-semibold text-[var(--color-ink)]">
                  Alur Upload Multi-Sheet:
                </h4>
                <ol className="list-decimal pl-5 space-y-2 text-xs text-[var(--color-ink-muted)] leading-relaxed">
                  <li>
                    <strong>Prepare (<code className="font-mono">POST /prepare</code>)</strong>: Memindai semua sheet dan mencatatnya per sheet di <code className="font-mono">upload_table</code> dengan status awal.
                  </li>
                  <li>
                    Jika mapping field wajib cocok dan lengkap, sheet diproses otomatis dan menjadi <code className="font-mono">ready</code>. Jika belum lengkap, sheet menunggu pemeriksaan dengan status <code className="font-mono">needs_review</code>; operator dapat memperbaiki mapping atau menandainya <code className="font-mono">skipped</code> bila tidak dipakai.
                  </li>
                  <li>
                    Hanya sheet <code className="font-mono">ready</code> yang masuk ke Master. Sheet <code className="font-mono">skipped</code> tetap tercatat untuk audit, dan batch selesai setelah seluruh sheet berstatus <code className="font-mono">ready</code> atau <code className="font-mono">skipped</code>.
                  </li>
                </ol>
              </div>
            </div>
          </Card>
        )}

        {activeTab === "oscln" && (
          <Card
            title="Panduan OSCLN Two-Way Reconciliation"
            description="Mencocokkan Master OS Claim hasil konsolidasi dengan snapshot CSV internal OSCLN secara aman tanpa memodifikasi data Master."
          >
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-[var(--radius-card)] border border-[var(--color-brand-line)] bg-[var(--color-brand-soft)]/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <ArrowsRightLeftIcon className="w-5 h-5 text-[var(--color-brand)]" />
                    <span className="font-semibold text-[var(--color-brand)] text-[13px]">
                      Matching Key Dua Arah (POV Switch)
                    </span>
                  </div>
                  <p className="text-[var(--color-ink-muted)] text-xs leading-relaxed">
                    Rekonsiliasi membandingkan <strong>Master[Loss Ref] &harr; OSCLN[loss_ref]</strong>. Anda dapat berpindah sudut pandang antara <em>Master &rarr; OSCLN</em> dan <em>OSCLN &rarr; Master</em> serta mengekspor hasilnya ke Excel dua tab.
                  </p>
                </div>

                <div className="p-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] space-y-2">
                  <div className="flex items-center gap-2">
                    <KeyIcon className="w-5 h-5 text-[var(--color-ink)]" />
                    <span className="font-semibold text-[var(--color-ink)] text-[13px]">
                      Status Klasifikasi Pencocokan
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge tone="valid">MATCHED_1_TO_1</Badge>
                    <Badge tone="warning">MATCHED_MULTIPLE</Badge>
                    <Badge tone="danger">NOT_FOUND</Badge>
                    <Badge tone="neutral">INVALID_KEY</Badge>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] space-y-3">
                <h4 className="font-semibold text-[var(--color-ink)] text-[13px]">
                  Langkah Eksekusi Rekonsiliasi:
                </h4>
                <ol className="list-decimal pl-5 space-y-2 text-xs text-[var(--color-ink-muted)] leading-relaxed">
                  <li>Buka menu <strong>OSCLN Reconciliation</strong> di sidebar.</li>
                  <li>Pada panel kiri, pilih file snapshot <strong>CSV OSCLN</strong> (maks. 15 MB) lalu klik <strong>Upload OSCLN CSV</strong>.</li>
                  <li>Pastikan snapshot aktif terpilih pada panel kanan (<strong>Reconciliation Setup</strong>) dan sesuaikan Tipe Data serta kolom Primary Key jika diperlukan.</li>
                  <li>Klik <strong>Run Two-Way Matching</strong> lalu tinjau ringkasan coverage atau unduh hasil lengkap melalui tombol <strong>Open Results Sheet</strong>.</li>
                </ol>
                {onNavigate && (
                  <div className="pt-2">
                    <Button
                      variant="primary"
                      size="sm"
                      icon={ArrowsRightLeftIcon}
                      onClick={() => onNavigate("oscln")}
                    >
                      Buka OSCLN Reconciliation
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {activeTab === "shortcuts" && (
          <Card
            title="Keyboard Shortcuts & Navigasi Cepat"
            description="Alat bantu produktivitas untuk mempercepat inspeksi tabel berukuran besar dan berpindah modul di portal Indonesia Re."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-semibold text-[var(--color-ink)] text-[13px]">
                    Toggle Left Sidebar
                  </h4>
                  <p className="text-[var(--color-ink-muted)] text-xs">
                    Lipat atau bentangkan sidebar untuk memperluas area tabel Master Data &amp; OSCLN
                  </p>
                </div>
                <kbd className="px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded font-mono font-bold text-xs text-[var(--color-ink)] shadow-sm shrink-0">
                  Ctrl + B / ⌘B
                </kbd>
              </div>

              <div className="p-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-semibold text-[var(--color-ink)] text-[13px]">
                    Tutup Modal &amp; Menu
                  </h4>
                  <p className="text-[var(--color-ink-muted)] text-xs">
                    Menutup dialog konfirmasi, form tambah user, atau dropdown profil pengguna secara cepat
                  </p>
                </div>
                <kbd className="px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded font-mono font-bold text-xs text-[var(--color-ink)] shadow-sm shrink-0">
                  Esc
                </kbd>
              </div>

              <div className="p-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-semibold text-[var(--color-ink)] text-[13px]">
                    Column View Switcher (Master Data)
                  </h4>
                  <p className="text-[var(--color-ink-muted)] text-xs">
                    Beralih instan antara kolom inti DB dan seluruh kolom asli hasil pemindaian file Excel
                  </p>
                </div>
                <Badge tone="brand">Core / All Columns</Badge>
              </div>

              <div className="p-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-semibold text-[var(--color-ink)] text-[13px]">
                    Back to Portal Integration
                  </h4>
                  <p className="text-[var(--color-ink-muted)] text-xs">
                    Kembali ke portal utama Indonesia Re sesuai konfigurasi <code className="font-mono">VITE_MODULE_URL</code>
                  </p>
                </div>
                <Badge tone="neutral">Sidebar Footer</Badge>
              </div>
            </div>
          </Card>
        )}

        {activeTab === "faq" && (
          <Card
            title="Frequently Asked Questions (FAQ)"
            description="Jawaban atas pertanyaan operasional paling sering terkait upload cedant, mapping kolom, dan rekonsiliasi OSCLN."
          >
            <div className="divide-y divide-[var(--color-line)]">
              {FAQS.map((f, idx) => (
                <div key={idx} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                  <h4 className="font-semibold text-[var(--color-ink)] text-[13px]">
                    {f.q}
                  </h4>
                  <p className="text-[var(--color-ink-muted)] text-[13px] leading-relaxed">
                    {f.a}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
