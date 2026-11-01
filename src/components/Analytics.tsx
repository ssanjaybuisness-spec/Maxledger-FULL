import { useMemo } from "react";
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
  CartesianGrid
} from "recharts";
import type { Transaction } from "../types";

interface Props {
  transactions: Transaction[];
}

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

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function Analytics({ transactions }: Props) {
  const currentMonth = monthKey(new Date());

  const monthlyData = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - (5 - index));

      const key = monthKey(date);

      const monthTransactions = transactions.filter(
        item => item.date.slice(0, 7) === key
      );

      const income = monthTransactions
        .filter(item => item.type === "income")
        .reduce((sum, item) => sum + item.amount, 0);

      const expenses = monthTransactions
        .filter(item => item.type === "expense")
        .reduce((sum, item) => sum + item.amount, 0);

      return {
        month: date.toLocaleDateString("en-IN", {
          month: "short"
        }),
        income,
        expenses
      };
    });
  }, [transactions]);

  const currentTransactions = transactions.filter(
    item => item.date.slice(0, 7) === currentMonth
  );

  const totalIncome = currentTransactions
    .filter(item => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const totalExpenses = currentTransactions
    .filter(item => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const savings = totalIncome - totalExpenses;

  const savingsRate =
    totalIncome > 0
      ? (savings / totalIncome) * 100
      : 0;

  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};

    currentTransactions
      .filter(item => item.type === "expense")
      .forEach(item => {
        totals[item.category] =
          (totals[item.category] || 0) + item.amount;
      });

    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [currentTransactions]);

  const monthLabel = new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });

  return (
    <section className="analytics-page">
      <div className="welcome">
        <p>FINANCIAL INSIGHTS</p>
        <h2>Your analytics.</h2>
        <span>Understand where your money goes.</span>
      </div>

      <div className="analytics-month">
        <span>MONTHLY SUMMARY</span>
        <h3>{monthLabel}</h3>
      </div>

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

      <section className="analytics-panel">
        <div className="analytics-heading">
          <h3>Income vs expenses</h3>
          <p>Last 6 months</p>
        </div>

        {monthlyData.every(
          item => item.income === 0 && item.expenses === 0
        ) ? (
          <p className="analytics-empty">
            Add transactions to see your monthly trends.
          </p>
        ) : (
          <div className="analytics-chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#26352f"
                />
                <XAxis
                  dataKey="month"
                  stroke="#94a3a0"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  stroke="#94a3a0"
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => currency(Number(value))}
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
                />
                <Bar
                  dataKey="expenses"
                  name="Expenses"
                  fill="#fb7185"
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="analytics-panel">
        <div className="analytics-heading">
          <h3>Spending breakdown</h3>
          <p>By category · This month</p>
        </div>

        {categoryData.length === 0 ? (
          <p className="analytics-empty">
            No expenses recorded this month.
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
                    formatter={(value) => currency(Number(value))}
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
    </section>
  );
}
