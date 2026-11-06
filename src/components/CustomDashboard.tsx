
import { useEffect, useState } from "react";
import {
  Settings2,
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Wallet,
  TrendingUp,
  TrendingDown,
  Clock3,
  CircleDollarSign
} from "lucide-react";
import type { Transaction, PendingPayment } from "../types";

type WidgetId = "balance" | "recent" | "pending";
type WidgetSize = "compact" | "expanded";

interface Props {
  balance: number;
  income: number;
  expenses: number;
  transactions: Transaction[];
  pendingPayments: PendingPayment[];
  money: (amount: number) => string;
}

interface Preferences {
  order: WidgetId[];
  visible: Record<WidgetId, boolean>;
  sizes: Record<WidgetId, WidgetSize>;
}

const DEFAULTS: Preferences = {
  order: ["balance", "recent", "pending"],
  visible: {
    balance: true,
    recent: true,
    pending: true
  },
  sizes: {
    balance: "compact",
    recent: "expanded",
    pending: "compact"
  }
};

const STORAGE_KEY = "maxledger_dashboard_preferences_v1";

const LABELS: Record<WidgetId, string> = {
  balance: "Balance overview",
  recent: "Recent transactions",
  pending: "Pending payments"
};

export default function CustomDashboard({
  balance,
  income,
  expenses,
  transactions,
  pendingPayments,
  money
}: Props) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [dragged, setDragged] = useState<WidgetId | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved) as Preferences;
        const validIds: WidgetId[] = ["balance", "recent", "pending"];

        const savedOrder = Array.isArray(parsed.order)
          ? parsed.order.filter(
              (id): id is WidgetId => validIds.includes(id)
            )
          : DEFAULTS.order;

        setPreferences({
          order: [
            ...savedOrder,
            ...validIds.filter(id => !savedOrder.includes(id))
          ],
          visible: { ...DEFAULTS.visible, ...parsed.visible },
          sizes: { ...DEFAULTS.sizes, ...parsed.sizes }
        });
      }
    } catch {
      setPreferences(DEFAULTS);
    }
  }, []);

  function update(next: Preferences) {
    setPreferences(next);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep preferences active for this session.
    }
  }

  function toggleVisibility(id: WidgetId) {
    update({
      ...preferences,
      visible: {
        ...preferences.visible,
        [id]: !preferences.visible[id]
      }
    });
  }

  function toggleSize(id: WidgetId) {
    update({
      ...preferences,
      sizes: {
        ...preferences.sizes,
        [id]:
          preferences.sizes[id] === "compact"
            ? "expanded"
            : "compact"
      }
    });
  }

  function moveWidget(target: WidgetId) {
    if (!dragged || dragged === target) return;

    const order = [...preferences.order];
    const from = order.indexOf(dragged);
    const to = order.indexOf(target);

    if (from < 0 || to < 0) return;

    order.splice(from, 1);
    order.splice(to, 0, dragged);

    update({ ...preferences, order });
    setDragged(null);
  }

  function reset() {
    update({
      order: [...DEFAULTS.order],
      visible: { ...DEFAULTS.visible },
      sizes: { ...DEFAULTS.sizes }
    });
  }

    const activePayments = pendingPayments.filter(payment => {
    if (payment.status === "cancelled") return false;

    const received = payment.receipts.reduce(
      (sum, receipt) => sum + receipt.amount,
      0
    );

    return payment.expectedAmount - received > 0.009;
  });

  const outstanding = activePayments.reduce((total, payment) => {
    const received = payment.receipts.reduce(
      (sum, receipt) => sum + receipt.amount,
      0
    );

    return total + Math.max(0, payment.expectedAmount - received);
  }, 0);

  const recent = [...transactions]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  function renderWidget(id: WidgetId) {
    if (!preferences.visible[id]) return null;

    const size = preferences.sizes[id];

    return (
      <section
        key={id}
        className={`premium-dashboard-widget premium-widget-${id} ${size}`}
        draggable={editing}
        onDragStart={() => setDragged(id)}
        onDragOver={event => event.preventDefault()}
        onDrop={() => moveWidget(id)}
        onDragEnd={() => setDragged(null)}
      >
        {editing && (
          <div className="premium-widget-edit-bar">
            <GripVertical size={15} />
            <span>Drag to reorder</span>
            <button
              type="button"
              onClick={() => toggleSize(id)}
            >
              {size === "compact" ? "Expand" : "Compact"}
            </button>
          </div>
        )}

        {id === "balance" && (
          <div className="premium-balance-card">
            <div className="premium-balance-top">
              <div className="premium-balance-label">
                <span className="premium-icon-box">
                  <Wallet size={19} />
                </span>
                <div>
                  <span className="premium-label">TOTAL BALANCE</span>
                  <span className="premium-caption">Your financial overview</span>
                </div>
              </div>

              <span className="premium-live-dot" />
            </div>

            <h2 className="premium-balance-amount">
              {money(balance)}
            </h2>

            <div className="premium-balance-divider" />

            <div className="premium-balance-stats">
              <div className="premium-stat">
                <span className="premium-stat-icon income">
                  <TrendingUp size={15} />
                </span>
                <div>
                  <span className="premium-stat-label">Income</span>
                  <strong>{money(income)}</strong>
                </div>
              </div>

              <div className="premium-stat">
                <span className="premium-stat-icon expense">
                  <TrendingDown size={15} />
                </span>
                <div>
                  <span className="premium-stat-label">Expenses</span>
                  <strong>{money(expenses)}</strong>
                </div>
              </div>
            </div>

            {size === "expanded" && (
              <div className="premium-balance-extra">
                <span>Available balance</span>
                <strong>{money(balance)}</strong>
              </div>
            )}
          </div>
        )}

        {id === "recent" && (
          <div className="premium-widget-content">
            <div className="premium-section-header">
              <div>
                <span className="premium-label">ACTIVITY</span>
                <h3>Recent transactions</h3>
              </div>
              <span className="premium-count">{recent.length}</span>
            </div>

            {recent.length === 0 ? (
              <div className="premium-empty-state">
                <CircleDollarSign size={25} />
                <p>No transactions yet</p>
                <span>Your activity will appear here.</span>
              </div>
            ) : (
              <div className="premium-transaction-list">
                {recent.slice(0, size === "compact" ? 3 : 5).map(item => (
                  <div className="premium-transaction-row" key={item.id}>
                    <div className={`premium-transaction-symbol ${item.type}`}>
                      {item.type === "income"
                        ? <ArrowDownLeft size={19} />
                        : <ArrowUpRight size={19} />}
                    </div>

                    <div className="premium-transaction-details">
                      <strong>{item.title}</strong>
                      <span>{item.category} · {item.date}</span>
                    </div>

                    <div className={`premium-transaction-amount ${item.type}`}>
                      <strong>
                        {item.type === "income" ? "+" : "−"}
                        {money(item.amount)}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {id === "pending" && (
          <div className="premium-widget-content">
            <div className="premium-section-header">
              <div>
                <span className="premium-label">TO BE COLLECTED</span>
                <h3>Pending payments</h3>
              </div>
              <span className="premium-pending-icon">
                <Clock3 size={18} />
              </span>
            </div>

            <h2 className="premium-pending-amount">
              {money(outstanding)}
            </h2>

            <div className="premium-pending-meta">
              <span className="premium-pending-dot" />
              {activePayments.length} active payment
              {activePayments.length === 1 ? "" : "s"}
            </div>

            {size === "expanded" && (
              <div className="premium-pending-list">
                {activePayments.length === 0 ? (
                  <p className="premium-muted">No pending payments.</p>
                ) : (
                  activePayments.slice(0, 5).map(payment => {
                    const received = payment.receipts.reduce(
                      (sum, receipt) => sum + receipt.amount,
                      0
                    );

                    return (
                      <div
                        className="premium-pending-row"
                        key={payment.id}
                      >
                        <span>{payment.customerName}</span>
                        <strong>
                          {money(Math.max(
                            0,
                            payment.expectedAmount - received
                          ))}
                        </strong>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="custom-dashboard premium-dashboard">
      <div className="premium-dashboard-heading">
        <div>
          <span className="premium-label">YOUR FINANCES</span>
          <h2>Dashboard</h2>
          <p className="premium-dashboard-subtitle">
            A clear view of your money.
          </p>
        </div>

        <button
          type="button"
          className={`premium-customise-button ${editing ? "active" : ""}`}
          onClick={() => setEditing(value => !value)}
        >
          <Settings2 size={17} />
          {editing ? "Done" : "Customise"}
        </button>
      </div>

      {editing && (
        <div className="premium-dashboard-editor">
          <div className="premium-editor-heading">
            <div>
              <h3>Personalise dashboard</h3>
              <p>Manage widget visibility and size.</p>
            </div>

            <button type="button" onClick={reset}>
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          {preferences.order.map(id => (
            <div className="premium-editor-row" key={id}>
              <GripVertical size={16} />
              <span>{LABELS[id]}</span>

              <button
                type="button"
                onClick={() => toggleVisibility(id)}
                aria-label={`Toggle ${LABELS[id]}`}
              >
                {preferences.visible[id]
                  ? <Eye size={18} />
                  : <EyeOff size={18} />}
              </button>

              <button
                type="button"
                onClick={() => toggleSize(id)}
                aria-label={`Change ${LABELS[id]} size`}
              >
                <ChevronDown size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="premium-dashboard-grid">
        {preferences.order.map(renderWidget)}
      </div>
    </div>
  );
}
