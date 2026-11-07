import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

import type {
  AppData,
  Budget,
  CashDistribution,
  DistributionMember,
  PendingPayment,
  Transaction
} from "../types";

import { buildXlsx, type SheetDefinition } from "./xlsx";

/* ------------------------------------------------------------------ */
/* Saving / sharing                                                    */
/* ------------------------------------------------------------------ */

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function localToday(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x2000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return btoa(binary);
}

/** Turns a label such as "Mar 2026 / Events" into "Mar-2026-Events". */
export function fileSafe(label: string): string {
  return (
    label
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "Report"
  );
}

/**
 * Builds an .xlsx workbook and hands it to the Android share sheet
 * (or downloads it in a browser).
 */
export async function saveWorkbook(
  baseName: string,
  sheets: SheetDefinition[]
): Promise<void> {
  const fileName = `${baseName}-${localToday()}.xlsx`;

  try {
    const bytes = buildXlsx(sheets);

    if (Capacitor.isNativePlatform()) {
      const file = await Filesystem.writeFile({
        path: fileName,
        data: toBase64(bytes),
        directory: Directory.Cache
      });

      await Share.share({
        title: "MaxLedger Excel Export",
        text: "Your MaxLedger Excel export",
        files: [file.uri],
        dialogTitle: "Save or share Excel file"
      });

      return;
    }

    const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    // A cancelled share sheet should not look like a failure.
    const message = error instanceof Error ? error.message : String(error);

    if (/cancel/i.test(message)) return;

    console.error("Excel export failed:", error);
    alert("Unable to export Excel file. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const round2 = (value: number) => Math.round(value * 100) / 100;

const sum = (values: number[]) =>
  round2(values.reduce((total, value) => total + value, 0));

const memberPaid = (member: DistributionMember) =>
  sum((member.payments || []).map(payment => Number(payment.amount || 0)));

const memberPending = (member: DistributionMember) =>
  Math.max(0, round2(Number(member.allocatedAmount || 0) - memberPaid(member)));

const eventAllocated = (event: CashDistribution) =>
  sum(event.members.map(member => Number(member.allocatedAmount || 0)));

const eventPaid = (event: CashDistribution) =>
  sum(event.members.map(memberPaid));

const eventPending = (event: CashDistribution) =>
  sum(event.members.map(memberPending));

function statusFor(allocated: number, paid: number): string {
  if (allocated - paid <= 0.009) return "Paid";
  if (paid > 0) return "Partially paid";
  return "Unpaid";
}

/* ------------------------------------------------------------------ */
/* Transactions & financial reports                                    */
/* ------------------------------------------------------------------ */

export function transactionsSheet(
  transactions: Transaction[],
  name = "Transactions"
): SheetDefinition {
  const sorted = [...transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt
  );

  return {
    name,
    headers: [
      "Date",
      "Title",
      "Type",
      "Category",
      "Amount",
      "Event Attended Date",
      "Payment Date",
      "Notes"
    ],
    rows: sorted.map(item => [
      item.date,
      item.title,
      item.type === "income" ? "Income" : "Expense",
      item.category,
      item.amount,
      item.eventAttendedDate || "",
      item.paymentDate || "",
      item.notes || ""
    ]),
    moneyColumns: [4],
    dateColumns: [0, 5, 6]
  };
}

export function financialReportSheets(
  transactions: Transaction[],
  label: string
): SheetDefinition[] {
  const income = sum(
    transactions.filter(item => item.type === "income").map(item => item.amount)
  );

  const expenses = sum(
    transactions
      .filter(item => item.type === "expense")
      .map(item => item.amount)
  );

  const summary: SheetDefinition = {
    name: "Summary",
    headers: [
      "Period",
      "Generated",
      "Transactions",
      "Total Income",
      "Total Expenses",
      "Net Balance",
      "Savings Rate %"
    ],
    rows: [
      [
        label,
        new Date().toLocaleString("en-IN"),
        transactions.length,
        income,
        expenses,
        round2(income - expenses),
        income > 0 ? round2(((income - expenses) / income) * 100) : 0
      ]
    ],
    moneyColumns: [3, 4, 5]
  };

  const monthly: Record<string, { income: number; expenses: number }> = {};

  transactions.forEach(item => {
    const month = item.date.slice(0, 7);
    monthly[month] = monthly[month] || { income: 0, expenses: 0 };

    if (item.type === "income") monthly[month].income += item.amount;
    else monthly[month].expenses += item.amount;
  });

  const monthlyRows = Object.entries(monthly)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, values]) => [
      month,
      round2(values.income),
      round2(values.expenses),
      round2(values.income - values.expenses)
    ]);

  const monthlySheet: SheetDefinition = {
    name: "Monthly",
    headers: ["Month", "Income", "Expenses", "Net"],
    rows: monthlyRows.length
      ? [
          ...monthlyRows,
          ["Total", income, expenses, round2(income - expenses)]
        ]
      : [],
    moneyColumns: [1, 2, 3],
    totalsRow: monthlyRows.length > 0
  };

  const categoryTotals: Record<
    string,
    { type: string; total: number; count: number }
  > = {};

  transactions.forEach(item => {
    const key = `${item.type}|${item.category}`;

    categoryTotals[key] = categoryTotals[key] || {
      type: item.type === "income" ? "Income" : "Expense",
      total: 0,
      count: 0
    };

    categoryTotals[key].total += item.amount;
    categoryTotals[key].count += 1;
  });

  const typeTotals = { Income: income, Expense: expenses };

  const categorySheet: SheetDefinition = {
    name: "Categories",
    headers: ["Category", "Type", "Total", "Transactions", "Share of Type %"],
    rows: Object.entries(categoryTotals)
      .map(([key, value]) => ({
        category: key.slice(key.indexOf("|") + 1),
        ...value
      }))
      .sort(
        (a, b) => a.type.localeCompare(b.type) || b.total - a.total
      )
      .map(item => {
        const base = typeTotals[item.type as "Income" | "Expense"];

        return [
          item.category,
          item.type,
          round2(item.total),
          item.count,
          base > 0 ? round2((item.total / base) * 100) : 0
        ];
      }),
    moneyColumns: [2]
  };

  return [
    summary,
    monthlySheet,
    categorySheet,
    transactionsSheet(transactions)
  ];
}

/* ------------------------------------------------------------------ */
/* Pending payments                                                    */
/* ------------------------------------------------------------------ */

function pendingStatus(payment: PendingPayment): string {
  const received = sum(payment.receipts.map(receipt => receipt.amount));
  const remaining = Math.max(0, round2(payment.expectedAmount - received));

  if (payment.status === "cancelled") return "Cancelled";
  if (remaining === 0) return "Paid";
  if (received > 0) return "Partially paid";
  if (payment.expectedDate < localToday()) return "Overdue";

  return "Pending";
}

export function pendingPaymentSheets(
  payments: PendingPayment[]
): SheetDefinition[] {
  const sorted = [...payments].sort((a, b) =>
    a.expectedDate.localeCompare(b.expectedDate)
  );

  return [
    {
      name: "Pending Payments",
      headers: [
        "Customer",
        "Expected Amount",
        "Received",
        "Remaining",
        "Expected Date",
        "Event Attended Date",
        "Status",
        "Notes"
      ],
      rows: sorted.map(payment => {
        const received = sum(payment.receipts.map(item => item.amount));

        return [
          payment.customerName,
          payment.expectedAmount,
          received,
          Math.max(0, round2(payment.expectedAmount - received)),
          payment.expectedDate,
          payment.eventAttendedDate || "",
          pendingStatus(payment),
          payment.notes || ""
        ];
      }),
      moneyColumns: [1, 2, 3],
      dateColumns: [4, 5]
    },
    {
      name: "Receipts",
      headers: ["Customer", "Received Date", "Amount", "Method", "Notes"],
      rows: sorted.flatMap(payment =>
        payment.receipts.map(receipt => [
          payment.customerName,
          receipt.receivedDate,
          receipt.amount,
          receipt.method,
          receipt.notes || ""
        ])
      ),
      moneyColumns: [2],
      dateColumns: [1]
    }
  ];
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export function budgetsSheet(
  budgets: Budget[],
  transactions: Transaction[]
): SheetDefinition {
  const rows = [...budgets]
    .sort(
      (a, b) =>
        (b.month || "").localeCompare(a.month || "") ||
        a.category.localeCompare(b.category)
    )
    .map(budget => {
      const spent = sum(
        transactions
          .filter(
            item =>
              item.type === "expense" &&
              item.date.slice(0, 7) === budget.month &&
              (budget.category === "Overall" ||
                item.category === budget.category)
          )
          .map(item => item.amount)
      );

      return [
        budget.month,
        budget.category === "Overall" ? "Overall budget" : budget.category,
        budget.amount,
        spent,
        round2(budget.amount - spent),
        budget.amount > 0 ? round2((spent / budget.amount) * 100) : 0
      ];
    });

  return {
    name: "Budgets",
    headers: ["Month", "Category", "Budget", "Spent", "Remaining", "Used %"],
    rows,
    moneyColumns: [2, 3, 4]
  };
}

/* ------------------------------------------------------------------ */
/* Cash distribution                                                   */
/* ------------------------------------------------------------------ */

export function cashDistributionSheets(
  events: CashDistribution[],
  label: string
): SheetDefinition[] {
  const sorted = [...events].sort((a, b) =>
    (a.eventAttendedDate || "").localeCompare(b.eventAttendedDate || "")
  );

  const allocated = sum(sorted.map(eventAllocated));
  const paid = sum(sorted.map(eventPaid));
  const pending = sum(sorted.map(eventPending));

  const summary: SheetDefinition = {
    name: "Summary",
    headers: [
      "Period",
      "Generated",
      "Events",
      "Total Allocated",
      "Total Paid",
      "Total Pending",
      "Collection %"
    ],
    rows: [
      [
        label,
        new Date().toLocaleString("en-IN"),
        sorted.length,
        allocated,
        paid,
        pending,
        allocated > 0 ? round2(Math.min(100, (paid / allocated) * 100)) : 0
      ]
    ],
    moneyColumns: [3, 4, 5]
  };

  const eventSheet: SheetDefinition = {
    name: "Events",
    headers: [
      "Event",
      "Event Date",
      "Location",
      "In Time",
      "Out Time",
      "Team Members",
      "Allocated",
      "Paid",
      "Pending",
      "Status",
      "Notes"
    ],
    rows: sorted.map(event => [
      event.eventName,
      event.eventAttendedDate || "",
      event.location || "",
      event.inTime || "",
      event.outTime || "",
      event.members.length,
      eventAllocated(event),
      eventPaid(event),
      eventPending(event),
      statusFor(eventAllocated(event), eventPaid(event)),
      event.notes || ""
    ]),
    moneyColumns: [6, 7, 8],
    dateColumns: [1]
  };

  const memberSheet: SheetDefinition = {
    name: "Event Members",
    headers: [
      "Event",
      "Event Date",
      "Team Member",
      "Allocated",
      "Paid",
      "Pending",
      "Status"
    ],
    rows: sorted.flatMap(event =>
      event.members.map(member => [
        event.eventName,
        event.eventAttendedDate || "",
        member.memberName,
        Number(member.allocatedAmount || 0),
        memberPaid(member),
        memberPending(member),
        statusFor(Number(member.allocatedAmount || 0), memberPaid(member))
      ])
    ),
    moneyColumns: [3, 4, 5],
    dateColumns: [1]
  };

  const paymentSheet: SheetDefinition = {
    name: "Payments",
    headers: [
      "Event",
      "Event Date",
      "Team Member",
      "Payment Date",
      "Amount",
      "Note"
    ],
    rows: sorted.flatMap(event =>
      event.members.flatMap(member =>
        (member.payments || []).map(payment => [
          event.eventName,
          event.eventAttendedDate || "",
          member.memberName,
          payment.paidDate || "",
          Number(payment.amount || 0),
          payment.referenceNote || ""
        ])
      )
    ),
    moneyColumns: [4],
    dateColumns: [1, 3]
  };

  const people: Record<
    string,
    { name: string; events: number; allocated: number; paid: number }
  > = {};

  sorted.forEach(event =>
    event.members.forEach(member => {
      const key = member.teamMemberId || member.memberName;

      people[key] = people[key] || {
        name: member.memberName,
        events: 0,
        allocated: 0,
        paid: 0
      };

      people[key].events += 1;
      people[key].allocated += Number(member.allocatedAmount || 0);
      people[key].paid += memberPaid(member);
    })
  );

  const teamSheet: SheetDefinition = {
    name: "By Team Member",
    headers: ["Team Member", "Events", "Allocated", "Paid", "Pending", "Status"],
    rows: Object.values(people)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(person => [
        person.name,
        person.events,
        round2(person.allocated),
        round2(person.paid),
        Math.max(0, round2(person.allocated - person.paid)),
        statusFor(person.allocated, person.paid)
      ]),
    moneyColumns: [2, 3, 4]
  };

  return [summary, eventSheet, memberSheet, paymentSheet, teamSheet];
}

/* ------------------------------------------------------------------ */
/* Everything                                                          */
/* ------------------------------------------------------------------ */

export function fullDataSheets(data: AppData): SheetDefinition[] {
  return [
    transactionsSheet(data.transactions),
    ...pendingPaymentSheets(data.pendingPayments),
    budgetsSheet(data.budgets || [], data.transactions),
    {
      name: "Categories",
      headers: ["Category", "Type"],
      rows: data.categories.map(category => [
        category.name,
        category.type === "income" ? "Income" : "Expense"
      ])
    },
    ...cashDistributionSheets(data.cashDistributions || [], "All events")
      .filter(sheet => sheet.name !== "Summary")
      .map(sheet => ({ ...sheet, name: `Cash - ${sheet.name}` })),
    {
      name: "Team Members",
      headers: ["Name"],
      rows: (data.teamMembers || []).map(member => [member.name])
    }
  ];
}

/* ------------------------------------------------------------------ */
/* One-call export helpers used by the UI                              */
/* ------------------------------------------------------------------ */

export function exportTransactionsExcel(
  transactions: Transaction[]
): Promise<void> {
  if (!transactions.length) {
    alert("No transactions available to export.");
    return Promise.resolve();
  }

  return saveWorkbook("MaxLedger-Transactions", [
    transactionsSheet(transactions)
  ]);
}

export function exportFinancialReportExcel(
  transactions: Transaction[],
  label: string
): Promise<void> {
  return saveWorkbook(
    `MaxLedger-Report-${fileSafe(label)}`,
    financialReportSheets(transactions, label)
  );
}

export function exportPendingPaymentsExcel(
  payments: PendingPayment[]
): Promise<void> {
  if (!payments.length) {
    alert("No pending payments available to export.");
    return Promise.resolve();
  }

  return saveWorkbook("MaxLedger-Pending-Payments", pendingPaymentSheets(payments));
}

export function exportBudgetsExcel(
  budgets: Budget[],
  transactions: Transaction[]
): Promise<void> {
  if (!budgets.length) {
    alert("No budgets available to export.");
    return Promise.resolve();
  }

  return saveWorkbook("MaxLedger-Budgets", [
    budgetsSheet(budgets, transactions)
  ]);
}

export function exportCashDistributionExcel(
  events: CashDistribution[],
  label: string
): Promise<void> {
  if (!events.length) {
    alert("No cash distribution events to export for this selection.");
    return Promise.resolve();
  }

  return saveWorkbook(
    `MaxLedger-Cash-Distribution-${fileSafe(label)}`,
    cashDistributionSheets(events, label)
  );
}

export function exportFullDataExcel(data: AppData): Promise<void> {
  return saveWorkbook("MaxLedger-All-Data", fullDataSheets(data));
}
