
import { useEffect, useState } from "react";
import {
  auth,
  createCloudBackup,
  getCloudBackups,
  logout,
  restoreCloudBackup
} from "../services/firebase";
import type { AppData } from "../types";
import {
  Cloud, CloudDownload, RefreshCw, ShieldCheck,
  Clock3, Database, HardDrive, CheckCircle2,
  FileSpreadsheet, LogOut
} from "lucide-react";

type BackupItem = {
  id: string;
  data: unknown;
  createdAt: any;
  kind: "automatic" | "manual";
};

type Props = {
  currentData: AppData;
  onRestore: (data: AppData) => void;
  onExportExcel?: () => void;
};

function formatBackupDate(value: any) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function isAppData(value: any): value is AppData {
  return value &&
    Array.isArray(value.transactions) &&
    Array.isArray(value.pendingPayments) &&
    Array.isArray(value.categories) &&
    Array.isArray(value.accounts) &&
    Array.isArray(value.budgets);
}

export default function BackupManager({
  currentData,
  onRestore,
  onExportExcel
}: Props) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);

  const userId = auth.currentUser?.uid;
  const accountName =
    auth.currentUser?.displayName || auth.currentUser?.email || "Signed in";
  const accountEmail = auth.currentUser?.email || "";
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (
      !window.confirm(
        "Sign out of MaxLedger? Your data stays saved in the cloud and on this device."
      )
    ) {
      return;
    }

    setSigningOut(true);

    try {
      await logout();
    } catch (error) {
      console.error("Sign out failed:", error);
      setMessage("Sign out failed. Please try again.");
      setMessageError(true);
      setSigningOut(false);
    }
  }
  const transactionCount = currentData.transactions.length;
  const pendingCount = currentData.pendingPayments.length;

  async function refreshBackups() {
    if (!userId) {
      setBackups([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const items = await getCloudBackups(userId);
      setBackups(items as BackupItem[]);
      setMessage("");
    } catch (error) {
      console.error(error);
      setMessage("Could not load cloud backups. Check your connection and try again.");
      setMessageError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshBackups();
  }, [userId]);

  async function handleCreateBackup() {
    if (!userId) {
      setMessage("Please sign in first.");
      setMessageError(true);
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await createCloudBackup(userId, currentData);
      setMessage("Your manual backup is safely stored in the cloud.");
      setMessageError(false);
      await refreshBackups();
    } catch (error) {
      console.error(error);
      setMessage("Backup failed. Please try again.");
      setMessageError(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(backup: BackupItem) {
    if (!userId) {
      setMessage("Please sign in first.");
      setMessageError(true);
      return;
    }

    if (!window.confirm(
      "Restore this backup? Your current data will be saved as a safety backup first."
    )) return;

    setBusy(true);
    setMessage("");

    try {
      const restored = await restoreCloudBackup(userId, backup.id);

      if (!isAppData(restored)) {
        throw new Error("Invalid backup format.");
      }

      onRestore(restored);
      setMessage("Backup restored successfully.");
      setMessageError(false);
      await refreshBackups();
    } catch (error) {
      console.error(error);
      setMessage("Restore failed. Please try again.");
      setMessageError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="backup-manager backup-redesign">
      <div className="backup-hero">
        <div className="backup-hero-top">
          <div className="backup-hero-icon"><Cloud size={23} /></div>
          <span className="backup-secure">
            <ShieldCheck size={14} /> CLOUD PROTECTED
          </span>
        </div>

        <span className="backup-kicker">DATA & SECURITY</span>
        <h2>Your data, backed up.</h2>
        <p>
          Keep your ledger safe with automatic snapshots and manual backups whenever you need them.
        </p>

        <button
          className="backup-create-button"
          onClick={() => void handleCreateBackup()}
          disabled={busy || !userId}
        >
          <CloudDownload size={17} />
          {busy ? "Please wait…" : "Create manual backup"}
        </button>

        {onExportExcel && (
          <button
            type="button"
            className="backup-create-button backup-excel-button"
            onClick={onExportExcel}
          >
            <FileSpreadsheet size={17} />
            Export all data to Excel
          </button>
        )}
      </div>

      <div className="backup-stats">
        <div className="backup-stat">
          <Database size={17} />
          <strong>{transactionCount}</strong>
          <span>Transactions</span>
        </div>
        <div className="backup-stat">
          <Clock3 size={17} />
          <strong>{pendingCount}</strong>
          <span>Payment records</span>
        </div>
        <div className="backup-stat">
          <HardDrive size={17} />
          <strong>{backups.length}</strong>
          <span>Cloud backups</span>
        </div>
      </div>

      {message && (
        <div className={`backup-message ${messageError ? "error" : "success"}`}>
          {!messageError && <CheckCircle2 size={16} />}
          {message}
        </div>
      )}

      <div className="backup-list-heading">
        <div>
          <span className="backup-kicker">HISTORY</span>
          <h3>Backup history</h3>
          <p>Your recent cloud restore points.</p>
        </div>
        <button
          className="backup-refresh-button"
          onClick={() => void refreshBackups()}
          disabled={loading || busy}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="backup-empty">
          <span className="backup-spinner" />
          <strong>Loading backup history</strong>
          <p>Checking your secure cloud storage…</p>
        </div>
      ) : backups.length === 0 ? (
        <div className="backup-empty">
          <div className="backup-empty-icon"><Cloud size={22} /></div>
          <strong>No backups yet</strong>
          <p>Your cloud restore points will appear here after the first backup.</p>
        </div>
      ) : (
        <div className="backup-list">
          {backups.map(backup => {
            const data = backup.data as Partial<AppData> | undefined;
            const automatic = backup.kind === "automatic";

            return (
              <article className="backup-item" key={backup.id}>
                <div className={`backup-item-icon ${automatic ? "automatic" : "manual"}`}>
                  {automatic ? <Clock3 size={18} /> : <CloudDownload size={18} />}
                </div>

                <div className="backup-item-info">
                  <div className="backup-item-title">
                    <strong>{automatic ? "Automatic backup" : "Manual backup"}</strong>
                    <span className={`backup-kind ${automatic ? "auto" : "manual"}`}>
                      {automatic ? "AUTO" : "MANUAL"}
                    </span>
                  </div>

                  <p>{formatBackupDate(backup.createdAt)}</p>

                  <span className="backup-item-meta">
                    {data?.transactions?.length ?? 0} transactions
                    <i />
                    {data?.pendingPayments?.length ?? 0} payments
                  </span>
                </div>

                <button
                  className="backup-restore-button"
                  onClick={() => void handleRestore(backup)}
                  disabled={busy || !userId}
                >
                  <RefreshCw size={14} /> Restore
                </button>
              </article>
            );
          })}
        </div>
      )}

      <p className="backup-footnote">
        <ShieldCheck size={14} />
        Restoring creates a safety backup of your current data first.
      </p>

      <div className="backup-account">
        <span className="backup-kicker">ACCOUNT</span>

        <div className="backup-account-info">
          <strong>{accountName}</strong>
          {accountEmail && accountEmail !== accountName && (
            <span>{accountEmail}</span>
          )}
        </div>

        <button
          type="button"
          className="backup-signout-button"
          onClick={() => void handleSignOut()}
          disabled={signingOut || busy}
        >
          <LogOut size={16} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </section>
  );
}
