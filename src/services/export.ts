
import type { Transaction } from "../types";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function escapeCSV(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportTransactionsCSV(
  transactions: Transaction[]
): Promise<void> {
  if (!transactions.length) {
    alert("No transactions available to export.");
    return;
  }

  try {
    const headers = [
      "Date",
      "Title",
      "Type",
      "Category",
      "Amount",
      "Event Attended Date",
      "Payment Date",
      "Notes"
    ];

    const rows = transactions.map(transaction => [
      transaction.date,
      transaction.title,
      transaction.type,
      transaction.category,
      transaction.amount,
      transaction.eventAttendedDate || "",
      transaction.paymentDate || "",
      transaction.notes || ""
    ]);

    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map(row => row.map(escapeCSV).join(","))
    ].join("\r\n");

    const filename = `MaxLedger-Transactions-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    const file = await Filesystem.writeFile({
      path: filename,
      data: "\uFEFF" + csv,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    });

    await Share.share({
      title: "MaxLedger CSV Export",
      text: "Your MaxLedger transaction export",
      files: [file.uri],
      dialogTitle: "Save or share CSV"
    });
  } catch (error) {
    console.error("CSV export failed:", error);
    alert("Unable to export CSV. Please try again.");
  }
}
