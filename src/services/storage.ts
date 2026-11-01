
import { Preferences } from "@capacitor/preferences";
import type { AppData } from "../types";

const STORAGE_KEY = "maxledger_data_v1";

const EMPTY_DATA: AppData = {
  transactions: [],
  pendingPayments: [],
  categories: [],
  accounts: []
};

function isValidData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;

  const data = value as Record<string, unknown>;

  return (
    Array.isArray(data.transactions) &&
    Array.isArray(data.pendingPayments) &&
    Array.isArray(data.categories) &&
    Array.isArray(data.accounts)
  );
}

export async function loadData(): Promise<AppData> {
  try {
    const result = await Preferences.get({ key: STORAGE_KEY });

    if (result.value) {
      const parsed: unknown = JSON.parse(result.value);
      if (isValidData(parsed)) return parsed;
    }
  } catch (error) {
    console.warn("Capacitor storage unavailable:", error);
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isValidData(parsed)) return parsed;
    }
  } catch (error) {
    console.error("Unable to load local data:", error);
  }

  return EMPTY_DATA;
}

export async function saveData(data: AppData): Promise<void> {
  const serialized = JSON.stringify(data);

  try {
    await Preferences.set({
      key: STORAGE_KEY,
      value: serialized
    });
    return;
  } catch (error) {
    console.warn("Capacitor storage unavailable:", error);
  }

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    throw new Error("Unable to save MaxLedger data: " + String(error));
  }
}

export async function clearLocalData(): Promise<void> {
  await Preferences.remove({ key: STORAGE_KEY });
  localStorage.removeItem(STORAGE_KEY);
}
