import "../styles/cash-distribution-premium.css";
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
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const makeId = () => crypto.randomUUID();

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value?: string) => {
  if (!value) return "—";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const escapeHtml = (value: string) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] || character));

const memberPaid = (member: DistributionMember) =>
  (member.payments || []).reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  );

const memberPending = (member: DistributionMember) =>
  Math.max(
    0,
    Number(member.allocatedAmount || 0) - memberPaid(member)
  );

const memberStatus = (member: DistributionMember): PaymentFilter => {
  if (memberPending(member) <= 0.009) return "paid";
  if (memberPaid(member) > 0) return "partial";
  return "unpaid";
};

const statusLabel = (status: PaymentFilter) => {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partially paid";
  if (status === "unpaid") return "Unpaid";
  return "All";
};

const eventAllocated = (event: CashDistribution) =>
  event.members.reduce(
    (sum, member) => sum + Number(member.allocatedAmount || 0),
    0
  );

const eventPaid = (event: CashDistribution) =>
  event.members.reduce((sum, member) => sum + memberPaid(member), 0);

const eventPending = (event: CashDistribution) =>
  event.members.reduce((sum, member) => sum + memberPending(member), 0);

const eventStatus = (event: CashDistribution): PaymentFilter => {
  if (eventPending(event) <= 0.009) return "paid";
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
  const [editingTeamMemberId, setEditingTeamMemberId] =
    useState<string | null>(null);
  const [teamMemberEditName, setTeamMemberEditName] = useState("");

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [paymentFilter, setPaymentFilter] =
    useState<PaymentFilter>("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [eventSort, setEventSort] = useState("newest");

  const [paymentEventId, setPaymentEventId] = useState<string | null>(null);
  const [paymentMemberId, setPaymentMemberId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);

  const [reportTab, setReportTab] = useState<ReportTab>("events");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("monthly");
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(today().slice(0, 4));
  const [reportSearch, setReportSearch] = useState("");

  const stats = useMemo(() => ({
    allocated: distributions.reduce(
      (sum, event) => sum + eventAllocated(event), 0
    ),
    paid: distributions.reduce(
      (sum, event) => sum + eventPaid(event), 0
    ),
    pending: distributions.reduce(
      (sum, event) => sum + eventPending(event), 0
    ),
  }), [distributions]);

  const periodEvents = useMemo(
    () => distributions.filter((event) =>
      periodMode === "monthly"
        ? event.eventAttendedDate?.startsWith(selectedMonth)
        : event.eventAttendedDate?.startsWith(selectedYear)
    ),
    [distributions, periodMode, selectedMonth, selectedYear]
  );

  const periodPayments = useMemo(
    () => distributions.flatMap((event) =>
      event.members.flatMap((member) =>
        (member.payments || [])
          .filter((payment) =>
            periodMode === "monthly"
              ? payment.paidDate?.startsWith(selectedMonth)
              : payment.paidDate?.startsWith(selectedYear)
          )
          .map((payment) => ({
            eventName: event.eventName,
            memberName: member.memberName,
            amount: payment.amount,
            paidDate: payment.paidDate,
            referenceNote: payment.referenceNote || "",
          }))
      )
    ),
    [distributions, periodMode, selectedMonth, selectedYear]
  );

  const periodSummary = useMemo(() => ({
    allocated: periodEvents.reduce(
      (sum, event) => sum + eventAllocated(event), 0
    ),
    pending: periodEvents.reduce(
      (sum, event) => sum + eventPending(event), 0
    ),
    paid: periodPayments.reduce(
      (sum, payment) => sum + payment.amount, 0
    ),
    eventCount: periodEvents.length,
  }), [periodEvents, periodPayments]);
  
  
  const filteredEvents = useMemo(
    () => distributions.filter((event) => {
      const query = eventSearch.trim().toLowerCase();

      const matchesName =
        !query ||
        event.eventName.toLowerCase().includes(query) ||
        (event.location || "").toLowerCase().includes(query);

      const matchesDate =
        !filterDate || event.eventAttendedDate === filterDate;

      const matchesStatus =
        paymentFilter === "all" ||
        eventStatus(event) === paymentFilter;

      const matchesTeam =
        teamFilter === "all" ||
        event.members.some(
          (member) => member.teamMemberId === teamFilter
        );

      return matchesName && matchesDate && matchesStatus && matchesTeam;
    }),
    [distributions, eventSearch, filterDate, paymentFilter, teamFilter]
  );

  const sortedEvents = useMemo(() => {
    const items = [...filteredEvents];

    switch (eventSort) {
      case "oldest":
        return items.sort((a, b) =>
          (a.eventAttendedDate || "").localeCompare(
            b.eventAttendedDate || ""
          )
        );

      case "pending":
        return items.sort(
          (a, b) => eventPending(b) - eventPending(a)
        );

      case "paid":
        return items.sort(
          (a, b) => eventPaid(b) - eventPaid(a)
        );

      default:
        return items.sort((a, b) =>
          (b.eventAttendedDate || "").localeCompare(
            a.eventAttendedDate || ""
          )
        );
    }
  }, [filteredEvents, eventSort]);


  const memberReports = useMemo(
    () => teamMembers.map((person) => {
      const rows = distributions.flatMap((event) =>
        event.members
          .filter((member) => member.teamMemberId === person.id)
          .map((member) => ({
            event: event.eventName,
            date: event.eventAttendedDate,
            allocated: member.allocatedAmount,
            paid: memberPaid(member),
            pending: memberPending(member),
          }))
      );

      return {
        ...person,
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
    setLocation("");
    setInTime("");
    setOutTime("");
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

  function toggleMember(id: string) {
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  }

  function addTeamMember() {
    const name = newMemberName.trim();
    if (!name) return;

    if (teamMembers.some(
      (member) => member.name.toLowerCase() === name.toLowerCase()
    )) {
      alert("This team member already exists.");
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

  function saveTeamMemberEdit(id: string) {
    const name = teamMemberEditName.trim();
    if (!name) return;

    if (teamMembers.some(
      (member) =>
        member.id !== id &&
        member.name.toLowerCase() === name.toLowerCase()
    )) {
      alert("Another team member already has that name.");
      return;
    }

    onTeamMembersChange(teamMembers.map((member) =>
      member.id === id
        ? { ...member, name, updatedAt: Date.now() }
        : member
    ));

    setEditingTeamMemberId(null);
    setTeamMemberEditName("");
  }

  function deleteTeamMember(id: string) {
    const member = teamMembers.find((item) => item.id === id);
    if (!member) return;

    if (!confirm(
      `Delete ${member.name} from the team list? Existing event history will remain.`
    )) return;

    onTeamMembersChange(
      teamMembers.filter((item) => item.id !== id)
    );

    setSelected((previous) =>
      previous.filter((item) => item !== id)
    );
  }

  function openEditEvent(event: CashDistribution) {
    setEditingId(event.id);
    setEventName(event.eventName);
    setEventDate(event.eventAttendedDate || today());
    setLocation(event.location || "");
    setInTime(event.inTime || "");
    setOutTime(event.outTime || "");
    setNotes(event.notes || "");

    setSelected(
      event.members.map((member) => member.teamMemberId)
    );

    setAmounts(Object.fromEntries(
      event.members.map((member) => [
        member.teamMemberId,
        String(member.allocatedAmount),
      ])
    ));

    setTotal(String(eventAllocated(event)));
    setSplit("custom");
    setFormOpen(true);
  }

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
    const allocationAmounts: Record<string, number> = {};

    if (split === "equal") {
      if (!total.trim() || !Number.isFinite(totalValue) || totalValue <= 0) {
        alert("Enter a valid total amount for equal split.");
        return;
      }

      const each =
        Math.floor((totalValue / selected.length) * 100) / 100;

      const remainder =
        Math.round((totalValue - each * selected.length) * 100) / 100;

      selected.forEach((id, index) => {
        allocationAmounts[id] = each + (index === 0 ? remainder : 0);
      });
    } else {
      for (const id of selected) {
        const value = Number(amounts[id]);

        if (
          !amounts[id]?.trim() ||
          !Number.isFinite(value) ||
          value < 0
        ) {
          alert("Enter a valid allocation for each selected member.");
          return;
        }

        allocationAmounts[id] = value;
      }

      const allocatedTotal = Object.values(allocationAmounts)
        .reduce((sum, value) => sum + value, 0);

      if (
        total.trim() &&
        Math.abs(allocatedTotal - totalValue) > 0.01
      ) {
        alert(
          `The allocations add up to ${money(allocatedTotal)}, not ${money(totalValue)}.`
        );
        return;
      }
    }

    const existing = editingId
      ? distributions.find((item) => item.id === editingId)
      : undefined;

    const members: DistributionMember[] = selected.map((id) => {
      const oldMember = existing?.members.find(
        (member) => member.teamMemberId === id
      );

      const person = teamMembers.find((member) => member.id === id);

      return {
        id: oldMember?.id || makeId(),
        teamMemberId: id,
        memberName:
          person?.name || oldMember?.memberName || "Unknown member",
        allocatedAmount: Math.round(
          (allocationAmounts[id] || 0) * 100
        ) / 100,
        payments: oldMember?.payments || [],
      };
    });

    const now = Date.now();

    const savedEvent: CashDistribution = {
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
      onDistributionsChange(distributions.map((item) =>
        item.id === existing.id ? savedEvent : item
      ));
    } else {
      onDistributionsChange([savedEvent, ...distributions]);
    }

    resetForm();
  }

  function duplicateEvent(event: CashDistribution) {
    const now = Date.now();

    const copy: CashDistribution = {
      ...event,
      id: makeId(),
      eventName: `${event.eventName} (Copy)`,
      createdAt: now,
      updatedAt: now,
      members: event.members.map((member) => ({
        ...member,
        id: makeId(),
        payments: [],
      })),
    };

    onDistributionsChange([copy, ...distributions]);
    setExpandedEventId(copy.id);
  }

  function deleteEvent(id: string) {
    const event = distributions.find((item) => item.id === id);
    if (!event) return;

    if (!confirm(
      `Delete "${event.eventName}" and its payment records?`
    )) return;

    onDistributionsChange(
      distributions.filter((item) => item.id !== id)
    );

    if (expandedEventId === id) setExpandedEventId(null);
  }

  function openPayment(
    event: CashDistribution,
    member: DistributionMember
  ) {
    setPaymentEventId(event.id);
    setPaymentMemberId(member.id);
    setPaymentAmount(String(memberPending(member)));
    setPaymentDate(today());
    setPaymentNote("");
    setPaymentOpen(true);
  }

  function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = Number(paymentAmount);

    if (
      !paymentEventId ||
      !paymentMemberId ||
      !paymentAmount.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert("Enter a valid payment amount.");
      return;
    }

    const distribution = distributions.find(
      (item) => item.id === paymentEventId
    );

    const member = distribution?.members.find(
      (item) => item.id === paymentMemberId
    );

    if (!distribution || !member) return;

    if (amount > memberPending(member) + 0.01) {
      alert(
        `Payment cannot exceed the pending amount (${money(memberPending(member))}).`
      );
      return;
    }

    const payment: DistributionPayment = {
      id: makeId(),
      amount: Math.round(amount * 100) / 100,
      paidDate: paymentDate,
      referenceNote: paymentNote.trim() || undefined,
      createdAt: Date.now(),
    };

    onDistributionsChange(distributions.map((item) =>
      item.id !== distribution.id
        ? item
        : {
            ...item,
            updatedAt: Date.now(),
            members: item.members.map((currentMember) =>
              currentMember.id === member.id
                ? {
                    ...currentMember,
                    payments: [
                      ...(currentMember.payments || []),
                      payment,
                    ],
                  }
                : currentMember
            ),
          }
    ));

    setPaymentOpen(false);
    setPaymentEventId(null);
    setPaymentMemberId(null);
    setPaymentAmount("");
    setPaymentNote("");
  }

  function deletePayment(
    eventId: string,
    memberId: string,
    paymentId: string
  ) {
    if (!confirm("Delete this payment record?")) return;

    onDistributionsChange(distributions.map((event) =>
      event.id !== eventId
        ? event
        : {
            ...event,
            updatedAt: Date.now(),
            members: event.members.map((member) =>
              member.id !== memberId
                ? member
                : {
                    ...member,
                    payments: (member.payments || []).filter(
                      (payment) => payment.id !== paymentId
                    ),
                  }
            ),
          }
    ));
  }

  // Pay All records pending amounts as paid in MaxLedger.
  // It does not transfer money.
  function payAllPendingMembers(event: CashDistribution) {
    const pendingMembers = event.members.filter(
      (member) => memberPending(member) > 0.009
    );

    if (pendingMembers.length === 0) {
      alert("There are no pending payments for this event.");
      return;
    }

    const totalPending = pendingMembers.reduce(
      (sum, member) => sum + memberPending(member),
      0
    );

    if (!confirm(
      `Record ${money(totalPending)} as paid for all ${pendingMembers.length} pending team members?`
    )) return;

    const now = Date.now();

    const updatedEvent: CashDistribution = {
      ...event,
      updatedAt: now,
      members: event.members.map((member) => {
        const pending = memberPending(member);
        if (pending <= 0.009) return member;

        const payment: DistributionPayment = {
          id: makeId(),
          amount: Math.round(pending * 100) / 100,
          paidDate: today(),
          referenceNote: "Recorded using Pay All",
          createdAt: now,
        };

        return {
          ...member,
          payments: [...(member.payments || []), payment],
        };
      }),
    };

    onDistributionsChange(distributions.map((item) =>
      item.id === event.id ? updatedEvent : item
    ));

    alert(
      `${money(totalPending)} recorded as paid for ${pendingMembers.length} team members.`
    );
  }
    // CSV export
  async function exportCSV() {
    const headers = [
      "Event",
      "Event Date",
      "Location",
      "Team Member",
      "Allocated Amount",
      "Paid Amount",
      "Pending Amount",
      "Payment Date",
      "Payment Amount",
      "Payment Note",
      "Status",
    ];

    const rows: string[][] = [];

    distributions.forEach((event) => {
      event.members.forEach((member) => {
        const payments = member.payments || [];

        if (payments.length === 0) {
          rows.push([
            event.eventName,
            event.eventAttendedDate || "",
            event.location || "",
            member.memberName,
            String(member.allocatedAmount),
            "0",
            String(memberPending(member)),
            "",
            "0",
            "",
            statusLabel(memberStatus(member)),
          ]);
        } else {
          payments.forEach((payment) => {
            rows.push([
              event.eventName,
              event.eventAttendedDate || "",
              event.location || "",
              member.memberName,
              String(member.allocatedAmount),
              String(memberPaid(member)),
              String(memberPending(member)),
              payment.paidDate || "",
              String(payment.amount),
              payment.referenceNote || "",
              statusLabel(memberStatus(member)),
            ]);
          });
        }
      });
    });

    const csvEscape = (value: string) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csvContent = [
      headers,
      ...rows,
    ]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const fileContent = "\uFEFF" + csvContent;
    const fileName = `MaxLedger-Cash-Distribution-${today()}.csv`;

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: fileContent,
          directory: Directory.Cache,
          encoding: "utf8" as never,
        });

        await Share.share({
          title: "Cash Distribution Report",
          text: "MaxLedger cash distribution report",
          url: result.uri,
          dialogTitle: "Export Cash Distribution",
        });
      } else {
        const blob = new Blob([fileContent], {
          type: "text/csv;charset=utf-8;",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("CSV export failed:", error);
      alert("Unable to export CSV. Please try again.");
    }
  }

  // PDF export
  async function exportPDF() {
    const eventRows = distributions
      .map((event) => {
        const members = event.members
          .map((member) => `
            <tr>
              <td>${escapeHtml(member.memberName)}</td>
              <td>${money(member.allocatedAmount)}</td>
              <td>${money(memberPaid(member))}</td>
              <td>${money(memberPending(member))}</td>
              <td>${escapeHtml(statusLabel(memberStatus(member)))}</td>
            </tr>
          `)
          .join("");

        return `
          <section class="event">
            <div class="event-heading">
              <div>
                <h2>${escapeHtml(event.eventName)}</h2>
                <p>${escapeHtml(formatDate(event.eventAttendedDate))} 
                ${event.location ? ` · ${escapeHtml(event.location)}` : ""}</p>
              </div>
              <div class="event-total">${money(eventAllocated(event))}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th>Allocated</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${members}</tbody>
            </table>
          </section>
        `;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>MaxLedger Cash Distribution</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 32px;
            background: #f4f6fb;
            color: #172033;
            font-family: Arial, sans-serif;
          }
          .header {
            background: #101b35;
            color: white;
            padding: 28px;
            border-radius: 14px;
            margin-bottom: 22px;
          }
          .header h1 {
            margin: 0 0 8px;
            font-size: 25px;
          }
          .header p {
            margin: 0;
            color: #c1cbe0;
          }
          .summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }
          .summary-card {
            background: white;
            border: 1px solid #e1e6f0;
            border-radius: 12px;
            padding: 18px;
          }
          .summary-card span {
            display: block;
            color: #667085;
            font-size: 12px;
            margin-bottom: 8px;
          }
          .summary-card strong {
            font-size: 20px;
          }
          .event {
            background: white;
            border: 1px solid #e1e6f0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 18px;
            break-inside: avoid;
          }
          .event-heading {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 16px;
          }
          .event-heading h2 {
            margin: 0 0 5px;
            font-size: 17px;
          }
          .event-heading p {
            margin: 0;
            color: #667085;
            font-size: 12px;
          }
          .event-total {
            font-weight: bold;
            color: #243f75;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          th {
            background: #edf1f8;
            color: #34415c;
            text-align: left;
          }
          th, td {
            padding: 10px 8px;
            border-bottom: 1px solid #e8ebf2;
          }
          .footer {
            text-align: center;
            color: #7b8497;
            font-size: 11px;
            margin-top: 28px;
          }
          @media print {
            body { padding: 0; background: white; }
            .event { box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <header class="header">
          <h1>MaxLedger</h1>
          <p>Cash Distribution Report · ${escapeHtml(today())}</p>
        </header>

        <div class="summary">
          <div class="summary-card">
            <span>Total Allocated</span>
            <strong>${money(stats.allocated)}</strong>
          </div>
          <div class="summary-card">
            <span>Total Paid</span>
            <strong>${money(stats.paid)}</strong>
          </div>
          <div class="summary-card">
            <span>Total Pending</span>
            <strong>${money(stats.pending)}</strong>
          </div>
        </div>

        ${eventRows}

        <div class="footer">
          Generated by MaxLedger
        </div>
      </body>
      </html>
    `;

    try {
      if (Capacitor.isNativePlatform()) {
        await Printer.printHtml({ html });
      } else {
        const printWindow = window.open("", "_blank");

        if (!printWindow) {
          alert("Allow pop-ups to export the PDF report.");
          return;
        }

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
      }
    } catch (error) {
      console.error("PDF export failed:", error);
      alert("Unable to create the PDF report. Please try again.");
    }
  }

  // Generate a standalone, branded receipt for an individual team-member payment.
  async function exportPaymentReceipt(
    event: CashDistribution,
    member: DistributionMember,
    payment: DistributionPayment
  ) {
    const payments = member.payments || [];
    const paymentIndex = payments.findIndex((item) => item.id === payment.id);
    const cumulativePaid = payments
      .slice(0, paymentIndex >= 0 ? paymentIndex + 1 : payments.length)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const remainingBalance = Math.max(
      0,
      Number(member.allocatedAmount || 0) - cumulativePaid
    );
    const receiptReference = `ML-${String(payment.id || "").slice(0, 8).toUpperCase() || "PAYMENT"}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Payment Receipt - ${escapeHtml(event.eventName)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 28px;
            background: #f3f6f5;
            color: #17231f;
            font-family: Arial, Helvetica, sans-serif;
          }
          .receipt {
            width: 100%;
            max-width: 720px;
            margin: 0 auto;
            padding: 34px;
            background: #fff;
            border: 1px solid #dce7e1;
            border-radius: 18px;
          }
          .brand {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            padding-bottom: 22px;
            border-bottom: 2px solid #d9eee5;
          }
          .brand h1 {
            margin: 0;
            color: #087a55;
            font-size: 28px;
            letter-spacing: -1px;
          }
          .brand p {
            margin: 6px 0 0;
            color: #718078;
            font-size: 12px;
          }
          .receipt-label {
            color: #087a55;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            text-align: right;
          }
          .reference {
            margin-top: 7px;
            color: #52645b;
            font-size: 11px;
            text-align: right;
            overflow-wrap: anywhere;
          }
          .amount-block {
            margin: 26px 0;
            padding: 22px;
            border-radius: 14px;
            background: #effaf4;
            text-align: center;
          }
          .amount-block span {
            display: block;
            color: #60756a;
            font-size: 12px;
          }
          .amount-block strong {
            display: block;
            margin-top: 7px;
            color: #087a55;
            font-size: 32px;
          }
          h2 {
            margin: 26px 0 12px;
            font-size: 14px;
            color: #263b31;
          }
          .details {
            width: 100%;
            border-collapse: collapse;
          }
          .details td {
            padding: 12px 4px;
            border-bottom: 1px solid #edf1ee;
            font-size: 13px;
            vertical-align: top;
          }
          .details td:first-child {
            width: 42%;
            color: #718078;
          }
          .details td:last-child {
            color: #1e3027;
            font-weight: 700;
            text-align: right;
            overflow-wrap: anywhere;
          }
          .balance {
            margin-top: 20px;
            padding: 16px;
            border: 1px solid #dce7e1;
            border-radius: 12px;
          }
          .balance-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 5px 0;
            font-size: 13px;
          }
          .balance-row strong { color: #087a55; }
          .note {
            margin-top: 22px;
            padding: 13px 15px;
            border-left: 3px solid #0b9a6a;
            background: #f7faf8;
            color: #52645b;
            font-size: 12px;
            line-height: 1.5;
            overflow-wrap: anywhere;
          }
          .footer {
            margin-top: 28px;
            padding-top: 16px;
            border-top: 1px solid #e7eee9;
            color: #849189;
            font-size: 11px;
            line-height: 1.6;
            text-align: center;
          }
          @media print {
            body { padding: 0; background: #fff; }
            .receipt {
              max-width: none;
              border: 0;
              border-radius: 0;
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <main class="receipt">
          <header class="brand">
            <div>
              <h1>MaxLedger</h1>
              <p>Event cash distribution</p>
            </div>
            <div>
              <div class="receipt-label">Payment Receipt</div>
              <div class="reference">Receipt ref: ${escapeHtml(receiptReference)}</div>
            </div>
          </header>

          <section class="amount-block">
            <span>Payment received by team member</span>
            <strong>${money(payment.amount)}</strong>
          </section>

          <h2>Payment details</h2>
          <table class="details">
            <tr><td>Team member</td><td>${escapeHtml(member.memberName)}</td></tr>
            <tr><td>Event</td><td>${escapeHtml(event.eventName)}</td></tr>
            <tr><td>Event date</td><td>${escapeHtml(formatDate(event.eventAttendedDate))}</td></tr>
            <tr><td>Location</td><td>${escapeHtml(event.location || "—")}</td></tr>
            <tr><td>Payment date</td><td>${escapeHtml(formatDate(payment.paidDate))}</td></tr>
            <tr><td>Payment reference / note</td><td>${escapeHtml(payment.referenceNote || "—")}</td></tr>
          </table>

          <h2>Allocation summary</h2>
          <div class="balance">
            <div class="balance-row">
              <span>Total allocated</span>
              <strong>${money(member.allocatedAmount)}</strong>
            </div>
            <div class="balance-row">
              <span>Total paid up to this receipt</span>
              <strong>${money(cumulativePaid)}</strong>
            </div>
            <div class="balance-row">
              <span>Remaining balance</span>
              <strong>${money(remainingBalance)}</strong>
            </div>
          </div>

          <div class="note">
            This receipt records a payment entry saved in MaxLedger. Keep it for your records.
          </div>
          <footer class="footer">
            Generated on ${escapeHtml(formatDate(today()))}<br />
            Generated by MaxLedger
          </footer>
        </main>
      </body>
      </html>
    `;

    try {
      if (Capacitor.isNativePlatform()) {
        await Printer.printHtml({ html });
      } else {
        const printWindow = window.open("", "_blank");

        if (!printWindow) {
          alert("Allow pop-ups to print or save this receipt as a PDF.");
          return;
        }

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
      }
    } catch (error) {
      console.error("Payment receipt export failed:", error);
      alert("Unable to create the payment receipt. Please try again.");
    }
  }
  
  // Generate a complete receipt for an entire event.
  async function exportEventReceipt(event: CashDistribution) {
    const allocated = eventAllocated(event);
    const paid = eventPaid(event);
    const pending = eventPending(event);
    const receiptReference = `ML-EVENT-${String(event.id).slice(0, 8).toUpperCase()}`;

    
    const memberRows = event.members.map((member) => {
      const memberPaidAmount = memberPaid(member);
      const memberPendingAmount = memberPending(member);
      const status = statusLabel(memberStatus(member));
      const payments = member.payments || [];

      const paymentHistory = payments.length
        ? payments.map((payment) => `
            <div class="payment-entry">
              <strong>${money(payment.amount)}</strong>
              <span>${escapeHtml(formatDate(payment.paidDate))}</span>
              ${payment.referenceNote
                ? `<small>${escapeHtml(payment.referenceNote)}</small>`
                : ""}
            </div>
          `).join("")
        : `<span class="no-payment">No payment recorded</span>`;

      return `
        <tr>
          <td>${escapeHtml(member.memberName)}</td>
          <td>${money(member.allocatedAmount)}</td>
          <td>${money(memberPaidAmount)}</td>
          <td>${paymentHistory}</td>
          <td>${money(memberPendingAmount)}</td>
          <td>${escapeHtml(status)}</td>
        </tr>
      `;
    }).join("");


      return `
        <tr>
          <td>${escapeHtml(member.memberName)}</td>
          <td>${money(member.allocatedAmount)}</td>
          <td>${money(memberPaidAmount)}</td>
          <td>${escapeHtml(paidDates)}</td>
          <td>${money(memberPendingAmount)}</td>
          <td>${escapeHtml(status)}</td>
        </tr>
      `;
    }).join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Event Receipt - ${escapeHtml(event.eventName)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 28px;
            color: #17231f;
            background: #f3f6f5;
            font-family: Arial, Helvetica, sans-serif;
          }
          .receipt {
            max-width: 850px;
            margin: auto;
            padding: 32px;
            background: white;
            border: 1px solid #dce7e1;
            border-radius: 16px;
          }
          header {
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            padding-bottom: 20px;
            border-bottom: 2px solid #d9eee5;
          }
          h1 { margin: 0; color: #087a55; font-size: 28px; }
          h2 { margin: 24px 0 12px; font-size: 18px; }
          .muted { color: #718078; font-size: 12px; }
          .ref { text-align: right; color: #087a55; font-weight: bold; }
          .hero {
            margin: 22px 0;
            padding: 20px;
            border-radius: 14px;
            background: #effaf4;
          }
          .hero h2 { margin: 0 0 8px; color: #087a55; }
          .stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
          }
          .stat {
            padding: 14px;
            border: 1px solid #dce7e1;
            border-radius: 12px;
          }
          .stat span { display: block; color: #718078; font-size: 11px; }
          .stat strong { display: block; margin-top: 8px; font-size: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            padding: 11px 8px;
            border-bottom: 1px solid #e7eee9;
            text-align: left;
            font-size: 12px;
          }
          th { background: #effaf4; color: #087a55; }
          td:not(:first-child), th:not(:first-child) { text-align: right; }
          .footer {
            margin-top: 25px;
            padding-top: 15px;
            border-top: 1px solid #e7eee9;
            text-align: center;
            color: #849189;
            font-size: 11px;
          }
          @media (max-width: 600px) {
            body { padding: 8px; }
            .receipt { padding: 16px; }
            .stats { grid-template-columns: 1fr; }
            th, td { padding: 8px 4px; font-size: 10px; }
          }
          @media print {
            body { padding: 0; background: white; }
            .receipt { max-width: none; border: 0; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <main class="receipt">
          <header>
            <div>
              <h1>MaxLedger</h1>
              <p class="muted">Event Cash Distribution Summary</p>
            </div>
            <div class="ref">
              EVENT RECEIPT
              <p class="muted">${escapeHtml(receiptReference)}</p>
            </div>
          </header>

          <section class="hero">
            <h2>${escapeHtml(event.eventName)}</h2>
            <p>Event attended: ${escapeHtml(formatDate(event.eventAttendedDate))}</p>
            <p>In Time: ${escapeHtml(event.inTime || "—")}</p>
            <p>Out Time: ${escapeHtml(event.outTime || "—")}</p>
            <p>Location: ${escapeHtml(event.location || "—")}</p>
          </section>

          <section class="stats">
            <div class="stat">
              <span>Total Allocated</span>
              <strong>${money(allocated)}</strong>
            </div>
            <div class="stat">
              <span>Total Paid</span>
              <strong>${money(paid)}</strong>
            </div>
            <div class="stat">
              <span>Outstanding Balance</span>
              <strong>${money(pending)}</strong>
            </div>
          </section>

          <h2>Team Payment Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Team Member</th>
                <th>Allocated</th>
                <th>Paid</th>
                <th>Paid Date(s)</th>
                <th>Pending</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${memberRows}
            </tbody>
          </table>

          <div class="footer">
            Generated on ${escapeHtml(formatDate(today()))}<br />
            Generated by MaxLedger
          </div>
        </main>
      </body>
      </html>
    `;

    try {
      if (Capacitor.isNativePlatform()) {
        await Printer.printHtml({ html });
      } else {
        const printWindow = window.open("", "_blank");

        if (!printWindow) {
          alert("Allow pop-ups to print or save this receipt as a PDF.");
          return;
        }

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
      }
    } catch (error) {
      console.error("Event receipt export failed:", error);
      alert("Unable to create the event receipt. Please try again.");
    }
  }
    function getYearOptions() {
    const years = new Set<string>([today().slice(0, 4)]);

    distributions.forEach((event) => {
      if (event.eventAttendedDate) {
        years.add(event.eventAttendedDate.slice(0, 4));
      }

      event.members.forEach((member) => {
        (member.payments || []).forEach((payment) => {
          if (payment.paidDate) {
            years.add(payment.paidDate.slice(0, 4));
          }
        });
      });
    });

    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }

  // Reusable team-member row inside an event
  function renderEventMember(
    event: CashDistribution,
    member: DistributionMember
  ) {
    const paid = memberPaid(member);
    const pending = memberPending(member);
    const status = memberStatus(member);

    return (
      <div className="cash-member-row" key={member.id}>
        <div className="cash-member-info">
          <strong>{member.memberName}</strong>
          <span>
            Allocated {money(member.allocatedAmount)}
          </span>
        </div>

        <div className="cash-member-amounts">
          <span className="cash-paid">
            Paid {money(paid)}
          </span>
          <span className="cash-pending">
            Pending {money(pending)}
          </span>
        </div>

        <span className={`cash-status cash-status-${status}`}>
          {statusLabel(status)}
        </span>

        {pending > 0.009 && (
          <button
            type="button"
            className="cash-button cash-button-small"
            onClick={() => openPayment(event, member)}
          >
            Record Payment
          </button>
        )}

        {member.payments?.length ? (
          <div className="cash-payment-history">
            {member.payments.map((payment) => (
              <div
                className="cash-payment-history-row"
                key={payment.id}
              >
                <span>{formatDate(payment.paidDate)}</span>
                <strong>{money(payment.amount)}</strong>
                {payment.referenceNote && (
                  <span>{payment.referenceNote}</span>
                )}
                <div className="cash-payment-actions">
                  <button
                    type="button"
                    className="cash-receipt-link"
                    onClick={() => exportPaymentReceipt(event, member, payment)}
                  >
                    Receipt PDF
                  </button>
                  <button
                    type="button"
                    className="cash-delete-link"
                    onClick={() =>
                      deletePayment(event.id, member.id, payment.id)
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
    return (
    <div className="cash-page-midnight">
      <style>{`
        .cash-page-midnight {
          --cash-bg: #080f1f;
          --cash-card: #111c32;
          --cash-card2: #17243d;
          --cash-border: #263651;
          --cash-text: #f1f5fc;
          --cash-muted: #9aa9c2;
          --cash-blue: #5b8cff;
          --cash-green: #36d399;
          --cash-red: #ff657a;
          color: var(--cash-text);
          background: var(--cash-bg);
          padding: 20px;
          border-radius: 18px;
          font-family: inherit;
        }
        .cash-page-midnight * { box-sizing: border-box; }
        .cash-page-midnight input,
        .cash-page-midnight select,
        .cash-page-midnight textarea {
          width: 100%;
          background: #0b1426;
          color: var(--cash-text);
          border: 1px solid var(--cash-border);
          border-radius: 9px;
          padding: 11px 12px;
          font: inherit;
        }
        .cash-page-midnight label {
          display: block;
          margin-bottom: 6px;
          color: var(--cash-muted);
          font-size: 13px;
        }
        .cash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .cash-header h2 { margin: 0 0 5px; font-size: 25px; }
        .cash-muted { color: var(--cash-muted); font-size: 13px; }
        .cash-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .cash-stat, .cash-section {
          background: var(--cash-card);
          border: 1px solid var(--cash-border);
          border-radius: 14px;
          padding: 16px;
        }
        .cash-stat span {
          display: block;
          color: var(--cash-muted);
          font-size: 12px;
          margin-bottom: 8px;
        }
        .cash-stat strong { font-size: 22px; }
        .cash-section { margin-bottom: 18px; }
        .cash-section h3 { margin: 0 0 14px; }
        .cash-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .cash-button {
          border: 1px solid var(--cash-border);
          background: var(--cash-card2);
          color: var(--cash-text);
          border-radius: 9px;
          padding: 10px 13px;
          cursor: pointer;
          font: inherit;
        }
        .cash-button-primary {
          background: var(--cash-blue);
          border-color: var(--cash-blue);
          color: white;
        }
        .cash-button-danger { color: #ff8292; }
        .cash-button-small { padding: 7px 10px; font-size: 12px; }
        .cash-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .cash-field-full { grid-column: 1 / -1; }
        .cash-team-list, .cash-event-list {
          display: grid;
          gap: 10px;
        }
        .cash-team-row, .cash-event-card {
          background: var(--cash-card2);
          border: 1px solid var(--cash-border);
          border-radius: 12px;
          padding: 14px;
        }
        .cash-team-row, .cash-event-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }
        .cash-event-heading h4 { margin: 0 0 5px; }
        .cash-event-meta { color: var(--cash-muted); font-size: 12px; }
        .cash-member-row {
          display: grid;
          grid-template-columns: 1fr 1fr auto auto;
          gap: 12px;
          align-items: center;
          padding: 12px 0;
          border-top: 1px solid var(--cash-border);
        }
        .cash-member-info strong, .cash-member-info span {
          display: block;
        }
        .cash-member-info span, .cash-member-amounts {
          color: var(--cash-muted);
          font-size: 12px;
        }
        .cash-member-amounts span { display: block; }
        .cash-paid { color: var(--cash-green); }
        .cash-pending { color: #ffbd69; }
        .cash-status { font-size: 12px; }
        .cash-payment-history {
          grid-column: 1 / -1;
          display: grid;
          gap: 6px;
        }
        .cash-payment-history-row {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          color: var(--cash-muted);
          font-size: 12px;
        }
        .cash-payment-actions {
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }
        .cash-receipt-link {
          border: 0;
          background: transparent;
          color: var(--cash-green);
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }
        .cash-delete-link {
          border: 0;
          background: transparent;
          color: var(--cash-red);
          cursor: pointer;
        }
        .cash-empty { color: var(--cash-muted); padding: 18px 0; }
        .cash-modal-backdrop {
          position: fixed;
          inset: 0;
          background: #000b;
          display: grid;
          place-items: center;
          padding: 16px;
          z-index: 9999;
        }
        .cash-modal {
          width: min(560px, 100%);
          max-height: 90vh;
          overflow: auto;
          background: var(--cash-card);
          border: 1px solid var(--cash-border);
          border-radius: 16px;
          padding: 20px;
        }
        .cash-report-table-wrap { overflow-x: auto; }
        .cash-report-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 500px;
        }
        .cash-report-table th, .cash-report-table td {
          text-align: left;
          padding: 10px;
          border-bottom: 1px solid var(--cash-border);
          font-size: 13px;
        }

        /* Premium reporting dashboard */
        .cash-report-shell {
          overflow: hidden;
          padding: 0;
          background: linear-gradient(145deg, #111c32 0%, #0d1729 100%);
          border-color: #2a3c58;
        }
        .cash-report-hero {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 18px; flex-wrap: wrap; padding: 22px 22px 18px;
          border-bottom: 1px solid #263651;
          background: radial-gradient(ellipse at top right, rgba(52,211,153,.12), transparent 48%);
        }
        .cash-report-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          color: #5ee4b4; font-size: 11px; font-weight: 800;
          letter-spacing: .12em; text-transform: uppercase; margin-bottom: 8px;
        }
        .cash-report-hero h2 { margin: 0 0 7px; font-size: 23px; letter-spacing: -.03em; }
        .cash-report-hero p { margin: 0; color: #9aa9c2; font-size: 13px; line-height: 1.5; }
        .cash-report-tabs {
          display: inline-flex; gap: 5px; padding: 5px;
          background: #091323; border: 1px solid #263651; border-radius: 12px;
        }
        .cash-report-tabs .cash-tab {
          border: 0; border-radius: 8px; padding: 10px 13px;
          background: transparent; color: #9aa9c2; font-size: 12px; font-weight: 700;
          cursor: pointer; transition: .18s ease;
        }
        .cash-report-tabs .cash-tab.active {
          background: linear-gradient(135deg, #16a875, #0f8f68);
          color: #fff; box-shadow: 0 5px 18px rgba(16,185,129,.18);
        }
        .cash-report-body { padding: 20px 22px 22px; }
        .cash-report-kpis {
          display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px; margin-bottom: 18px;
        }
        .cash-report-kpi {
          min-width: 0; padding: 15px; border: 1px solid #293b57;
          border-radius: 13px; background: linear-gradient(160deg, #172640, #101b30);
        }
        .cash-report-kpi-label {
          display: flex; align-items: center; gap: 7px; color: #a6b4ca;
          font-size: 11px; font-weight: 700; letter-spacing: .04em; margin-bottom: 10px;
        }
        .cash-report-kpi strong { display: block; font-size: clamp(17px, 2.4vw, 23px); letter-spacing: -.025em; overflow-wrap: anywhere; }
        .cash-report-kpi small { display: block; margin-top: 6px; color: #8496b1; font-size: 10px; }
        .cash-report-kpi.green { border-top: 2px solid #34d399; }
        .cash-report-kpi.blue { border-top: 2px solid #60a5fa; }
        .cash-report-kpi.amber { border-top: 2px solid #fbbf24; }
        .cash-report-kpi.violet { border-top: 2px solid #a78bfa; }
        .cash-report-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 12px; margin-bottom: 15px;
        }
        .cash-report-toolbar-title h3 { margin: 0 0 4px; font-size: 15px; }
        .cash-report-toolbar-title p { margin: 0; color: #8496b1; font-size: 12px; }
        .cash-report-search { max-width: 280px; }
        .cash-report-period-controls {
          display: grid; grid-template-columns: minmax(130px, .7fr) minmax(150px, 1fr) minmax(100px, .6fr);
          gap: 10px; margin-bottom: 17px;
        }
        .cash-report-progress {
          height: 7px; width: 100%; overflow: hidden; border-radius: 999px;
          background: #263651; margin-top: 7px;
        }
        .cash-report-progress > span {
          display: block; height: 100%; border-radius: inherit;
          background: linear-gradient(90deg, #10b981, #5ee4b4);
        }
        .cash-report-table-wrap {
          overflow-x: auto; border: 1px solid #263651; border-radius: 12px;
          background: rgba(7,15,29,.35);
        }
        .cash-report-table { width: 100%; border-collapse: collapse; min-width: 620px; }
        .cash-report-table th {
          padding: 12px 14px; text-align: left; color: #8fa2bd;
          background: #0b1628; font-size: 10px; font-weight: 800;
          text-transform: uppercase; letter-spacing: .08em; white-space: nowrap;
        }
        .cash-report-table td {
          padding: 14px; border-top: 1px solid #21314a; font-size: 12px;
          color: #dce6f5; vertical-align: middle;
        }
        .cash-report-table tbody tr:hover { background: rgba(96,165,250,.045); }
        .cash-report-person { display: flex; align-items: center; gap: 10px; min-width: 150px; }
        .cash-report-avatar {
          display: grid; place-items: center; flex: 0 0 34px; height: 34px;
          border-radius: 10px; color: #a7f3d0; background: #123a32;
          border: 1px solid #1e5a49; font-size: 12px; font-weight: 800;
        }
        .cash-report-person strong { display: block; font-size: 12px; }
        .cash-report-person small { display: block; color: #8496b1; font-size: 10px; margin-top: 3px; }
        .cash-report-status {
          display: inline-flex; align-items: center; border-radius: 999px;
          padding: 5px 8px; font-size: 10px; font-weight: 800; white-space: nowrap;
        }
        .cash-report-status.paid { background: rgba(52,211,153,.12); color: #5ee4b4; }
        .cash-report-status.partial { background: rgba(251,191,36,.12); color: #fbbf24; }
        .cash-report-status.unpaid { background: rgba(248,113,113,.12); color: #fb8b96; }
        .cash-report-empty {
          padding: 28px 16px; text-align: center; color: #9aa9c2;
          border: 1px dashed #31435f; border-radius: 12px;
        }
        .cash-report-empty strong { display: block; color: #e5edf8; margin-bottom: 5px; }
        .cash-report-period-footer {
          display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px;
          margin-top: 16px; padding: 14px 16px; border: 1px solid #263651;
          border-radius: 12px; background: #0b1628; color: #9aa9c2; font-size: 12px;
        }
        .cash-report-period-footer strong { color: #e5edf8; }
        @media(max-width: 760px) {
          .cash-report-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .cash-report-period-controls { grid-template-columns: 1fr 1fr; }
          .cash-report-period-controls > :last-child { grid-column: 1 / -1; }
          .cash-report-hero, .cash-report-body { padding-left: 15px; padding-right: 15px; }
          .cash-report-tabs { width: 100%; }
          .cash-report-tabs .cash-tab { flex: 1; }
        }
        @media(max-width: 420px) {
          .cash-report-kpis { grid-template-columns: 1fr 1fr; gap: 8px; }
          .cash-report-kpi { padding: 12px; }
          .cash-report-kpi-label { font-size: 10px; }
        }
        @media(max-width: 650px) {
          .cash-grid { grid-template-columns: 1fr; }
          .cash-form-grid { grid-template-columns: 1fr; }
          .cash-member-row { grid-template-columns: 1fr 1fr; }
          .cash-page-midnight { padding: 12px; }
        }
      `}</style>

      <header className="cash-header">
        <div>
          <h2>Cash Distribution</h2>
          <div className="cash-muted">
            Track event payments, team allocations and pending balances.
          </div>
        </div>
        <div className="cash-actions">
          <button className="cash-button" onClick={exportCSV}>
            Export CSV
          </button>
          <button className="cash-button" onClick={exportPDF}>
            Export PDF
          </button>
          <button
            className="cash-button cash-button-primary"
            onClick={startNew}
          >
            + New Event
          </button>
        </div>
      </header>

      <div className="cash-grid">
        <div className="cash-stat">
          <span>Total Allocated</span>
          <strong>{money(stats.allocated)}</strong>
        </div>
        <div className="cash-stat">
          <span>Total Paid</span>
          <strong className="cash-paid">{money(stats.paid)}</strong>
        </div>
        <div className="cash-stat">
          <span>Total Pending</span>
          <strong className="cash-pending">{money(stats.pending)}</strong>
        </div>
      </div>

            {/* Event form */}
      {formOpen && (
        <section className="cash-section">
          <h3>{editingId ? "Edit Event" : "Create Event"}</h3>

          <form onSubmit={saveEvent}>
            <div className="cash-form-grid">
              <div className="cash-field cash-field-full">
                <label>Event Name</label>
                <input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  required
                  placeholder="Enter event name"
                />
              </div>

              <div className="cash-field">
                <label>Event Date</label>
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
                  placeholder="Event location"
                />
              </div>

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

              <div className="cash-field cash-field-full">
                <label>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional event notes"
                />
              </div>

              <div className="cash-field">
                <label>Allocation Method</label>
                <select
                  value={split}
                  onChange={(e) => setSplit(e.target.value as SplitMode)}
                >
                  <option value="equal">Equal Split</option>
                  <option value="custom">Custom Amount</option>
                </select>
              </div>

              <div className="cash-field">
                <label>
                  {split === "equal"
                    ? "Total Amount (₹)"
                    : "Optional Total (₹)"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  required={split === "equal"}
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <h4>Select Team Members</h4>

              <div className="cash-form-grid">
                <div className="cash-field">
                  <label>Search Members</label>
                  <input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search team"
                  />
                </div>

                <div className="cash-field">
                  <label>Add Team Member</label>
                  <div className="cash-actions">
                    <input
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      placeholder="Member name"
                    />
                    <button
                      type="button"
                      className="cash-button"
                      onClick={addTeamMember}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="cash-team-list" style={{ marginTop: 12 }}>
                {teamMembers
                  .filter((member) =>
                    member.name.toLowerCase().includes(
                      memberSearch.toLowerCase()
                    )
                  )
                  .map((member) => (
                    <div className="cash-team-row" key={member.id}>
                      <label style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selected.includes(member.id)}
                          onChange={() => toggleMember(member.id)}
                          style={{ width: "auto", marginRight: 8 }}
                        />
                        {member.name}
                      </label>

                      {selected.includes(member.id) &&
                        split === "custom" && (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Allocation ₹"
                            value={amounts[member.id] || ""}
                            onChange={(e) =>
                              setAmounts((previous) => ({
                                ...previous,
                                [member.id]: e.target.value,
                              }))
                            }
                            style={{ maxWidth: 150 }}
                          />
                        )}
                    </div>
                  ))}
              </div>
            </div>

            <div className="cash-actions" style={{ marginTop: 16 }}>
              <button
                type="submit"
                className="cash-button cash-button-primary"
              >
                {editingId ? "Update Event" : "Save Event"}
              </button>

              <button
                type="button"
                className="cash-button"
                onClick={resetForm}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Team member management */}
      <section className="cash-section">
        <h3>Team Management</h3>

        <div className="cash-field" style={{ marginBottom: 12 }}>
          <label>Search Team Members</label>
          <input
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Search members"
          />
        </div>

        <div className="cash-team-list">
          {teamMembers
            .filter((member) =>
              member.name.toLowerCase().includes(
                memberSearch.toLowerCase()
              )
            )
            .map((member) => (
              <div className="cash-team-row" key={member.id}>
                {editingTeamMemberId === member.id ? (
                  <>
                    <input
                      value={teamMemberEditName}
                      onChange={(e) =>
                        setTeamMemberEditName(e.target.value)
                      }
                    />
                    <div className="cash-actions">
                      <button
                        className="cash-button cash-button-primary"
                        onClick={() => saveTeamMemberEdit(member.id)}
                      >
                        Save
                      </button>
                      <button
                        className="cash-button"
                        onClick={() => setEditingTeamMemberId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <strong>{member.name}</strong>
                    <div className="cash-actions">
                      <button
                        className="cash-button cash-button-small"
                        onClick={() => {
                          setEditingTeamMemberId(member.id);
                          setTeamMemberEditName(member.name);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="cash-button cash-button-small cash-button-danger"
                        onClick={() => deleteTeamMember(member.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

          {teamMembers.length === 0 && (
            <div className="cash-empty">No team members yet.</div>
          )}
        </div>
      </section>
            {/* EVENT HISTORY */}
      <section className="cash-section">
        <div className="cash-section-head">
          <div>
            <h2>Event History</h2>
            <p>View, manage, and track every event payment.</p>
          </div>
          <span className="cash-badge">
            {filteredEvents.length} events
          </span>
        </div>

        <div className="cash-filter-grid">
          <input
            className="cash-input"
            placeholder="Search event, location, member..."
            value={eventSearch}
            onChange={(e) => setEventSearch(e.target.value)}
          />

          <input
            className="cash-input"
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />

          <select
            className="cash-input"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
          >
            <option value="all">All payment statuses</option>
            <option value="paid">Fully paid</option>
            <option value="unpaid">Pending payments</option>
            <option value="partial">Partially paid</option>
          </select>
           <select
            className="cash-input"
            value={eventSort}
            onChange={(e) => setEventSort(e.target.value)}
            >
            <option value="newest">Newest events</option>
            <option value="oldest">Oldest events</option>
            <option value="pending">Highest pending amount</option>
            <option value="paid">Highest paid amount</option>
           </select>

          <select
            className="cash-input"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="all">All team members</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="cash-empty">
            <h3>No events found</h3>
            <p>Try changing your filters or create a new event.</p>
          </div>
        ) : (
          <div className="cash-event-list">
            {sortedEvents.map((event) => {
              const allocated = eventAllocated(event);
              const paid = eventPaid(event);
              const pending = eventPending(event);
              const expanded = expandedEventId === event.id;

              return (
                <article className="cash-event-card" key={event.id}>
                  <div className="cash-event-top">
                    <div>
                      <div className="cash-event-title-row">
                        <h3>{event.eventName}</h3>
                        <span
                          className={`cash-status cash-status-${eventStatus(event)}`}
                        >
                          {statusLabel(eventStatus(event))}
                        </span>
                      </div>

                      <div className="cash-event-meta">
                        <span>{formatDate(event.eventAttendedDate)}</span>
                        {event.location && <span>📍 {event.location}</span>}
                        {event.inTime && <span>In: {event.inTime}</span>}
                        {event.outTime && <span>Out: {event.outTime}</span>}
                      </div>
                    </div>

                    <button
                      className="cash-btn cash-btn-secondary"
                      type="button"
                      onClick={() =>
                        setExpandedEventId(expanded ? null : event.id)
                      }
                    >
                      {expanded ? "Hide Details" : "View Details"}
                    </button>
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
                      <strong className="cash-negative">{money(pending)}</strong>
                    </div>
                    <div>
                      <span>Members</span>
                      <strong>{event.members.length}</strong>
                    </div>
                  </div>

                  <div className="cash-progress">
                    <div
                      className="cash-progress-bar"
                      style={{
                        width: `${
                          allocated > 0
                            ? Math.min((paid / allocated) * 100, 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                                    <div className="cash-event-actions">
                    <button
                      className="cash-btn cash-btn-secondary"
                      type="button"
                      onClick={() => openEditEvent(event)}
                    >
                      Edit
                    </button>

                    <button
                      className="cash-btn cash-btn-secondary"
                      type="button"
                      onClick={() => duplicateEvent(event)}
                    >
                      Duplicate
                    </button>

                    <button
                      className="cash-btn cash-btn-secondary"
                      type="button"
                      onClick={() => exportEventReceipt(event)}
                    >
                      Event Receipt PDF
                    </button>

                    {pending > 0 && (
                      <button
                        className="cash-btn cash-btn-primary"
                        type="button"
                        onClick={() => payAllPendingMembers(event)}
                      >
                        Pay All Pending
                      </button>
                    )}

                    <button
                      className="cash-btn cash-btn-danger"
                      type="button"
                      onClick={() => deleteEvent(event.id)}
                    >
                      Delete
                    </button>
                  </div>

                  {expanded && (
                    <div className="cash-event-details">
                      {event.notes && (
                        <div className="cash-notes">
                          <strong>Notes:</strong> {event.notes}
                        </div>
                      )}

                      <div className="cash-member-list">
                        {event.members.map((member) =>
                          renderEventMember(event, member)
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
            {/* PREMIUM REPORTS & ANALYTICS */}
      <section className="cash-section cash-report-shell">
        <div className="cash-report-hero">
          <div>
            <div className="cash-report-eyebrow">✦ Insights dashboard</div>
            <h2>Reports &amp; Analytics</h2>
            <p>Understand team payouts, event performance and outstanding balances.</p>
          </div>
          <div className="cash-report-tabs">
            <button
              type="button"
              className={`cash-tab ${reportTab === "members" ? "active" : ""}`}
              onClick={() => setReportTab("members")}
            >
              Team Reports
            </button>
            <button
              type="button"
              className={`cash-tab ${reportTab === "events" ? "active" : ""}`}
              onClick={() => setReportTab("events")}
            >
              Period Summary
            </button>
          </div>
        </div>

        <div className="cash-report-body">
          {reportTab === "members" ? (
            <>
              <div className="cash-report-kpis">
                <div className="cash-report-kpi blue">
                  <div className="cash-report-kpi-label">◈ TEAM MEMBERS</div>
                  <strong>{filteredMemberReports.length}</strong>
                  <small>Members matching your search</small>
                </div>
                <div className="cash-report-kpi violet">
                  <div className="cash-report-kpi-label">▤ EVENTS ASSIGNED</div>
                  <strong>{filteredMemberReports.reduce((sum, person) => sum + person.eventCount, 0)}</strong>
                  <small>Total team event assignments</small>
                </div>
                <div className="cash-report-kpi green">
                  <div className="cash-report-kpi-label">↗ TOTAL PAID</div>
                  <strong>{money(filteredMemberReports.reduce((sum, person) => sum + person.paid, 0))}</strong>
                  <small>Payments recorded for this team</small>
                </div>
                <div className="cash-report-kpi amber">
                  <div className="cash-report-kpi-label">◷ OUTSTANDING</div>
                  <strong>{money(filteredMemberReports.reduce((sum, person) => sum + person.pending, 0))}</strong>
                  <small>Amount still to be paid</small>
                </div>
              </div>

              <div className="cash-report-toolbar">
                <div className="cash-report-toolbar-title">
                  <h3>Team payment performance</h3>
                  <p>Allocation, payment progress and outstanding amount by member.</p>
                </div>
                <input
                  className="cash-input cash-report-search"
                  placeholder="⌕  Search team member..."
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                />
              </div>

              {filteredMemberReports.length === 0 ? (
                <div className="cash-report-empty">
                  <strong>No report data found</strong>
                  Try another search or add team members to your roster.
                </div>
              ) : (
                <div className="cash-report-table-wrap">
                  <table className="cash-report-table">
                    <thead>
                      <tr>
                        <th>Team Member</th>
                        <th>Events</th>
                        <th>Allocated</th>
                        <th>Paid</th>
                        <th>Payment progress</th>
                        <th>Pending</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMemberReports.map((report) => {
                        const progress = report.allocated > 0
                          ? Math.min(100, (report.paid / report.allocated) * 100)
                          : 0;
                        const status = report.pending <= 0.009
                          ? "paid"
                          : report.paid > 0
                            ? "partial"
                            : "unpaid";
                        return (
                          <tr key={report.id}>
                            <td>
                              <div className="cash-report-person">
                                <div className="cash-report-avatar">
                                  {(report.name || "?").trim().slice(0, 1).toUpperCase()}
                                </div>
                                <div>
                                  <strong>{report.name}</strong>
                                  <small>Team member</small>
                                </div>
                              </div>
                            </td>
                            <td>{report.eventCount}</td>
                            <td>{money(report.allocated)}</td>
                            <td className="cash-positive">{money(report.paid)}</td>
                            <td>
                              <div style={{ minWidth: 95 }}>
                                <small style={{ color: "#9aa9c2" }}>{progress.toFixed(0)}%</small>
                                <div className="cash-report-progress">
                                  <span style={{ width: `${progress}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="cash-negative">{money(report.pending)}</td>
                            <td>
                              <span className={`cash-report-status ${status}`}>
                                {status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Unpaid"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="cash-report-toolbar">
                <div className="cash-report-toolbar-title">
                  <h3>Period performance</h3>
                  <p>Review allocations and payments for a selected period.</p>
                </div>
              </div>

              <div className="cash-report-period-controls">
                <select
                  className="cash-input"
                  value={periodMode}
                  onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
                >
                  <option value="monthly">Monthly view</option>
                  <option value="yearly">Yearly view</option>
                </select>

                {periodMode === "monthly" && (
                  <input
                    className="cash-input"
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  />
                )}

                <select
                  className="cash-input"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                >
                  {getYearOptions().map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="cash-report-kpis">
                <div className="cash-report-kpi blue">
                  <div className="cash-report-kpi-label">▤ ALLOCATED</div>
                  <strong>{money(periodSummary.allocated)}</strong>
                  <small>{periodSummary.eventCount} event{periodSummary.eventCount === 1 ? "" : "s"} in period</small>
                </div>
                <div className="cash-report-kpi green">
                  <div className="cash-report-kpi-label">↗ PAID</div>
                  <strong>{money(periodSummary.paid)}</strong>
                  <small>{periodPayments.length} payment{periodPayments.length === 1 ? "" : "s"} received</small>
                </div>
                <div className="cash-report-kpi amber">
                  <div className="cash-report-kpi-label">◷ PENDING</div>
                  <strong>{money(periodSummary.pending)}</strong>
                  <small>Outstanding balance</small>
                </div>
                <div className="cash-report-kpi violet">
                  <div className="cash-report-kpi-label">◎ COLLECTION RATE</div>
                  <strong>{periodSummary.allocated > 0
                    ? `${Math.min(100, (periodSummary.paid / periodSummary.allocated) * 100).toFixed(1)}%`
                    : "0.0%"}</strong>
                  <small>Paid compared with allocated</small>
                </div>
              </div>

              <div className="cash-report-period-footer">
                <span>Collection progress</span>
                <strong>
                  {periodSummary.allocated > 0
                    ? `${Math.min(100, (periodSummary.paid / periodSummary.allocated) * 100).toFixed(1)}% collected`
                    : "No allocation recorded"}
                </strong>
              </div>
              <div className="cash-report-progress" style={{ height: 10, marginTop: 10 }}>
                <span style={{
                  width: `${periodSummary.allocated > 0
                    ? Math.min(100, (periodSummary.paid / periodSummary.allocated) * 100)
                    : 0}%`
                }} />
              </div>
            </>
          )}
        </div>
      </section>
            {/* PAYMENT MODAL */}
      {paymentOpen && (
        <div
          className="cash-modal-overlay"
          onClick={() => setPaymentOpen(false)}
        >
          <div
            className="cash-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cash-modal-head">
              <div>
                <h2>Record Payment</h2>
                <p>Enter the payment details below.</p>
              </div>

              <button
                className="cash-modal-close"
                type="button"
                onClick={() => setPaymentOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={savePayment}>
              <div className="cash-form-grid">
                <div className="cash-field full">
                  <label>Event</label>
                  <select
                    className="cash-input"
                    value={paymentEventId || ""}
                    onChange={(e) => {
                      setPaymentEventId(e.target.value || null);
                      setPaymentMemberId(null);
                    }}
                    required
                  >
                    <option value="">Select event</option>
                    {distributions.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.eventName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cash-field full">
                  <label>Team Member</label>
                  <select
                    className="cash-input"
                    value={paymentMemberId || ""}
                    onChange={(e) => setPaymentMemberId(e.target.value || null)}
                    required
                  >
                    <option value="">Select member</option>
                    {distributions
                      .find((event) => event.id === paymentEventId)
                      ?.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.memberName}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="cash-field">
                  <label>Amount (₹)</label>
                  <input
                    className="cash-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="cash-field">
                  <label>Payment Date</label>
                  <input
                    className="cash-input"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                  />
                </div>

                <div className="cash-field full">
                  <label>Payment Note / Reference</label>
                  <input
                    className="cash-input"
                    placeholder="Optional note"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="cash-modal-actions">
                <button
                  className="cash-btn cash-btn-secondary"
                  type="button"
                  onClick={() => setPaymentOpen(false)}
                >
                  Cancel
                </button>

                <button
                  className="cash-btn cash-btn-primary"
                  type="submit"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
      
