import { useMemo, useState, type FormEvent } from "react";
import type {
  CashDistribution,
  DistributionMember,
  DistributionPayment,
  TeamMember,
} from "../types";

interface Props {
  distributions: CashDistribution[];
  teamMembers: TeamMember[];
  onDistributionsChange: (items: CashDistribution[]) => void;
  onTeamMembersChange: (items: TeamMember[]) => void;
}

type SplitMode = "equal" | "custom";
type ReportTab = "events" | "members";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const makeId = () => crypto.randomUUID();

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value: string) => {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const memberPaid = (member: DistributionMember) =>
  (member.payments || []).reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  );

const memberPending = (member: DistributionMember) =>
  Math.max(0, member.allocatedAmount - memberPaid(member));

const memberStatus = (member: DistributionMember) => {
  if (memberPending(member) <= 0) return "Paid";
  if (memberPaid(member) > 0) return "Partially paid";
  return "Unpaid";
};

const eventAllocated = (event: CashDistribution) =>
  event.members.reduce((sum, member) => sum + member.allocatedAmount, 0);

const eventPaid = (event: CashDistribution) =>
  event.members.reduce((sum, member) => sum + memberPaid(member), 0);

const eventPending = (event: CashDistribution) =>
  event.members.reduce((sum, member) => sum + memberPending(member), 0);

export default function CashDistribution({
  distributions,
  teamMembers,
  onDistributionsChange,
  onTeamMembersChange,
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

  const [newMemberName, setNewMemberName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState<ReportTab>("events");

  const [paymentEventId, setPaymentEventId] = useState<string | null>(null);
  const [paymentMemberId, setPaymentMemberId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentNote, setPaymentNote] = useState("");

  const [paymentOpen, setPaymentOpen] = useState(false);

  const stats = useMemo(() => ({
    paid: distributions.reduce((sum, event) => sum + eventPaid(event), 0),
    pending: distributions.reduce((sum, event) => sum + eventPending(event), 0),
  }), [distributions]);

  const memberReports = useMemo(() => {
    return teamMembers.map((teamMember) => {
      const rows = distributions.flatMap((event) =>
        event.members
          .filter((member) => member.teamMemberId === teamMember.id)
          .map((member) => ({
            event: event.eventName,
            date: event.eventAttendedDate,
            allocated: member.allocatedAmount,
            paid: memberPaid(member),
            pending: memberPending(member),
          }))
      );

      return {
        ...teamMember,
        rows,
        eventCount: rows.length,
        allocated: rows.reduce((sum, row) => sum + row.allocated, 0),
        paid: rows.reduce((sum, row) => sum + row.paid, 0),
        pending: rows.reduce((sum, row) => sum + row.pending, 0),
      };
    });
  }, [teamMembers, distributions]);

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setEventName("");
    setEventDate(today());
    setNotes("");
    setSplit("equal");
    setTotal("");
    setSelected([]);
    setAmounts({});
    setNewMemberName("");
    setMemberSearch("");
  }

  function startNew() {
    resetForm();
    setFormOpen(true);
  }

  function addMember() {
    const name = newMemberName.trim();
    if (!name) return;

    const existing = teamMembers.find(
      (member) => member.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      setSelected((previous) =>
        previous.includes(existing.id)
          ? previous
          : [...previous, existing.id]
      );
      setNewMemberName("");
      return;
    }

    const now = Date.now();

    const member: TeamMember = {
      id: makeId(),
      name,
      createdAt: now,
      updatedAt: now,
    };

    onTeamMembersChange([...teamMembers, member]);
    setSelected((previous) => [...previous, member.id]);
    setNewMemberName("");
  }

  function toggleMember(memberId: string) {
    setSelected((previous) =>
      previous.includes(memberId)
        ? previous.filter((id) => id !== memberId)
        : [...previous, memberId]
    );
  }

  function editEvent(event: CashDistribution) {
    setEditingId(event.id);
    setEventName(event.eventName);
    setEventDate(event.eventAttendedDate || today());
    setNotes(event.notes || "");
    setSplit("custom");
    setSelected(event.members.map((member) => member.teamMemberId));

    setAmounts(
      Object.fromEntries(
        event.members.map((member) => [
          member.teamMemberId,
          String(member.allocatedAmount),
        ])
      )
    );

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
    setSelected(event.members.map((member) => member.teamMemberId));

    setAmounts(
      Object.fromEntries(
        event.members.map((member) => [
          member.teamMemberId,
          String(member.allocatedAmount),
        ])
      )
    );

    setTotal(String(eventAllocated(event)));
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
    function saveEvent(e: FormEvent<HTMLFormElement>) {
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
        const teamMember = teamMembers.find(
          (member) => member.id === memberId
        );

        const oldMember = old?.members.find(
          (member) => member.teamMemberId === memberId
        );

        let allocatedAmount = 0;

        if (split === "equal") {
          const totalCents = Math.round(eventTotal * 100);
          const baseCents = Math.floor(totalCents / selected.length);
          const remainder = totalCents - baseCents * selected.length;

          allocatedAmount =
            (baseCents +
              (index === selected.length - 1 ? remainder : 0)) /
            100;
        } else {
          allocatedAmount =
            Math.round(Number(amounts[memberId] || 0) * 100) / 100;
        }

        return {
          id: oldMember?.id || makeId(),
          teamMemberId: memberId,
          memberName: teamMember?.name || oldMember?.memberName || "Unknown",
          allocatedAmount,
          payments: oldMember?.payments || [],
        };
      }
    );

    if (
      eventMembers.some(
        (member) =>
          !Number.isFinite(member.allocatedAmount) ||
          member.allocatedAmount < 0
      )
    ) {
      alert("Enter valid non-negative amounts.");
      return;
    }

    const now = Date.now();

    const updated: CashDistribution = {
      id: editingId || makeId(),
      eventName: name,
      eventAttendedDate: eventDate,
      members: eventMembers,
      notes: notes.trim() || undefined,
      createdAt: old?.createdAt || now,
      updatedAt: now,
    };

    const next = editingId
      ? distributions.map((event) =>
          event.id === editingId ? updated : event
        )
      : [updated, ...distributions];

    onDistributionsChange(next);
    resetForm();
  }

  function deleteEvent(eventId: string) {
    if (!window.confirm("Delete this event and its distribution records?")) {
      return;
    }

    onDistributionsChange(
      distributions.filter((event) => event.id !== eventId)
    );
  }

  function openPayment(event: CashDistribution, member: DistributionMember) {
    setPaymentEventId(event.id);
    setPaymentMemberId(member.teamMemberId);
    setPaymentAmount(String(memberPending(member)));
    setPaymentDate(today());
    setPaymentNote("");
    setPaymentOpen(true);
  }

  function savePayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const amount = Math.round(Number(paymentAmount) * 100) / 100;

    if (!paymentEventId || !paymentMemberId || !Number.isFinite(amount) || amount <= 0) {
      alert("Enter a valid payment amount.");
      return;
    }

    const event = distributions.find(
      (item) => item.id === paymentEventId
    );

    const member = event?.members.find(
      (item) => item.teamMemberId === paymentMemberId
    );

    if (!event || !member) return;

    if (amount > memberPending(member) + 0.001) {
      alert("Payment cannot be greater than the pending amount.");
      return;
    }

    const payment: DistributionPayment = {
      id: makeId(),
      amount,
      paidDate: paymentDate,
      referenceNote: paymentNote.trim() || undefined,
      createdAt: Date.now(),
    };

    const next = distributions.map((item) =>
      item.id === paymentEventId
        ? {
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
          }
        : item
    );

    onDistributionsChange(next);
    setPaymentOpen(false);
    setPaymentEventId(null);
    setPaymentMemberId(null);
  }

  function deletePayment(
    eventId: string,
    memberId: string,
    paymentId: string
  ) {
    if (!window.confirm("Delete this payment record?")) return;

    const next = distributions.map((event) =>
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
    );

    onDistributionsChange(next);
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
          onClick={startNew}
        >
          {formOpen ? "New distribution" : "+ New distribution"}
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
                    setSplit(e.target.value as SplitMode)
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
                            Math.round(
                              (Number(total) * 100) / selected.length
                            ) / 100
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
                {paymentMember.memberName} · {paymentEvent.eventName}
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
            <section className="cash-section">
        <div className="cash-section-heading">
          <div>
            <h2>Distribution history</h2>
            <p>Track team payments across your events.</p>
          </div>
          <span className="cash-count">{distributions.length} events</span>
        </div>

        {distributions.length === 0 ? (
          <div className="cash-empty">
            <h3>No distributions yet</h3>
            <p>Create an event distribution to start tracking team payments.</p>
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
                <article className="cash-event-card" key={event.id}>
                  <div className="cash-event-top">
                    <div>
                      <h3>{event.eventName}</h3>
                      <p>
                        Event attended: {formatDate(event.eventAttendedDate)}
                      </p>
                      <span className="cash-member-count">
                        {event.members.length} team members
                      </span>
                    </div>

                    <div className="cash-event-actions">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedEventId(expanded ? null : event.id)
                        }
                      >
                        {expanded ? "Hide details" : "View details"}
                      </button>
                      <button type="button" onClick={() => duplicateEvent(event)}>
                        Duplicate
                      </button>
                      <button type="button" onClick={() => editEvent(event)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="cash-danger"
                        onClick={() => deleteEvent(event.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="cash-event-summary">
                    <div>
                      <span>Allocated</span>
                      <strong>{money(allocated)}</strong>
                    </div>
                    <div>
                      <span>Paid</span>
                      <strong className="cash-positive">{money(paid)}</strong>
                    </div>
                    <div>
                      <span>Pending</span>
                      <strong className="cash-pending">{money(pending)}</strong>
                    </div>
                  </div>

                  <div className="cash-progress-track">
                    <div
                      className="cash-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="cash-progress-label">
                    {progress.toFixed(0)}% paid
                  </p>

                  {event.notes && (
                    <p className="cash-event-notes">{event.notes}</p>
                  )}

                  {expanded && (
                    <div className="cash-event-details">
                      <h4>Team payment details</h4>

                      {event.members.map((member) => {
                        const memberPendingAmount = memberPending(member);
                        const status = memberStatus(member);

                        return (
                          <div className="cash-member-card" key={member.id}>
                            <div className="cash-member-top">
                              <div>
                                <strong>{member.memberName}</strong>
                                <span className={`cash-status cash-status-${status.toLowerCase()}`}>
                                  {status}
                                </span>
                              </div>
                              <div className="cash-member-amounts">
                                <span>
                                  Allocated: {money(member.allocatedAmount)}
                                </span>
                                <span>
                                  Paid: {money(memberPaid(member))}
                                </span>
                                <span>
                                  Pending: {money(memberPendingAmount)}
                                </span>
                              </div>
                            </div>

                            {memberPendingAmount > 0 && (
                              <button
                                type="button"
                                className="cash-primary-button"
                                onClick={() =>
                                  openPayment(event, member)
                                }
                              >
                                + Record payment
                              </button>
                            )}

                            {member.payments.length > 0 && (
                              <div className="cash-payment-history">
                                <h5>Payment history</h5>
                                {member.payments.map((payment) => (
                                  <div
                                    className="cash-payment-row"
                                    key={payment.id}
                                  >
                                    <div>
                                      <strong>{money(payment.amount)}</strong>
                                      <span>
                                        {formatDate(payment.paidDate)}
                                      </span>
                                      {payment.referenceNote && (
                                        <small>{payment.referenceNote}</small>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      className="cash-danger"
                                      onClick={() =>
                                        deletePayment(
                                          event.id,
                                          member.id,
                                          payment.id
                                        )
                                      }
                                    >
                                      Delete
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

      <section className="cash-section">
        <div className="cash-section-heading">
          <div>
            <h2>Reports</h2>
            <p>Review distribution totals by event or team member.</p>
          </div>
        </div>

        <div className="cash-report-tabs">
          <button
            type="button"
            className={reportTab === "events" ? "active" : ""}
            onClick={() => setReportTab("events")}
          >
            Event report
          </button>
          <button
            type="button"
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
                  <div>
                    <strong className="cash-positive">
                      {money(eventPaid(event))}
                    </strong>
                    <span>Paid</span>
                  </div>
                  <div>
                    <strong className="cash-pending">
                      {money(eventPending(event))}
                    </strong>
                    <span>Pending</span>
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
                    <span>
                      {member.eventCount}{" "}
                      {member.eventCount === 1 ? "event" : "events"}
                    </span>
                  </div>
                  <div>
                    <strong className="cash-positive">
                      {money(member.paid)}
                    </strong>
                    <span>Paid</span>
                  </div>
                  <div>
                    <strong className="cash-pending">
                      {money(member.pending)}
                    </strong>
                    <span>Pending</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <p className="cash-footer-note">
        Cash distributions are tracked separately and do not automatically
        change your income or expense records.
      </p>
    </div>
  );
}
