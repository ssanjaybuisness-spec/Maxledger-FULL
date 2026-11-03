import { useMemo, useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  Pencil,
  Copy,
  CheckCircle2,
  Clock,
  X,
  Save
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
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const money = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;

const paidAmount = (member: DistributionMember) =>
  (member.payments || []).reduce((sum, payment) => sum + payment.amount, 0);

const remainingAmount = (member: DistributionMember) =>
  Math.max(0, member.allocatedAmount - paidAmount(member));

const paymentStatus = (member: DistributionMember) => {
  const paid = paidAmount(member);

  if (paid >= member.allocatedAmount) return "Paid";
  if (paid > 0) return "Partially paid";
  return "Unpaid";
};

const makeId = () => crypto.randomUUID();

export default function CashDistribution({
  distributions,
  teamMembers,
  onDistributionsChange,
  onTeamMembersChange
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState(today());
  const [eventNotes, setEventNotes] = useState("");

  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [totalBudget, setTotalBudget] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [newMemberName, setNewMemberName] = useState("");

  const [reportTab, setReportTab] = useState<"events" | "members">("events");
  const [selectedReportMember, setSelectedReportMember] = useState("all");

  const [paymentTarget, setPaymentTarget] = useState<{
  distributionId: string;
  memberId: string;
} | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentReference, setPaymentReference] = useState("");

  const totalAllocated = (distribution: CashDistribution) =>
    distribution.members.reduce(
      (sum, member) => sum + member.allocatedAmount,
      0
    );

  const totalPaid = (distribution: CashDistribution) =>
    distribution.members.reduce(
      (sum, member) => sum + paidAmount(member),
      0
    );

  const totalPending = (distribution: CashDistribution) =>
    distribution.members.reduce(
      (sum, member) => sum + remainingAmount(member),
      0
    );

  const allPaid = distributions.reduce(
    (sum, event) => sum + totalPaid(event),
    0
  );

  const allPending = distributions.reduce(
    (sum, event) => sum + totalPending(event),
    0
  );

  const uniqueMemberCount = new Set(
    distributions.flatMap(event =>
      event.members.map(member => member.teamMemberId)
    )
  ).size;

  const memberHistory = useMemo(() => {
    const rows = teamMembers.map(member => {
      const events = distributions.flatMap(event =>
        event.members
          .filter(item => item.teamMemberId === member.id)
          .map(item => ({
            eventName: event.eventName,
            eventDate: event.eventAttendedDate,
            allocated: item.allocatedAmount,
            paid: paidAmount(item),
            pending: remainingAmount(item),
            payments: item.payments || []
          }))
      );

      return {
        id: member.id,
        name: member.name,
        totalAllocated: events.reduce(
          (sum, item) => sum + item.allocated,
          0
        ),
        totalPaid: events.reduce(
          (sum, item) => sum + item.paid,
          0
        ),
        totalPending: events.reduce(
          (sum, item) => sum + item.pending,
          0
        ),
        events
      };
    });

    return rows;
  }, [teamMembers, distributions]);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setEventName("");
    setEventDate(today());
    setEventNotes("");
    setSplitMode("equal");
    setTotalBudget("");
    setSelectedMembers([]);
    setCustomAmounts({});
    setNewMemberName("");
  }

  function startNewEvent() {
    resetForm();
    setShowForm(true);
  }

  function addTeamMember() {
    const name = newMemberName.trim();

    if (!name) return;

    const existing = teamMembers.find(
      member => member.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      if (!selectedMembers.includes(existing.id)) {
        setSelectedMembers(current => [...current, existing.id]);
      }

      setNewMemberName("");
      return;
    }

    const now = Date.now();

    const member: TeamMember = {
      id: makeId(),
      name,
      createdAt: now,
      updatedAt: now
    };

    onTeamMembersChange([...teamMembers, member]);
    setSelectedMembers(current => [...current, member.id]);
    setNewMemberName("");
  }

  function toggleMember(memberId: string) {
    setSelectedMembers(current =>
      current.includes(memberId)
        ? current.filter(id => id !== memberId)
        : [...current, memberId]
    );
  }

  function editEvent(distribution: CashDistribution) {
    setEditingId(distribution.id);
    setEventName(distribution.eventName);
    setEventDate(distribution.eventAttendedDate || today());
    setEventNotes(distribution.notes || "");
    setSplitMode("custom");
    setSelectedMembers(
      distribution.members.map(member => member.teamMemberId)
    );

    const amounts: Record<string, string> = {};

    distribution.members.forEach(member => {
      amounts[member.teamMemberId] = String(member.allocatedAmount);
    });

    setCustomAmounts(amounts);
    setTotalBudget(String(totalAllocated(distribution)));
    setShowForm(true);
  }

  function duplicateEvent(distribution: CashDistribution) {
    setEditingId(null);
    setEventName(`${distribution.eventName} (Copy)`);
    setEventDate(today());
    setEventNotes(distribution.notes || "");
    setSplitMode("custom");
    setSelectedMembers(
      distribution.members.map(member => member.teamMemberId)
    );

    const amounts: Record<string, string> = {};

    distribution.members.forEach(member => {
      amounts[member.teamMemberId] = String(member.allocatedAmount);
    });

    setCustomAmounts(amounts);
    setTotalBudget(String(totalAllocated(distribution)));
    setShowForm(true);
  }

  function saveEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = eventName.trim();

    if (!name || !eventDate || selectedMembers.length === 0) {
      window.alert("Enter an event name, date, and select at least one member.");
      return;
    }

    const selected = teamMembers.filter(member =>
      selectedMembers.includes(member.id)
    );

    if (selected.length === 0) {
      window.alert("Please select at least one team member.");
      return;
    }

    let allocations: Record<string, number> = {};

    if (splitMode === "equal") {
      const amount = Number(totalBudget);

      if (!Number.isFinite(amount) || amount <= 0) {
        window.alert("Enter a valid total amount.");
        return;
      }

      const base = Math.floor((amount / selected.length) * 100) / 100;
      let assigned = 0;

      selected.forEach((member, index) => {
        const value =
          index === selected.length - 1
            ? Math.round((amount - assigned) * 100) / 100
            : base;

        allocations[member.id] = value;
        assigned += value;
      });
    } else {
      for (const member of selected) {
        const amount = Number(customAmounts[member.id] || 0);

        if (!Number.isFinite(amount) || amount < 0) {
          window.alert(`Enter a valid amount for ${member.name}.`);
          return;
        }

        allocations[member.id] = amount;
      }
    }

    const now = Date.now();

    const existing = distributions.find(
      item => item.id === editingId
    );

    const members: DistributionMember[] = selected.map(member => {
      const oldMember = existing?.members.find(
        item => item.teamMemberId === member.id
      );

      return {
        id: oldMember?.id || makeId(),
        teamMemberId: member.id,
        memberName: member.name,
        allocatedAmount: allocations[member.id] || 0,
        payments: oldMember?.payments || [],
        notes: oldMember?.notes
      };
    });

    const updatedEvent: CashDistribution = {
      id: editingId || makeId(),
      eventName: name,
      eventAttendedDate: eventDate,
      members,
      notes: eventNotes.trim() || undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    if (editingId) {
      onDistributionsChange(
        distributions.map(item =>
          item.id === editingId ? updatedEvent : item
        )
      );
    } else {
      onDistributionsChange([updatedEvent, ...distributions]);
    }

    resetForm();
  }

  function deleteEvent(distributionId: string) {
    if (
      !window.confirm(
        "Delete this event distribution and its payment history?"
      )
    ) {
      return;
    }

    onDistributionsChange(
      distributions.filter(item => item.id !== distributionId)
    );
  }

  function openPayment(
    distributionId: string,
    memberId: string
  ) {
    setPaymentTarget({ distributionId, memberId });
    setPaymentAmount("");
    setPaymentDate(today());
    setPaymentReference("");
  }

  function savePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!paymentTarget) return;

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Enter a valid payment amount.");
      return;
    }

    const distribution = distributions.find(
      item => item.id === paymentTarget.distributionId
    );

    const member = distribution?.members.find(
      item => item.id === paymentTarget.memberId
    );

    if (!distribution || !member) return;

    const remaining = remainingAmount(member);

    if (amount > remaining) {
      window.alert(
        `Payment cannot exceed the remaining amount of ${money(remaining)}.`
      );
      return;
    }

    const payment: DistributionPayment = {
      id: makeId(),
      amount,
      paidDate: paymentDate,
      referenceNote: paymentReference.trim() || undefined,
      createdAt: Date.now()
    };

    const updatedDistribution: CashDistribution = {
      ...distribution,
      updatedAt: Date.now(),
      members: distribution.members.map(item =>
        item.id === member.id
          ? {
              ...item,
              payments: [...(item.payments || []), payment]
            }
          : item
      )
    };

    onDistributionsChange(
      distributions.map(item =>
        item.id === distribution.id ? updatedDistribution : item
      )
    );

    setPaymentTarget(null);
  }

  function deletePayment(
    distributionId: string,
    memberId: string,
    paymentId: string
  ) {
    if (!window.confirm("Delete this payment record?")) return;

    onDistributionsChange(
      distributions.map(event =>
        event.id !== distributionId
          ? event
          : {
              ...event,
              updatedAt: Date.now(),
              members: event.members.map(member =>
                member.id !== memberId
                  ? member
                  : {
                      ...member,
                      payments: member.payments.filter(
                        payment => payment.id !== paymentId
                      )
                    }
              )
            }
      )
    );
  }

  function deleteSavedMember(memberId: string) {
    const isUsed = distributions.some(event =>
      event.members.some(member => member.teamMemberId === memberId)
    );

    if (isUsed) {
      window.alert(
        "This member is used in distribution history. Keep them in the team list so past records remain clear."
      );
      return;
    }

    if (!window.confirm("Remove this saved team member?")) return;

    onTeamMembersChange(
      teamMembers.filter(member => member.id !== memberId)
    );
  }

  const paymentDistribution = paymentTarget
    ? distributions.find(
        event => event.id === paymentTarget.distributionId
      )
    : undefined;

  const paymentMember = paymentTarget
    ? paymentDistribution?.members.find(
        member => member.id === paymentTarget.memberId
      )
    : undefined;

  return (
    <section className="cash-distribution-page">
      <div className="analytics-summary">
        <article className="analytics-card">
          <span>Total distributed</span>
          <h3 className="income">{money(allPaid)}</h3>
        </article>

        <article className="analytics-card">
          <span>Total pending</span>
          <h3 className="expense">{money(allPending)}</h3>
        </article>

        <article className="analytics-card">
          <span>Team members</span>
          <h3>{uniqueMemberCount}</h3>
        </article>

        <article className="analytics-card">
          <span>Events</span>
          <h3>{distributions.length}</h3>
        </article>
      </div>

      <div className="section-heading">
        <div>
          <p>TEAM PAYMENTS</p>
          <h2>Cash distribution</h2>
        </div>

        <button
          type="button"
          className="add-button"
          onClick={startNewEvent}
        >
          <Plus size={17} /> New event
        </button>
      </div>

      {showForm && (
        <form className="transaction-form" onSubmit={saveEvent}>
          <div className="form-heading">
            <h3>{editingId ? "Edit distribution" : "Create event distribution"}</h3>

            <button
              type="button"
              className="icon-button"
              onClick={resetForm}
              aria-label="Close event form"
            >
              <X size={18} />
            </button>
          </div>

          <label>Event name</label>
          <input
            value={eventName}
            onChange={event => setEventName(event.target.value)}
            placeholder="e.g. College fest"
            maxLength={100}
            required
          />

          <label>Event attended date</label>
          <input
            type="date"
            value={eventDate}
            onChange={event => setEventDate(event.target.value)}
            required
          />

          <label>Split type</label>
          <select
            value={splitMode}
            onChange={event =>
              setSplitMode(event.target.value as SplitMode)
            }
          >
            <option value="equal">Equal split</option>
            <option value="custom">Custom amount per member</option>
          </select>

          {splitMode === "equal" && (
            <>
              <label>Total distribution amount (₹)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={totalBudget}
                onChange={event => setTotalBudget(event.target.value)}
                placeholder="Enter total amount to split"
              />
            </>
          )}

          <div className="analytics-heading">
            <h3>Team members</h3>
            <p>Select saved members or add a new one.</p>
          </div>

          <div className="transaction-search">
            <input
              value={newMemberName}
              onChange={event => setNewMemberName(event.target.value)}
              placeholder="New team member name"
            />
            <button
              type="button"
              className="add-button"
              onClick={addTeamMember}
            >
              <Plus size={16} /> Add
            </button>
          </div>

          {teamMembers.length === 0 ? (
            <p className="analytics-empty">
              Add your first team member above.
            </p>
          ) : (
            <div className="distribution-member-picker">
              {teamMembers.map(member => {
                const selected = selectedMembers.includes(member.id);

                return (
                  <div className="distribution-picker-row" key={member.id}>
                    <label className="distribution-member-check">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleMember(member.id)}
                      />
                      <span>{member.name}</span>
                    </label>

                    {selected && splitMode === "custom" && (
                      <input
                        className="distribution-custom-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={customAmounts[member.id] || ""}
                        onChange={event =>
                          setCustomAmounts(current => ({
                            ...current,
                            [member.id]: event.target.value
                          }))
                        }
                        placeholder="₹ amount"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <label>Event notes (optional)</label>
          <textarea
            value={eventNotes}
            onChange={event => setEventNotes(event.target.value)}
            placeholder="Additional event details"
            rows={3}
          />

          <button className="submit-button" type="submit">
            <Save size={17} /> {editingId ? "Save changes" : "Create distribution"}
          </button>
        </form>
      )}

      {paymentTarget && paymentDistribution && paymentMember && (
        <form className="transaction-form" onSubmit={savePayment}>
          <div className="form-heading">
            <h3>Record payment</h3>

            <button
              type="button"
              className="icon-button"
              onClick={() => setPaymentTarget(null)}
              aria-label="Close payment form"
            >
            <X size={18} />
            </button>
          </div>

          <p>
            <strong>{paymentMember.memberName}</strong>
            <br />
            Event: {paymentDistribution.eventName}
            <br />
            Remaining: {money(remainingAmount(paymentMember))}
          </p>

          <label>Amount paid (₹)</label>
          <input
            type="number"
            min="0.01"
            max={remainingAmount(paymentMember)}
            step="0.01"
            value={paymentAmount}
            onChange={event => setPaymentAmount(event.target.value)}
            required
          />

          <label>Payment date</label>
          <input
            type="date"
            value={paymentDate}
            onChange={event => setPaymentDate(event.target.value)}
            required
          />

          <label>Reference / receipt note (optional)</label>
          <input
            value={paymentReference}
            onChange={event => setPaymentReference(event.target.value)}
            placeholder="Reference number or short note"
          />

          <button className="submit-button" type="submit">
            Save payment
          </button>
        </form>
      )}

      <section className="analytics-panel">
        <div className="analytics-heading">
          <h3>Reports & history</h3>
          <p>View event-wise and member-wise distribution records.</p>
        </div>

        <div className="filter-tabs">
          <button
            className={reportTab === "events" ? "filter-active" : ""}
            onClick={() => setReportTab("events")}
            type="button"
          >
            Event report
          </button>

          <button
            className={reportTab === "members" ? "filter-active" : ""}
            onClick={() => setReportTab("members")}
            type="button"
          >
            Member report
          </button>
        </div>

        {reportTab === "events" && (
          <div className="distribution-event-list">
            {distributions.length === 0 ? (
              <div className="empty-state">
                <Users />
                <h3>No distributions yet</h3>
                <p>Create an event to start tracking team payments.</p>
              </div>
            ) : (
              distributions.map(distribution => (
                <article
                  className="analytics-panel"
                  key={distribution.id}
                >
                  <div className="analytics-heading">
                    <div>
                      <h3>{distribution.eventName}</h3>
                      <p>Event attended: {distribution.eventAttendedDate}</p>
                    </div>

                    <div className="distribution-event-actions">
                      <button
                        type="button"
                        className="row-action"
                        onClick={() => duplicateEvent(distribution)}
                        aria-label="Duplicate event"
                        title="Duplicate event"
                      >
                        <Copy size={16} />
                      </button>

                      <button
                        type="button"
                        className="row-action"
                        onClick={() => editEvent(distribution)}
                        aria-label="Edit event"
                        title="Edit event"
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        type="button"
                        className="row-action delete-action"
                        onClick={() => deleteEvent(distribution.id)}
                        aria-label="Delete event"
                        title="Delete event"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="analytics-summary">
                    <article className="analytics-card">
                      <span>Allocated</span>
                      <h3>{money(totalAllocated(distribution))}</h3>
                    </article>

                    <article className="analytics-card">
                      <span>Paid</span>
                      <h3 className="income">{money(totalPaid(distribution))}</h3>
                    </article>

                    <article className="analytics-card">
                      <span>Pending</span>
                      <h3 className="expense">{money(totalPending(distribution))}</h3>
                    </article>
                  </div>

                  {distribution.notes && (
                    <p>{distribution.notes}</p>
                  )}

                  {distribution.members.map(member => (
                    <div
                      className="distribution-member-card"
                      key={member.id}
                    >
                      <div className="analytics-heading">
                        <div>
                          <h3>{member.memberName}</h3>
                          <p>
                            Allocated: {money(member.allocatedAmount)}
                            {" · "}
                            Paid: {money(paidAmount(member))}
                            {" · "}
                            Remaining: {money(remainingAmount(member))}
                          </p>
                        </div>

                        <span
                          className={`distribution-status ${
                            paymentStatus(member) === "Paid"
                              ? "paid"
                              : paymentStatus(member) === "Partially paid"
                                ? "partial"
                                : "unpaid"
                          }`}
                        >
                          {paymentStatus(member)}
                        </span>
                      </div>

                      {remainingAmount(member) > 0 && (
                        <button
                          type="button"
                          className="add-button"
                          onClick={() =>
                            openPayment(distribution.id, member.id)
                          }
                        >
                          <Plus size={16} /> Record payment
                        </button>
                      )}

                      {(member.payments || []).length > 0 && (
                        <div className="distribution-payment-history">
                          <strong>Payment history</strong>

                          {member.payments.map(payment => (
                            <div
                              className="distribution-payment-row"
                              key={payment.id}
                            >
                              <div>
                                <strong>{money(payment.amount)}</strong>
                                <p>
                                  {payment.paidDate}
                                  {payment.referenceNote
                                    ? ` · ${payment.referenceNote}`
                                    : ""}
                                </p>
                              </div>

                              <button
                                type="button"
                                className="row-action delete-action"
                                onClick={() =>
                                  deletePayment(
                                    distribution.id,
                                    member.id,
                                    payment.id
                                  )
                                }
                                aria-label="Delete payment entry"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </article>
              ))
            )}
          </div>
        )}

        {reportTab === "members" && (
          <>
            <label className="analytics-date-control">
              Select team member
              <select
                value={selectedReportMember}
                onChange={event =>
                  setSelectedReportMember(event.target.value)
                }
              >
                <option value="all">All team members</option>
                {teamMembers.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>

            {memberHistory
              .filter(member =>
                selectedReportMember === "all" ||
                member.id === selectedReportMember
              )
              .map(member => (
                <article className="analytics-panel" key={member.id}>
                  <div className="analytics-heading">
                    <h3>{member.name}</h3>
                  </div>

                  <div className="analytics-summary">
                    <article className="analytics-card">
                      <span>Total allocated</span>
                      <h3>{money(member.totalAllocated)}</h3>
                    </article>

                    <article className="analytics-card">
                      <span>Total paid</span>
                      <h3 className="income">{money(member.totalPaid)}</h3>
                    </article>

                    <article className="analytics-card">
                      <span>Total pending</span>
                      <h3 className="expense">{money(member.totalPending)}</h3>
                    </article>
                  </div>

                  {member.events.map((event, index) => (
                    <div
                      className="distribution-payment-row"
                      key={`${event.eventName}-${event.eventDate}-${index}`}
                    >
                      <div>
                        <strong>{event.eventName}</strong>
                        <p>
                          {event.eventDate}
                          {" · "}
                          Paid {money(event.paid)}
                          {" · "}
                          Pending {money(event.pending)}
                        </p>
                      </div>
                    </div>
                  ))}
                </article>
              ))}
          </>
        )}
      </section>

      <section className="analytics-panel">
        <div className="analytics-heading">
          <h3>Saved team members</h3>
          <p>Members are reused across future events.</p>
        </div>

        {teamMembers.length === 0 ? (
          <p className="analytics-empty">
            Team members you add to an event will appear here.
          </p>
        ) : (
          teamMembers.map(member => (
            <div
              className="distribution-payment-row"
              key={member.id}
            >
              <div>
                <strong>{member.name}</strong>
              </div>

              <button
                type="button"
                className="row-action delete-action"
                onClick={() => deleteSavedMember(member.id)}
                aria-label={`Remove ${member.name}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </section>

      <p className="analytics-empty">
        <CheckCircle2 size={15} /> Cash distribution is kept separate from income and expenses.
      </p>
    </section>
  );
}
