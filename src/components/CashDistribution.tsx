import { useMemo, useState, type FormEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Printer } from "@capgo/capacitor-printer";
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
type PeriodMode = "monthly" | "yearly";
type PaymentFilter = "all" | "paid" | "partial" | "unpaid";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const makeId = () => crypto.randomUUID();
const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (value?: string) => {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
};
const escapeHtml = (value: string) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
const memberPaid = (member: DistributionMember) =>
  (member.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
const memberPending = (member: DistributionMember) =>
  Math.max(0, Number(member.allocatedAmount || 0) - memberPaid(member));
const memberStatus = (member: DistributionMember): PaymentFilter => {
  if (memberPending(member) <= 0) return "paid";
  if (memberPaid(member) > 0) return "partial";
  return "unpaid";
};
const statusLabel = (status: PaymentFilter) =>
  status === "paid" ? "Paid" : status === "partial" ? "Partially paid" : status === "unpaid" ? "Unpaid" : "All";
const eventAllocated = (event: CashDistribution) =>
  event.members.reduce((sum, m) => sum + Number(m.allocatedAmount || 0), 0);
const eventPaid = (event: CashDistribution) =>
  event.members.reduce((sum, m) => sum + memberPaid(m), 0);
const eventPending = (event: CashDistribution) =>
  event.members.reduce((sum, m) => sum + memberPending(m), 0);
const eventStatus = (event: CashDistribution): PaymentFilter => {
  if (eventPending(event) <= 0) return "paid";
  if (eventPaid(event) > 0) return "partial";
  return "unpaid";
};

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
  const [location, setLocation] = useState("");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [notes, setNotes] = useState("");
  const [split, setSplit] = useState<SplitMode>("equal");
  const [total, setTotal] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [newMemberName, setNewMemberName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [editingTeamMemberId, setEditingTeamMemberId] = useState<string | null>(null);
  const [teamMemberEditName, setTeamMemberEditName] = useState("");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState<ReportTab>("events");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("monthly");
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(today().slice(0, 4));
  const [reportSearch, setReportSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [paymentEventId, setPaymentEventId] = useState<string | null>(null);
  const [paymentMemberId, setPaymentMemberId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);

  const stats = useMemo(() => ({
    allocated: distributions.reduce((s, e) => s + eventAllocated(e), 0),
    paid: distributions.reduce((s, e) => s + eventPaid(e), 0),
    pending: distributions.reduce((s, e) => s + eventPending(e), 0),
  }), [distributions]);

  const periodEvents = useMemo(() => distributions.filter((event) =>
    periodMode === "monthly"
      ? event.eventAttendedDate?.startsWith(selectedMonth)
      : event.eventAttendedDate?.startsWith(selectedYear)
  ), [distributions, periodMode, selectedMonth, selectedYear]);

  const periodPayments = useMemo(() => distributions.flatMap((event) =>
    event.members.flatMap((member) => (member.payments || [])
      .filter((payment) => periodMode === "monthly"
        ? payment.paidDate?.startsWith(selectedMonth)
        : payment.paidDate?.startsWith(selectedYear))
      .map((payment) => ({
        eventName: event.eventName,
        memberName: member.memberName,
        amount: payment.amount,
        paidDate: payment.paidDate,
        referenceNote: payment.referenceNote || "",
      }))
    )
  ), [distributions, periodMode, selectedMonth, selectedYear]);

  const periodSummary = useMemo(() => ({
    allocated: periodEvents.reduce((s, e) => s + eventAllocated(e), 0),
    pending: periodEvents.reduce((s, e) => s + eventPending(e), 0),
    paid: periodPayments.reduce((s, p) => s + p.amount, 0),
    eventCount: periodEvents.length,
  }), [periodEvents, periodPayments]);

  const previousMonth = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const d = new Date(year, month - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [selectedMonth]);

  const previousMonthEvents = useMemo(() =>
    distributions.filter((e) => e.eventAttendedDate?.startsWith(previousMonth)),
  [distributions, previousMonth]);

  const previousMonthPayments = useMemo(() =>
    distributions.flatMap((e) => e.members.flatMap((m) =>
      (m.payments || []).filter((p) => p.paidDate?.startsWith(previousMonth))
        .map((p) => p.amount)
    )).reduce((sum, amount) => sum + amount, 0),
  [distributions, previousMonth]);

  const filteredEvents = useMemo(() => distributions.filter((event) => {
    const q = eventSearch.trim().toLowerCase();
    const matchesName = !q || event.eventName.toLowerCase().includes(q) ||
      (event.location || "").toLowerCase().includes(q);
    const matchesDate = !filterDate || event.eventAttendedDate === filterDate;
    const matchesStatus = paymentFilter === "all" || eventStatus(event) === paymentFilter;
    const matchesTeam = teamFilter === "all" ||
      event.members.some((m) => m.teamMemberId === teamFilter);
    return matchesName && matchesDate && matchesStatus && matchesTeam;
  }), [distributions, eventSearch, filterDate, paymentFilter, teamFilter]);

  const memberReports = useMemo(() => teamMembers.map((person) => {
    const rows = distributions.flatMap((event) => event.members
      .filter((m) => m.teamMemberId === person.id)
      .map((m) => ({
        event: event.eventName, date: event.eventAttendedDate,
        allocated: m.allocatedAmount, paid: memberPaid(m), pending: memberPending(m),
      })));
    return {
      ...person, rows, eventCount: rows.length,
      allocated: rows.reduce((s, r) => s + r.allocated, 0),
      paid: rows.reduce((s, r) => s + r.paid, 0),
      pending: rows.reduce((s, r) => s + r.pending, 0),
    };
  }), [teamMembers, distributions]);

  const filteredMemberReports = memberReports.filter((m) =>
    m.name.toLowerCase().includes(reportSearch.toLowerCase())
  );

  function resetForm() {
    setFormOpen(false); setEditingId(null); setEventName(""); setEventDate(today());
    setLocation(""); setInTime(""); setOutTime(""); setNotes(""); setSplit("equal");
    setTotal(""); setSelected([]); setAmounts({}); setNewMemberName(""); setMemberSearch("");
  }
  function startNew() { resetForm(); setFormOpen(true); }
  function toggleMember(id: string) {
    setSelected((previous) => previous.includes(id)
      ? previous.filter((item) => item !== id) : [...previous, id]);
  }
    function addTeamMember() {
    const name = newMemberName.trim();
    if (!name) return;
    if (teamMembers.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      alert("This team member already exists.");
      return;
    }
    const now = Date.now();
    const member: TeamMember = {
      id: makeId(), name, createdAt: now, updatedAt: now,
    };
    onTeamMembersChange([...teamMembers, member]);
    setSelected((previous) => [...previous, member.id]);
    setNewMemberName("");
  }

  function saveTeamMemberEdit(id: string) {
    const name = teamMemberEditName.trim();
    if (!name) return;
    if (teamMembers.some((m) => m.id !== id && m.name.toLowerCase() === name.toLowerCase())) {
      alert("Another team member already has that name.");
      return;
    }
    onTeamMembersChange(teamMembers.map((m) =>
      m.id === id ? { ...m, name, updatedAt: Date.now() } : m
    ));
    setEditingTeamMemberId(null);
    setTeamMemberEditName("");
  }

  function deleteTeamMember(id: string) {
    const member = teamMembers.find((m) => m.id === id);
    if (!member) return;
    if (!confirm(`Delete ${member.name} from the team list? Existing event history will remain.`)) return;
    onTeamMembersChange(teamMembers.filter((m) => m.id !== id));
    setSelected((previous) => previous.filter((item) => item !== id));
  }

  function openEditEvent(event: CashDistribution) {
    setEditingId(event.id);
    setEventName(event.eventName);
    setEventDate(event.eventAttendedDate || today());
    setLocation(event.location || "");
    setInTime(event.inTime || "");
    setOutTime(event.outTime || "");
    setNotes(event.notes || "");
    setSelected(event.members.map((m) => m.teamMemberId));
    setAmounts(Object.fromEntries(event.members.map((m) => [m.teamMemberId, String(m.allocatedAmount)])));
    setTotal(String(eventAllocated(event)));
    setSplit("custom");
    setFormOpen(true);
  }

  function saveEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!eventName.trim()) {
      alert("Enter an event name.");
      return;
    }
    if (!eventDate) {
      alert("Choose the event date.");
      return;
    }
    if (selected.length === 0) {
      alert("Select at least one team member.");
      return;
    }

    const totalValue = Number(total);
    if (split === "equal" && (!total.trim() || !Number.isFinite(totalValue) || totalValue <= 0)) {
      alert("Enter a valid total amount for equal split.");
      return;
    }

    let allocationAmounts: Record<string, number> = {};
    if (split === "equal") {
      const each = Math.floor((totalValue / selected.length) * 100) / 100;
      const remainder = Math.round((totalValue - each * selected.length) * 100) / 100;
      selected.forEach((id, index) => {
        allocationAmounts[id] = each + (index === 0 ? remainder : 0);
      });
    } else {
      for (const id of selected) {
        const value = Number(amounts[id]);
        if (!amounts[id]?.trim() || !Number.isFinite(value) || value < 0) {
          alert("Enter a valid allocation for each selected member.");
          return;
        }
        allocationAmounts[id] = value;
      }
      const allocatedTotal = Object.values(allocationAmounts).reduce((sum, value) => sum + value, 0);
      if (total.trim() && Math.abs(allocatedTotal - totalValue) > 0.01) {
        alert(`The allocations add up to ${money(allocatedTotal)}, not ${money(totalValue)}.`);
        return;
      }
    }

    const existing = editingId ? distributions.find((d) => d.id === editingId) : undefined;
    const members: DistributionMember[] = selected.map((id) => {
      const oldMember = existing?.members.find((m) => m.teamMemberId === id);
      const person = teamMembers.find((m) => m.id === id);
      return {
        id: oldMember?.id || makeId(),
        teamMemberId: id,
        memberName: person?.name || oldMember?.memberName || "Unknown member",
        allocatedAmount: Math.round((allocationAmounts[id] || 0) * 100) / 100,
        payments: oldMember?.payments || [],
      };
    });

    const now = Date.now();
    const event: CashDistribution = {
      id: editingId || makeId(),
      eventName: eventName.trim(),
      eventAttendedDate: eventDate,
      location: location.trim() || undefined,
      inTime: inTime || undefined,
      outTime: outTime || undefined,
      members,
      notes: notes.trim() || undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (existing) {
      onDistributionsChange(distributions.map((d) => d.id === existing.id ? event : d));
    } else {
      onDistributionsChange([event, ...distributions]);
    }
    resetForm();
  }

  function duplicateEvent(event: CashDistribution) {
    const copy: CashDistribution = {
      ...event,
      id: makeId(),
      eventName: `${event.eventName} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      members: event.members.map((m) => ({
        ...m, id: makeId(), payments: [],
      })),
    };
    onDistributionsChange([copy, ...distributions]);
    setExpandedEventId(copy.id);
  }

  function deleteEvent(id: string) {
    const event = distributions.find((d) => d.id === id);
    if (!event) return;
    if (!confirm(`Delete "${event.eventName}" and its payment records?`)) return;
    onDistributionsChange(distributions.filter((d) => d.id !== id));
    if (expandedEventId === id) setExpandedEventId(null);
  }

  function openPayment(event: CashDistribution, member: DistributionMember) {
    setPaymentEventId(event.id);
    setPaymentMemberId(member.id);
    setPaymentAmount(String(memberPending(member)));
    setPaymentDate(today());
    setPaymentNote("");
    setPaymentOpen(true);
  }

  function savePayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = Number(paymentAmount);
    if (!paymentEventId || !paymentMemberId || !paymentAmount.trim() ||
        !Number.isFinite(amount) || amount <= 0) {
      alert("Enter a valid payment amount.");
      return;
    }

    const event = distributions.find((d) => d.id === paymentEventId);
    const member = event?.members.find((m) => m.id === paymentMemberId);
    if (!event || !member) return;

    if (amount > memberPending(member) + 0.01) {
      alert(`Payment cannot exceed the pending amount (${money(memberPending(member))}).`);
      return;
    }

    const payment: DistributionPayment = {
      id: makeId(),
      amount: Math.round(amount * 100) / 100,
      paidDate: paymentDate,
      referenceNote: paymentNote.trim() || undefined,
      createdAt: Date.now(),
    };

    onDistributionsChange(distributions.map((d) => d.id !== event.id ? d : {
      ...d,
      updatedAt: Date.now(),
      members: d.members.map((m) => m.id === member.id
        ? { ...m, payments: [...(m.payments || []), payment] }
        : m),
    }));
    setPaymentOpen(false);
    setPaymentEventId(null);
    setPaymentMemberId(null);
  }

  function deletePayment(eventId: string, memberId: string, paymentId: string) {
    if (!confirm("Delete this payment record?")) return;
    onDistributionsChange(distributions.map((event) => event.id !== eventId ? event : {
      ...event,
      updatedAt: Date.now(),
      members: event.members.map((member) => member.id !== memberId ? member : {
        ...member,
        payments: (member.payments || []).filter((p) => p.id !== paymentId),
      }),
    }));
  }

  function csvEscape(value: unknown) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }
    async function exportCSV() {
    const rows = [
      [
        "Event", "Event Date", "Location", "In Time", "Out Time",
        "Team Member", "Allocated", "Received", "Pending",
        "Payment Date", "Payment Amount", "Payment Note",
      ],
    ];

    distributions.forEach((event) => {
      event.members.forEach((member) => {
        if (!member.payments?.length) {
          rows.push([
            event.eventName, event.eventAttendedDate, event.location || "",
            event.inTime || "", event.outTime || "", member.memberName,
            String(member.allocatedAmount), String(memberPaid(member)),
            String(memberPending(member)), "", "", "",
          ]);
        } else {
          member.payments.forEach((payment) => {
            rows.push([
              event.eventName, event.eventAttendedDate, event.location || "",
              event.inTime || "", event.outTime || "", member.memberName,
              String(member.allocatedAmount), String(memberPaid(member)),
              String(memberPending(member)), payment.paidDate,
              String(payment.amount), payment.referenceNote || "",
            ]);
          });
        }
      });
    });

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const filename = `MaxLedger-Distribution-${today()}.csv`;

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.writeFile({
          path: filename,
          data: csv,
          directory: Directory.Cache,
          encoding: "utf8" as never,
        });
        await Share.share({
          title: "MaxLedger CSV Report",
          text: "Exported event distribution report",
          files: [result.uri],
        });
      } else {
        const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("CSV export failed", error);
      alert("CSV export failed. Please try again.");
    }
  }

  async function exportPDF() {
    const reportRows = distributions.map((event) => `
      <section class="event">
        <h2>${escapeHtml(event.eventName)}</h2>
        <p>
          Date: ${escapeHtml(formatDate(event.eventAttendedDate))}
          ${event.location ? ` | Location: ${escapeHtml(event.location)}` : ""}
          ${event.inTime ? ` | In: ${escapeHtml(event.inTime)}` : ""}
          ${event.outTime ? ` | Out: ${escapeHtml(event.outTime)}` : ""}
        </p>
        <table>
          <thead><tr><th>Team Member</th><th>Allocated</th><th>Received</th><th>Pending</th></tr></thead>
          <tbody>
            ${event.members.map((member) => `
              <tr>
                <td>${escapeHtml(member.memberName)}</td>
                <td>${money(member.allocatedAmount)}</td>
                <td>${money(memberPaid(member))}</td>
                <td>${money(memberPending(member))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p><strong>Total allocated:</strong> ${money(eventAllocated(event))}
          | <strong>Received:</strong> ${money(eventPaid(event))}
          | <strong>Pending:</strong> ${money(eventPending(event))}
        </p>
      </section>
    `).join("");

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>MaxLedger Distribution Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #18221b; }
          h1 { color: #16784b; }
          h2 { margin-bottom: 6px; }
          .summary { background: #eef7f0; padding: 12px; margin: 16px 0; }
          .event { page-break-inside: avoid; margin: 22px 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #e9f3ec; }
        </style>
      </head>
      <body>
        <h1>MaxLedger — Distribution Report</h1>
        <p>Generated on ${escapeHtml(formatDate(today()))}</p>
        <div class="summary">
          <strong>Total allocated:</strong> ${money(stats.allocated)}<br>
          <strong>Total received:</strong> ${money(stats.paid)}<br>
          <strong>Total pending:</strong> ${money(stats.pending)}
        </div>
        ${reportRows}
      </body>
      </html>
    `;

    try {
      if (Capacitor.isNativePlatform()) {
        await Printer.printHtml({
          name: "MaxLedger Distribution Report",
          html,
        });
      } else {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          alert("Please allow pop-ups to print this report.");
          return;
        }
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }
    } catch (error) {
      console.error("PDF/print export failed", error);
      alert("Unable to open the PDF print screen.");
    }
  }

  function getMonthName(month: string) {
    if (!month) return "";
    const [year, monthNumber] = month.split("-").map(Number);
    return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-IN", {
      month: "long", year: "numeric",
    });
  }

  function getYearOptions() {
    const years = new Set<string>([String(new Date().getFullYear())]);
    distributions.forEach((event) => {
      if (event.eventAttendedDate) years.add(event.eventAttendedDate.slice(0, 4));
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }

  const selectedReportLabel = periodMode === "monthly"
    ? getMonthName(selectedMonth)
    : selectedYear;

  const previousMonthAllocated = previousMonthEvents.reduce(
    (sum, event) => sum + eventAllocated(event), 0
  );
  const previousMonthPending = previousMonthEvents.reduce(
    (sum, event) => sum + eventPending(event), 0
  );

  function renderEventMember(event: CashDistribution, member: DistributionMember) {
    const status = memberStatus(member);
    return (
      <div className="cash-distribution-member" key={member.id}>
        <div className="cash-distribution-member-top">
          <div>
            <strong>{member.memberName}</strong>
            <span className={`cash-status cash-status-${status}`}>
              {statusLabel(status)}
            </span>
          </div>
          <div className="cash-member-financials">
            <span>Allocated: {money(member.allocatedAmount)}</span>
            <span>Received: {money(memberPaid(member))}</span>
            <span>Pending: {money(memberPending(member))}</span>
          </div>
        </div>

        <div className="cash-progress-track">
          <div
            className="cash-progress-fill"
            style={{
              width: `${member.allocatedAmount > 0
                ? Math.min(100, memberPaid(member) / member.allocatedAmount * 100)
                : 100}%`,
            }}
          />
        </div>

        {memberPending(member) > 0 && (
          <button
            type="button"
            className="cash-text-btn"
            onClick={() => openPayment(event, member)}
          >
            + Record payment
          </button>
        )}

        {!!member.payments?.length && (
          <div className="cash-payment-history">
            <strong>Payment history</strong>
            {member.payments.map((payment) => (
              <div className="cash-payment-row" key={payment.id}>
                <span>
                  {formatDate(payment.paidDate)} · {money(payment.amount)}
                  {payment.referenceNote ? ` · ${payment.referenceNote}` : ""}
                </span>
                <button
                  type="button"
                  className="cash-delete-text"
                  onClick={() => deletePayment(event.id, member.id, payment.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
    return (
    <div className="cash-page">
      <header className="cash-header">
        <div>
          <h1>Cash Distribution</h1>
          <p>Track event allocations, team payments and pending balances.</p>
        </div>
        <button type="button" className="cash-primary-btn" onClick={startNew}>
          + New Distribution
        </button>
      </header>

      {/* Event create/edit form */}
      {formOpen && (
        <section className="cash-panel cash-form-panel">
          <h2>{editingId ? "Edit Distribution" : "New Distribution"}</h2>

          <form className="cash-form" onSubmit={saveEvent}>
            <div className="cash-field">
              <label>Event Name *</label>
              <input
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Enter event name"
                required
              />
            </div>

            <div className="cash-field">
              <label>Event Date *</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
            </div>

            <div className="cash-field">
              <label>Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Event venue/location"
              />
            </div>

            <div className="cash-time-row">
              <div className="cash-field">
                <label>In Time</label>
                <input
                  type="time"
                  value={inTime}
                  onChange={(e) => setInTime(e.target.value)}
                />
              </div>
              <div className="cash-field">
                <label>Out Time</label>
                <input
                  type="time"
                  value={outTime}
                  onChange={(e) => setOutTime(e.target.value)}
                />
              </div>
            </div>

            <div className="cash-field">
              <label>Team Members</label>
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search team members"
              />

              <div className="cash-member-list">
                {teamMembers
                  .filter((m) => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
                  .map((member) => (
                    <div className="cash-member-option" key={member.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected.includes(member.id)}
                          onChange={() => toggleMember(member.id)}
                        />
                        <span>{member.name}</span>
                      </label>

                      {editingTeamMemberId === member.id ? (
                        <div className="cash-inline-edit">
                          <input
                            value={teamMemberEditName}
                            onChange={(e) => setTeamMemberEditName(e.target.value)}
                            aria-label="Edit team member name"
                          />
                          <button
                            type="button"
                            onClick={() => saveTeamMemberEdit(member.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTeamMemberId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="cash-member-manage-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTeamMemberId(member.id);
                              setTeamMemberEditName(member.name);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTeamMember(member.id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              <div className="cash-add-member">
                <input
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Add new team member"
                />
                <button type="button" onClick={addTeamMember}>
                  Add Member
                </button>
              </div>
            </div>

            <div className="cash-field">
              <label>Allocation Type</label>
              <div className="cash-choice-row">
                <button
                  type="button"
                  className={`cash-choice ${split === "equal" ? "active" : ""}`}
                  onClick={() => setSplit("equal")}
                >
                  Equal Split
                </button>
                <button
                  type="button"
                  className={`cash-choice ${split === "custom" ? "active" : ""}`}
                  onClick={() => setSplit("custom")}
                >
                  Custom Amount
                </button>
              </div>
            </div>

            <div className="cash-field">
              <label>
                Total Distribution Amount {split === "equal" ? "*" : "(optional)"}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder={split === "equal" ? "Required for equal split" : "Optional"}
                required={split === "equal"}
              />
              {split === "equal" && selected.length > 0 && Number(total) > 0 && (
                <small>
                  Approx. {money(Number(total) / selected.length)} per member
                </small>
              )}
            </div>

            {split === "custom" && selected.length > 0 && (
              <div className="cash-allocation-list">
                <h3>Individual Allocations</h3>
                {selected.map((id) => {
                  const member = teamMembers.find((m) => m.id === id);
                  return (
                    <div className="cash-allocation-row" key={id}>
                      <label>{member?.name || "Unknown member"}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amounts[id] || ""}
                        onChange={(e) =>
                          setAmounts((previous) => ({
                            ...previous,
                            [id]: e.target.value,
                          }))
                        }
                        placeholder="Amount"
                        required
                      />
                    </div>
                  );
                })}
                <p>
                  Allocation total:{" "}
                  {money(selected.reduce((sum, id) => sum + Number(amounts[id] || 0), 0))}
                </p>
              </div>
            )}

            <div className="cash-field">
              <label>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional event notes"
                rows={3}
              />
            </div>

            <div className="cash-form-actions">
              <button type="submit" className="cash-primary-btn">
                {editingId ? "Save Changes" : "Create Distribution"}
              </button>
              <button type="button" className="cash-secondary-btn" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Payment dialog */}
      {paymentOpen && (
        <section className="cash-panel">
          <h2>Record Payment</h2>
          <form className="cash-form" onSubmit={savePayment}>
            <div className="cash-field">
              <label>Amount *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
              />
            </div>
            <div className="cash-field">
              <label>Payment Date *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>
            <div className="cash-field">
              <label>Reference / Note</label>
              <input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Optional reference"
              />
            </div>
            <div className="cash-form-actions">
              <button type="submit" className="cash-primary-btn">
                Save Payment
              </button>
              <button
                type="button"
                className="cash-secondary-btn"
                onClick={() => setPaymentOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Event history */}
      <section className="cash-panel">
        <div className="cash-panel-heading">
          <div>
            <h2>Distribution History</h2>
            <p>Search and filter events.</p>
          </div>
          <div className="cash-export-actions">
            <button type="button" onClick={exportCSV}>Export CSV</button>
            <button type="button" onClick={exportPDF}>Export PDF</button>
          </div>
        </div>

        <div className="cash-search-filter-grid">
          <input
            value={eventSearch}
            onChange={(e) => setEventSearch(e.target.value)}
            placeholder="Search event or location"
          />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            aria-label="Filter by event date"
          />
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
          >
            <option value="all">All payment statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partially paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All team members</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="cash-empty-state">
            <h3>No distributions found</h3>
            <p>Create a distribution or adjust your filters.</p>
          </div>
        ) : (
          <div className="cash-event-list">
            {filteredEvents.map((event) => {
              const status = eventStatus(event);
              const expanded = expandedEventId === event.id;

              return (
                <article className="cash-event-card" key={event.id}>
                  <div className="cash-event-summary">
                    <button
                      type="button"
                      className="cash-event-main"
                      onClick={() => setExpandedEventId(expanded ? null : event.id)}
                    >
                      <div>
                        <h3>{event.eventName}</h3>
                        <p>
                          {formatDate(event.eventAttendedDate)}
                          {event.location ? ` · ${event.location}` : ""}
                        </p>
                        {(event.inTime || event.outTime) && (
                          <p>
                            {event.inTime ? `In: ${event.inTime}` : ""}
                            {event.inTime && event.outTime ? " · " : ""}
                            {event.outTime ? `Out: ${event.outTime}` : ""}
                          </p>
                        )}
                      </div>
                      <span className={`cash-status cash-status-${status}`}>
                        {statusLabel(status)}
                      </span>
                    </button>
                    <div className="cash-event-total">
                      <strong>{money(eventAllocated(event))}</strong>
                      <small>Allocated</small>
                      <small>Received: {money(eventPaid(event))}</small>
                      <small>Pending: {money(eventPending(event))}</small>
                    </div>
                  </div>

                  <div className="cash-event-actions">
                    <button type="button" onClick={() => openEditEvent(event)}>Edit</button>
                    <button type="button" onClick={() => duplicateEvent(event)}>Duplicate</button>
                    <button type="button" onClick={() => deleteEvent(event.id)}>Delete</button>
                  </div>

                  {expanded && (
                    <div className="cash-event-details">
                      {event.notes && <p className="cash-event-notes">{event.notes}</p>}
                      <div className="cash-distribution-members">
                        {event.members.map((member) => renderEventMember(event, member))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Reports */}
      <section className="cash-panel">
        <div className="cash-panel-heading">
          <div>
            <h2>Reports</h2>
            <p>Event and team-member payment reports.</p>
          </div>
        </div>

        <div className="cash-report-toolbar">
          <div className="cash-choice-row">
            <button
              type="button"
              className={`cash-choice ${periodMode === "monthly" ? "active" : ""}`}
              onClick={() => setPeriodMode("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`cash-choice ${periodMode === "yearly" ? "active" : ""}`}
              onClick={() => setPeriodMode("yearly")}
            >
              Yearly
            </button>
          </div>

          {periodMode === "monthly" ? (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          ) : (
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
              {getYearOptions().map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          )}
        </div>

        <h3>{selectedReportLabel} Summary</h3>
        <div className="cash-month-summary">
          <div>
            <span>Events</span>
            <strong>{periodSummary.eventCount}</strong>
          </div>
          <div>
            <span>Allocated</span>
            <strong>{money(periodSummary.allocated)}</strong>
          </div>
          <div>
            <span>Received during period</span>
            <strong>{money(periodSummary.paid)}</strong>
          </div>
          <div>
            <span>Pending balance</span>
            <strong>{money(periodSummary.pending)}</strong>
          </div>
        </div>

        <div className="cash-report-tabs">
          <button
            type="button"
            className={reportTab === "events" ? "active" : ""}
            onClick={() => setReportTab("events")}
          >
            Event Report
          </button>
          <button
            type="button"
            className={reportTab === "members" ? "active" : ""}
            onClick={() => setReportTab("members")}
          >
            Team Member Report
          </button>
        </div>

        {reportTab === "events" ? (
          <div className="cash-report-list">
            {periodEvents.length === 0 ? (
              <p>No events found for this period.</p>
            ) : periodEvents.map((event) => (
              <div className="cash-report-row" key={event.id}>
                <div>
                  <strong>{event.eventName}</strong>
                  <small>{formatDate(event.eventAttendedDate)}</small>
                </div>
                <div>
                  <span>Allocated: {money(eventAllocated(event))}</span>
                  <span>Received: {money(eventPaid(event))}</span>
                  <span>Pending: {money(eventPending(event))}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <input
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              placeholder="Search team member"
            />
            <div className="cash-member-report">
              {filteredMemberReports.map((member) => (
                <div className="cash-report-row" key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <small>{member.eventCount} event(s)</small>
                  </div>
                  <div>
                    <span>Allocated: {money(member.allocated)}</span>
                    <span>Received: {money(member.paid)}</span>
                    <span>Pending: {money(member.pending)}</span>
                  </div>
                  {member.rows.map((row, index) => (
                    <small key={`${member.id}-${index}`}>
                      {row.event} · {formatDate(row.date)} · Pending {money(row.pending)}
                    </small>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Month-to-month comparison */}
      <section className="cash-panel">
        <h2>Month-to-Month Comparison</h2>
        <p>
          Comparing {getMonthName(selectedMonth)} with {getMonthName(previousMonth)}.
        </p>
        <div className="cash-month-summary">
          <div>
            <span>Current allocated</span>
            <strong>{money(periodMode === "monthly" ? periodSummary.allocated : 0)}</strong>
          </div>
          <div>
            <span>Previous allocated</span>
            <strong>{money(previousMonthAllocated)}</strong>
          </div>
          <div>
            <span>Current received</span>
            <strong>{money(periodMode === "monthly" ? periodSummary.paid : 0)}</strong>
          </div>
          <div>
            <span>Previous received</span>
            <strong>{money(previousMonthPayments)}</strong>
          </div>
          <div>
            <span>Previous pending</span>
            <strong>{money(previousMonthPending)}</strong>
          </div>
        </div>
        {periodMode !== "monthly" && (
          <p>Choose Monthly above to compare the selected month against the previous month.</p>
        )}
      </section>

      {/* Distribution summary intentionally at the bottom */}
      <section className="cash-panel cash-summary-bottom">
        <h2>Distribution Summary</h2>
        <div className="cash-stats">
          <div className="cash-stat-card">
            <span>Total Allocated</span>
            <strong>{money(stats.allocated)}</strong>
          </div>
          <div className="cash-stat-card cash-stat-paid">
            <span>Total Received</span>
            <strong>{money(stats.paid)}</strong>
          </div>
          <div className="cash-stat-card cash-stat-pending">
            <span>Total Pending</span>
            <strong>{money(stats.pending)}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
