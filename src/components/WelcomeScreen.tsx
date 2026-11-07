import {
  BarChart3,
  Clock3,
  CloudUpload,
  FileSpreadsheet,
  Users
} from "lucide-react";

type Props = {
  displayName: string;
  email: string;
  isNewAccount: boolean;
  onContinue: () => void;
};

const FEATURES = [
  {
    icon: BarChart3,
    title: "Income & expenses",
    text: "Track every rupee with categories, budgets and clear analytics."
  },
  {
    icon: Clock3,
    title: "Pending payments",
    text: "Follow customer dues and record part-payments as they arrive."
  },
  {
    icon: Users,
    title: "Event cash distribution",
    text: "Split event earnings with your team and track every payout."
  },
  {
    icon: FileSpreadsheet,
    title: "Excel, CSV & PDF reports",
    text: "Export professional reports for any period in one tap."
  },
  {
    icon: CloudUpload,
    title: "Secure cloud backup",
    text: "Your ledger syncs to your Google account and stays backed up."
  }
];

export default function WelcomeScreen({
  displayName,
  email,
  isNewAccount,
  onContinue
}: Props) {
  const firstName = displayName.trim().split(/\s+/)[0] || "there";

  return (
    <div
      className="welcome-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="welcome-card">
        <div className="brand-icon welcome-logo">M</div>

        <p className="welcome-kicker">
          {isNewAccount ? "ACCOUNT CREATED" : "SIGNED IN"}
        </p>

        <h1 id="welcome-title">
          {isNewAccount
            ? `Welcome to MaxLedger, ${firstName}!`
            : `Welcome back, ${firstName}!`}
        </h1>

        <p className="welcome-lead">
          {isNewAccount
            ? "Your professional ledger for income, events and team payouts is ready."
            : "Your ledger is ready. Everything is right where you left it."}
        </p>

        <ul className="welcome-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <span className="welcome-feature-icon">
                <Icon size={18} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="submit-button welcome-button"
          onClick={onContinue}
        >
          {isNewAccount ? "Get started" : "Continue"}
        </button>

        {email && <p className="welcome-account">Signed in as {email}</p>}
      </div>
    </div>
  );
}
