
import { useEffect, useState } from "react";
import {
  Settings2, GripVertical, Eye, EyeOff, RotateCcw,
  ArrowDownLeft, ArrowUpRight, ChevronDown
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
      // Preferences remain active for this session if storage is unavailable.
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
        [id]: preferences.sizes[id] === "compact"
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

  const outstanding = pendingPayments
    .filter(
      payment =>
        payment.status !== "paid" &&
        payment.status !== "cancelled"
    )
    .reduce((total, payment) => {
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
        className={`custom-widget ${size}`}
        draggable={editing}
        onDragStart={() => setDragged(id)}
        onDragOver={event => event.preventDefault()}
        onDrop={() => moveWidget(id)}
        onDragEnd={() => setDragged(null)}
      >
        <div className="custom-widget-heading">
          <div className="custom-widget-title">
            {editing && <GripVertical size={16} />}
            <h3>{LABELS[id]}</h3>
          </div>

          {editing && (
            <button
              className="widget-size-button"
              onClick={() => toggleSize(id)}
              type="button"
            >
              {size === "compact" ? "Expand" : "Compact"}
            </button>
          )}
        </div>

        {id === "balance" && (
          <>
            <h2 className="custom-balance">{money(balance)}</h2>

            {size === "expanded" && (
              <div className="custom-balance-details">
                <div>
                  <span>Total income</span>
                  <strong>{money(income)}</strong>
                </div>
                <div>
                  <span>Total expenses</span>
                  <strong>{money(expenses)}</strong>
                </div>
              </div>
            )}
          </>
        )}

        {id === "recent" && (
          <div className="custom-recent-list">
            {recent.length === 0 ? (
              <p className="custom-muted">No transactions yet.</p>
            ) : (
              recent.slice(0, size === "compact" ? 3 : 5).map(item => (
                <div className="custom-recent-row" key={item.id}>
                  <div className={`custom-transaction-icon ${item.type}`}>
                    {item.type === "income"
                      ? <ArrowDownLeft size={17} />
                      : <ArrowUpRight size={17} />}
                  </div>

                  <div className="custom-transaction-info">
                    <strong>{item.title}</strong>
                    <span>{item.category} · {item.date}</span>
                  </div>

                  <strong className={item.type}>
                    {item.type === "income" ? "+" : "-"}
                    {money(item.amount)}
                  </strong>
                </div>
              ))
            )}
          </div>
        )}

        {id === "pending" && (
          <>
            <h2 className="custom-balance">{money(outstanding)}</h2>

            <p className="custom-muted">
              Outstanding amount · {pendingPayments.filter(
                payment =>
                  payment.status !== "paid" &&
                  payment.status !== "cancelled"
              ).length} active payments
            </p>

            {size === "expanded" &&
              pendingPayments
                .filter(
                  payment =>
                    payment.status !== "paid" &&
                    payment.status !== "cancelled"
                )
                .slice(0, 5)
                .map(payment => (
                  <div className="custom-pending-row" key={payment.id}>
                    <span>{payment.customerName}</span>
                    <strong>
                      {money(Math.max(
                        0,
                        payment.expectedAmount -
                          payment.receipts.reduce(
                            (sum, receipt) => sum + receipt.amount,
                            0
                          )
                      ))}
                    </strong>
                  </div>
                ))}
          </>
        )}
      </section>
    );
  }

  return (
    <div className="custom-dashboard">
      <div className="custom-dashboard-top">
        <div>
          <p className="custom-eyebrow">YOUR SPACE</p>
          <h2>My Dashboard</h2>
        </div>

        <button
          type="button"
          className={`custom-settings-button ${editing ? "selected" : ""}`}
          onClick={() => setEditing(value => !value)}
        >
          <Settings2 size={17} />
          {editing ? "Done" : "Customise"}
        </button>
      </div>

      {editing && (
        <div className="dashboard-editor">
          <div className="dashboard-editor-heading">
            <div>
              <h3>Personalise dashboard</h3>
              <p>Drag widgets to change their order.</p>
            </div>

            <button type="button" onClick={reset}>
              <RotateCcw size={15} /> Reset
            </button>
          </div>

          {preferences.order.map(id => (
            <div className="dashboard-editor-row" key={id}>
              <GripVertical size={17} />
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

      <div className="custom-widget-list">
        {preferences.order.map(renderWidget)}
      </div>
    </div>
  );
}
