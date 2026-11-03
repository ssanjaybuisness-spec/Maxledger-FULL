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

  const previousMonth = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const date = new Date(year, month - 2, 1);

    return `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
  }, [selectedMonth]);

  const previousMonthEvents = useMemo(
    () => distributions.filter((event) =>
      event.eventAttendedDate?.startsWith(previousMonth)
    ),
    [distributions, previousMonth]
  );

  const previousMonthPayments = useMemo(
    () => distributions
      .flatMap((event) =>
        event.members.flatMap((member) =>
          (member.payments || [])
            .filter((payment) =>
              payment.paidDate?.startsWith(previousMonth)
            )
            .map((payment) => payment.amount)
        )
      )
      .reduce((sum, amount) => sum + amount, 0),
    [distributions, previousMonth]
  );

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

  function getMonthName(month: string) {
    if (!month) return "";

    const [year, monthNumber] = month.split("-").map(Number);

    return new Date(year, monthNumber - 1, 1).toLocaleDateString(
      "en-IN",
      { month: "long", year: "numeric" }
    );
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

  const previousMonthAllocated = previousMonthEvents.reduce(
    (sum, event) => sum + eventAllocated(event),
    0
  );

  const previousMonthPending = previousMonthEvents.reduce(
    (sum, event) => sum + eventPending(event),
    0
  );

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
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  {filteredMemberReports.length === 0 ? (
  <div className="cash-empty">
    No team members found.
  </div>
) : (
  <table className="cash-report-table">
    <thead>
      <tr>
        <th>Team Member</th>
        <th>Events</th>
        <th>Allocated</th>
        <th>Paid</th>
        <th>Pending</th>
      </tr>
    </thead>
    <tbody>
      {filteredMemberReports.map((member) => (
        <tr key={member.id}>
          <td>{member.name}</td>
          <td>{member.eventCount}</td>
          <td>{money(member.allocated)}</td>
          <td>{money(member.paid)}</td>
          <td>{money(member.pending)}</td>
        </tr>
      ))}
    </tbody>
  </table>
)}
            </div>
          </>
        )}
      </section>

      {/* Payment modal for event-member Record Payment buttons */}
      {paymentOpen && (
        <div
          className="cash-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPaymentOpen(false);
            }
          }}
        >
          <div className="cash-modal">
            <h3>Record Payment</h3>

            <form onSubmit={savePayment}>
              <div className="cash-form-grid">
                <div className="cash-field cash-field-full">
                  <label>Event</label>
                  <input
                    value={
                      distributions.find(
                        (event) => event.id === paymentEventId
                      )?.eventName || ""
                    }
                    readOnly
                  />
                </div>

                <div className="cash-field cash-field-full">
                  <label>Team Member</label>
                  <input
                    value={
                      distributions
                        .find((event) => event.id === paymentEventId)
                        ?.members.find(
                          (member) => member.id === paymentMemberId
                        )?.memberName || ""
                    }
                    readOnly
                  />
                </div>

                <div className="cash-field">
                  <label>Amount (₹)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(event) =>
                      setPaymentAmount(event.target.value)
                    }
                    required
                  />
                </div>

                <div className="cash-field">
                  <label>Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(event) =>
                      setPaymentDate(event.target.value)
                    }
                    required
                  />
                </div>

                <div className="cash-field cash-field-full">
                  <label>Payment Note / Reference</label>
                  <input
                    value={paymentNote}
                    onChange={(event) =>
                      setPaymentNote(event.target.value)
                    }
                    placeholder="Optional reference"
                  />
                </div>
              </div>

              <div className="cash-actions" style={{ marginTop: 18 }}>
                <button
                  type="submit"
                  className="cash-button cash-button-primary"
                >
                  Save Payment
                </button>

                <button
                  type="button"
                  className="cash-button"
                  onClick={() => setPaymentOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
  
