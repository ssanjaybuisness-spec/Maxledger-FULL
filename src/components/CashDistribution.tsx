import { useMemo, useState } from "react";
import {
  Plus, X, Pencil, Copy, Trash2, Check, Users,
  Wallet, CalendarDays, ChevronDown, ChevronUp,
  ReceiptText, Save
} from "lucide-react";
import type {
  CashDistribution,
  DistributionMember,
  DistributionPayment,
  TeamMember
} from "../types";

interface Props {
  distributions: CashDistribution[];
  teamMembers: TeamMember[];
  onDistributionsChange: (items: CashDistribution[]) => void;
  onTeamMembersChange: (items: TeamMember[]) => void;
}

type SplitMode = "equal" | "custom";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const id = () => crypto.randomUUID();

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const paid = (m: DistributionMember) =>
  (m.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

const pending = (m: DistributionMember) =>
  Math.max(0, m.allocatedAmount - paid(m));

const status = (m: DistributionMember) =>
  paid(m) >= m.allocatedAmount ? "Paid" :
    paid(m) > 0 ? "Partially paid" : "Unpaid";

export default function CashDistribution({
  distributions,
  teamMembers,
  onDistributionsChange,
  onTeamMembersChange
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [split, setSplit] = useState<SplitMode>("equal");
  const [total, setTotal] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [memberName, setMemberName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [report, setReport] = useState<"events" | "members">("events");
  const [reportMember, setReportMember] = useState("all");

  const [paymentTarget, setPaymentTarget] = useState<{
    eventId: string; memberId: string;
  } | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentNote, setPaymentNote] = useState("");

  const eventAllocated = (e: CashDistribution) =>
    e.members.reduce((s, m) => s + m.allocatedAmount, 0);

  const eventPaid = (e: CashDistribution) =>
    e.members.reduce((s, m) => s + paid(m), 0);

  const eventPending = (e: CashDistribution) =>
    e.members.reduce((s, m) => s + pending(m), 0);

  const totalPaid = distributions.reduce((s, e) => s + eventPaid(e), 0);
  const totalPending = distributions.reduce((s, e) => s + eventPending(e), 0);

  const memberCount = new Set(
    distributions.flatMap(e => e.members.map(m => m.teamMemberId))
  ).size;

  const memberReports = useMemo(() => teamMembers.map(member => {
    const rows = distributions.flatMap(event =>
      event.members.filter(m => m.teamMemberId === member.id).map(m => ({
        event: event.eventName,
        date: event.eventAttendedDate,
        allocated: m.allocatedAmount,
        paid: paid(m),
        pending: pending(m)
      }))
    );

    return {
      ...member,
      rows,
      allocated: rows.reduce((s, r) => s + r.allocated, 0),
      paid: rows.reduce((s, r) => s + r.paid, 0),
      pending: rows.reduce((s, r) => s + r.pending, 0)
    };
  }), [teamMembers, distributions]);

  function reset() {
    setFormOpen(false);
    setEditingId(null);
    setEventName("");
    setEventDate(today());
    setNotes("");
    setSplit("equal");
    setTotal("");
    setSelected([]);
    setAmounts({});
    setMemberName("");
    setMemberSearch("");
  }

  function startNew() {
    reset();
    setFormOpen(true);
  }

  function addMember() {
    const name = memberName.trim();
    if (!name) return;

    const existing = teamMembers.find(
      m => m.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      setSelected(prev =>
        prev.includes(existing.id) ? prev : [...prev, existing.id]
      );
      setMemberName("");
      return;
    }

    const now = Date.now();

    const member: TeamMember = {
      id: id(),
      name,
      createdAt: now,
      updatedAt: now
    };

    onTeamMembersChange([...teamMembers, member]);
    setSelected(prev => [...prev, member.id]);
    setMemberName("");
  }

  function toggleMember(memberId: string) {
    setSelected(prev => prev.includes(memberId)
      ? prev.filter(x => x !== memberId)
      : [...prev, memberId]
    );
  }

  function editEvent(event: CashDistribution) {
    setEditingId(event.id);
    setEventName(event.eventName);
    setEventDate(event.eventAttendedDate || today());
    setNotes(event.notes || "");
    setSplit("custom");
    setSelected(event.members.map(m => m.teamMemberId));

    setAmounts(Object.fromEntries(event.members.map(m => [
      m.teamMemberId, String(m.allocatedAmount)
    ])));

    setTotal(String(eventAllocated(event)));
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function duplicateEvent(event: CashDistribution) {
    setEditingId(null);
    setEventName(`${event.eventName} copy`);
    setEventDate(today());
    setNotes(event.notes || "");
    setSplit("custom");
    setSelected(event.members.map(m => m.teamMemberId));

    setAmounts(Object.fromEntries(event.members.map(m => [
      m.teamMemberId, String(m.allocatedAmount)
    ])));

    setTotal(String(eventAllocated(event)));
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
    function saveEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const name = eventName.trim();
    const eventTotal = Math.round(Number(total) * 100) / 100;

    if (!name || !eventDate || selected.length === 0) {
      alert("Enter an event name, date, and select at least one team member.");
      return;
    }

    if (split === "equal" && (!eventTotal || eventTotal <= 0)) {
      alert("Enter a valid total amount.");
      return;
    }

    const old = distributions.find((event) => event.id === editingId);

    const eventMembers: DistributionMember[] = selected.map(
      (memberId, index) => {
        const teamMember = teamMembers.find((member) => member.id === memberId);
        const oldMember = old?.members.find(
          (member) => member.teamMemberId === memberId
        );

        let allocatedAmount = 0;

        if (split === "equal") {
          const totalCents = Math.round(eventTotal * 100);
          const baseCents = Math.floor(totalCents / selected.length);
          const remainder = totalCents - baseCents * selected.length;

          allocatedAmount =
            (baseCents + (index === selected.length - 1 ? remainder : 0)) /
            100;
        } else {
          allocatedAmount =
            Math.round(Number(amounts[memberId] || 0) * 100) / 100;
        }

        return {
          teamMemberId: memberId,
          name: teamMember?.name || oldMember?.name || "Unknown member",
          allocatedAmount,
          payments: oldMember?.payments || [],
        };
      }
    );

    if (
      split === "custom" &&
      eventMembers.some((member) => member.allocatedAmount < 0)
    ) {
      alert("Amounts cannot be negative.");
      return;
    }

    const now = Date.now();

    const updated: CashDistribution = {
      id: editingId || id(),
      eventName: name,
      eventAttendedDate: eventDate,
      members: eventMembers,
      notes: notes.trim() || undefined,
      createdAt: old?.createdAt || now,
      updatedAt: now,
    };

    setData((previous) => ({
      ...previous,
      cashDistributions: editingId
        ? (previous.cashDistributions || []).map((event) =>
            event.id === editingId ? updated : event
          )
        : [updated, ...(previous.cashDistributions || [])],
    }));

    resetForm();
  }

  function deleteEvent(eventId: string) {
    if (!window.confirm("Delete this event and its distribution records?")) {
      return;
    }

    setData((previous) => ({
      ...previous,
      cashDistributions: (previous.cashDistributions || []).filter(
        (event) => event.id !== eventId
      ),
    }));
  }

  function openPayment(event: CashDistribution, member: DistributionMember) {
    setPaymentEventId(event.id);
    setPaymentMemberId(member.teamMemberId);
    setPaymentAmount(String(memberPending(member)));
    setPaymentDate(today());
    setPaymentNote("");
    setPaymentOpen(true);
  }

  function savePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const amount = Math.round(Number(paymentAmount) * 100) / 100;

    if (!paymentEventId || !paymentMemberId || amount <= 0) {
      alert("Enter a valid payment amount.");
      return;
    }

    const event = distributions.find((item) => item.id === paymentEventId);
    const member = event?.members.find(
      (item) => item.teamMemberId === paymentMemberId
    );

    if (!event || !member) return;

    if (amount > memberPending(member) + 0.01) {
      alert("Payment cannot be greater than the pending amount.");
      return;
    }

    const payment: DistributionPayment = {
      id: id(),
      amount,
      paidDate: paymentDate,
      referenceNote: paymentNote.trim() || undefined,
      createdAt: Date.now(),
    };

    setData((previous) => ({
      ...previous,
      cashDistributions: (previous.cashDistributions || []).map((item) => {
        if (item.id !== paymentEventId) return item;

        return {
          ...item,
          updatedAt: Date.now(),
          members: item.members.map((person) =>
            person.teamMemberId === paymentMemberId
              ? {
                  ...person,
                  payments: [...(person.payments || []), payment],
                }
              : person
          ),
        };
      }),
    }));

    setPaymentOpen(false);
  }

  function deletePayment(
    eventId: string,
    memberId: string,
    paymentId: string
  ) {
    if (!window.confirm("Delete this payment record?")) return;

    setData((previous) => ({
      ...previous,
      cashDistributions: (previous.cashDistributions || []).map((event) =>
        event.id === eventId
          ? {
              ...event,
              updatedAt: Date.now(),
              members: event.members.map((member) =>
                member.teamMemberId === memberId
                  ? {
                      ...member,
                      payments: (member.payments || []).filter(
                        (payment) => payment.id !== paymentId
                      ),
                    }
                  : member
              ),
            }
          : event
      ),
    }));
  }

  const paymentEvent = distributions.find(
    (event) => event.id === paymentEventId
  );

  const paymentMember = paymentEvent?.members.find(
    (member) => member.teamMemberId === paymentMemberId
  );

  const filteredTeam = teamMembers.filter((member) =>
    member.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <div className="cash-page">
      <div className="cash-header">
        <div>
          <div className="cash-eyebrow">EVENT FINANCES</div>
          <h1>Cash distribution</h1>
          <p>Track team payouts, payments, and pending balances.</p>
        </div>

        <button
          className="cash-primary-btn"
          onClick={() => {
            resetForm();
            setFormOpen((open) => !open);
          }}
        >
          {formOpen ? "Close form" : "+ New distribution"}
        </button>
      </div>

      <div className="cash-stats">
        <div className="cash-stat">
          <span>Total paid</span>
          <strong>{money(stats.paid)}</strong>
        </div>

        <div className="cash-stat">
          <span>Pending</span>
          <strong>{money(stats.pending)}</strong>
        </div>

        <div className="cash-stat">
          <span>Events</span>
          <strong>{distributions.length}</strong>
        </div>

        <div className="cash-stat">
          <span>Team members</span>
          <strong>{teamMembers.length}</strong>
        </div>
      </div>

      {formOpen && (
        <section className="cash-panel cash-form-panel">
          <div className="cash-section-heading">
            <div>
              <h2>{editingId ? "Edit distribution" : "New distribution"}</h2>
              <p>Enter event details and select the team.</p>
            </div>
          </div>

          <form onSubmit={saveEvent}>
            <div className="cash-form-grid">
              <label className="cash-field">
                <span>Event name</span>
                <input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g. Wedding reception"
                  required
                />
              </label>

              <label className="cash-field">
                <span>Event attended date</span>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="cash-form-grid">
              <label className="cash-field">
                <span>Distribution method</span>
                <select
                  value={split}
                  onChange={(e) =>
                    setSplit(e.target.value as "equal" | "custom")
                  }
                >
                  <option value="equal">Split equally</option>
                  <option value="custom">Custom amount per member</option>
                </select>
              </label>

              {split === "equal" && (
                <label className="cash-field">
                  <span>Total distribution amount (₹)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>
              )}
            </div>

            <div className="cash-team-heading">
              <div>
                <h3>Team members</h3>
                <p>Select the people who attended this event.</p>
              </div>

              <span className="cash-selected-count">
                {selected.length} selected
              </span>
            </div>

            <div className="cash-add-member">
              <input
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Add a new team member"
              />

              <button
                type="button"
                className="cash-secondary-btn"
                onClick={addMember}
              >
                Add member
              </button>
            </div>

            <input
              className="cash-search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search team members..."
            />

            {filteredTeam.length === 0 ? (
              <div className="cash-empty-small">
                No team members found. Add someone above.
              </div>
            ) : (
              <div className="cash-member-picker">
                {filteredTeam.map((member) => {
                  const isSelected = selected.includes(member.id);

                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={`cash-member-option ${
                        isSelected ? "selected" : ""
                      }`}
                      onClick={() => toggleMember(member.id)}
                    >
                      <span className="cash-member-check">
                        {isSelected ? "✓" : "+"}
                      </span>

                      <span>{member.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {selected.length > 0 && (
              <div className="cash-selected-members">
                <div className="cash-selected-title">
                  <strong>Selected members</strong>
                  <span>{selected.length} people</span>
                </div>

                {selected.map((memberId) => {
                  const member = teamMembers.find(
                    (item) => item.id === memberId
                  );

                  if (!member) return null;

                  return (
                    <div className="cash-allocation-row" key={memberId}>
                      <span>{member.name}</span>

                      {split === "custom" ? (
                        <label className="cash-amount-input">
                          <span>₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={amounts[memberId] || ""}
                            onChange={(e) =>
                              setAmounts((previous) => ({
                                ...previous,
                                [memberId]: e.target.value,
                              }))
                            }
                            placeholder="Amount"
                            required
                          />
                        </label>
                      ) : (
                        <strong>
                          {money(
                            selected.length > 0
                              ? Math.round(
                                  (Number(total) * 100) / selected.length
                                ) / 100
                              : 0
                          )}
                        </strong>
                      )}

                      <button
                        type="button"
                        className="cash-remove-btn"
                        onClick={() => toggleMember(memberId)}
                        aria-label={`Remove ${member.name}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {split === "custom" && selected.length > 0 && (
              <div className="cash-total-preview">
                <span>Total allocated</span>
                <strong>
                  {money(
                    selected.reduce(
                      (sum, memberId) =>
                        sum + Number(amounts[memberId] || 0),
                      0
                    )
                  )}
                </strong>
              </div>
            )}

            <label className="cash-field">
              <span>Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any event or payout notes..."
                rows={3}
              />
            </label>

            <div className="cash-form-actions">
              <button
                type="button"
                className="cash-secondary-btn"
                onClick={resetForm}
              >
                Cancel
              </button>

              <button type="submit" className="cash-primary-btn">
                {editingId ? "Save changes" : "Create distribution"}
              </button>
            </div>
          </form>
        </section>
      )}

      {paymentOpen && paymentEvent && paymentMember && (
        <section className="cash-panel cash-payment-panel">
          <div className="cash-section-heading">
            <div>
              <h2>Record payment</h2>
              <p>
                {paymentMember.name} · {paymentEvent.eventName}
              </p>
            </div>

            <button
              type="button"
              className="cash-remove-btn"
              onClick={() => setPaymentOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="cash-payment-summary">
            <div>
              <span>Allocated</span>
              <strong>{money(paymentMember.allocatedAmount)}</strong>
            </div>

            <div>
              <span>Already paid</span>
              <strong>{money(memberPaid(paymentMember))}</strong>
            </div>

            <div>
              <span>Remaining</span>
              <strong>{money(memberPending(paymentMember))}</strong>
            </div>
          </div>

          <form onSubmit={savePayment}>
            <div className="cash-form-grid">
              <label className="cash-field">
                <span>Payment amount (₹)</span>
                <input
                  type="number"
                  min="0.01"
                  max={memberPending(paymentMember)}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </label>

              <label className="cash-field">
                <span>Payment date</span>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </label>
            </div>

            <label className="cash-field">
              <span>Reference / receipt note (optional)</span>
              <input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Reference, receipt, or note"
              />
            </label>

            <div className="cash-form-actions">
              <button
                type="button"
                className="cash-secondary-btn"
                onClick={() => setPaymentOpen(false)}
              >
                Cancel
              </button>

              <button type="submit" className="cash-primary-btn">
                Record payment
              </button>
            </div>
          </form>
        </section>
      )}
            <section className="cash-history-section">
        <div className="cash-section-heading">
          <div>
            <h2>Distribution history</h2>
            <p>Your event payouts and team payment status.</p>
          </div>

          <span className="cash-count-badge">
            {distributions.length} events
          </span>
        </div>

        {distributions.length === 0 ? (
          <div className="cash-panel cash-empty">
            <div className="cash-empty-icon">₹</div>
            <h3>No distributions yet</h3>
            <p>Create your first event distribution to track team payments.</p>
            <button
              className="cash-primary-btn"
              onClick={() => setFormOpen(true)}
            >
              + Create distribution
            </button>
          </div>
        ) : (
          <div className="cash-event-list">
            {distributions.map((event) => {
              const allocated = eventAllocated(event);
              const paid = eventPaid(event);
              const pending = eventPending(event);
              const progress =
                allocated > 0 ? Math.min((paid / allocated) * 100, 100) : 0;
              const expanded = expandedEventId === event.id;

              return (
                <article className="cash-panel cash-event-card" key={event.id}>
                  <div className="cash-event-top">
                    <div className="cash-event-title">
                      <div className="cash-event-icon">₹</div>

                      <div>
                        <h3>{event.eventName}</h3>
                        <span>
                          {formatDate(event.eventAttendedDate)} ·{" "}
                          {event.members.length} team members
                        </span>
                      </div>
                    </div>

                    <div className="cash-event-total">
                      <strong>{money(allocated)}</strong>
                      <span>Total allocated</span>
                    </div>
                  </div>

                  <div className="cash-event-summary">
                    <div>
                      <span>Paid</span>
                      <strong className="cash-paid-text">{money(paid)}</strong>
                    </div>

                    <div>
                      <span>Pending</span>
                      <strong className="cash-pending-text">
                        {money(pending)}
                      </strong>
                    </div>

                    <div>
                      <span>Status</span>
                      <strong>
                        {pending <= 0
                          ? "Completed"
                          : paid > 0
                            ? "Partially paid"
                            : "Unpaid"}
                      </strong>
                    </div>
                  </div>

                  <div className="cash-progress-track">
                    <div
                      className="cash-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="cash-progress-caption">
                    <span>{Math.round(progress)}% paid</span>
                    <span>{money(pending)} remaining</span>
                  </div>

                  {event.notes && (
                    <div className="cash-event-notes">{event.notes}</div>
                  )}

                  <div className="cash-event-actions">
                    <button
                      className="cash-secondary-btn"
                      onClick={() =>
                        setExpandedEventId(expanded ? null : event.id)
                      }
                    >
                      {expanded ? "Hide details" : "View team & payments"}
                    </button>

                    <button
                      className="cash-secondary-btn"
                      onClick={() => duplicateEvent(event)}
                    >
                      Duplicate
                    </button>

                    <button
                      className="cash-secondary-btn"
                      onClick={() => editEvent(event)}
                    >
                      Edit
                    </button>

                    <button
                      className="cash-danger-btn"
                      onClick={() => deleteEvent(event.id)}
                    >
                      Delete
                    </button>
                  </div>

                  {expanded && (
                    <div className="cash-event-details">
                      <div className="cash-details-heading">
                        <h4>Team payment details</h4>
                      </div>

                      {event.members.map((member) => {
                        const memberPaidAmount = memberPaid(member);
                        const memberPendingAmount = memberPending(member);

                        const status =
                          memberPendingAmount <= 0
                            ? "Paid"
                            : memberPaidAmount > 0
                              ? "Partially paid"
                              : "Unpaid";

                        return (
                          <div
                            className="cash-payout-member"
                            key={member.teamMemberId}
                          >
                            <div className="cash-payout-member-top">
                              <div>
                                <strong>{member.name}</strong>
                                <span>
                                  Allocated: {money(member.allocatedAmount)}
                                </span>
                              </div>

                              <span
                                className={`cash-status cash-status-${status
                                  .toLowerCase()
                                  .replace(" ", "-")}`}
                              >
                                {status}
                              </span>
                            </div>

                            <div className="cash-payout-values">
                              <span>
                                Paid{" "}
                                <strong>{money(memberPaidAmount)}</strong>
                              </span>

                              <span>
                                Pending{" "}
                                <strong>{money(memberPendingAmount)}</strong>
                              </span>
                            </div>

                            {memberPendingAmount > 0 && (
                              <button
                                className="cash-primary-btn cash-pay-btn"
                                onClick={() => openPayment(event, member)}
                              >
                                + Record payment
                              </button>
                            )}

                            {(member.payments || []).length > 0 && (
                              <div className="cash-payment-history">
                                <span className="cash-payment-history-label">
                                  Payment history
                                </span>

                                {(member.payments || []).map((payment) => (
                                  <div
                                    className="cash-payment-row"
                                    key={payment.id}
                                  >
                                    <div>
                                      <strong>{money(payment.amount)}</strong>
                                      <span>
                                        {formatDate(payment.paidDate)}
                                        {payment.referenceNote
                                          ? ` · ${payment.referenceNote}`
                                          : ""}
                                      </span>
                                    </div>

                                    <button
                                      className="cash-remove-btn"
                                      onClick={() =>
                                        deletePayment(
                                          event.id,
                                          member.teamMemberId,
                                          payment.id
                                        )
                                      }
                                      aria-label="Delete payment"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="cash-report-section">
        <div className="cash-section-heading">
          <div>
            <h2>Reports</h2>
            <p>Review distribution totals by event or team member.</p>
          </div>
        </div>

        <div className="cash-report-tabs">
          <button
            className={reportTab === "events" ? "active" : ""}
            onClick={() => setReportTab("events")}
          >
            Event report
          </button>

          <button
            className={reportTab === "members" ? "active" : ""}
            onClick={() => setReportTab("members")}
          >
            Member report
          </button>
        </div>

        {reportTab === "events" ? (
          <div className="cash-report-list">
            {distributions.length === 0 ? (
              <p className="cash-muted">No event data available yet.</p>
            ) : (
              distributions.map((event) => (
                <div className="cash-report-row" key={event.id}>
                  <div>
                    <strong>{event.eventName}</strong>
                    <span>{formatDate(event.eventAttendedDate)}</span>
                  </div>

                  <div className="cash-report-numbers">
                    <span>Paid {money(eventPaid(event))}</span>
                    <strong>{money(eventPending(event))} pending</strong>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="cash-report-list">
            {memberReports.length === 0 ? (
              <p className="cash-muted">No team member data available yet.</p>
            ) : (
              memberReports.map((member) => (
                <div className="cash-report-row" key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.eventCount} events</span>
                  </div>

                  <div className="cash-report-numbers">
                    <span>Paid {money(member.paid)}</span>
                    <strong>{money(member.pending)} pending</strong>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <div className="cash-footer-note">
        Cash distributions are tracked separately from income and expenses.
      </div>
    </div>
  );
}
