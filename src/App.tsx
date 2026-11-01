
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Wallet, TrendingUp, TrendingDown, Clock, Plus, Eye, EyeOff,
  LayoutDashboard, ArrowDownLeft, ArrowUpRight, Pencil, Trash2,
  Search, X
} from "lucide-react";

import { loadData, saveData } from "./services/storage";
import type { AppData, Transaction } from "./types";

const EMPTY_DATA: AppData = {
  transactions: [],
  pendingPayments: [],
  categories: [],
  accounts: []
};

type Filter = "all" | "income" | "expense";

export default function App() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    let active = true;

    loadData()
      .then(saved => {
        if (active) {
          setData(saved);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setStorageError("Unable to load saved data.");
          setLoaded(true);
        }
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;

    saveData(data).then(() => {
      setStorageError("");
    }).catch(() => {
      setStorageError("Unable to save data. Check device storage.");
    });
  }, [data, loaded]);

  const income = data.transactions
    .filter(item => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const expenses = data.transactions
    .filter(item => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const balance = income - expenses;

  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return data.transactions.filter(item => {
      const matchesFilter = filter === "all" || item.type === filter;
      const matchesSearch =
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [data.transactions, search, filter]);

  const money = (amount: number) =>
    balanceVisible
      ? `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
      : "₹••••••";

  function openAddForm() {
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(item: Transaction) {
    setEditingId(item.id);
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setShowForm(false);
  }

  function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const category = String(form.get("category") || "").trim();
    const amount = Number(form.get("amount"));
    const type = form.get("type") as "income" | "expense";
    const date = String(form.get("date") || "");

    if (
      !title ||
      !category ||
      !date ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) return;

    const now = Date.now();

    if (editingId) {
      setData(current => ({
        ...current,
        transactions: current.transactions.map(item =>
          item.id === editingId
            ? { ...item, title, category, amount, type, date, updatedAt: now }
            : item
        )
      }));
    } else {
      const transaction: Transaction = {
        id: crypto.randomUUID(),
        title,
        category,
        amount,
        type,
        date,
        createdAt: now,
        updatedAt: now
      };

      setData(current => ({
        ...current,
        transactions: [transaction, ...current.transactions]
      }));
    }

    closeForm();
  }

  function deleteTransaction(id: string) {
    if (!window.confirm("Delete this transaction permanently?")) return;

    setData(current => ({
      ...current,
      transactions: current.transactions.filter(item => item.id !== id)
    }));
  }

  const editingTransaction = data.transactions.find(
    item => item.id === editingId
  );

  if (!loaded) {
    return <main className="app-shell"><h2>Loading MaxLedger...</h2></main>;
  }

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

        <button className="icon-button"
          onClick={() => setBalanceVisible(value => !value)}
          aria-label="Toggle balance visibility">
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
          <div className="summary-icon income-icon"><TrendingUp /></div>
          <p>Total income</p>
          <h3>{money(income)}</h3>
        </article>

        <article className="summary-card">
          <div className="summary-icon expense-icon"><TrendingDown /></div>
          <p>Total expenses</p>
          <h3>{money(expenses)}</h3>
        </article>
      </section>

      <section className="section-heading">
        <div>
          <p>ACTIVITY</p>
          <h2>Transactions</h2>
        </div>
        <button className="add-button" onClick={openAddForm}>
          <Plus size={17} /> Add
        </button>
      </section>

      {storageError && <p role="alert">{storageError}</p>}

      {showForm && (
        <form className="transaction-form" onSubmit={saveTransaction}>
          <div className="form-heading">
            <h3>{editingId ? "Edit transaction" : "New transaction"}</h3>
            <button type="button" className="icon-button" onClick={closeForm}>
              <X size={18} />
            </button>
          </div>

          <label>Transaction name</label>
          <input name="title" placeholder="e.g. Event payment"
            defaultValue={editingTransaction?.title || ""}
            maxLength={100} required />

          <label>Category</label>
          <input name="category" placeholder="e.g. Freelance"
            defaultValue={editingTransaction?.category || ""}
            maxLength={50} required />

          <label>Amount (₹)</label>
          <input name="amount" type="number" min="0.01" step="0.01"
            placeholder="Enter amount"
            defaultValue={editingTransaction?.amount ?? ""}
            required />

          <label>Transaction type</label>
          <select name="type" defaultValue={editingTransaction?.type || "income"}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>

          <label>Date</label>
          <input name="date" type="date"
            defaultValue={editingTransaction?.date ||
              new Date().toISOString().slice(0, 10)}
            required />

          <button className="submit-button" type="submit">
            {editingId ? "Update transaction" : "Save transaction"}
          </button>
        </form>
      )}

      <div className="transaction-search">
        <Search size={18} />
        <input value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Search transactions..." />
      </div>

      <div className="filter-tabs">
        {(["all", "income", "expense"] as Filter[]).map(option => (
          <button key={option}
            className={filter === option ? "filter-active" : ""}
            onClick={() => setFilter(option)}>
            {option === "all" ? "All" :
              option === "income" ? "Income" : "Expenses"}
          </button>
        ))}
      </div>

      <section className="transactions">
        {visibleTransactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Clock /></div>
            <h3>No transactions found</h3>
            <p>Try another search or add a transaction.</p>
          </div>
        ) : (
          visibleTransactions.map(item => (
            <article className="transaction-row" key={item.id}>
              <div className={`transaction-icon ${item.type}`}>
                {item.type === "income" ? <ArrowDownLeft /> : <ArrowUpRight />}
              </div>

              <div className="transaction-info">
                <h3>{item.title}</h3>
                <p>{item.category} · {item.date}</p>
              </div>

              <strong className={item.type}>
                {item.type === "income" ? "+" : "-"}{money(item.amount)}
              </strong>

              <button className="row-action" aria-label="Edit transaction"
                onClick={() => openEditForm(item)}>
                <Pencil size={16} />
              </button>

              <button className="row-action delete-action"
                aria-label="Delete transaction"
                onClick={() => deleteTransaction(item.id)}>
                <Trash2 size={16} />
              </button>
            </article>
          ))
        )}
      </section>

      <nav className="bottom-nav">
        <div className="nav-item active"><LayoutDashboard /><span>Home</span></div>
        <div className="nav-item"><TrendingUp /><span>Income</span></div>
        <div className="nav-item"><TrendingDown /><span>Expenses</span></div>
        <div className="nav-item"><Clock /><span>Pending</span></div>
      </nav>
    </main>
  );
}

