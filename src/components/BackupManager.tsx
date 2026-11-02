
import { useEffect, useState } from "react";
import {
  auth,
  createCloudBackup,
  getCloudBackups,
  restoreCloudBackup
} from "../services/firebase";
import type { AppData } from "../types";

type BackupItem = {
  id: string;
  data: unknown;
  createdAt: any;
  kind: "automatic" | "manual";
};

type Props = {
  currentData: AppData;
  onRestore: (data: AppData) => void;
};

function formatBackupDate(value: any) {
  const date = value?.toDate
    ? value.toDate()
    : value
      ? new Date(value)
      : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString();
}

function isAppData(value: any): value is AppData {
  return (
    value &&
    Array.isArray(value.transactions) &&
    Array.isArray(value.pendingPayments) &&
    Array.isArray(value.categories) &&
    Array.isArray(value.accounts) &&
    Array.isArray(value.budgets)
  );
}

export default function BackupManager({
  currentData,
  onRestore
}: Props) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const userId = auth.currentUser?.uid;

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
      setMessage("Could not load cloud backups.");
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
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await createCloudBackup(userId, currentData);
      setMessage("Manual backup created successfully.");
      await refreshBackups();
    } catch (error) {
      console.error(error);
      setMessage("Backup failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(backup: BackupItem) {
    if (!userId) {
      setMessage("Please sign in first.");
      return;
    }

    const confirmed = window.confirm(
      "Restore this backup? Your current data will be saved as a safety backup first."
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      const restored = await restoreCloudBackup(
        userId,
        backup.id
      );

      if (!isAppData(restored)) {
        throw new Error("Invalid backup format.");
      }

      onRestore(restored);
      setMessage("Backup restored successfully.");
      await refreshBackups();
    } catch (error) {
      console.error(error);
      setMessage("Restore failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="backup-manager">
      <div className="backup-manager-header">
        <div>
          <h2>Cloud Backup Manager</h2>
          <p>
            Automatic backups are created once per day.
            Manual backups can be created anytime.
          </p>
        </div>

        <button
          onClick={handleCreateBackup}
          disabled={busy || !userId}
        >
          {busy ? "Please wait…" : "Create manual backup"}
        </button>
      </div>

      {message && <p role="status">{message}</p>}

      {loading ? (
        <p>Loading backups…</p>
      ) : backups.length === 0 ? (
        <p>No cloud backups found yet.</p>
      ) : (
        <div className="backup-list">
          {backups.map((backup) => {
            const data = backup.data as
              Partial<AppData> | undefined;

            const isAutomatic = backup.kind === "automatic";

            return (
              <article
                className="backup-item"
                key={backup.id}
              >
                <div>
                  <strong>
                    {isAutomatic
                      ? "🤖 Automatic Backup"
                      : "✋ Manual Backup"}
                  </strong>

                  <p>
                    {formatBackupDate(backup.createdAt)}
                  </p>

                  <p>
                    {data?.transactions?.length ?? 0}
                    {" transactions · "}
                    {data?.pendingPayments?.length ?? 0}
                    {" pending payments"}
                  </p>
                </div>

                <button
                  onClick={() => void handleRestore(backup)}
                  disabled={busy || !userId}
                >
                  Restore
                </button>
              </article>
            );
          })}
        </div>
      )}

      <button
        className="backup-refresh"
        onClick={() => void refreshBackups()}
        disabled={loading || busy}
      >
        Refresh list
      </button>
    </section>
  );
}
