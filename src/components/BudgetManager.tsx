
import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, Wallet, AlertTriangle, CalendarDays } from "lucide-react";
import type { Budget, Category, Transaction } from "../types";

export type { Budget } from "../types";

interface Props {
  budgets: Budget[];
  categories: Category[];
  transactions: Transaction[];
  onChange: (budgets: Budget[]) => void;
}

const currency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function BudgetManager({
  budgets,
  categories,
  transactions,
  onChange
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [category, setCategory] = useState("Overall");
  const [amount, setAmount] = useState("");

  const monthlyBudgets = budgets.filter(
    item => (item.month || getCurrentMonth()) === selectedMonth
  );

  const spending = useMemo(() => {
    const result: Record<string, number> = {};

    transactions
      .filter(
        transaction =>
          transaction.type === "expense" &&
          transaction.date.slice(0, 7) === selectedMonth
      )
      .forEach(transaction => {
        result[transaction.category] =
          (result[transaction.category] || 0) + transaction.amount;
      });

    return result;
  }, [transactions, selectedMonth]);

  const totalSpent = Object.values(spending).reduce(
    (sum, value) => sum + value,
    0
  );

  function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      window.alert("Enter a valid budget amount.");
      return;
    }

    const existing = budgets.find(
      item =>
        item.category === category &&
        (item.month || getCurrentMonth()) === selectedMonth
    );

    if (existing) {
      onChange(
        budgets.map(item =>
          item.id === existing.id
            ? { ...item, amount: value, month: selectedMonth }
            : item
        )
      );
    } else {
      onChange([
        ...budgets,
        {
          id: crypto.randomUUID(),
          category,
          amount: value,
          month: selectedMonth
        }
      ]);
    }

    setAmount("");
  }

  function removeBudget(id: string) {
    if (window.confirm("Remove this budget?")) {
      onChange(budgets.filter(item => item.id !== id));
    }
  }

  function getSpent(name: string) {
    return name === "Overall" ? totalSpent : spending[name] || 0;
  }

  const monthLabel = new Date(
    Number(selectedMonth.slice(0, 4)),
    Number(selectedMonth.slice(5, 7)) - 1
  ).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });

  return (
    <section className="budget-page">
      <div className="section-heading">
        <div>
          <p>SPENDING CONTROL</p>
          <h2>Monthly budgets</h2>
        </div>
      </div>

      <div className="budget-month-picker">
        <CalendarDays size={20} />
        <div>
          <label htmlFor="budget-month">Select month</label>
          <input
            id="budget-month"
            type="month"
            value={selectedMonth}
            onChange={event => setSelectedMonth(event.target.value)}
          />
        </div>
      </div>

      <div className="pending-summary">
        <div>
          <span>Total spending · {monthLabel}</span>
          <h2>{currency(totalSpent)}</h2>
        </div>
        <Wallet size={28} />
      </div>

      <form className="transaction-form" onSubmit={saveBudget}>
        <h3>Set a budget</h3>

        <label>Budget category</label>
        <select
          value={category}
          onChange={event => setCategory(event.target.value)}
        >
          <option value="Overall">Overall monthly budget</option>
          {categories
            .filter(item => item.type === "expense")
            .map(item => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
        </select>

        <label>Budget amount (₹)</label>
        <input
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={event => setAmount(event.target.value)}
          placeholder="Enter amount"
          required
        />

        <button className="submit-button" type="submit">
          <Plus size={17} />
          Save budget
        </button>
      </form>

      <div className="budget-list">
        <h3>Budgets for {monthLabel}</h3>

        {monthlyBudgets.length === 0 ? (
          <div className="empty-state">
            <Wallet />
            <h3>No budgets for this month</h3>
            <p>Create a budget above to start tracking.</p>
          </div>
        ) : (
          monthlyBudgets.map(item => {
            const spent = getSpent(item.category);
            const percentage = (spent / item.amount) * 100;
            const remaining = item.amount - spent;
            const exceeded = remaining < 0;

            return (
              <article className="pending-card" key={item.id}>
                <div className="pending-heading">
                  <div>
                    <h3>{item.category}</h3>
                    <p>
                      {currency(spent)} spent of {currency(item.amount)}
                    </p>
                  </div>

                  <button
                    className="row-action delete-action"
                    onClick={() => removeBudget(item.id)}
                    aria-label="Remove budget"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="budget-progress">
                  <div
                    className="budget-progress-fill"
                    style={{
                      width: `${Math.min(percentage, 100)}%`
                    }}
                  />
                </div>

                <div className="pending-amounts">
                  <span>{Math.round(percentage)}% used</span>
                  <strong>
                    {exceeded
                      ? `${currency(Math.abs(remaining))} over budget`
                      : `${currency(remaining)} remaining`}
                  </strong>
                </div>

                {percentage >= 80 && (
                  <p className="budget-warning">
                    <AlertTriangle size={15} />
                    {exceeded
                      ? "Budget exceeded!"
                      : "You've used at least 80% of this budget."}
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
