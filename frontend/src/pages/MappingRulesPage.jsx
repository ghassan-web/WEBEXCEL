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
  { col:"KABMN-NONPROP", cedant:"KABMN (Non-Proportional)", sheetMet:"List of Large Losses",  lossRef:"Insured Name",            outstanding:"Net Claim Amount",                 dateOfLoss:"D.O.L",               status:"READY"      },
  { col:"KBINS-NONPROP", cedant:"KB INS (Non-Proportional)", sheetMet:"2.11",             lossRef:"Claim No",               outstanding:"Sum of XOL",                       dateOfLoss:"Date Of Loss",        status:"READY"      },
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
  { col:"B",  cedant:"ABB",           sheetMet:"Sheet1",   lossRef:"AL_Index",    outstanding:"klaim",              dateOfLoss:"tg_kejadian",      fields:["proportional","non proportional"], status:"READY" },
  { col:"ADB-NONPROP",       cedant:"ADB (Non-Proportional)",       sheetMet:"List of OS claim", lossRef:"CLAIM NO.", outstanding:"XOL", dateOfLoss:"DOL", fields:["non proportional"], status:"READY" },
  { col:"ADB-TRAVEL-NONPROP", cedant:"ADB Travel (Non-Proportional)", sheetMet:"List of OS claim", lossRef:"CLAIM NO.", outstanding:"XOL", dateOfLoss:"DOL", fields:["non proportional"], status:"READY" },
  { col:"C",  cedant:"ACA",           sheetMet:"Infopack", lossRef:"RefNo",       outstanding:"Amount_Net_OS",      dateOfLoss:"DOL",              fields:["proportional","non proportional"], status:"READY" },
  { col:"D",  cedant:"ADHI RE",       sheetMet:"Sheet1",   lossRef:"CLAIM NO",    outstanding:"TOTAL AMOUNT",       dateOfLoss:"DATE OF LOSS",     fields:["proportional","non proportional"], status:"READY" },
  { col:"E",  cedant:"AGGI",          sheetMet:"Sheet1",   lossRef:"CLAIM NO",    outstanding:"DUE TO INSUL / US",  dateOfLoss:"DATE OF LOSS",     fields:["proportional","non proportional"], status:"READY" },
  { col:"F",  cedant:"AON (Broker)",  sheetMet:"Sheet1",   lossRef:"Contract Code", outstanding:"Orig Currency Amt", dateOfLoss:"Trans Desc/DOL",  fields:["proportional","non proportional"], status:"READY" },
  { col:"G",  cedant:"ASIB",          sheetMet:"Sheet1",   lossRef:"No. DLA / Ribu / Nota", outstanding:"OS Original Currency", dateOfLoss:"Tgl. DOL", fields:["proportional","non proportional"], status:"READY" },
  { col:"H",  cedant:"ASKRINDO",      sheetMet:"Sheet1",   lossRef:"DLA/FLA",     outstanding:"Hutang sd 2024",     dateOfLoss:"DOL",              fields:["proportional","non proportional"], status:"READY" },
  { col:"I",  cedant:"ASTRARAHANA",   sheetMet:"Sheet1",   lossRef:"ClaimNo",     outstanding:"AllAmount",          dateOfLoss:"DOCL",             fields:["proportional","non proportional"], status:"READY" },
  { col:"J",  cedant:"AVRIST",        sheetMet:"Sheet1",   lossRef:"CLAIM NUMBER", outstanding:"OUTSTANDING",       dateOfLoss:"DATE OF LOSS",     fields:["proportional","non proportional"], status:"READY" },
  { col:"K",  cedant:"AXA",           sheetMet:"Sheet1",   lossRef:"Ref No.",     outstanding:"Sum of Outstanding", dateOfLoss:"(Tidak tersedia)", fields:["proportional","non proportional"], status:"READY" },
  { col:"L",  cedant:"BCA INSURANCE", sheetMet:"Sheet1",   lossRef:"Reference No.", outstanding:"Outstanding Amount", dateOfLoss:"Date of Loss",   fields:["proportional","non proportional"], status:"READY" },
  { col:"M",  cedant:"BINTANG",       sheetMet:"Sheet1",   lossRef:"Claim Number", outstanding:"R/I Share Amount", dateOfLoss:"DOL",              fields:["proportional","non proportional"], status:"READY" },
  { col:"N",  cedant:"BRINS",         sheetMet:"Sheet1",   lossRef:"domino",      outstanding:"Nihilpng",           dateOfLoss:"(Tidak tersedia)", fields:["proportional","non proportional"], status:"READY" },
  { col:"O",  cedant:"CHINA TAIPING", sheetMet:"Sheet1",   lossRef:"Claim No.",   outstanding:"Reinsurer Origin Share", dateOfLoss:"(Tidak tersedia)", fields:["proportional","non proportional"], status:"READY" },
  { col:"P",  cedant:"ETIGA",         sheetMet:"RENDO",    lossRef:"Reference No.", outstanding:"Net O/S",          dateOfLoss:"Loss Date",        fields:["proportional","non proportional"], status:"READY" },
  { col:"Q",  cedant:"FPG",           sheetMet:"Sheet1",   lossRef:"Document No.", outstanding:"Amount Net O/S FPG", dateOfLoss:"Date of Loss",   fields:["proportional","non proportional"], status:"READY" },
  { col:"R",  cedant:"GEGI",          sheetMet:"Outstanding", lossRef:"CLAIM NO", outstanding:"NET_AMT",            dateOfLoss:"DOL",              fields:["proportional","non proportional"], status:"READY" },
  { col:"S",  cedant:"HARTA AMAN",    sheetMet:"DETAILS",  lossRef:"Reference No.", outstanding:"Outstanding Original Currency", dateOfLoss:"DOL", fields:["proportional","non proportional"], status:"READY" },
  { col:"T",  cedant:"JASA RAHARJA",  sheetMet:"Sheet1",   lossRef:"REF NO",      outstanding:"AMOUNT NET O/S",     dateOfLoss:"DATE OF LOSS",     fields:["proportional","non proportional"], status:"READY" },
  { col:"U",  cedant:"JASINDO",       sheetMet:"Sheet1",   lossRef:"Reference",   outstanding:"Saldo Akhir Tagih",  dateOfLoss:"Date of Loss",     fields:["proportional","non proportional"], status:"READY" },
  { col:"JASTAN",           cedant:"JASTAN",                    sheetMet:"1.3 List OS Losses", lossRef:"Claim No",          outstanding:"Gross Incurred Est*)", dateOfLoss:"Date of Loss",     fields:["proportional"],     status:"READY" },
  { col:"JASTAN-NP",        cedant:"JASTAN (Non-Proportional)", sheetMet:"Exhibit 4.1",        lossRef:"Insured",           outstanding:"Losses to the XL",    dateOfLoss:"Date of Loss",     fields:["non proportional"], status:"READY" },
  // v.01
  { col:"JASTAN-NP-LL",     cedant:"JASTAN (Non-Proportional)", sheetMet:"Large Losses",       lossRef:"Name of Insured",   outstanding:"Net Retained",        dateOfLoss:"Date of Loss",     fields:["non proportional"], status:"READY" },
  { col:"JASTAN-NP-EQ",     cedant:"JASTAN (Non-Proportional)", sheetMet:"Cat Losses - EQ",    lossRef:"CLAIM REF. NO.",    outstanding:"OUTSTANDING LOSS",    dateOfLoss:"(Tidak tersedia)", fields:["non proportional"], status:"READY" },
  { col:"JASTAN-NP-FL",     cedant:"JASTAN (Non-Proportional)", sheetMet:"Cat Losses - FL",    lossRef:"CLAIM REF. NO.",    outstanding:"OUTSTANDING LOSS",    dateOfLoss:"(Tidak tersedia)", fields:["non proportional"], status:"READY" },
  { col:"JASTAN-NP-RSMD",   cedant:"JASTAN (Non-Proportional)", sheetMet:"Cat Losses - RSMD",  lossRef:"CLAIM REF. NO.",    outstanding:"OUTSTANDING LOSS",    dateOfLoss:"(Tidak tersedia)", fields:["non proportional"], status:"READY" },
  // v.02
  { col:"JASTAN-NP-LL-V2",  cedant:"JASTAN (Non-Proportional)", sheetMet:"Large Losses",       lossRef:"Name of Insured",   outstanding:"Net Retained",        dateOfLoss:"Date of Loss",     fields:["non proportional"], status:"READY" },
  { col:"JASTAN-NP-EQ-V2",  cedant:"JASTAN (Non-Proportional)", sheetMet:"Cat Losses - EQ",    lossRef:"CLAIM REF. NO.",    outstanding:"OUTSTANDING LOSS",    dateOfLoss:"DATE OF LOSS",     fields:["non proportional"], status:"READY" },
  { col:"JASTAN-NP-FL-V2",  cedant:"JASTAN (Non-Proportional)", sheetMet:"Cat Losses - FL",    lossRef:"CLAIM REF. NO.",    outstanding:"OUTSTANDING LOSS",    dateOfLoss:"DATE OF LOSS",     fields:["non proportional"], status:"READY" },
  { col:"JASTAN-NP-RSMD-V2",cedant:"JASTAN (Non-Proportional)", sheetMet:"Cat Losses - RSMD",  lossRef:"CLAIM REF. NO.",    outstanding:"OUTSTANDING LOSS",    dateOfLoss:"DATE OF LOSS",     fields:["non proportional"], status:"READY" },
  { col:"KABMN-NONPROP", cedant:"KABMN (Non-Proportional)", sheetMet:"List of Large Losses",  lossRef:"Insured Name",      outstanding:"Net Claim Amount",            dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"KARK-PROP",    cedant:"KARK (Proportional)",       sheetMet:"List Realisasi",     lossRef:"Insured",           outstanding:"Claim OS",            dateOfLoss:"(Tidak tersedia)",   fields:["proportional"],     status:"READY" },
  { col:"KARK-NONPROP", cedant:"KARK (Non-Proportional)",  sheetMet:"5.1",                lossRef:"Insured Name",      outstanding:"CLAIM HIT TO THE LAYER", dateOfLoss:"Loss Date",        fields:["non proportional"], status:"READY" },
  { col:"KBINS-PROP",  cedant:"KB INS (Proportional)",    sheetMet:"2.11",               lossRef:"Claim No",          outstanding:"Sum of ANR",          dateOfLoss:"Date Of Loss",     fields:["proportional"],     status:"READY" },
  { col:"KBINS-NONPROP", cedant:"KB INS (Non-Proportional)", sheetMet:"2.11",             lossRef:"Claim No",          outstanding:"Sum of XOL",          dateOfLoss:"Date Of Loss",     fields:["non proportional"], status:"READY" },
  { col:"LIPPO-PROP",     cedant:"LIPPO (Proportional)",     sheetMet:"Exhibit 5.1",  lossRef:"Claim No",       outstanding:"Claim O/S",        dateOfLoss:"Loss Date",           fields:["proportional"],     status:"READY" },
  { col:"LIPPO-PROP-CAT", cedant:"LIPPO (Proportional)",     sheetMet:"Exhibit 5.2",  lossRef:"Event Name",     outstanding:"Claim O/S",        dateOfLoss:"(Tidak tersedia)",    fields:["proportional"],     status:"READY" },
  { col:"LIPPO-NONPROP-LL",  cedant:"LIPPO (Non-Proportional)", sheetMet:"Exhibit 5.1",  lossRef:"Insured Name",   outstanding:"Losses to the XL", dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"LIPPO-NONPROP-CAT", cedant:"LIPPO (Non-Proportional)", sheetMet:"Exhibit 5.2",  lossRef:"Event Name",     outstanding:"Losses to the XL", dateOfLoss:"(Tidak tersedia)",    fields:["non proportional"], status:"READY" },
  { col:"MAIPARK-NONPROP", cedant:"MAIPARK (Non-Proportional)", sheetMet:"Exhibit 4.1", lossRef:"Event",          outstanding:"Outstanding",      dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"MAXIMUS-PROP",    cedant:"MAXIMUS (Proportional)",              sheetMet:"2.10",        lossRef:"LOSS NO.",       outstanding:"QUOTA SHARE",      dateOfLoss:"D O L",               fields:["proportional"],     status:"READY" },
  { col:"MAXIMUS-NONPROP", cedant:"MAXIMUS (Non-Proportional)",          sheetMet:"2.10",        lossRef:"LOSS NO.",       outstanding:"XOL",              dateOfLoss:"D O L",               fields:["non proportional"], status:"READY" },
  { col:"MAXIMUS-SURETY-PROP", cedant:"MAXIMUS (Surety Bond Proportional)", sheetMet:"OS Loses", lossRef:"LOSS NO.",       outstanding:"QS",               dateOfLoss:"D O L",               fields:["proportional"],     status:"READY" },
  { col:"MKI-MV-PA-PROP", cedant:"MERITZ KORINDO (Proportional - MV & PA)", sheetMet:"List of Individual Losses 5 Yrs", lossRef:"Claim No.", outstanding:"Amt IDR",          dateOfLoss:"Date of Loss",        fields:["proportional"],     status:"READY" },
  { col:"MKI-NONPROP",    cedant:"MKI (Non-Proportional)",                  sheetMet:"Larger Loss",                    lossRef:"Claim No.", outstanding:"Outstanding Claim Amount MKI Share", dateOfLoss:"Date of Loss", fields:["non proportional"], status:"READY" },
  { col:"X",  cedant:"MAG",           sheetMet:"Sheet1",   lossRef:"REFNO",       outstanding:"AMOUNT NET O/S",     dateOfLoss:"DATE OF LOSS",     fields:["proportional","non proportional"], status:"READY" },
  { col:"Y",  cedant:"MNC",           sheetMet:"Sheet1",   lossRef:"CLAIM NO",    outstanding:"RI_PAID (ORI)",      dateOfLoss:"LOSS DATE",        fields:["proportional","non proportional"], status:"READY" },
  { col:"Z",  cedant:"MPM",           sheetMet:"Sheet1",   lossRef:"Name Ref No.", outstanding:"OS Obj – Curr",    dateOfLoss:"Date of Loss",     fields:["proportional","non proportional"], status:"READY" },
  { col:"AA", cedant:"OONA",          sheetMet:"Sheet1",   lossRef:"Slip No./DLA No.", outstanding:"Netto / Due To Us / (You)", dateOfLoss:"D.O.L", fields:["proportional","non proportional"], status:"READY" },
  { col:"AB", cedant:"RAMAYANA",      sheetMet:"Sheet1",   lossRef:"NO. DLA",     outstanding:"IDR",                dateOfLoss:"D.O.L",            fields:["proportional","non proportional"], status:"READY" },
  { col:"AC", cedant:"SAMSUNG TUGU",  sheetMet:"Sheet1",   lossRef:"INVOICE NO",  outstanding:"OAC AMT",            dateOfLoss:"(Tidak tersedia)", fields:["proportional","non proportional"], status:"READY" },
  { col:"AD", cedant:"SINAR MAS",     sheetMet:"Sheet1",   lossRef:"No. Invoice", outstanding:"Due To ASM",         dateOfLoss:"dol",              fields:["proportional","non proportional"], status:"READY" },
  { col:"AE", cedant:"SOMPO",         sheetMet:"Sheet1",   lossRef:"OUR DEBT/CREDIT NO.", outstanding:"OUTSTANDING", dateOfLoss:"DATE OF LOSS",   fields:["proportional","non proportional"], status:"READY" },
  { col:"AF", cedant:"TOKIO MARINE",  sheetMet:"Sheet1",   lossRef:"CLAIM NO.",   outstanding:"CLAIM PAID",         dateOfLoss:"DATE OF LOSS",     fields:["proportional","non proportional"], status:"READY" },
  { col:"AG", cedant:"TPI",           sheetMet:"Sheet1",   lossRef:"Claim Number", outstanding:"Amount",            dateOfLoss:"(Tidak tersedia)", fields:["proportional","non proportional"], status:"READY" },
  { col:"AH", cedant:"UMUM MEGA",     sheetMet:"Sheet1",   lossRef:"REFNO",       outstanding:"OS",                 dateOfLoss:"LOSSDATE",         fields:["proportional","non proportional"], status:"READY" },
  { col:"AI", cedant:"VIDEI",         sheetMet:"Sheet1",   lossRef:"No. DLA",     outstanding:"TOTAL KLAIM",        dateOfLoss:"DOL",              fields:["proportional","non proportional"], status:"READY" },

  // ── Tambahan dari Rekap Infopack 2026 ─────────────────────────────────
  { col:"ABDA-PROP",         cedant:"ABDA (Proportional)",              sheetMet:"Sheet1",                    lossRef:"PLA",             outstanding:"AMOUNT 100% CLAIMS",  dateOfLoss:"D.O.L",               fields:["proportional"],              status:"READY" },
  { col:"ARTARINDO-PROP",    cedant:"ARTARINDO (Proportional)",         sheetMet:"Exhibit 3.1-3.4",           lossRef:"Claim No",        outstanding:"CLAIM AMOUNT/ARTARINDO SHARE", dateOfLoss:"Date Of Loss",   fields:["proportional"],              status:"READY" },
  { col:"ASEI-PROP",         cedant:"ASEI (Proportional)",              sheetMet:"OS Loss",                   lossRef:"Claim No.",       outstanding:"Loss in IDR",         dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"ASEI-PROP-LL",      cedant:"ASEI (Proportional)",              sheetMet:"List Of Big Loss",          lossRef:"Claim No.",       outstanding:"Loss in IDR",         dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"ASM-PROP",          cedant:"ASM (Proportional)",               sheetMet:"8.1-8.12",                  lossRef:"CLAIM NO.",       outstanding:"ASM GROSS (100%)",    dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"ASTRA-PROP",        cedant:"ASTRA (Proportional)",             sheetMet:"2.1",                       lossRef:"Claim No.",       outstanding:"CLAIM 100% - TOTAL GROSS", dateOfLoss:"DOL",             fields:["proportional"],              status:"READY" },
  { col:"ASWATA-ENGHULL-PROP",cedant:"ASWATA (Proportional)",          sheetMet:"Exhibit 3.1-3.2",           lossRef:"Claim No.",       outstanding:"WT SHARE - TOTAL GROSS", dateOfLoss:"DOL",               fields:["proportional"],              status:"READY" },
  { col:"ASWATA-FIRE-PROP",  cedant:"ASWATA (Proportional)",            sheetMet:"2.3-2.7",                   lossRef:"Claim No.",       outstanding:"WT SHARE - TOTAL GROSS", dateOfLoss:"DOL",               fields:["proportional"],              status:"READY" },
  { col:"AUS-PROP",          cedant:"AUS (Proportional)",               sheetMet:"Exhibit 4.1-4.4",           lossRef:"Claim No.",       outstanding:"AUS Share",           dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"AVRIST-PROP-LL",    cedant:"AVRIST (Proportional)",            sheetMet:"07 Large Losses",           lossRef:"Claim No.",       outstanding:"Incurred",            dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"BGU-PROP",          cedant:"BGU (Proportional)",               sheetMet:"4.1-4.8",                   lossRef:"Reference No.",   outstanding:"Outstanding Amount",  dateOfLoss:"Date of Loss",        fields:["proportional"],              status:"READY" },
  { col:"BGU-PROP-LL",       cedant:"BGU (Proportional)",               sheetMet:"7. LARGE LOSSES",           lossRef:"Reference No.",   outstanding:"Outstanding Amount",  dateOfLoss:"Date of Loss",        fields:["proportional"],              status:"READY" },
  { col:"SAMTUG-PROP",       cedant:"SAMSUNG TUGU (Proportional)",      sheetMet:"Samsung Tugu WA SPL 2026",  lossRef:"Claim No.",       outstanding:"OAC AMT",             dateOfLoss:"(Tidak tersedia)",    fields:["proportional"],              status:"READY" },
  { col:"SAHABAT-PROP",      cedant:"SAHABAT (Proportional)",           sheetMet:"List Large Loss - Q3 2025", lossRef:"Claim No.",       outstanding:"INCURRED LOSS",       dateOfLoss:"Date of Loss",        fields:["proportional"],              status:"READY" },
  { col:"ZURICH-PROP",       cedant:"ZURICH (Proportional)",            sheetMet:"Datapack ZAI",              lossRef:"Claim No",        outstanding:"INCURRED",            dateOfLoss:"Date of Loss",        fields:["proportional"],              status:"READY" },
  { col:"TRIPA-PROP",        cedant:"TRIPA (Proportional)",             sheetMet:"9.1-9.5",                   lossRef:"THE INSURED",     outstanding:"QUOTA SHARE",         dateOfLoss:"D.O.L.",              fields:["proportional"],              status:"READY" },
  { col:"VICTORIA-PROP",     cedant:"VICTORIA (Proportional)",          sheetMet:"D.4",                       lossRef:"INSURED NAME",    outstanding:"(Tidak tersedia)",    dateOfLoss:"Date of Loss",        fields:["proportional"],              status:"READY" },
  { col:"TOB-PROP",          cedant:"TOB (Proportional)",               sheetMet:"Exhibit 4-1",               lossRef:"Description",     outstanding:"Settled, O/S, Incurred", dateOfLoss:"DOL",              fields:["proportional"],              status:"READY" },
  { col:"SUMITOTO-PROP",     cedant:"SUMIT OTO (Proportional)",         sheetMet:"Exhibit 3-1",               lossRef:"Insured Name",    outstanding:"QS",                  dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"STACO-PROP",        cedant:"STACO (Proportional)",             sheetMet:"Exhibit 5-1",               lossRef:"Insured Name",    outstanding:"Quota Share",         dateOfLoss:"Date of Loss",        fields:["proportional"],              status:"READY" },
  { col:"STACO-PROP-CAT",    cedant:"STACO (Proportional)",             sheetMet:"Exhibit 5-2",               lossRef:"Event Name",      outstanding:"Quota Share",         dateOfLoss:"(Tidak tersedia)",    fields:["proportional"],              status:"READY" },
  { col:"SOMPO-INFOPACK",    cedant:"SOMPO (Proportional)",             sheetMet:"Major Cat Loss Report",     lossRef:"CLIENT NAME",     outstanding:"INCURRED CLM",        dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"BINTANG-INFOPACK",  cedant:"BINTANG (Proportional)",           sheetMet:"5.1-5.5 / 7.1-7.5",        lossRef:"Insured Name",    outstanding:"Sum Insured Bintang", dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"BOSOWA-PROP",       cedant:"BOSOWA (Proportional)",            sheetMet:"OS-SB / OS-CI / FR",        lossRef:"INSURED NAME",    outstanding:"BOSOWA SHARE – AMOUNT", dateOfLoss:"DOL",               fields:["proportional"],              status:"READY" },
  { col:"BRINS-PROP",        cedant:"BRINS (Proportional)",             sheetMet:"FR / MV / MC / MH / EG / SB / CI / GA-PA / MI / HE", lossRef:"INSURED NAME", outstanding:"Sum of Gross", dateOfLoss:"DOL", fields:["proportional"],              status:"READY" },
  { col:"BUANAIND-PROP",     cedant:"BUANA IND (Proportional)",         sheetMet:"2021-2024",                 lossRef:"INSURED",         outstanding:"GROSS CLAIM",         dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"BUMIDA-PROP",       cedant:"BUMIDA (Proportional)",            sheetMet:"GROSS INCURED EST*)",       lossRef:"INSURED",         outstanding:"GROSS INCURED EST*)",  dateOfLoss:"DOL",                fields:["proportional"],              status:"READY" },
  { col:"CAKRAWALA-PROP",    cedant:"CAKRAWALA (Proportional)",         sheetMet:"List Claim",                lossRef:"Name Of Insured", outstanding:"CLAIM AMOUNT",        dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"CANDIUTA-PROP",     cedant:"CANDIUTA (Proportional)",          sheetMet:"List of OS Losses",         lossRef:"INSURED",         outstanding:"GROSS CLAIM",         dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"CTII-PROP",         cedant:"CHINA TAIPING (Treaty)",           sheetMet:"Exhibit 5.2-5.4",           lossRef:"Claim No.",       outstanding:"Reinsurer Origin Share", dateOfLoss:"DATE OF LOSS",     fields:["proportional"],              status:"READY" },
  { col:"DAYIN-PROP",        cedant:"DAYIN (Proportional)",             sheetMet:"List Claim",                lossRef:"INSURED",         outstanding:"GROSS CLAIM",         dateOfLoss:"Loss Date",           fields:["proportional"],              status:"READY" },
  { col:"ETIQA-PROP",        cedant:"ETIQA (Proportional)",             sheetMet:"List of Losses",            lossRef:"Policy Name",     outstanding:"Etiqa Share",         dateOfLoss:"Date of Loss",        fields:["proportional"],              status:"READY" },
  { col:"EXIMBANK-PROP",     cedant:"EXIMBANK (Proportional)",          sheetMet:"List Claim",                lossRef:"ApplicantName",   outstanding:"Total Claim (share IEB)", dateOfLoss:"Claim Due Date",  fields:["proportional"],              status:"READY" },
  { col:"FPG-INFOPACK",      cedant:"FPG (Proportional)",               sheetMet:"List of Claims QS / SPL",   lossRef:"Insured",         outstanding:"QUOTASHARE → TOTAL",  dateOfLoss:"DATE OF LOSS",        fields:["proportional"],              status:"READY" },
  { col:"GEGII-PROP",        cedant:"GEGII (Proportional)",             sheetMet:"Fire - Large Loss / Eng / GA / Marine", lossRef:"The Insured", outstanding:"Gross Claim Amount (100%)", dateOfLoss:"Date of Loss", fields:["proportional"],           status:"READY" },
  { col:"HARTA-INFOPACK",    cedant:"HARTA (Proportional)",             sheetMet:"2.1-2.3",                   lossRef:"INSURED NAME",    outstanding:"OURSHARE INCURRED",   dateOfLoss:"DATE OF LOSS",        fields:["proportional"],              status:"READY" },
  { col:"INTRA-PROP",        cedant:"INTRA (Proportional)",             sheetMet:"05 OS Loss Fire / Eng / SB", lossRef:"INSURED",        outstanding:"CLAIM ESTIMATE",      dateOfLoss:"LOSS DATE",           fields:["proportional"],              status:"READY" },
  { col:"JASINDO-INFOPACK",  cedant:"JASINDO (Proportional)",           sheetMet:"IV.1-IV.4",                 lossRef:"Insured",         outstanding:"JASA SHARE",          dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"JRP-PROP",          cedant:"JRP (Proportional)",               sheetMet:"2021-2024",                 lossRef:"AName",           outstanding:"GROSS_CLAIM / GROSS_NET", dateOfLoss:"LossDate",         fields:["proportional"],              status:"READY" },
  { col:"MNC-INFOPACK",      cedant:"MNC (Proportional)",               sheetMet:"EVENT LOSSES - All Treaty", lossRef:"INSURED_NAME",    outstanding:"INCURRED QUOTASHARE CLAIM", dateOfLoss:"LOSS_DATE",      fields:["proportional"],              status:"READY" },
  { col:"PLN-PROP",          cedant:"PLN (Proportional)",               sheetMet:"GROSS CLAIM",               lossRef:"NAMA TERTANGGUNG", outstanding:"GROSS CLAIM",        dateOfLoss:"LOSSDATE",            fields:["proportional"],              status:"READY" },
  { col:"RAKSA-PROP",        cedant:"RAKSA (Proportional)",             sheetMet:"Fire - Large Loss / Cat",   lossRef:"Insured Name",    outstanding:"RAKSA'S SHARE",       dateOfLoss:"Loss Date",           fields:["proportional"],              status:"READY" },
  { col:"RAMAYANA-INFOPACK", cedant:"RAMAYANA (Proportional)",          sheetMet:"10. Data BigLoss / 9. Outstanding Claim", lossRef:"INSURED", outstanding:"CLAIM RMY SHARE", dateOfLoss:"DOL",                fields:["proportional"],              status:"READY" },
  { col:"MSIG-PROP",         cedant:"MSIG (Proportional)",              sheetMet:"MSIG.xlsx",                 lossRef:"Client Name",     outstanding:"Paid / OS / Total (QS)", dateOfLoss:"D.O.L",             fields:["proportional"],              status:"READY" },
  { col:"RELIANCE-PROP-GO",  cedant:"RELIANCE (Proportional)",          sheetMet:"GO",                        lossRef:"PLA",             outstanding:"Q/S",                 dateOfLoss:"DATE",                fields:["proportional"],              status:"READY" },
  { col:"RELIANCE-PROP-GP",  cedant:"RELIANCE (Proportional)",          sheetMet:"GP",                        lossRef:"PLA",             outstanding:"Q/S",                 dateOfLoss:"DATE",                fields:["proportional"],              status:"READY" },
  { col:"RELIANCE-PROP-GQ",  cedant:"RELIANCE (Proportional)",          sheetMet:"GQ",                        lossRef:"PLA",             outstanding:"Q/S",                 dateOfLoss:"DATE",                fields:["proportional"],              status:"READY" },
  { col:"TOKIO-INFOPACK",    cedant:"TOKIO MARINE (Proportional)",      sheetMet:"Major Cat Loss Report",     lossRef:"CLIENT NAME",     outstanding:"INCURRED CLM",        dateOfLoss:"DOL",                 fields:["proportional"],              status:"READY" },
  { col:"TPI-INFOPACK-51",   cedant:"TPI (Proportional)",               sheetMet:"Exhibit 5-1",               lossRef:"Original Insured", outstanding:"Settled, O/S, Incurred", dateOfLoss:"DOL",              fields:["proportional"],              status:"READY" },
  { col:"TPI-INFOPACK-52",   cedant:"TPI (Proportional)",               sheetMet:"Exhibit 5-2",               lossRef:"Original Insured", outstanding:"Settled, O/S, Incurred", dateOfLoss:"DOL",              fields:["proportional"],              status:"READY" },

  // ── Non-Proportional — dari Rekap Infopack 2026 (1) ──────────────────
  // Page 1 — ABB, ABDA, ACA, ADB, AGGI, ARTARINDO, ASEI, ASKRINDO, ASM, ASTRA, ASWATA, AUS, AVRIST, AXA, BCA, BGU, SAMTUG, SAHABAT, ZURICH, VIDEI, UMUM MEGA, TRIPA
  { col:"ABB-NP",              cedant:"ABB (Non-Proportional)",             sheetMet:"List big loss/CAT",              lossRef:"INSURED",          outstanding:"Gross Claim",              dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"ABDA-NP",             cedant:"ABDA (Non-Proportional)",            sheetMet:"LIST INDIVIDUAL",                lossRef:"INSURED",          outstanding:"INCURRED LOSS",            dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"ACA-NP",              cedant:"ACA (Non-Proportional)",             sheetMet:"Sheet1",                         lossRef:"INSURED NAME",     outstanding:"INCURRED CLAIM",           dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"AGGI-NP",             cedant:"AGGI (Non-Proportional)",            sheetMet:"List of Large claim",            lossRef:"INSURED NAME",     outstanding:"INCURRED LOSS",            dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"ARTARINDO-NP",        cedant:"ARTARINDO (Non-Proportional)",       sheetMet:"Exhibit 3.1-3.4",                lossRef:"Claim Amount Artarindo Share", outstanding:"Claim Amount Artarindo Share", dateOfLoss:"Date Of Loss", fields:["non proportional"], status:"READY" },
  { col:"ASEI-NP",             cedant:"ASEI (Non-Proportional)",            sheetMet:"Exhibit 3.1-3.4",                lossRef:"Claim No.",        outstanding:"GROSS LOSS 100%",          dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"ASKRINDO-NP",         cedant:"ASKRINDO (Non-Proportional)",        sheetMet:"XOL Statistic / Top 10 Loss",    lossRef:"INSURED NAME",     outstanding:"(Tidak tersedia)",         dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"ASM-NP",              cedant:"ASM (Non-Proportional)",             sheetMet:"2.11-2.13",                      lossRef:"CLAIM NO.",        outstanding:"GROSS LOSS ASM SHARE",     dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"ASTRA-HE-NP",         cedant:"ASTRA (Non-Proportional)",           sheetMet:"5.1",                            lossRef:"Claim No.",        outstanding:"100% - Incurred Loss",     dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"ASTRA-MARINE-NP",     cedant:"ASTRA (Non-Proportional)",           sheetMet:"2.1-2.5",                        lossRef:"Claim No.",        outstanding:"100% - Incurred Loss",     dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"ASTRA-MOTOR-NP",      cedant:"ASTRA (Non-Proportional)",           sheetMet:"5.1-5.3",                        lossRef:"Claim No.",        outstanding:"CLAIM 100% - TOTAL GROSS", dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"ASWATA-MARINE-NP",    cedant:"ASWATA (Non-Proportional)",          sheetMet:"Exhibit 4.1-4.3",                lossRef:"Claim No.",        outstanding:"WT SHARE - TOTAL GROSS",   dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"ASWATA-FIRE-NP",      cedant:"ASWATA (Non-Proportional)",          sheetMet:"2.1-2.9",                        lossRef:"Claim No.",        outstanding:"WT SHARE - TOTAL GROSS",   dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"AUS-NP",              cedant:"AUS (Non-Proportional)",             sheetMet:"Exhibit 5.1",                    lossRef:"Claim No.",        outstanding:"Incurred",                 dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"AVRIST-NP",           cedant:"AVRIST (Non-Proportional)",          sheetMet:"07 Major Losses",                lossRef:"Claim No.",        outstanding:"INCURRED, EST*)",          dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"AXA-NP",              cedant:"AXA (Non-Proportional)",             sheetMet:"4. LIST LOSS TO THE LAYER",      lossRef:"INSURED NAME",     outstanding:"INCURRED LOSS",            dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"BCA-MOTOR-NP",        cedant:"BCA (Non-Proportional)",             sheetMet:"4.1-4.2",                        lossRef:"INSURED NAME",     outstanding:"INCURRED LOSS",            dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"BCA-WA-NP",           cedant:"BCA (Non-Proportional)",             sheetMet:"4.1-4.2",                        lossRef:"INSURED NAME",     outstanding:"INCURRED LOSS",            dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"BGU-NP",              cedant:"BGU (Non-Proportional)",             sheetMet:"6. OS CLAIM",                    lossRef:"Reference No.",    outstanding:"Outstanding Amount",       dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"SAMTUG-NP",           cedant:"SAMSUNG TUGU (Non-Proportional)",    sheetMet:"Samsung Tugu WA XOL 2026",       lossRef:"Claim No.",        outstanding:"OAC AMT",                  dateOfLoss:"(Tidak tersedia)",    fields:["non proportional"], status:"READY" },
  { col:"SAHABAT-NP",          cedant:"SAHABAT (Non-Proportional)",         sheetMet:"List Of Loss Hit to the Layer",  lossRef:"Claim No.",        outstanding:"INCURRED LOSS",            dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"ZURICH-NP",           cedant:"ZURICH (Non-Proportional)",          sheetMet:"Data update",                    lossRef:"Claim No.",        outstanding:"NETT_CLAIM",               dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"VIDEI-NP-MH",         cedant:"VIDEI (Non-Proportional)",           sheetMet:"MH",                             lossRef:"THE INSURED",      outstanding:"Incurred Claim",           dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"VIDEI-NP-FIRE",       cedant:"VIDEI (Non-Proportional)",           sheetMet:"FIRE",                           lossRef:"THE INSURED",      outstanding:"Incurred Claim",           dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"VIDEI-NP-SB",         cedant:"VIDEI (Non-Proportional)",           sheetMet:"SB",                             lossRef:"THE INSURED",      outstanding:"Incurred Claim",           dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"VIDEI-NP-LL",         cedant:"VIDEI (Non-Proportional)",           sheetMet:"List Of Loss Hit to the Layer",  lossRef:"THE INSURED",      outstanding:"Incurred Claim",           dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"UMUMEGA-NP",          cedant:"UMUM MEGA (Non-Proportional)",       sheetMet:"3.1-3.4",                        lossRef:"INSURED",          outstanding:"REINSTATEMENT",            dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"TRIPA-NP-WA",         cedant:"TRIPA (Non-Proportional)",           sheetMet:"WA XOL 4.1-4.5",                 lossRef:"NAME OF THE INSURED", outstanding:"REINSTATEMENT",         dateOfLoss:"D.O.L.",              fields:["non proportional"], status:"READY" },
  { col:"TRIPA-NP-MV",         cedant:"TRIPA (Non-Proportional)",           sheetMet:"MV XOL 3.1-3.5",                 lossRef:"NAME OF THE INSURED", outstanding:"REINSTATEMENT",         dateOfLoss:"D.O.L.",              fields:["non proportional"], status:"READY" },
  // Page 2 — TRIPA cont, TPI, TOKIO, TOB, SUNDAY, SUMIT OTO, SOMPO
  { col:"TPI-NP",              cedant:"TPI (Non-Proportional)",             sheetMet:"3.1-3.5 / 4.1",                 lossRef:"InsName",          outstanding:"Original 100% Claim - Total Incurred", dateOfLoss:"D.O.L. / DOL", fields:["non proportional"], status:"READY" },
  { col:"TOKIO-NP",            cedant:"TOKIO MARINE (Non-Proportional)",    sheetMet:"3.5 / 4.1 / 5.1-5.2",           lossRef:"CLIENT NAME",      outstanding:"INCURRED CLM",             dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"TOB-NP",              cedant:"TOB (Non-Proportional)",             sheetMet:"Major cat loss / 3.1",           lossRef:"Description",      outstanding:"Gross Claim (Sunday Share)", dateOfLoss:"DOL",               fields:["non proportional"], status:"READY" },
  { col:"SUNDAY-NP",           cedant:"SUNDAY (Non-Proportional)",          sheetMet:"2.1 / 2.12",                     lossRef:"Insured",          outstanding:"Gross Claim (Sunday Share)", dateOfLoss:"DOL",               fields:["non proportional"], status:"READY" },
  { col:"SUMITOTO-NP",         cedant:"SUMIT OTO (Non-Proportional)",       sheetMet:"Exhibit 2.10 / 5.1-5.2",        lossRef:"Insured Name",     outstanding:"GROSS CLAIM",              dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"SOMPO-NP",            cedant:"SOMPO (Non-Proportional)",           sheetMet:"CompXL Statistics / Motor CXL",  lossRef:"INSURED NAME (ADD BY SII)", outstanding:"RETAINED LOSS",    dateOfLoss:"DATE OF LOSS",        fields:["non proportional"], status:"READY" },
  // Page 3 — SIMASTECH, SEAINSURE, BINTANG, BOSOWA, BRINS, BUANA IND, BUMIDA, CAKRAWALA
  { col:"SIMASTECH-NP",        cedant:"SIMASTECH (Non-Proportional)",       sheetMet:"2.6-2.7",                        lossRef:"Insured Name",     outstanding:"GROSS LOSS ASI SHARE",     dateOfLoss:"D O L",               fields:["non proportional"], status:"READY" },
  { col:"SEAINSURE-NP",        cedant:"SEAINSURE (Non-Proportional)",       sheetMet:"Exhibit 4.1 / 7.1-7.2",         lossRef:"Insured",          outstanding:"Claim IDR",                dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"BINTANG-NP",          cedant:"BINTANG (Non-Proportional)",         sheetMet:"5.1-5.6 / 7.1-7.7",             lossRef:"Insured Name",     outstanding:"BOSOWA SHARE OF CLAIM",    dateOfLoss:"Occur",               fields:["non proportional"], status:"READY" },
  { col:"BOSOWA-NP",           cedant:"BOSOWA (Non-Proportional)",          sheetMet:"5.1-5.5 / 7.1-7.7",             lossRef:"NAME OF INSURED",  outstanding:"BOSOWA SHARE OF CLAIM",    dateOfLoss:"DOL.",                fields:["non proportional"], status:"READY" },
  { col:"BRINS-NP",            cedant:"BRINS (Non-Proportional)",           sheetMet:"OUTSTANDING XOL UY 2024+",       lossRef:"INSURED NAME",     outstanding:"Sum of XOL_1_CLAIM_OS",   dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"BUANAIND-NP",         cedant:"BUANA IND (Non-Proportional)",       sheetMet:"Flood Jan13 / UY.2021-2025",     lossRef:"INSURED",          outstanding:"XOL TOTAL LOSS ESTIMATION", dateOfLoss:"DOL",               fields:["non proportional"], status:"READY" },
  { col:"BUMIDA-NP",           cedant:"BUMIDA (Non-Proportional)",          sheetMet:"OUTSTANDING",                    lossRef:"INSURED",          outstanding:"GROSS INCURED EST*)",      dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"CAKRAWALA-NP",        cedant:"CAKRAWALA (Non-Proportional)",       sheetMet:"CLAIM MV XOL 2020-2025",         lossRef:"Name of Insured",  outstanding:"Claim Amount",             dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  // Page 4 — CHUBB, CTII, DAYIN, ELJ, ETIQA, FPG, GEGII, HARTA, INTRA, JASINDO, MAIPARK, KARK
  { col:"CHUBB-NP",            cedant:"CHUBB (Non-Proportional)",           sheetMet:"OS CLAIM TTY 2018-2025",         lossRef:"Policy Holder Name", outstanding:"Total",                  dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"CTII-NP",             cedant:"CHINA TAIPING (Non-Proportional)",   sheetMet:"6.1-6.4 / B.1 / C.1",           lossRef:"Insured Name",     outstanding:"Settlement in 100% Share", dateOfLoss:"Date of Loss",       fields:["non proportional"], status:"READY" },
  { col:"DAYIN-NP",            cedant:"DAYIN (Non-Proportional)",           sheetMet:"Motor - Large Loss",             lossRef:"INSURED",          outstanding:"CLAIM OUR SHARE",          dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"ELJ-NP",              cedant:"ELJ (Non-Proportional)",             sheetMet:"Exhibit 4.1 / 6.2-6.4",         lossRef:"The Insured",      outstanding:"Loss Estimated / Gross Claim", dateOfLoss:"Loss Date",       fields:["non proportional"], status:"READY" },
  { col:"ETIQA-NP",            cedant:"ETIQA (Non-Proportional)",           sheetMet:"Motor / Combined Risk / CAT",    lossRef:"Policy Name",      outstanding:"Claim Gross Etiqa Share",  dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"FPG-NP",              cedant:"FPG (Non-Proportional)",             sheetMet:"Fire-Large Loss / Eng / GA / Marine", lossRef:"INSURED NAME", outstanding:"OURSHARE → TOTAL",        dateOfLoss:"DATE OF LOSS",        fields:["non proportional"], status:"READY" },
  { col:"GEGII-NP",            cedant:"GEGII (Non-Proportional)",           sheetMet:"CLAIM XOL TY2024-2025 / Event", lossRef:"INSURED",          outstanding:"Gross Incurred (Local)",   dateOfLoss:"DATE OF LOSS",        fields:["non proportional"], status:"READY" },
  { col:"HARTA-NP",            cedant:"HARTA (Non-Proportional)",           sheetMet:"2.2-2.6",                        lossRef:"INSURED NAME",     outstanding:"OURSHARE INCURRED",        dateOfLoss:"DATE OF LOSS",        fields:["non proportional"], status:"READY" },
  { col:"INTRA-NP",            cedant:"INTRA (Non-Proportional)",           sheetMet:"05 OS Loss Fire / Eng / MV / MC / GA", lossRef:"INSURED",   outstanding:"CLAIM ESTIMATE",           dateOfLoss:"LOSS DATE",           fields:["non proportional"], status:"READY" },
  { col:"JASINDO-NP",          cedant:"JASINDO (Non-Proportional)",         sheetMet:"IV.1 / GA / MWA XOL / CARGO / MH", lossRef:"Insured",      outstanding:"XOL - SETTLED + XOL - OS", dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"MAIPARK-NP-INFOPACK", cedant:"MAIPARK (Non-Proportional InfoPack)", sheetMet:"Exhibit 6.2",                   lossRef:"Uw Year",          outstanding:"GROSS RETAINED",           dateOfLoss:"(Tidak tersedia)",    fields:["non proportional"], status:"READY" },
  // Page 5 — KB INS, LIPPO, RELIANCE, PANFIC, RAMA, MPM, MERITZ, MAXIMUS, JASTAN, RAMAYANA, JRP, MNC
  { col:"KBINS-NP-INFOPACK",   cedant:"KB INS (Non-Proportional InfoPack)", sheetMet:"List of Large Losses / 2.11",   lossRef:"Insured Name",     outstanding:"XOL",                      dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"LIPPO-NP-INFOPACK",   cedant:"LIPPO (Non-Proportional InfoPack)",  sheetMet:"OS / Claim PAID XOL",           lossRef:"U/W Year",         outstanding:"XOL",                      dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"RELIANCE-NP",         cedant:"RELIANCE (Non-Proportional)",        sheetMet:"3.1 Update / 3.4",              lossRef:"UWYEAR",           outstanding:"Losses to the XL",         dateOfLoss:"DATE OF LOSS",        fields:["non proportional"], status:"READY" },
  { col:"PANFIC-NP",           cedant:"PANFIC (Non-Proportional)",          sheetMet:"Run Risk / B.2",                 lossRef:"Insured",          outstanding:"(Tidak tersedia)",         dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"RAMA-NP",             cedant:"RAMA (Non-Proportional)",            sheetMet:"Large Losses / Whole Account New", lossRef:"Insured",       outstanding:"(Tidak tersedia)",         dateOfLoss:"Date of Loss",        fields:["non proportional"], status:"READY" },
  { col:"MPM-NP",              cedant:"MPM (Non-Proportional)",             sheetMet:"Sheet1 / Larger Loss",           lossRef:"Insured",          outstanding:"Gross Net",                dateOfLoss:"DOL",                 fields:["non proportional"], status:"READY" },
  { col:"MERITZ-NP",           cedant:"MERITZ KORINDO (Non-Proportional)",  sheetMet:"List individual Losses / 2.11-2.13", lossRef:"ASSURED",    outstanding:"Paid Claim Amount MKI Share", dateOfLoss:"D.O.L",            fields:["non proportional"], status:"READY" },
  { col:"MAXIMUS-NP-INFOPACK", cedant:"MAXIMUS (Non-Proportional InfoPack)", sheetMet:"Cat Losses - FL / EQ / RSMD",  lossRef:"INSURED",          outstanding:"AMOUNT OF LOSS",           dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"JASTAN-NP-INFOPACK",  cedant:"JASTAN (Non-Proportional InfoPack)", sheetMet:"LIST LOSS TO THE / 2021-2025",  lossRef:"THE INSURED",      outstanding:"GROSS INCURRED",           dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"RAMAYANA-NP",         cedant:"RAMAYANA (Non-Proportional)",        sheetMet:"LIST LOSS TO THE LAYER - WA",   lossRef:"THE INSURED",      outstanding:"CLAIM RMY SHARE",          dateOfLoss:"D.O.L",               fields:["non proportional"], status:"READY" },
  { col:"JRP-NP",              cedant:"JRP (Non-Proportional)",             sheetMet:"Exhibit: 2.5 / 2.12",           lossRef:"INSURED",          outstanding:"Q/S",                      dateOfLoss:"LOSS DATE",           fields:["non proportional"], status:"READY" },
  { col:"MNC-NP",              cedant:"MNC (Non-Proportional)",             sheetMet:"2.2 / FAC_AMT",                  lossRef:"INSURED_NAME",     outstanding:"OURSHARE_RESERVE",         dateOfLoss:"LOSS_DATE",           fields:["non proportional"], status:"READY" },
  // Page 6 — PLN, RAKSA, MSIG
  { col:"PLN-NP",              cedant:"PLN (Non-Proportional)",             sheetMet:"Exceed Natural / Outstanding",   lossRef:"NAMA TERTANGGUNG", outstanding:"GROSS_CLAIM",              dateOfLoss:"LOSSDATE",            fields:["non proportional"], status:"READY" },
  { col:"RAKSA-NP",            cedant:"RAKSA (Non-Proportional)",           sheetMet:"3.4",                            lossRef:"Insured Name",     outstanding:"(Tidak tersedia)",         dateOfLoss:"Loss Date",           fields:["non proportional"], status:"READY" },
  { col:"MSIG-NP",             cedant:"MSIG (Non-Proportional)",            sheetMet:"MSIG Indonesia 2026",            lossRef:"Client Name",      outstanding:"Paid / OS / Total (100% & MSIG Share)", dateOfLoss:"D.O.L", fields:["non proportional"], status:"READY" },
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
      || p.col.toLowerCase().includes(q)
      || (p.fields || []).some(f => f.toLowerCase().includes(q));
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
                  {activeTab === "infopack" && (
                    <th className="px-3 py-2.5 text-left font-semibold text-indigo-500 uppercase tracking-wide">
                      Field
                    </th>
                  )}
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={activeTab === "infopack" ? 8 : 7} className="text-center py-12 text-gray-400">
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
                    {/* Field (proportional / non proportional) — InfoPack only */}
                    {activeTab === "infopack" && (
                      <td className="px-3 py-1.5">
                        <div className="flex flex-col gap-0.5">
                          {(p.fields || []).map((f, fi) => (
                            <span key={fi} className="text-xs text-gray-500">{f}</span>
                          ))}
                        </div>
                      </td>
                    )}
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
