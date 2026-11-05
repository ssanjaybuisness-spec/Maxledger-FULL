import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  LabelList
} from "recharts";
import type { Transaction } from "../types";
import { printPeriodFinancialReport } from "../services/report";

interface Props {
  transactions: Transaction[];
  onExportCSV: () => void;
  onDownloadPDF: () => void;
  onBackup: () => void;
  onRestore: () => void;
}

type ReportMode = "monthly" | "yearly" | "custom";

const COLORS = [
  "#34d399",
  "#60a5fa",
  "#a78bfa",
  "#fbbf24",
  "#fb923c",
  "#f472b6",
  "#38bdf8",
  "#c084fc"
];

const currency = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0
  })}`;

const compactCurrency = (amount: number) => {
  if (amount >= 10000000) return `₹${+(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${+(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${+(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
};


const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const currentDate = new Date();

export default function Analytics({
  transactions,
  onExportCSV,
  onDownloadPDF,
  onBackup,
  onRestore
}: Props) {
  const [mode, setMode] = useState<ReportMode>("monthly");

  const [selectedMonth, setSelectedMonth] = useState(
    monthKey(currentDate)
  );

  const [selectedYear, setSelectedYear] = useState(
    String(currentDate.getFullYear())
  );

  const [startDate, setStartDate] = useState(
    `${currentDate.getFullYear()}-01-01`
  );

  const [endDate, setEndDate] = useState(
    currentDate.toISOString().slice(0, 10)
  );

  const years = useMemo(() => {
    const available = transactions
      .map(item => Number(item.date.slice(0, 4)))
      .filter(year => Number.isFinite(year) && year > 0);

    const allYears = [
      currentDate.getFullYear(),
      ...available
    ];

    return [...new Set(allYears)].sort((a, b) => b - a);
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(item => {
      if (mode === "monthly") {
        return item.date.slice(0, 7) === selectedMonth;
      }

      if (mode === "yearly") {
        return item.date.slice(0, 4) === selectedYear;
      }

      return (
        startDate &&
        endDate &&
        startDate <= endDate &&
        item.date >= startDate &&
        item.date <= endDate
      );
    });
  }, [
    transactions,
    mode,
    selectedMonth,
    selectedYear,
    startDate,
    endDate
  ]);

  const totalIncome = filteredTransactions
    .filter(item => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const totalExpenses = filteredTransactions
    .filter(item => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const savings = totalIncome - totalExpenses;

  const savingsRate = totalIncome > 0
    ? (savings / totalIncome) * 100
    : 0;

  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};

    filteredTransactions
      .filter(item => item.type === "expense")
      .forEach(item => {
        totals[item.category] =
          (totals[item.category] || 0) + item.amount;
      });

    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const trendData = useMemo(() => {
    if (mode === "yearly") {
      return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(Number(selectedYear), index, 1);
        const key = monthKey(date);

        const monthTransactions = transactions.filter(
          item => item.date.slice(0, 7) === key
        );

        return {
          month: date.toLocaleDateString("en-IN", {
            month: "short"
          }),
          income: monthTransactions
            .filter(item => item.type === "income")
            .reduce((sum, item) => sum + item.amount, 0),
          expenses: monthTransactions
            .filter(item => item.type === "expense")
            .reduce((sum, item) => sum + item.amount, 0)
        };
      });
    }

    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - (5 - index));

      const key = monthKey(date);

      const monthTransactions = transactions.filter(
        item => item.date.slice(0, 7) === key
      );

      return {
        month: date.toLocaleDateString("en-IN", {
          month: "short",
          year: "2-digit"
        }),
        income: monthTransactions
          .filter(item => item.type === "income")
          .reduce((sum, item) => sum + item.amount, 0),
        expenses: monthTransactions
          .filter(item => item.type === "expense")
          .reduce((sum, item) => sum + item.amount, 0)
      };
    });
  }, [transactions, mode, selectedYear]);

  const periodLabel = useMemo(() => {
    if (mode === "monthly") {
      const [year, month] = selectedMonth.split("-").map(Number);

      return new Date(year, month - 1, 1)
        .toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric"
        });
    }

    if (mode === "yearly") {
      return selectedYear;
    }

    return startDate && endDate
      ? `${startDate} to ${endDate}`
      : "Select date range";
  }, [mode, selectedMonth, selectedYear, startDate, endDate]);

  const invalidRange =
    mode === "custom" &&
    (!startDate || !endDate || startDate > endDate);

  const yearlyIncome = useMemo(
    () =>
      transactions
        .filter(
          item =>
            item.type === "income" &&
            item.date.startsWith(selectedYear)
        )
        .reduce((sum, item) => sum + item.amount, 0),
    [transactions, selectedYear]
  );

  const yearlyExpenses = useMemo(
    () =>
      transactions
        .filter(
          item =>
            item.type === "expense" &&
            item.date.startsWith(selectedYear)
        )
        .reduce((sum, item) => sum + item.amount, 0),
    [transactions, selectedYear]
  );

  const exportPDF = () => {
    printPeriodFinancialReport(filteredTransactions, periodLabel);
  };

  return (
    <section className="analytics-page">
      <div className="welcome">
        <p>FINANCIAL INSIGHTS</p>
        <h2>Your analytics.</h2>
        <span>Understand where your money goes.</span>
      </div>

      <section className="analytics-panel">
        <div className="analytics-heading">
          <h3>Report period</h3>
          <p>Choose what you want to analyse</p>
        </div>

        <div className="filter-tabs">
          <button
            className={mode === "monthly" ? "filter-active" : ""}
            onClick={() => setMode("monthly")}
          >
            Monthly
          </button>

          <button
            className={mode === "yearly" ? "filter-active" : ""}
            onClick={() => setMode("yearly")}
          >
            Yearly
          </button>

          <button
            className={mode === "custom" ? "filter-active" : ""}
            onClick={() => setMode("custom")}
          >
            Custom
          </button>
        </div>

        {mode === "monthly" && (
          <label className="analytics-date-control">
            Select month
            <input
              type="month"
              value={selectedMonth}
              onChange={event => setSelectedMonth(event.target.value)}
            />
          </label>
        )}

        {mode === "yearly" && (
          <label className="analytics-date-control">
            Select year
            <select
              value={selectedYear}
              onChange={event => setSelectedYear(event.target.value)}
            >
              {years.map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === "custom" && (
          <div className="analytics-custom-range">
            <label>
              From
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={event => setStartDate(event.target.value)}
              />
            </label>

            <label>
              To
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={event => setEndDate(event.target.value)}
              />
            </label>
          </div>
        )}
      </section>

      {invalidRange ? (
        <p className="analytics-empty">
          Please select a valid date range.
        </p>
      ) : (
        <>
          <div className="analytics-month">
            <span>FINANCIAL SUMMARY</span>
            <h3>{periodLabel}</h3>
          </div>

          <button
            type="button"
            onClick={exportPDF}
            style={{
              width: "100%",
              padding: "13px",
              marginBottom: "18px",
              borderRadius: "10px",
              border: "1px solid #34d399",
              background: "#173b2d",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            ↓ Export PDF Report
          </button>

          <div className="analytics-summary">
            <article className="analytics-card">
              <span>Total income</span>
              <h3 className="income">{currency(totalIncome)}</h3>
            </article>

            <article className="analytics-card">
              <span>Total expenses</span>
              <h3 className="expense">{currency(totalExpenses)}</h3>
            </article>

            <article className="analytics-card">
              <span>Net savings</span>
              <h3>{currency(savings)}</h3>
            </article>

            <article className="analytics-card">
              <span>Savings rate</span>
              <h3>{savingsRate.toFixed(1)}%</h3>
            </article>
          </div>

          {mode === "yearly" && (
            <section className="analytics-panel">
              <div className="analytics-heading">
                <h3>Yearly summary</h3>
                <p>{selectedYear}</p>
              </div>

              <div className="analytics-summary">
                <article className="analytics-card">
                  <span>Yearly income</span>
                  <h3 className="income">{currency(yearlyIncome)}</h3>
                </article>

                <article className="analytics-card">
                  <span>Yearly expenses</span>
                  <h3 className="expense">{currency(yearlyExpenses)}</h3>
                </article>

                <article className="analytics-card">
                  <span>Yearly net savings</span>
                  <h3>{currency(yearlyIncome - yearlyExpenses)}</h3>
                </article>
              </div>
            </section>
          )}

          <section className="analytics-panel">
            <div className="analytics-heading">
              <h3>Income vs expenses</h3>
              <p>
                {mode === "yearly"
                  ? `Monthly trend · ${selectedYear}`
                  : "Last 6 months"}
              </p>
            </div>

            {trendData.every(
              item => item.income === 0 && item.expenses === 0
            ) ? (
              <p className="analytics-empty">
                Add transactions to see your monthly trends.
              </p>
            ) : (
              <div className="analytics-chart">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trendData} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#26352f"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="#94a3a0"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#94a3a0"
                      tick={{ fontSize: 11 }}
                      width={56}tickFormatter={(value: number) => compactCurrency(value)}
                    />
                    <Tooltip
                      formatter={value => currency(Number(value))}
                      contentStyle={{
                        background: "#111c17",
                        border: "1px solid #26352f",
                        borderRadius: 10
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="income"
                      name="Income"
                      fill="#34d399"
                     radius={[5, 5, 0, 0]}
                       >
                     <LabelList
                      dataKey="income"
                     position="top"
                     fill="#34d399"
                     fontSize={10}
                     formatter={(value: unknown) =>
                      mode === "yearly" || Number(value) <= 0
                      ? ""
        : compactCurrency(Number(value))
    }
  />
</Bar>
<Bar
  dataKey="expenses"
  name="Expenses"
  fill="#fb7185"
  radius={[5, 5, 0, 0]}
>
  <LabelList
    dataKey="expenses"
    position="top"
    fill="#fb7185"
    fontSize={10}
    formatter={(value: unknown) =>
      mode === "yearly" || Number(value) <= 0
        ? ""
        : compactCurrency(Number(value))
    }
  />
</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="analytics-panel">
            <div className="analytics-heading">
              <h3>Spending breakdown</h3>
              <p>By category · {periodLabel}</p>
            </div>

            {categoryData.length === 0 ? (
              <p className="analytics-empty">
                No expenses recorded for this period.
              </p>
            ) : (
              <>
                <div className="analytics-chart">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={52}
                        paddingAngle={3}
                      >
                        {categoryData.map((item, index) => (
                          <Cell
                            key={item.name}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>

                      <Tooltip
                        formatter={value => currency(Number(value))}
                        contentStyle={{
                          background: "#111c17",
                          border: "1px solid #26352f",
                          borderRadius: 10
                        }}
                      />

                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="analytics-category-list">
                  {categoryData.map((item, index) => (
                    <div
                      className="analytics-category-row"
                      key={item.name}
                    >
                      <span
                        className="analytics-dot"
                        style={{
                          background: COLORS[index % COLORS.length]
                        }}
                      />
                      <span>{item.name}</span>
                      <strong>{currency(item.value)}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}

      <section className="export-panel">
        <div>
          <h3>Data & reports</h3>
          <p>Export, download or protect your ledger data.</p>
        </div>

        <button
          type="button"
          className="add-button"
          onClick={onExportCSV}
          disabled={transactions.length === 0}
        >
          ↓ Export CSV
        </button>

        <button
          type="button"
          className="add-button"
          onClick={onDownloadPDF}
        >
          ↓ Download PDF
        </button>

        <button
          type="button"
          className="add-button"
          onClick={onBackup}
        >
          ↓ Backup data
        </button>

        <button
          type="button"
          className="add-button"
          onClick={onRestore}
        >
          ↑ Restore backup
        </button>
      </section>
    </section>
  );
}
