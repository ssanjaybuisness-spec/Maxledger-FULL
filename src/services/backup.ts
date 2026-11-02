
import type { AppData } from "../types";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export async function exportBackup(data: AppData): Promise<void> {
  try {
    const backup = {
      app: "MaxLedger",
      version: 1,
      exportedAt: new Date().toISOString(),
      data
    };

    const filename = `MaxLedger-Backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    const file = await Filesystem.writeFile({
      path: filename,
      data: JSON.stringify(backup, null, 2),
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    });

    await Share.share({
      title: "MaxLedger Full Backup",
      text: "Your complete MaxLedger data backup",
      files: [file.uri],
      dialogTitle: "Save or share backup"
    });
  } catch (error) {
    console.error("Backup export failed:", error);
    alert("Unable to create backup. Please try again.");
  }
}
