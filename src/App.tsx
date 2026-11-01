
import { useState } from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Clock,
  Plus,
  Eye,
  EyeOff,
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight
} from "lucide-react";

type Transaction = {
  id: number;
  title: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  date: string;
};

export default function App() {
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(false);

  const income = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const expenses = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const balance = income - expenses;

  function addTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));

    if (!amount || amount <= 0) return;

    const transaction: Transaction = {
      id: Date.now(),
      title: String(form.get("title")),
      category: String(form.get("category")),
      amount,
      type: form.get("type") as "income" | "expense",
      date: new Date().toLocaleDateString("en-IN")
    };

    setTransactions((current) => [transaction, ...current]);
    setShowForm(false);
  }

  const money = (amount: number) =>
    balanceVisible
      ? `₹${amount.toLocaleString("en-IN")}`
      : "₹••••••";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><Wallet /></div>
          <div>
            <h1>MaxLedger</h1>
            <p>PERSONAL FINANCE</p>
          </div>
        </div>

        <button
          className="icon-button"
          onClick={() => setBalanceVisible(!balanceVisible)}
          aria-label="Toggle balance visibility"
        >
          {balanceVisible ? <Eye /> : <EyeOff />}
        </button>
      </header>

      <section className="welcome">
        <p>YOUR FINANCIAL OVERVIEW</p>
        <h2>Manage your money.</h2>
        <span>Every rupee, accounted for.</span>
      </section>

      <section className="balance-card">
        <div className="card-label">
          <span>Total balance</span>
          <Wallet size={19} />
        </div>
        <h2>{money(balance)}</h2>
        <span className="balance-note">Available balance</span>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <div className="summary-icon income-icon">
            <TrendingUp />
          </div>
          <p>Total income</p>
          <h3>{money(income)}</h3>
        </article>

        <article className="summary-card">
          <div className="summary-icon expense-icon">
            <TrendingDown />
          </div>
          <p>Total expenses</p>
          <h3>{money(expenses)}</h3>
        </article>
      </section>

      <section className="section-heading">
        <div>
          <p>ACTIVITY</p>
          <h2>Recent transactions</h2>
        </div>

        <button
          className="add-button"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={17} /> Add
        </button>
      </section>

      {showForm && (
        <form className="transaction-form" onSubmit={addTransaction}>
          <h3>New transaction</h3>

          <input
            name="title"
            placeholder="Transaction name"
            required
          />

          <input
            name="category"
            placeholder="Category"
            required
          />

          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount in ₹"
            required
          />

          <select name="type">
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>

          <button className="submit-button" type="submit">
            Save transaction
          </button>
        </form>
      )}

      <section className="transactions">
        {transactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Clock /></div>
            <h3>No transactions yet</h3>
            <p>Your financial activity will appear here.</p>
          </div>
        ) : (
          transactions.map((item) => (
            <article className="transaction-row" key={item.id}>
              <div className={`transaction-icon ${item.type}`}>
                {item.type === "income"
                  ? <ArrowDownLeft />
                  : <ArrowUpRight />}
              </div>

              <div className="transaction-info">
                <h3>{item.title}</h3>
                <p>{item.category} · {item.date}</p>
              </div>

              <strong className={item.type}>
                {item.type === "income" ? "+" : "-"}
                {money(item.amount)}
              </strong>
            </article>
          ))
        )}
      </section>

      <nav className="bottom-nav">
        <div className="nav-item active">
          <LayoutDashboard />
          <span>Home</span>
        </div>
        <div className="nav-item">
          <TrendingUp />
          <span>Income</span>
        </div>
        <div className="nav-item">
          <TrendingDown />
          <span>Expenses</span>
        </div>
        <div className="nav-item">
          <Clock />
          <span>Pending</span>
        </div>
      </nav>
    </main>
  );
}
