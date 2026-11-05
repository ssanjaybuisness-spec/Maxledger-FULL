
import { useState, type FormEvent } from "react";
import { Plus, Wallet, CheckCircle, X } from "lucide-react";
import type { PendingPayment, PaymentReceipt } from "../types";

interface Props {
  payments: PendingPayment[];
  onChange: (payments: PendingPayment[]) => void;
  onReceive: (paymentId: string, receipt: PaymentReceipt) => void;
}

export default function PendingPayments({
  payments,
  onChange,
  onReceive
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const receivedTotal = (payment: PendingPayment) =>
    payment.receipts.reduce((sum, receipt) => sum + receipt.amount, 0);

  const remaining = (payment: PendingPayment) =>
    Math.max(0, payment.expectedAmount - receivedTotal(payment));

  const getStatus = (payment: PendingPayment) => {
    if (payment.status === "cancelled") return "cancelled";
    if (remaining(payment) === 0) return "paid";
    if (receivedTotal(payment) > 0) return "partially_paid";

    if (payment.expectedDate < new Date().toISOString().slice(0, 10)) {
      return "overdue";
    }

    return "pending";
  };

  const money = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", {
      maximumFractionDigits: 2
    })}`;

  function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const customerName = String(form.get("customerName") || "").trim();
    const expectedAmount = Number(form.get("expectedAmount"));
    const expectedDate = String(form.get("expectedDate") || "");
    const eventAttendedDate = String(form.get("eventAttendedDate") || "");
    const notes = String(form.get("notes") || "").trim();

    if (
      !customerName ||
      !expectedDate ||
      !Number.isFinite(expectedAmount) ||
      expectedAmount <= 0
    ) return;

    const now = Date.now();

    const payment: PendingPayment = {
      id: crypto.randomUUID(),
      customerName,
      expectedAmount,
      expectedDate,
      eventAttendedDate: eventAttendedDate || undefined,
      status: "pending",
      receipts: [],
      notes,
      createdAt: now,
      updatedAt: now
    };

    onChange([payment, ...payments]);
    setShowForm(false);
  }

  function receivePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!receivingId) return;

    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const method = String(form.get("method") || "Other");
    const notes = String(form.get("notes") || "").trim();

    const payment = payments.find(item => item.id === receivingId);

    if (
      !payment ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > remaining(payment)
    ) return;

    const receipt: PaymentReceipt = {
      id: crypto.randomUUID(),
      amount,
      method,
      receivedDate: new Date().toISOString().slice(0, 10),
      notes
    };

    onReceive(receivingId, receipt);
    setReceivingId(null);
  }

  function cancelPayment(id: string) {
    const payment = payments.find(item => item.id === id);
    if (!payment) return;

    if (!window.confirm("Cancel this pending payment?")) return;

    onChange(payments.map(item =>
      item.id === id
        ? { ...item, status: "cancelled", updatedAt: Date.now() }
        : item
    ));
  }

  const filteredPayments = payments.filter(payment => {
    const status = getStatus(payment);
    return filter === "all" || status === filter;
  });

  return (
    <section className="pending-module">
      <div className="pending-heading">
        <div>
          <p>PAYMENT TRACKER</p>
        </div>

        <button className="add-button" onClick={() => setShowForm(true)}>
          <Plus size={17} /> Add
        </button>
      </div>

      <div className="pending-summary">
        <span>Outstanding amount</span>
        <h2>
          {money(payments
            .filter(item => !["paid", "cancelled"].includes(getStatus(item)))
            .reduce((sum, item) => sum + remaining(item), 0))}
        </h2>
      </div>

      {showForm && (
        <form className="transaction-form" onSubmit={addPayment}>
          <h3>New pending payment</h3>

          <label>Customer or event name</label>
          <input name="customerName" required maxLength={100}
            placeholder="Customer / Event" />

          <label>Expected amount (₹)</label>
          <input name="expectedAmount" type="number"
            min="0.01" step="0.01" required />

          <label>Event attended date</label>
          <input name="eventAttendedDate" type="date" />

          <label>Expected receiving date</label>
          <input name="expectedDate" type="date" required />

          <label>Notes</label>
          <input name="notes" maxLength={300}
            placeholder="Optional notes" />

          <button className="submit-button">Save pending payment</button>

          <button type="button" className="cancel-button"
            onClick={() => setShowForm(false)}>
            Cancel
          </button>
        </form>
      )}

      <div className="filter-tabs">
        {["all", "pending", "partially_paid", "paid", "overdue"].map(status => (
          <button key={status}
            className={filter === status ? "filter-active" : ""}
            onClick={() => setFilter(status)}>
            {status === "all" ? "All" : status.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="pending-list">
        {filteredPayments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Wallet /></div>
            <h3>No payments found</h3>
            <p>Add a pending payment to track money owed to you.</p>
          </div>
        ) : filteredPayments.map(payment => {
          const status = getStatus(payment);

          return (
            <article className="pending-card" key={payment.id}>
              <div className="pending-card-top">
                <div>
                  <h3>{payment.customerName}</h3>
                  {payment.eventAttendedDate && (
                    <p>Event attended: {payment.eventAttendedDate}</p>
                  )}
                  <p>Expected: {payment.expectedDate}</p>
                </div>
                <span className={`payment-status ${status}`}>
                  {status.replace("_", " ")}
                </span>
              </div>

              <div className="pending-amounts">
                <div>
                  <span>Expected</span>
                  <strong>{money(payment.expectedAmount)}</strong>
                </div>
                <div>
                  <span>Received</span>
                  <strong>{money(receivedTotal(payment))}</strong>
                </div>
                <div>
                  <span>Remaining</span>
                  <strong>{money(remaining(payment))}</strong>
                </div>
              </div>

              {payment.receipts.length > 0 && (
                <details className="payment-history">
                  <summary>Payment history ({payment.receipts.length})</summary>
                  {payment.receipts.map(receipt => (
                    <p key={receipt.id}>
                      {receipt.receivedDate} · {receipt.method} · {money(receipt.amount)}
                    </p>
                  ))}
                </details>
              )}

              {status !== "paid" && status !== "cancelled" && (
                <div className="pending-actions">
                  <button className="add-button"
                    onClick={() => setReceivingId(payment.id)}>
                    <CheckCircle size={15} /> Record received
                  </button>

                  <button className="cancel-button"
                    onClick={() => cancelPayment(payment.id)}>
                    Cancel payment
                  </button>
                </div>
              )}

              {receivingId === payment.id && (
                <form className="transaction-form" onSubmit={receivePayment}>
                  <h3>Record received amount</h3>

                  <label>Amount received (₹)</label>
                  <input name="amount" type="number" min="0.01"
                    max={remaining(payment)} step="0.01" required />

                  <label>Payment method</label>
                  <select name="method">
                    <option>UPI</option>
                    <option>Bank transfer</option>
                    <option>Cash</option>
                    <option>Other</option>
                  </select>

                  <label>Notes</label>
                  <input name="notes" maxLength={200} />

                  <button className="submit-button">
                    Confirm received
                  </button>

                  <button type="button" className="cancel-button"
                    onClick={() => setReceivingId(null)}>
                    <X size={15} /> Close
                  </button>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
