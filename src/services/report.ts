import type { AppData } from "../types";

const money = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

export function printFinancialReport(data: AppData): void {
  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    window.alert("Please allow pop-ups to generate your PDF report.");
    return;
  }

  const transactions = [...data.transactions].sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  const income = transactions
    .filter(item => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const expenses = transactions
    .filter(item => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const categoryTotals: Record<string, number> = {};

  transactions
    .filter(item => item.type === "expense")
    .forEach(item => {
      categoryTotals[item.category] =
        (categoryTotals[item.category] || 0) + item.amount;
    });

  const categoryRows = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => `
      <tr>
        <td>${escapeHTML(category)}</td>
        <td>${money(amount)}</td>
      </tr>
    `).join("");

  const transactionRows = transactions.map(item => `
    <tr>
      <td>${escapeHTML(item.date)}</td>
      <td>${escapeHTML(item.title)}</td>
      <td>${escapeHTML(item.category)}</td>
      <td>${item.type === "income" ? "Income" : "Expense"}</td>
      <td class="${item.type}">${money(item.amount)}</td>
    </tr>
  `).join("");

  const monthlyTotals: Record<string, { income: number; expenses: number }> = {};

  transactions.forEach(item => {
    const month = item.date.slice(0, 7);

    if (!monthlyTotals[month]) {
      monthlyTotals[month] = { income: 0, expenses: 0 };
    }

    if (item.type === "income") {
      monthlyTotals[month].income += item.amount;
    } else {
      monthlyTotals[month].expenses += item.amount;
    }
  });

  const monthlyRows = Object.entries(monthlyTotals)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, totals]) => `
      <tr>
        <td>${escapeHTML(month)}</td>
        <td class="income">${money(totals.income)}</td>
        <td class="expense">${money(totals.expenses)}</td>
        <td>${money(totals.income - totals.expenses)}</td>
      </tr>
    `).join("");

  reportWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>MaxLedger Financial Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          color: #17251d;
          padding: 28px;
          max-width: 1000px;
          margin: auto;
        }
        h1 { margin-bottom: 5px; }
        .subtitle { color: #64746a; margin-bottom: 28px; }
        .summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin: 20px 0 30px;
        }
        .summary article {
          border: 1px solid #dce5df;
          border-radius: 10px;
          padding: 15px;
        }
        .summary span { color: #64746a; font-size: 12px; }
        .summary strong {
          display: block;
          margin-top: 8px;
          font-size: 18px;
        }
        h2 {
          margin-top: 30px;
          border-bottom: 2px solid #dce5df;
          padding-bottom: 8px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 14px 0 25px;
          font-size: 12px;
        }
        th, td {
          padding: 10px 8px;
          border-bottom: 1px solid #e5ebe7;
          text-align: left;
        }
        th { background: #edf4ef; }
        .income { color: #13834f; }
        .expense { color: #c04444; }
        .empty { color: #78867d; padding: 12px 0; }
        .footer {
          margin-top: 35px;
          color: #78867d;
          font-size: 11px;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
          tr { break-inside: avoid; }
        }
        @media (max-width: 600px) {
          body { padding: 12px; }
          .summary { grid-template-columns: 1fr; }
          table { font-size: 10px; }
        }
      </style>
    </head>
    <body>
      <h1>MaxLedger</h1>
      <p class="subtitle">
        Financial Report · Generated ${new Date().toLocaleString("en-IN")}
      </p>

      <div class="summary">
        <article>
          <span>Total income</span>
          <strong class="income">${money(income)}</strong>
        </article>
        <article>
          <span>Total expenses</span>
          <strong class="expense">${money(expenses)}</strong>
        </article>
        <article>
          <span>Net balance</span>
          <strong>${money(income - expenses)}</strong>
        </article>
      </div>

      <h2>Monthly Summary</h2>
      ${monthlyRows
        ? `<table>
            <thead><tr>
              <th>Month</th><th>Income</th><th>Expenses</th><th>Net</th>
            </tr></thead>
            <tbody>${monthlyRows}</tbody>
          </table>`
        : '<p class="empty">No monthly data available.</p>'}

      <h2>Spending by Category</h2>
      ${categoryRows
        ? `<table>
            <thead><tr><th>Category</th><th>Total spent</th></tr></thead>
            <tbody>${categoryRows}</tbody>
          </table>`
        : '<p class="empty">No expenses recorded.</p>'}

      <h2>Transaction History</h2>
      ${transactionRows
        ? `<table>
            <thead><tr>
              <th>Date</th><th>Title</th><th>Category</th>
              <th>Type</th><th>Amount</th>
            </tr></thead>
            <tbody>${transactionRows}</tbody>
          </table>`
        : '<p class="empty">No transactions recorded.</p>'}

      <p class="footer">
        Generated by MaxLedger. Keep this report private because it contains
        financial information.
      </p>

      <button class="no-print" onclick="window.print()">
        Print / Save as PDF
      </button>
    </body>
    </html>
  `);

  reportWindow.document.close();
  reportWindow.focus();
}
