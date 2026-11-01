
import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, Wallet, AlertTriangle } from "lucide-react";
import type { Category, Transaction } from "../types";

export interface Budget {
  id: string;
  category: string;
  amount: number;
}

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

export default function BudgetManager({
  budgets,
  categories,
  transactions,
  onChange
}: Props) {
  const [category, setCategory] = useState("Overall");
  const [amount, setAmount] = useState("");

  const month = new Date().toISOString().slice(0, 7);

  const spending = useMemo(() => {
    const result: Record<string, number> = {};

    transactions
      .filter(
        transaction =>
          transaction.type === "expense" &&
          transaction.date.slice(0, 7) === month
      )
      .forEach(transaction => {
        result[transaction.category] =
          (result[transaction.category] || 0) + transaction.amount;
      });

    return result;
  }, [transactions, month]);

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

    const existing = budgets.find(item => item.category === category);

    if (existing) {
      onChange(
        budgets.map(item =>
          item.category === category ? { ...item, amount: value } : item
        )
      );
    } else {
      onChange([
        ...budgets,
        {
          id: crypto.randomUUID(),
          category,
          amount: value
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

  return (
    <section className="budget-page">
      <div className="section-heading">
        <div>
          <p>SPENDING CONTROL</p>
          <h2>Monthly budgets</h2>
        </div>
      </div>

      <div className="pending-summary">
        <div>
          <span>Total spent this month</span>
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
        <h3>Your budgets</h3>

        {budgets.length === 0 ? (
          <div className="empty-state">
            <Wallet />
            <h3>No budgets set</h3>
            <p>Create your first monthly budget above.</p>
          </div>
        ) : (
          budgets.map(item => {
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

                {(percentage >= 80 || exceeded) && (
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
