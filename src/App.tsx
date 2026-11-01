
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Wallet, TrendingUp, TrendingDown, Clock, Plus, Eye, EyeOff,
  LayoutDashboard, ArrowDownLeft, ArrowUpRight, Pencil, Trash2,
  Search, X
} from "lucide-react";

import { loadData, saveData } from "./services/storage";
import type {
  AppData,
  Transaction,
  PendingPayment,
  PaymentReceipt,
  TransactionType
} from "./types";
import PendingPayments from "./components/PendingPayments";

const EMPTY_DATA: AppData = {
  transactions: [],
  pendingPayments: [],
  categories: [],
  accounts: []
};

type Filter = "all" | "income" | "expense";
type Tab = "home" | "pending";

export default function App() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [storageError, setStorageError] = useState("");
  const [formType, setFormType] = useState<TransactionType>("income");
  const [selectedCategory, setSelectedCategory] = useState("");

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

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;

    saveData(data)
      .then(() => setStorageError(""))
      .catch(() => {
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

  const availableCategories = data.categories.filter(
    category => category.type === formType
  );

  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return data.transactions.filter(item => {
      const matchesFilter =
        filter === "all" || item.type === filter;

      const matchesSearch =
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [data.transactions, search, filter]);

  const money = (amount: number) =>
    balanceVisible
      ? `₹${amount.toLocaleString("en-IN", {
          maximumFractionDigits: 2
        })}`
      : "₹••••••";

  function openAddForm() {
    const firstCategory =
      data.categories.find(category => category.type === "income");

    setEditingId(null);
    setFormType("income");
    setSelectedCategory(firstCategory?.name || "");
    setShowForm(true);
  }

  function openEditForm(item: Transaction) {
    setEditingId(item.id);
    setFormType(item.type);
    setSelectedCategory(item.category);
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setShowForm(false);
  }

  function changeFormType(type: TransactionType) {
    setFormType(type);

    const firstCategory = data.categories.find(
      category => category.type === type
    );

    setSelectedCategory(firstCategory?.name || "");
  }

  function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const category = String(form.get("category") || "").trim();
    const amount = Number(form.get("amount"));
    const type = form.get("type") as TransactionType;
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
            ? {
                ...item,
                title,
                category,
                amount,
                type,
                date,
                updatedAt: now
              }
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
      transactions: current.transactions.filter(
        item => item.id !== id
      )
    }));
  }

  function handlePendingChange(payments: PendingPayment[]) {
    setData(current => ({
      ...current,
      pendingPayments: payments
    }));
  }

  function handleReceive(
    paymentId: string,
    receipt: PaymentReceipt
  ) {
    setData(current => {
      const payment = current.pendingPayments.find(
        item => item.id === paymentId
      );

      if (!payment) return current;

      const alreadyReceived = payment.receipts.reduce(
        (sum, item) => sum + item.amount,
        0
      );

      const remaining = payment.expectedAmount - alreadyReceived;

      if (
        !Number.isFinite(receipt.amount) ||
        receipt.amount <= 0 ||
        receipt.amount > remaining
      ) {
        return current;
      }

      const updatedPayment = {
        ...payment,
        receipts: [...payment.receipts, receipt],
        updatedAt: Date.now()
      };

      const now = Date.now();

      const incomeTransaction: Transaction = {
        id: crypto.randomUUID(),
        title: `Payment received - ${payment.customerName}`,
        category: "Pending payment",
        amount: receipt.amount,
        type: "income",
        date: receipt.receivedDate,
        notes: receipt.notes,
        createdAt: now,
        updatedAt: now
      };

      return {
        ...current,
        pendingPayments: current.pendingPayments.map(item =>
          item.id === paymentId ? updatedPayment : item
        ),
        transactions: [
          incomeTransaction,
          ...current.transactions
        ]
      };
    });
  }

  const editingTransaction = data.transactions.find(
    item => item.id === editingId
  );

  if (!loaded) {
    return (
      <main className="app-shell">
        <h2>Loading MaxLedger...</h2>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Wallet />
          </div>
          <div>
            <h1>MaxLedger</h1>
            <p>PERSONAL FINANCE</p>
          </div>
        </div>

        <button
          className="icon-button"
          onClick={() => setBalanceVisible(value => !value)}
          aria-label="Toggle balance visibility"
        >
          {balanceVisible ? <Eye /> : <EyeOff />}
        </button>
      </header>

      {storageError && <p role="alert">{storageError}</p>}

      {activeTab === "home" && (
        <>
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
              <h2>Transactions</h2>
            </div>

            <button className="add-button" onClick={openAddForm}>
              <Plus size={17} /> Add
            </button>
          </section>

          {showForm && (
            <form
              className="transaction-form"
              onSubmit={saveTransaction}
            >
              <div className="form-heading">
                <h3>
                  {editingId ? "Edit transaction" : "New transaction"}
                </h3>

                <button
                  type="button"
                  className="icon-button"
                  onClick={closeForm}
                >
                  <X size={18} />
                </button>
              </div>

              <label>Transaction name</label>
              <input
                name="title"
                placeholder="e.g. Event payment"
                defaultValue={editingTransaction?.title || ""}
                maxLength={100}
                required
              />

              <label>Transaction type</label>
              <select
                name="type"
                value={formType}
                onChange={event =>
                  changeFormType(event.target.value as TransactionType)
                }
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>

              <label>Category</label>
              <select
                name="category"
                value={selectedCategory}
                onChange={event => setSelectedCategory(event.target.value)}
                required
              >
                {editingTransaction &&
                  !availableCategories.some(
                    category => category.name === editingTransaction.category
                  ) && (
                    <option value={editingTransaction.category}>
                      {editingTransaction.category}
                    </option>
                  )}

                {availableCategories.map(category => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>

              <label>Amount (₹)</label>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Enter amount"
                defaultValue={editingTransaction?.amount ?? ""}
                required
              />

              <label>Date</label>
              <input
                name="date"
                type="date"
                defaultValue={
                  editingTransaction?.date ||
                  new Date().toISOString().slice(0, 10)
                }
                required
              />

              <button className="submit-button" type="submit">
                {editingId ? "Update transaction" : "Save transaction"}
              </button>
            </form>
          )}

          <div className="transaction-search">
            <Search size={18} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search transactions..."
            />
          </div>

          <div className="filter-tabs">
            {(["all", "income", "expense"] as Filter[]).map(option => (
              <button
                key={option}
                className={filter === option ? "filter-active" : ""}
                onClick={() => setFilter(option)}
              >
                {option === "all"
                  ? "All"
                  : option === "income"
                    ? "Income"
                    : "Expenses"}
              </button>
            ))}
          </div>

          <section className="transactions">
            {visibleTransactions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Clock />
                </div>
                <h3>No transactions found</h3>
                <p>Try another search or add a transaction.</p>
              </div>
            ) : (
              visibleTransactions.map(item => (
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

                  <button
                    className="row-action"
                    aria-label="Edit transaction"
                    onClick={() => openEditForm(item)}
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    className="row-action delete-action"
                    aria-label="Delete transaction"
                    onClick={() => deleteTransaction(item.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))
            )}
          </section>
        </>
      )}

      {activeTab === "pending" && (
        <section className="pending-page">
          <section className="welcome">
            <p>PAYMENT TRACKER</p>
            <h2>Pending payments.</h2>
            <span>Track what you are waiting to receive.</span>
          </section>

          <PendingPayments
            payments={data.pendingPayments}
            onChange={handlePendingChange}
            onReceive={handleReceive}
          />
        </section>
      )}

      <nav className="bottom-nav">
        <button
          type="button"
          className={`nav-item ${activeTab === "home" ? "active" : ""}`}
          onClick={() => setActiveTab("home")}
        >
          <LayoutDashboard />
          <span>Home</span>
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => {
            setActiveTab("home");
            setFilter("income");
          }}
        >
          <TrendingUp />
          <span>Income</span>
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => {
            setActiveTab("home");
            setFilter("expense");
          }}
        >
          <TrendingDown />
          <span>Expenses</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          <Clock />
          <span>Pending</span>
        </button>
      </nav>
    </main>
  );
}
