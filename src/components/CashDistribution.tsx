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

const escapeHtml = (value: string) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

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
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7));
  const [reportSearch, setReportSearch] = useState("");

  const [paymentEventId, setPaymentEventId] = useState<string | null>(null);
  const [paymentMemberId, setPaymentMemberId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);

  const stats = useMemo(
    () => ({
      paid: distributions.reduce((sum, event) => sum + eventPaid(event), 0),
      pending: distributions.reduce(
        (sum, event) => sum + eventPending(event),
        0
      ),
      allocated: distributions.reduce(
        (sum, event) => sum + eventAllocated(event),
        0
      ),
    }),
    [distributions]
  );

  const monthlyEvents = useMemo(
    () =>
      distributions.filter((event) =>
        event.eventAttendedDate?.startsWith(selectedMonth)
      ),
    [distributions, selectedMonth]
  );

  const monthlyPayments = useMemo(
    () =>
      distributions.flatMap((event) =>
        event.members.flatMap((member) =>
          (member.payments || [])
            .filter((payment) => payment.paidDate?.startsWith(selectedMonth))
            .map((payment) => ({
              eventName: event.eventName,
              memberName: member.memberName,
              amount: payment.amount,
              paidDate: payment.paidDate,
              referenceNote: payment.referenceNote || "",
            }))
        )
      ),
    [distributions, selectedMonth]
  );

  const monthlySummary = useMemo(() => {
    const allocated = monthlyEvents.reduce(
      (sum, event) => sum + eventAllocated(event),
      0
    );
    const pending = monthlyEvents.reduce(
      (sum, event) => sum + eventPending(event),
      0
    );
    const paid = monthlyPayments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );

    return {
      allocated,
      pending,
      paid,
      eventCount: monthlyEvents.length,
    };
  }, [monthlyEvents, monthlyPayments]);

  const memberReports = useMemo(
    () =>
      teamMembers.map((teamMember) => {
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
      }),
    [teamMembers, distributions]
  );

  const filteredMemberReports = memberReports.filter((member) =>
    member.name.toLowerCase().includes(reportSearch.toLowerCase())
  );

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
    function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = eventName.trim();
    if (!name || selected.length === 0) {
      alert("Enter an event name and select at least one team member.");
      return;
    }

    const allocatedAmounts =
      split === "equal"
        ? (() => {
            const totalCents = Math.round(Number(total) * 100);
            const baseCents = Math.floor(totalCents / selected.length);

            return Object.fromEntries(
              selected.map((id, index) => [
                id,
                (index === selected.length - 1
                  ? totalCents - baseCents * (selected.length - 1)
                  : baseCents) / 100,
              ])
            );
          })()
        : Object.fromEntries(
            selected.map((id) => [
              id,
              Math.round((Number(amounts[id]) || 0) * 100) / 100,
            ])
          );

    const amountTotal = selected.reduce(
      (sum, id) => sum + (allocatedAmounts[id] || 0),
      0
    );

    if (
      selected.some((id) => (allocatedAmounts[id] || 0) <= 0) ||
      amountTotal <= 0
    ) {
      alert("Enter a valid allocation amount for every selected member.");
      return;
    }

    if (
      split === "custom" &&
      Math.abs(amountTotal - Number(total)) > 0.01
    ) {
      alert("The individual allocations must add up to the event total.");
      return;
    }

    const existing = distributions.find((item) => item.id === editingId);

    const members: DistributionMember[] = selected.map((teamMemberId) => {
      const oldMember = existing?.members.find(
        (member) => member.teamMemberId === teamMemberId
      );
      const teamMember = teamMembers.find(
        (member) => member.id === teamMemberId
      );

      return {
        id: oldMember?.id || makeId(),
        teamMemberId,
        memberName: teamMember?.name || oldMember?.memberName || "Unknown",
        allocatedAmount: allocatedAmounts[teamMemberId] || 0,
        payments: oldMember?.payments || [],
      };
    });

    const now = Date.now();

    const updatedEvent: CashDistribution = {
      id: existing?.id || makeId(),
      eventName: name,
      eventAttendedDate: eventDate,
      members,
      notes: notes.trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const updated = existing
      ? distributions.map((item) =>
          item.id === existing.id ? updatedEvent : item
        )
      : [updatedEvent, ...distributions];

    onDistributionsChange(updated);
    resetForm();
  }

  function deleteEvent(eventId: string) {
    const confirmed = window.confirm(
      "Delete this event and all its distribution payment records?"
    );

    if (!confirmed) return;

    onDistributionsChange(
      distributions.filter((event) => event.id !== eventId)
    );

    if (expandedEventId === eventId) {
      setExpandedEventId(null);
    }

    if (paymentEventId === eventId) {
      setPaymentOpen(false);
      setPaymentEventId(null);
      setPaymentMemberId(null);
    }
  }

  function openPayment(event: CashDistribution, member: DistributionMember) {
    setPaymentEventId(event.id);
    setPaymentMemberId(member.id);
    setPaymentAmount(String(memberPending(member).toFixed(2)));
    setPaymentDate(today());
    setPaymentNote("");
    setPaymentOpen(true);
  }

  function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const eventItem = distributions.find(
      (item) => item.id === paymentEventId
    );
    const member = eventItem?.members.find(
      (item) => item.id === paymentMemberId
    );

    if (!eventItem || !member) return;

    const amount = Math.round(Number(paymentAmount) * 100) / 100;
    const pending = memberPending(member);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a valid payment amount.");
      return;
    }

    if (amount > pending + 0.01) {
      alert(`The payment cannot exceed the pending amount of ${money(pending)}.`);
      return;
    }

    const payment: DistributionPayment = {
      id: makeId(),
      amount,
      paidDate: paymentDate,
      referenceNote: paymentNote.trim(),
      createdAt: Date.now(),
    };

    const updated = distributions.map((item) => {
      if (item.id !== eventItem.id) return item;

      return {
        ...item,
        updatedAt: Date.now(),
        members: item.members.map((currentMember) =>
          currentMember.id === member.id
            ? {
                ...currentMember,
                payments: [...(currentMember.payments || []), payment],
              }
            : currentMember
        ),
      };
    });

    onDistributionsChange(updated);
    setPaymentOpen(false);
    setPaymentEventId(null);
    setPaymentMemberId(null);
    setPaymentAmount("");
    setPaymentNote("");
  }

  function deletePayment(eventId: string, memberId: string, paymentId: string) {
    const confirmed = window.confirm("Delete this payment record?");
    if (!confirmed) return;

    const updated = distributions.map((event) => {
      if (event.id !== eventId) return event;

      return {
        ...event,
        updatedAt: Date.now(),
        members: event.members.map((member) =>
          member.id === memberId
            ? {
                ...member,
                payments: (member.payments || []).filter(
                  (payment) => payment.id !== paymentId
                ),
              }
            : member
        ),
      };
    });

    onDistributionsChange(updated);
  }

  const paymentEvent = distributions.find(
    (event) => event.id === paymentEventId
  );

  const paymentMember = paymentEvent?.members.find(
    (member) => member.id === paymentMemberId
  );

  const filteredTeam = teamMembers.filter((member) =>
    member.name.toLowerCase().includes(memberSearch.toLowerCase())
  );
    function exportCSV() {
    const rows: string[][] = [
      [
        "Event",
        "Event Date",
        "Member",
        "Allocated",
        "Payment Date",
        "Payment Amount",
        "Payment Note",
        "Pending",
        "Status",
      ],
    ];

    monthlyEvents.forEach((event) => {
      event.members.forEach((member) => {
        const payments = member.payments || [];

        if (payments.length === 0) {
          rows.push([
            event.eventName,
            event.eventAttendedDate,
            member.memberName,
            member.allocatedAmount.toFixed(2),
            "",
            "",
            "",
            memberPending(member).toFixed(2),
            memberStatus(member),
          ]);
          return;
        }

        payments.forEach((payment) => {
          rows.push([
            event.eventName,
            event.eventAttendedDate,
            member.memberName,
            member.allocatedAmount.toFixed(2),
            payment.paidDate,
            payment.amount.toFixed(2),
            payment.referenceNote || "",
            memberPending(member).toFixed(2),
            memberStatus(member),
          ]);
        });
      });
    });

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `MaxLedger-${selectedMonth}-report.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const eventRows = monthlyEvents
      .map((event) => {
        const memberRows = event.members
          .map((member) => {
            const payments = (member.payments || [])
              .filter((payment) => payment.paidDate.startsWith(selectedMonth))
              .map(
                (payment) =>
                  `<tr>
                    <td>${escapeHtml(member.memberName)}</td>
                    <td>${escapeHtml(formatDate(payment.paidDate))}</td>
                    <td>${money(payment.amount)}</td>
                    <td>${escapeHtml(payment.referenceNote || "—")}</td>
                  </tr>`
              )
              .join("");

            return `
              <tr class="member-row">
                <td>${escapeHtml(member.memberName)}</td>
                <td>${money(member.allocatedAmount)}</td>
                <td>${money(memberPaid(member))}</td>
                <td>${money(memberPending(member))}</td>
                <td>${escapeHtml(memberStatus(member))}</td>
              </tr>
              ${payments}
            `;
          })
          .join("");

        return `
          <section class="event">
            <h2>${escapeHtml(event.eventName)}</h2>
            <p class="muted">Event date: ${escapeHtml(formatDate(event.eventAttendedDate))}</p>
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Allocated</th>
                  <th>Total paid</th>
                  <th>Pending</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${memberRows}</tbody>
            </table>
            ${
              event.notes
                ? `<p class="note">Note: ${escapeHtml(event.notes)}</p>`
                : ""
            }
          </section>
        `;
      })
      .join("");

    const paymentRows = monthlyPayments
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.eventName)}</td>
            <td>${escapeHtml(item.memberName)}</td>
            <td>${escapeHtml(formatDate(item.paidDate))}</td>
            <td>${money(item.amount)}</td>
            <td>${escapeHtml(item.referenceNote || "—")}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert("Allow pop-ups for MaxLedger to create the PDF report.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>MaxLedger Monthly Report - ${escapeHtml(selectedMonth)}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              color: #20251f;
              padding: 28px;
              max-width: 1000px;
              margin: auto;
            }
            h1 { margin-bottom: 4px; }
            h2 { margin-bottom: 6px; font-size: 18px; }
            .muted { color: #687267; font-size: 12px; }
            .summary {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 12px;
              margin: 24px 0;
            }
            .summary-card {
              border: 1px solid #dce2d8;
              border-radius: 10px;
              padding: 14px;
            }
            .summary-card span {
              display: block;
              color: #687267;
              font-size: 11px;
              margin-bottom: 7px;
            }
            .summary-card strong { font-size: 18px; }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 12px 0;
              font-size: 11px;
            }
            th, td {
              border: 1px solid #dce2d8;
              padding: 8px;
              text-align: left;
            }
            th { background: #f0f3ed; }
            .event {
              margin: 24px 0;
              page-break-inside: avoid;
            }
            .note {
              background: #f6f7f3;
              padding: 10px;
              font-size: 12px;
            }
            .section-title { margin-top: 28px; }
            @media print {
              body { padding: 0; }
              .event { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h1>MaxLedger</h1>
          <p class="muted">Monthly Cash Distribution Report · ${escapeHtml(selectedMonth)}</p>

          <div class="summary">
            <div class="summary-card">
              <span>Allocated in selected month</span>
              <strong>${money(monthlySummary.allocated)}</strong>
            </div>
            <div class="summary-card">
              <span>Payments received in selected month</span>
              <strong>${money(monthlySummary.paid)}</strong>
            </div>
            <div class="summary-card">
              <span>Pending from selected month's events</span>
              <strong>${money(monthlySummary.pending)}</strong>
            </div>
          </div>

          <h2 class="section-title">Event breakdown</h2>
          ${eventRows || "<p>No events found for this month.</p>"}

          <h2 class="section-title">Payments received this month</h2>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Member</th>
                <th>Payment date</th>
                <th>Amount</th>
                <th>Reference note</th>
              </tr>
            </thead>
            <tbody>
              ${paymentRows || '<tr><td colspan="5">No payments recorded this month.</td></tr>'}
            </tbody>
          </table>

          <p class="muted">Generated by MaxLedger</p>
          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }
    return (
    <div className="cash-page">
      <header className="cash-header">
        <div>
          <span className="cash-eyebrow">MAXLEDGER · TEAM FINANCES</span>
          <h1>Cash distribution</h1>
          <p>Track event allocations, team payments and pending amounts.</p>
        </div>

        <button className="cash-primary-btn" onClick={startNew}>
          + New distribution
        </button>
      </header>

      <section className="cash-overview">
        <div className="cash-overview-heading">
          <div>
            <span className="cash-eyebrow">OVERVIEW</span>
            <h2>Distribution summary</h2>
          </div>
          <span className="cash-count">
            {distributions.length} events
          </span>
        </div>

        <div className="cash-stats-grid">
          <article className="cash-stat-card">
            <span>Total allocated</span>
            <strong>{money(stats.allocated)}</strong>
            <small>Across all events</small>
          </article>

          <article className="cash-stat-card">
            <span>Total received</span>
            <strong>{money(stats.paid)}</strong>
            <small>Payments recorded</small>
          </article>

          <article className="cash-stat-card">
            <span>Total pending</span>
            <strong>{money(stats.pending)}</strong>
            <small>Awaiting payment</small>
          </article>
        </div>
      </section>

      {formOpen && (
        <section className="cash-panel" id="cash-event-form">
          <div className="cash-panel-heading">
            <div>
              <span className="cash-eyebrow">
                {editingId ? "EDIT DISTRIBUTION" : "NEW DISTRIBUTION"}
              </span>
              <h2>{editingId ? "Update event" : "Create event distribution"}</h2>
            </div>

            <button
              type="button"
              className="cash-icon-btn"
              onClick={resetForm}
              aria-label="Close form"
            >
              ✕
            </button>
          </div>

          <form onSubmit={saveEvent} className="cash-form">
            <label className="cash-field">
              <span>Event name</span>
              <input
                value={eventName}
                onChange={(event) => setEventName(event.target.value)}
                placeholder="e.g. College cultural event"
                required
              />
            </label>

            <label className="cash-field">
              <span>Event attended date</span>
              <input
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
                required
              />
            </label>

            <label className="cash-field">
              <span>Total distribution amount (₹)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={total}
                onChange={(event) => setTotal(event.target.value)}
                placeholder="Enter total amount"
                required
              />
            </label>

            <div className="cash-field">
              <span>Allocation method</span>
              <div className="cash-choice-row">
                <button
                  type="button"
                  className={split === "equal" ? "cash-choice active" : "cash-choice"}
                  onClick={() => setSplit("equal")}
                >
                  Equal split
                </button>
                <button
                  type="button"
                  className={split === "custom" ? "cash-choice active" : "cash-choice"}
                  onClick={() => setSplit("custom")}
                >
                  Custom amounts
                </button>
              </div>
            </div>

            <div className="cash-field cash-team-selector">
              <div className="cash-field-heading">
                <span>Select team members</span>
                <small>{selected.length} selected</small>
              </div>

              <input
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search team members"
              />

              <div className="cash-member-list">
                {filteredTeam.map((member) => (
                  <label key={member.id} className="cash-member-option">
                    <input
                      type="checkbox"
                      checked={selected.includes(member.id)}
                      onChange={() => toggleMember(member.id)}
                    />
                    <span>{member.name}</span>
                  </label>
                ))}

                {filteredTeam.length === 0 && (
                  <p className="cash-empty-small">No matching team members.</p>
                )}
              </div>

              <div className="cash-add-member">
                <input
                  value={newMemberName}
                  onChange={(event) => setNewMemberName(event.target.value)}
                  placeholder="Add a new team member"
                />
                <button type="button" onClick={addMember}>
                  Add member
                </button>
              </div>
            </div>

            {selected.length > 0 && (
              <div className="cash-allocation-list">
                <div className="cash-field-heading">
                  <span>Member allocations</span>
                  <small>
                    {split === "equal" ? "Calculated equally" : "Enter each amount"}
                  </small>
                </div>

                {selected.map((id) => {
                  const member = teamMembers.find((item) => item.id === id);
                  const equalAmount =
                    selected.length > 0
                      ? Math.floor(
                          (Number(total) * 100) / selected.length
                        ) / 100
                      : 0;

                  return (
                    <div className="cash-allocation-row" key={id}>
                      <span>{member?.name || "Unknown member"}</span>

                      {split === "equal" ? (
                        <strong>{money(equalAmount)}</strong>
                      ) : (
                        <label>
                          <span className="cash-sr-only">Allocation amount</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={amounts[id] || ""}
                            onChange={(event) =>
                              setAmounts((current) => ({
                                ...current,
                                [id]: event.target.value,
                              }))
                            }
                            placeholder="Amount"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <label className="cash-field">
              <span>Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Add any details about this distribution..."
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
        <section className="cash-panel" id="cash-payment-form">
          <div className="cash-panel-heading">
            <div>
              <span className="cash-eyebrow">RECORD PAYMENT</span>
              <h2>{paymentMember.memberName}</h2>
              <p>{paymentEvent.eventName}</p>
            </div>

            <button
              type="button"
              className="cash-icon-btn"
              onClick={() => setPaymentOpen(false)}
              aria-label="Close payment form"
            >
              ✕
            </button>
          </div>

          <div className="cash-payment-balance">
            <span>Remaining amount</span>
            <strong>{money(memberPending(paymentMember))}</strong>
          </div>

          <form onSubmit={savePayment} className="cash-form">
            <label className="cash-field">
              <span>Payment amount (₹)</span>
              <input
                type="number"
                min="0.01"
                max={memberPending(paymentMember)}
                step="0.01"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                required
              />
            </label>

            <label className="cash-field">
              <span>Payment date</span>
              <input
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                required
              />
            </label>

            <label className="cash-field">
              <span>Reference / receipt note (optional)</span>
              <input
                value={paymentNote}
                onChange={(event) => setPaymentNote(event.target.value)}
                placeholder="e.g. UPI reference or cash received"
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
                Save payment
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="cash-panel">
        <div className="cash-panel-heading">
          <div>
            <span className="cash-eyebrow">EVENT HISTORY</span>
            <h2>All distributions</h2>
          </div>
          <span className="cash-count">{distributions.length} total</span>
        </div>

        {distributions.length === 0 ? (
          <div className="cash-empty-state">
            <span className="cash-empty-icon">₹</span>
            <h3>No distributions yet</h3>
            <p>Create your first event distribution to start tracking team payments.</p>
            <button className="cash-primary-btn" onClick={startNew}>
              Create distribution
            </button>
          </div>
        ) : (
          <div className="cash-event-list">
            {distributions.map((event) => {
              const isExpanded = expandedEventId === event.id;
              const allocated = eventAllocated(event);
              const paid = eventPaid(event);
              const pending = eventPending(event);

              return (
                <article className="cash-event-card" key={event.id}>
                  <button
                    type="button"
                    className="cash-event-summary"
                    onClick={() =>
                      setExpandedEventId(isExpanded ? null : event.id)
                    }
                  >
                    <div className="cash-event-main">
                      <h3>{event.eventName}</h3>
                      <span>{formatDate(event.eventAttendedDate)}</span>
                      <small>
                        {event.members.length} team member
                        {event.members.length === 1 ? "" : "s"}
                      </small>
                    </div>

                    <div className="cash-event-total">
                      <strong>{money(allocated)}</strong>
                      <span>{money(pending)} pending</span>
                    </div>

                    <span className="cash-expand-icon">
                      {isExpanded ? "−" : "+"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="cash-event-details">
                      <div className="cash-event-metrics">
                        <div>
                          <span>Allocated</span>
                          <strong>{money(allocated)}</strong>
                        </div>
                        <div>
                          <span>Received</span>
                          <strong>{money(paid)}</strong>
                        </div>
                        <div>
                          <span>Pending</span>
                          <strong>{money(pending)}</strong>
                        </div>
                      </div>

                      <div className="cash-distribution-members">
                        {event.members.map((member) => {
                          const memberPayments = member.payments || [];
                          const status = memberStatus(member);

                          return (
                            <div className="cash-distribution-member" key={member.id}>
                              <div className="cash-distribution-member-top">
                                <div>
                                  <h4>{member.memberName}</h4>
                                  <span>
                                    Paid {money(memberPaid(member))} of{" "}
                                    {money(member.allocatedAmount)}
                                  </span>
                                </div>

                                <span
                                  className={`cash-status cash-status-${status.toLowerCase()}`}
                                >
                                  {status}
                                </span>
                              </div>

                              <div className="cash-progress-track">
                                <div
                                  className="cash-progress-fill"
                                  style={{
                                    width: `${
                                      member.allocatedAmount > 0
                                        ? Math.min(
                                            100,
                                            (memberPaid(member) /
                                              member.allocatedAmount) *
                                              100
                                          )
                                        : 0
                                    }%`,
                                  }}
                                />
                              </div>

                              <div className="cash-member-financials">
                                <span>
                                  Pending: <strong>{money(memberPending(member))}</strong>
                                </span>
                                <button
                                  type="button"
                                  className="cash-text-btn"
                                  disabled={memberPending(member) <= 0}
                                  onClick={() => openPayment(event, member)}
                                >
                                  + Add payment
                                </button>
                              </div>

                              {memberPayments.length > 0 && (
                                <div className="cash-payment-history">
                                  <h5>Payment history</h5>

                                  {memberPayments.map((payment) => (
                                    <div
                                      className="cash-payment-row"
                                      key={payment.id}
                                    >
                                      <div>
                                        <strong>{money(payment.amount)}</strong>
                                        <span>{formatDate(payment.paidDate)}</span>
                                        {payment.referenceNote && (
                                          <small>{payment.referenceNote}</small>
                                        )}
                                      </div>

                                      <button
                                        type="button"
                                        className="cash-delete-text"
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

                      {event.notes && (
                        <div className="cash-event-notes">
                          <strong>Notes</strong>
                          <p>{event.notes}</p>
                        </div>
                      )}

                      <div className="cash-event-actions">
                        <button
                          type="button"
                          className="cash-secondary-btn"
                          onClick={() => editEvent(event)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="cash-secondary-btn"
                          onClick={() => duplicateEvent(event)}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="cash-delete-btn"
                          onClick={() => deleteEvent(event.id)}
                        >
                          Delete event
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="cash-panel cash-reports">
        <div className="cash-panel-heading">
          <div>
            <span className="cash-eyebrow">ANALYTICS</span>
            <h2>Reports & exports</h2>
            <p>Review monthly activity and team member balances.</p>
          </div>
        </div>

        <div className="cash-report-toolbar">
          <label className="cash-field">
            <span>Report month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </label>

          <div className="cash-export-actions">
            <button
              type="button"
              className="cash-secondary-btn"
              onClick={exportCSV}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="cash-primary-btn"
              onClick={exportPDF}
            >
              Export PDF
            </button>
          </div>
        </div>

        <div className="cash-month-summary">
          <div>
            <span>Events this month</span>
            <strong>{monthlyEvents.length}</strong>
          </div>
          <div>
            <span>Allocated</span>
            <strong>{money(monthlySummary.allocated)}</strong>
          </div>
          <div>
            <span>Received this month</span>
            <strong>{money(monthlySummary.paid)}</strong>
          </div>
          <div>
            <span>Pending from these events</span>
            <strong>{money(monthlySummary.pending)}</strong>
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
            {monthlyEvents.length === 0 ? (
              <p className="cash-empty-small">No events found for this month.</p>
            ) : (
              monthlyEvents.map((event) => (
                <div className="cash-report-row" key={event.id}>
                  <div>
                    <strong>{event.eventName}</strong>
                    <span>{formatDate(event.eventAttendedDate)}</span>
                  </div>
                  <div>
                    <strong>{money(eventAllocated(event))}</strong>
                    <span>{money(eventPending(event))} pending</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="cash-member-report">
            <input
              value={reportSearch}
              onChange={(event) => setReportSearch(event.target.value)}
              placeholder="Search team member"
            />

            {filteredMemberReports.length === 0 ? (
              <p className="cash-empty-small">No member records found.</p>
            ) : (
              filteredMemberReports.map((member) => (
  <div className="cash-report-row" key={member.id}>
    <div>
      <strong>{member.name}</strong>
      <span>{member.eventCount} event(s)</span>
    </div>
    <div>
      <strong>{money(member.allocated)}</strong>
      <span>
        {money(member.paid)} received · {money(member.pending)} pending
      </span>
    </div>
  </div>
))
            )}
          </div>
        )}
      </section>

      <footer className="cash-footer">
        <span>MAXLEDGER</span>
        <span>Cash distribution · Team payment tracking</span>
      </footer>
    </div>
  );
}
  
