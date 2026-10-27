import { useState, useCallback } from "react";
import {
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  TagIcon,
  CurrencyDollarIcon,
  CalendarIcon,
} from "@heroicons/react/24/outline";

/* ─────────────────────────────────────────────────────────────
   Full mapping data (columns B → CT, OS Claim Cedant tab)
   Fields: col, cedant, sheetMet, lossRef, outstanding, dateOfLoss, status
───────────────────────────────────────────────────────────── */
const PROFILES_OS = [
  { col:"B",  cedant:"ABB",                sheetMet:"Sheet1",                              lossRef:"AL_Index",               outstanding:"klaim",                            dateOfLoss:"tg_kejadian",         status:"READY"      },
  { col:"C",  cedant:"ACA",                sheetMet:"KlaimFak",                            lossRef:"RefNo",                  outstanding:"Amount_Net_OS",                    dateOfLoss:"DOL",                 status:"READY"      },
  { col:"D",  cedant:"ACA",                sheetMet:"KlaimAF",                             lossRef:"RefNo",                  outstanding:"Amount_Net_OS",                    dateOfLoss:"DOL",                 status:"READY"      },
  { col:"D2", cedant:"ACA",                sheetMet:"CashCalls",                           lossRef:"RefNo",                  outstanding:"Amount_Net_OS",                    dateOfLoss:"DOL",                 status:"READY"      },
  { col:"E",  cedant:"ADHI RE",            sheetMet:"Sheet1",                              lossRef:"CLAIM NO",               outstanding:"TOTAL AMOUNT TSAI",                dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"F",  cedant:"AGGI",               sheetMet:"Sheet1",                              lossRef:"CLAIM NO",               outstanding:"DUE TO INSUL / US",                dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"G",  cedant:"AON",                sheetMet:"COF",                                 lossRef:"Claim Code",             outstanding:"Claim – in amount",                dateOfLoss:"—",                   status:"INCOMPLETE" },
  { col:"H",  cedant:"AON (Broker)",       sheetMet:"Property, Marine, Vhkls",             lossRef:"Contract Code",          outstanding:"Orig Currency Amt",                dateOfLoss:"Trans Desc/DOL",      status:"READY"      },
  { col:"I",  cedant:"AON (Broker)",       sheetMet:"Facultative, Pending Query",          lossRef:"Contract Code",          outstanding:"Orig Currency Amt",                dateOfLoss:"Trans Desc/DOL",      status:"READY"      },
  { col:"J",  cedant:"AON (Broker)",       sheetMet:"Sheet1",                              lossRef:"Contract Code",          outstanding:"Orig Currency Amt",                dateOfLoss:"Trans Desc/DOL",      status:"READY"      },
  { col:"K",  cedant:"API RE (Broker)",    sheetMet:"List Claim",                          lossRef:"FLA / GLA APRE",         outstanding:"Loss Pj Share",                    dateOfLoss:"DOL (Date of Loss)",  status:"READY"      },
  { col:"L",  cedant:"API RE (Broker)",    sheetMet:"List Update",                         lossRef:"No. DLA APRE",           outstanding:"Outstanding Claim",                dateOfLoss:"DOL (Date of Loss)",  status:"READY"      },
  { col:"M",  cedant:"ASIB",               sheetMet:"Detail_BIRDAS",                       lossRef:"No. DLA / Ribu / Nota",  outstanding:"OS Original Currency",             dateOfLoss:"Tgl. DOL",            status:"READY"      },
  { col:"N",  cedant:"ASIB",               sheetMet:"KLAIM",                               lossRef:"No. DLA / Ribu / Nota",  outstanding:"OS Original Currency",             dateOfLoss:"Tgl. DOL",            status:"READY"      },
  { col:"O",  cedant:"ASIB",               sheetMet:"LIPAS",                               lossRef:"PM_OJX_REF",             outstanding:"CCOB_BAL_DUE",                     dateOfLoss:"(field tersedia)",    status:"READY"      },
  { col:"P",  cedant:"ASKRINDO",           sheetMet:"Sheet1",                              lossRef:"DLA/FLA",                outstanding:"Hutang sd 2024",                   dateOfLoss:"DOL",                 status:"READY"      },
  { col:"Q",  cedant:"ASKRINDO (Broker)",  sheetMet:"REKAPAN TAGIHAN OS KLAIM ALL CE",     lossRef:"DLA ASKRINDO",           outstanding:"ORIGINAL AMOUNT",                  dateOfLoss:"DOL",                 status:"READY"      },
  { col:"R",  cedant:"ASTRARAHANA",        sheetMet:"Detail",                              lossRef:"ClaimNo",                outstanding:"AllAmount",                        dateOfLoss:"DOCL",                status:"READY"      },
  { col:"S",  cedant:"ASMITA",             sheetMet:"Sheet1",                              lossRef:"DLA REASGURANG",         outstanding:"AMOUNT",                           dateOfLoss:"DOL",                 status:"READY"      },
  { col:"T",  cedant:"AVRIST",             sheetMet:"Sheet1",                              lossRef:"CLAIM NUMBER",           outstanding:"OUTSTANDING",                      dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"U",  cedant:"AXA",                sheetMet:"Sheet1",                              lossRef:"Ref No.",                outstanding:"Sum of Outstanding",               dateOfLoss:"(Tidak tersedia)",    status:"READY"      },
  { col:"V",  cedant:"BCA INSURANCE",      sheetMet:"Sheet1",                              lossRef:"Reference No.",          outstanding:"Outstanding Amount",               dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"W",  cedant:"BINTANG",            sheetMet:"DLA Belum Konfirmasi Teknis",         lossRef:"Claim Number",           outstanding:"R/I Share Amount",                 dateOfLoss:"DOL",                 status:"READY"      },
  { col:"X",  cedant:"BINTANG",            sheetMet:"Konfirmasi Teknis belum dibayar",     lossRef:"Claim Number",           outstanding:"R/I Share Amount",                 dateOfLoss:"DOL",                 status:"READY"      },
  { col:"Y",  cedant:"BINTANG",            sheetMet:"DLA Belum Konfirmasi Teknis",         lossRef:"Claim Number",           outstanding:"R/I Share Amount",                 dateOfLoss:"DOL",                 status:"READY"      },
  { col:"Z",  cedant:"BINTANG",            sheetMet:"Konfirmasi Teknis belum dibayar",     lossRef:"Claim Number",           outstanding:"R/I Share Amount",                 dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AA", cedant:"BINTANG",            sheetMet:"FLA",                                 lossRef:"Claim Number",           outstanding:"R/I Share Amount",                 dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AB", cedant:"BINTANG",            sheetMet:"NCL",                                 lossRef:"Claim Number",           outstanding:"R/I Share Amount",                 dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AC", cedant:"BRINS",              sheetMet:"SOA Facultatif, Cedoos",              lossRef:"domino",                 outstanding:"Nihilpng",                         dateOfLoss:"(Tidak tersedia)",    status:"READY"      },
  { col:"AD", cedant:"CHINA TAIPING",      sheetMet:"R/U",                                 lossRef:"Claim No.",              outstanding:"Reinsurer Origin Share",           dateOfLoss:"(Tidak tersedia)",    status:"READY"      },
  { col:"AE", cedant:"CHINA TAIPING",      sheetMet:"R/U Facor",                           lossRef:"Policy No.",             outstanding:"O/Scc",                            dateOfLoss:"Date Of Loss",        status:"READY"      },
  { col:"AF", cedant:"CHINA TAIPING",      sheetMet:"on process (TREATY)",                 lossRef:"DLA NO",                 outstanding:"RENDO SHARE",                      dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AG", cedant:"CHINA TAIPING",      sheetMet:"on process (FACUL)",                  lossRef:"REF NO",                 outstanding:"AMOUNT",                           dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AH", cedant:"CHINA TAIPING",      sheetMet:"Sheet1",                              lossRef:"DLA NO",                 outstanding:"RENDO SHARE",                      dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AI", cedant:"CIPTA COLEMON (Broker)", sheetMet:"Facultative",                     lossRef:"COA Claim Ref. No.",     outstanding:"Loss In Amount",                   dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AJ", cedant:"DAYIN",              sheetMet:"TANDA S",                             lossRef:"REFNO",                  outstanding:"NET BALANCE",                      dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AK", cedant:"DIBAI",              sheetMet:"Klaim Proses",                        lossRef:"FLA/DLA DIBAI",          outstanding:"PT REASGURANG INDONESIA UTAMA",    dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AL", cedant:"ENERGY RE",          sheetMet:"Sheet1 (2)",                          lossRef:"Ref No.",                outstanding:"Claim Amount + 4% of 300% / Amount", dateOfLoss:"DOL",               status:"READY"      },
  { col:"AM", cedant:"ETIGA",              sheetMet:"RENDO",                               lossRef:"Reference No.",          outstanding:"Net O/S",                          dateOfLoss:"Loss Date",           status:"READY"      },
  { col:"AN", cedant:"FL RE (Broker)",     sheetMet:"ALL CLAIM",                           lossRef:"DLA File",               outstanding:"Balance O/S",                      dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AO", cedant:"FPG",                sheetMet:"Sheet1",                              lossRef:"Document No.",           outstanding:"Amount Net O/S FPG",               dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"AP", cedant:"FPG",                sheetMet:"Sheet1",                              lossRef:"Document No.",           outstanding:"Amount Net O/S FPG",               dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"AQ", cedant:"FPG",                sheetMet:"Sheet1",                              lossRef:"Document No.",           outstanding:"Amount Net O/S FPG",               dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"AR", cedant:"GARUDA RE (Broker)", sheetMet:"Sheet1",                              lossRef:"Claim No.",              outstanding:"Reinsurer Share Orig in IDR",       dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AS", cedant:"GEGI",               sheetMet:"Outstanding",                         lossRef:"CLAIM NO",               outstanding:"NET_AMT",                          dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AT", cedant:"GLYCARP (Broker)",   sheetMet:"Data",                                lossRef:"Client Reference",       outstanding:"Reinsurer Orig CCY Amt",           dateOfLoss:"Loss Date",           status:"READY"      },
  { col:"AU", cedant:"HARTA AMAN",         sheetMet:"DETAILS",                             lossRef:"Reference No.",          outstanding:"Outstanding Original Currency",    dateOfLoss:"DOL",                 status:"READY"      },
  { col:"AV", cedant:"IBS RE (Broker)",    sheetMet:"OS TAC - CAR",                        lossRef:"IBS Darrino",            outstanding:"Balance",                          dateOfLoss:"LossClaim",           status:"READY"      },
  { col:"AW", cedant:"IBS RE (Broker)",    sheetMet:"OS TAC - PAL OS TAC - CPM OS TAC - Liability", lossRef:"IBS Darrino", outstanding:"Balance",                           dateOfLoss:"LossClaim",           status:"READY"      },
  { col:"AX", cedant:"IBS RE (Broker)",    sheetMet:"CUBE",                                lossRef:"NO CLAIM CUBE",          outstanding:"Balance",                          dateOfLoss:"LossClaim",           status:"READY"      },
  { col:"AY", cedant:"IBS RE (Broker)",    sheetMet:"Received Confirmation",               lossRef:"IBS Darrino",            outstanding:"Balance",                          dateOfLoss:"LossClaim",           status:"READY"      },
  { col:"AZ", cedant:"IBUS (Broker)",      sheetMet:"list os",                             lossRef:"Reference No.",          outstanding:"Amount GRI",                       dateOfLoss:"DOL",                 status:"READY"      },
  { col:"BA", cedant:"IQNA ASIA (Broker)", sheetMet:"R/U",                                 lossRef:"REFERENCE IGNA R/ / DLA", outstanding:"OUTSTANDING",                     dateOfLoss:"D.O.L",               status:"READY"      },
  { col:"BB", cedant:"IQNA ASIA (Broker)", sheetMet:"R/U",                                 lossRef:"REFERENCE IGNA R/ / DLA", outstanding:"OUTSTANDING",                     dateOfLoss:"D.O.L",               status:"READY"      },
  { col:"BC", cedant:"JASA RAHARJA",       sheetMet:"CASH CALL, FACULTATIVE, XCL",         lossRef:"REF NO",                 outstanding:"AMOUNT NET O/S",                   dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"BD", cedant:"JASINDO",            sheetMet:"Detail1, Detail2, Detail3, Inkaso",   lossRef:"Reference",              outstanding:"Saldo Akhir Tagih",                dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"BE", cedant:"JBGDA (Broker)",     sheetMet:"ANTRAGRANA",                          lossRef:"NO. REBS",               outstanding:"INDORE / OS",                      dateOfLoss:"DOL",                 status:"READY"      },
  { col:"BF", cedant:"JBGDA (Broker)",     sheetMet:"PUN, ASTRA, SAHABAT",                 lossRef:"NO. REBS",               outstanding:"INDORE OS",                        dateOfLoss:"DOL",                 status:"READY"      },
  { col:"BG", cedant:"JBGDA (Broker)",     sheetMet:"ACA",                                 lossRef:"No. Ref Alliata",        outstanding:"OS INDORE",                        dateOfLoss:"DOL",                 status:"READY"      },
  { col:"BH", cedant:"JCR (Broker)",       sheetMet:"rencana rékons aguntua",              lossRef:"DLA JCR",                outstanding:"jumlah",                           dateOfLoss:"DOL",                 status:"READY"      },
  { col:"BI", cedant:"KB INS",             sheetMet:"RENDO",                               lossRef:"Claim No.",              outstanding:"Remain OS in 1005",                dateOfLoss:"DOL",                 status:"READY"      },
  { col:"KBRU", cedant:"KBRU (Broker)",    sheetMet:"Sheet1",                              lossRef:"REFF CLAIM",             outstanding:"AMOUNT SHARES REAS",               dateOfLoss:"DATE LOSS",            status:"READY"      },
  { col:"BK", cedant:"LINKS RE (Broker)",  sheetMet:"Sheet1",                              lossRef:"(LINKS-RE) CLAIM NUMBER", outstanding:"CLAIMS SHARE",                    dateOfLoss:"DOL",                 status:"READY"      },
  { col:"BL", cedant:"LIPPO",              sheetMet:"Sheet1",                              lossRef:"No DLA / Claim",         outstanding:"Outstanding",                      dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"BM", cedant:"LIPPO",              sheetMet:"Sheet1",                              lossRef:"No DLA / Claim",         outstanding:"Outstanding",                      dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"BN", cedant:"LIPPO",              sheetMet:"Sheet1",                              lossRef:"No DLA / Claim",         outstanding:"Outstanding",                      dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"BO", cedant:"LIPPO",              sheetMet:"APPROVED",                            lossRef:"No DLA / Claim",         outstanding:"Outstanding",                      dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"BP", cedant:"LIPPO",              sheetMet:"CPM, MONEY",                          lossRef:"No DLA / Claim",         outstanding:"Outstanding",                      dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"BQ", cedant:"MAG",                sheetMet:"SOA 06.2026",                         lossRef:"REFNO",                  outstanding:"AMOUNT NET O/S",                   dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"BR", cedant:"MAG",                sheetMet:"RENDO – CRASH PROGRAM",               lossRef:"Document No.",           outstanding:"Amount Net O/S",                   dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"BS", cedant:"MAG",                sheetMet:"PROPOSED BOD",                        lossRef:"Reference No.",          outstanding:"Amount Net O/S",                   dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"BT", cedant:"MAG",                sheetMet:"LIST CLAIM BATCH I 2026",             lossRef:"REFNO",                  outstanding:"AMOUNT NET O/S",                   dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"BU", cedant:"MAG",                sheetMet:"WIJANG GROUP",                        lossRef:"REFNO",                  outstanding:"AMOUNT NET O/S",                   dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"BV", cedant:"MAG",                sheetMet:"III sheet – Blue SUMSER DAN STATUS",  lossRef:"REFNO",                  outstanding:"AMOUNT NET O/S",                   dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"BW", cedant:"MARSH (Broker)",     sheetMet:"Sheet1",                              lossRef:"Trans No.",              outstanding:"Reinsurer Orig CCY Amt",           dateOfLoss:"Loss Date",           status:"READY"      },
  { col:"BX", cedant:"MNC",                sheetMet:"List OS Fact",                        lossRef:"CLAIM NO",               outstanding:"RI_PAID (ORI)",                    dateOfLoss:"LOSS DATE",           status:"READY"      },
  { col:"BY", cedant:"MNC",                sheetMet:"List SOL",                            lossRef:"CLAIM NO",               outstanding:"SHARE REAS",                       dateOfLoss:"DOL",                 status:"READY"      },
  { col:"BZ", cedant:"MPM",                sheetMet:"Sheet1",                              lossRef:"Name Ref No.",           outstanding:"OS Obj – Curr",                    dateOfLoss:"Date of Loss",        status:"READY"      },
  { col:"CB", cedant:"MURE (Broker)",      sheetMet:"Withdrawn",                           lossRef:"No Claim MURE",          outstanding:"Amount",                           dateOfLoss:"DOL",                 status:"READY"      },
  { col:"CC", cedant:"MURE (Broker)",      sheetMet:"Proposed BOD - ALM",                  lossRef:"No Claim MURE",          outstanding:"Amount",                           dateOfLoss:"DOL",                 status:"READY"      },
  { col:"CD", cedant:"MURE (Broker)",      sheetMet:"List OS",                             lossRef:"No Claim MURE",          outstanding:"Amount",                           dateOfLoss:"DOL",                 status:"READY"      },
  { col:"CE", cedant:"MURE (Broker)",      sheetMet:"Confirmed Teknis",                    lossRef:"Subject (mail) No Claim MURE", outstanding:"Amount",                    dateOfLoss:"(Tidak tersedia)",    status:"READY"      },
  { col:"CF", cedant:"OONA",               sheetMet:"Sheet1",                              lossRef:"Slip No./DLA No.",       outstanding:"Netto / Due To Us / (You)",        dateOfLoss:"D.O.L",               status:"READY"      },
  { col:"CG", cedant:"RAMAVANA",           sheetMet:"TAC-REVIEW, CC-REVIEW, XCL-REVIEW",  lossRef:"NO. DLA",                outstanding:"IDR",                              dateOfLoss:"D.O.L",               status:"READY"      },
  { col:"CH", cedant:"SAMSUNG TUGU",       sheetMet:"PASIF TAC OUT",                       lossRef:"PANCOS NO",              outstanding:"OAC AMT",                          dateOfLoss:"(Tidak tersedia)",    status:"READY"      },
  { col:"CI", cedant:"SAMSUNG TUGU",       sheetMet:"CLAIM",                               lossRef:"CLAIM NO",               outstanding:"OAC AMT",                          dateOfLoss:"(Tidak tersedia)",    status:"READY"      },
  { col:"CJ", cedant:"SINAR MAS",          sheetMet:"Sheet1",                              lossRef:"No. Invoice",            outstanding:"Due To ASM",                       dateOfLoss:"dol",                 status:"READY"      },
  { col:"CK", cedant:"SOMPO",              sheetMet:"FAC OUT",                             lossRef:"OUR DEBT/CREDIT NO.",    outstanding:"OUTSTANDING",                      dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"CL", cedant:"SOMPO",              sheetMet:"CLAIM",                               lossRef:"OUR DEBIT/CREDIT NO",    outstanding:"OUTSTANDING",                      dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"CM", cedant:"SOMPO",              sheetMet:"CLAIM – AEGS",                        lossRef:"Cross Reference",        outstanding:"Outstanding",                      dateOfLoss:"Loss Date",           status:"READY"      },
  { col:"CN", cedant:"SOMPO",              sheetMet:"OS, D/I",                             lossRef:"Ref No",                 outstanding:"Outstanding Current",              dateOfLoss:"(Tidak tersedia)",    status:"READY"      },
  { col:"CO", cedant:"TOKIO MARINE",       sheetMet:"DacOutClaim",                         lossRef:"CLAIM NO",               outstanding:"CLAIM PAID",                       dateOfLoss:"DATE OF LOSS",        status:"READY"      },
  { col:"CP", cedant:"TPI",                sheetMet:"OS Claim Produksi Agustus 2026",      lossRef:"Claim Number",           outstanding:"Amount",                           dateOfLoss:"(Tidak tersedia)",    status:"READY"      },
  { col:"CQ", cedant:"TRINITY RE (Broker)",sheetMet:"All Cedant",                          lossRef:"Trinity Claim Reff",     outstanding:"Net Loss",                         dateOfLoss:"DOL",                 status:"READY"      },
  { col:"CR", cedant:"TRIPA",              sheetMet:"R/U",                                 lossRef:"DocNo",                  outstanding:"SALDO",                            dateOfLoss:"DOL",                 status:"READY"      },
  { col:"CS", cedant:"UMUM MEGA",          sheetMet:"DATA",                                lossRef:"REFNO",                  outstanding:"OS",                               dateOfLoss:"LOSSDATE",            status:"READY"      },
  { col:"CT", cedant:"VIDEI",              sheetMet:"Sheet1",                              lossRef:"No. DLA",                outstanding:"TOTAL KLAIM",                      dateOfLoss:"DOL",                 status:"READY"      },
];

const PROFILES_INFOPACK = [
  { col:"B",  cedant:"ABB",            sheetMet:"Sheet1",      lossRef:"AL_Index",    outstanding:"klaim",           dateOfLoss:"tg_kejadian",  status:"READY" },
  { col:"C",  cedant:"ACA",            sheetMet:"Infopack",    lossRef:"RefNo",       outstanding:"Amount_Net_OS",   dateOfLoss:"DOL",          status:"READY" },
  { col:"D",  cedant:"ADHI RE",        sheetMet:"Sheet1",      lossRef:"CLAIM NO",    outstanding:"TOTAL AMOUNT",    dateOfLoss:"DATE OF LOSS", status:"READY" },
];

/* ─── ACA column detail (dari file Excel O88RI00002) ─────── */
const ACA_SHEET_COLUMNS = {
  "KlaimFak": [
    "Date","DocNo","RefNo","Voucher_No","Branch","COB","Description","vType",
    "Inception_Date","Expiry_Date","Name_TTG","Due_Date","Over_Due","Currency",
    "Original_Amount","Paid_Amount","Amount_Net_OS","Wait Approval","DOL",
    "AcceptedDate","AcceptedBy","AcceptedRefNo","AcceptedStatus","AcceptedRemarks",
    "Fac Code","PLA No","DLA No",
  ],
  "KlaimAF": [
    "Date","DocNo","RefNo","Voucher_No","Branch","COB","Description","vType",
    "Inception_Date","Expiry_Date","Name_TTG","Due_Date","Over_Due","Currency",
    "Amount_Net_OS","Wait Approval","DOL","AcceptedDate","AcceptedBy",
    "AcceptedRefNo","AcceptedStatus","AcceptedRemarks",
  ],
  "CashCalls": [
    "Date","DocNo","RefNo","Voucher_No","Branch","COB","Description","vType",
    "Inception_Date","Expiry_Date","Name_TTG","Due_Date","Over_Due","Currency",
    "Amount_Net_OS","Wait Approval","DOL","AcceptedDate","AcceptedBy",
    "AcceptedRefNo","AcceptedStatus",
  ],
};

/* ─── colour helpers ─────────────────────────────────────── */
const BROKER_COLOR = "text-teal-700 font-semibold";
const CEDANT_COLOR = "font-semibold text-gray-800";

function isBroker(name) { return name.toLowerCase().includes("broker"); }

/* ─── legend badge ───────────────────────────────────────── */
function LegendBadge({ color, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
      <span className={`inline-block w-2 h-2 rounded-sm ${color.includes("orange") ? "bg-orange-400" : color.includes("purple") ? "bg-purple-400" : "bg-blue-400"}`} />
      {label}
    </span>
  );
}

/* ─── main page ──────────────────────────────────────────── */
export default function MappingRulesPage() {
  const [activeTab, setActiveTab] = useState("os");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [refTab,    setRefTab]    = useState("Sheet1 (OS valid)");

  const profiles = activeTab === "os" ? PROFILES_OS : PROFILES_INFOPACK;

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase();
    return !q
      || p.cedant.toLowerCase().includes(q)
      || p.sheetMet.toLowerCase().includes(q)
      || p.lossRef.toLowerCase().includes(q)
      || p.outstanding.toLowerCase().includes(q)
      || p.col.toLowerCase().includes(q);
  });

  const readyCount = profiles.filter(p => p.status === "READY").length;

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => setLoading(false), 800);
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">

      {/* ── Sticky header ── */}
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <AdjustmentsHorizontalIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-800">Mapping Rules</h1>
          <p className="text-xs text-gray-400">Profil pemetaan kolom per cedant — read only</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          ↺ Reload Mapping
        </button>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5 max-w-6xl w-full">

        {/* ── Tabs ── */}
        <div className="flex gap-0 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {[["os","OS Claim Cedant"],["infopack","InfoPack"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setSearch(""); }}
              className={[
                "px-5 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeTab === key
                  ? "bg-white shadow text-teal-700 font-semibold border border-gray-200"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Section title ── */}
        <div>
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-0.5">REFERENCE INTELLIGENCE</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-gray-800">
                Mapping Rules — {activeTab === "os" ? "OS Claim Cedant" : "InfoPack"}
              </h2>
              <p className="text-xs text-gray-400 mt-1 max-w-xl">
                Mapping dibaca langsung dari Google Sheets referensi. Satu kolom Cedant = satu profil format. Tidak ada perubahan pada sheet mapping.
              </p>
            </div>
          </div>
        </div>

        {/* ── Info card: spreadsheet URL + reference tab ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Mapping spreadsheet</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href="#"
              className="text-xs text-teal-600 hover:underline font-mono break-all"
              onClick={e => e.preventDefault()}
            >
              1ls-2mLFGkdHFc_1IVtWG70YFJk-pt-1u-k9cy3.VmH/
            </a>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">Reference tab</span>
              <div className="relative">
                <select
                  value={refTab}
                  onChange={e => setRefTab(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none cursor-pointer"
                >
                  <option>Sheet1 (OS valid)</option>
                  <option>Sheet2 (InfoPack)</option>
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▼</span>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 pt-1 border-t border-gray-50 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs text-orange-600">
              <TagIcon className="h-3.5 w-3.5" /> Loss / Loss Ref
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-purple-600">
              <CurrencyDollarIcon className="h-3.5 w-3.5" /> Outama / Outstanding
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
              <CalendarIcon className="h-3.5 w-3.5" /> Lipas / Date of Loss
            </span>
          </div>

          {/* Sheet number note */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-start gap-2 text-xs text-gray-500">
            <InformationCircleIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong className="text-gray-700">Sheet number dideteksi:</strong>{" "}
              MATCHED: hanya bila ketiga header yang dikenali sama terdapat dalam satu baris header. Program mencari baris header di OS baris pertama setiap sheet. Nama sheet pada mapping digunakan sebagai penunjuk, bukan pembatas.
            </span>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2.5 flex items-center gap-3">
          <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari cedant, sheet, kolom, loss ref, outstanding…"
            className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
          )}
          <span className="text-xs text-gray-400 flex-shrink-0">
            {filtered.length} / {profiles.length}
          </span>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide w-10">Column</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Cedant</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Sheet Met</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-orange-500 uppercase tracking-wide">
                    <span className="inline-flex items-center gap-1"><TagIcon className="h-3 w-3" /> Loss Ref</span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-purple-500 uppercase tracking-wide">
                    <span className="inline-flex items-center gap-1"><CurrencyDollarIcon className="h-3 w-3" /> Outstanding</span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-blue-500 uppercase tracking-wide">
                    <span className="inline-flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Date of Loss</span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      Tidak ada profil yang cocok dengan pencarian.
                    </td>
                  </tr>
                )}
                {filtered.map((p, i) => (
                  <tr key={i} className="hover:bg-teal-50/30 transition-colors">
                    {/* Column */}
                    <td className="px-3 py-1.5">
                      <span className="font-mono font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded text-[11px]">
                        {p.col}
                      </span>
                    </td>
                    {/* Cedant */}
                    <td className={`px-3 py-1.5 whitespace-nowrap ${isBroker(p.cedant) ? BROKER_COLOR : CEDANT_COLOR}`}>
                      {p.cedant}
                    </td>
                    {/* Sheet Met */}
                    <td className="px-3 py-1.5 text-gray-500 max-w-[200px]">
                      <span className="truncate block" title={p.sheetMet}>{p.sheetMet}</span>
                    </td>
                    {/* Loss Ref */}
                    <td className="px-3 py-1.5 whitespace-nowrap text-gray-700 font-medium">
                      {p.lossRef}
                    </td>
                    {/* Outstanding */}
                    <td className="px-3 py-1.5 text-gray-700">
                      <span className="truncate block max-w-[180px]" title={p.outstanding}>{p.outstanding}</span>
                    </td>
                    {/* Date of Loss */}
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                      {p.dateOfLoss}
                    </td>
                    {/* Status */}
                    <td className="px-3 py-1.5">
                      {p.status === "READY" ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">
                          <CheckCircleIcon className="h-2.5 w-2.5" />READY
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded">
                          <ExclamationTriangleIcon className="h-2.5 w-2.5" />INCOMPLETE
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Menampilkan <strong className="text-gray-600">{filtered.length}</strong> dari <strong className="text-gray-600">{profiles.length}</strong> profil ·{" "}
              <span className="text-emerald-600 font-semibold">{readyCount} READY</span>
            </span>
            <span className="text-xs text-gray-400">Reference mapping: read only · Google Sheets</span>
          </div>
        </div>

      </div>
    </div>
  );
}
