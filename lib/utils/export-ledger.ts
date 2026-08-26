import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Workbook } from "exceljs";
import { formatCurrency } from "@/lib/utils/format";
import type { LedgerEntry } from "@/lib/hooks/orders/use-orders-history";

function conceptLabel(entry: LedgerEntry): string {
  return entry.isProrated ? `${entry.concept} (prorrateo)` : entry.concept;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportLedgerToPdf(
  entries: LedgerEntry[],
  closingBalance: number,
  periodLabel: string,
  startDate: string,
  endDate: string
): void {
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text("Libro diario — Jebbs", 14, 15);
  doc.setFontSize(10);
  doc.text(periodLabel, 14, 21);

  const rows = entries.map((entry) => [
    entry.date,
    conceptLabel(entry),
    entry.kind === "expense" ? formatCurrency(entry.amount) : "—",
    entry.kind === "income" ? formatCurrency(entry.amount) : "—",
    formatCurrency(entry.balance),
  ]);

  autoTable(doc, {
    startY: 27,
    head: [["Fecha", "Concepto", "Debe", "Haber", "Saldo"]],
    body: rows,
    foot: [["", "", "", "Saldo del período", formatCurrency(closingBalance)]],
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  doc.save(`libro-diario_${startDate}_${endDate}.pdf`);
}

export async function exportLedgerToExcel(
  entries: LedgerEntry[],
  closingBalance: number,
  periodLabel: string,
  startDate: string,
  endDate: string
): Promise<void> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Libro diario");

  sheet.columns = [
    { header: "Fecha", key: "date", width: 14 },
    { header: "Concepto", key: "concept", width: 40 },
    { header: "Debe", key: "debit", width: 16 },
    { header: "Haber", key: "credit", width: 16 },
    { header: "Saldo", key: "balance", width: 16 },
  ];

  sheet.insertRow(1, [`Libro diario — Jebbs — ${periodLabel}`]);
  sheet.mergeCells("A1:E1");
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { bold: true };

  const currencyFmt = '"$"#,##0';

  for (const entry of entries) {
    const row = sheet.addRow({
      date: entry.date,
      concept: conceptLabel(entry),
      debit: entry.kind === "expense" ? entry.amount : null,
      credit: entry.kind === "income" ? entry.amount : null,
      balance: entry.balance,
    });
    for (const key of ["debit", "credit", "balance"] as const) {
      const cell = row.getCell(key);
      cell.numFmt = currencyFmt;
      cell.alignment = { horizontal: "right" };
    }
  }

  const closingRow = sheet.addRow({ concept: "Saldo del período", balance: closingBalance });
  closingRow.font = { bold: true };
  const closingCell = closingRow.getCell("balance");
  closingCell.numFmt = currencyFmt;
  closingCell.alignment = { horizontal: "right" };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `libro-diario_${startDate}_${endDate}.xlsx`);
}
