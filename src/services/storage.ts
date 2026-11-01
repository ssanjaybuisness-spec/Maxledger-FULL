import { Preferences } from "@capacitor/preferences";
import type { AppData, Category } from "../types";
import { auth, getCloudData, saveCloudData } from "./firebase";

const STORAGE_KEY = "maxledger_data_v1";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "income-salary", name: "Salary", type: "income", color: "#34d399", icon: "wallet" },
  { id: "income-freelance", name: "Freelance", type: "income", color: "#60a5fa", icon: "laptop" },
  { id: "income-business", name: "Business", type: "income", color: "#a78bfa", icon: "briefcase" },
  { id: "income-event", name: "Event Work", type: "income", color: "#fbbf24", icon: "calendar" },
  { id: "income-other", name: "Other Income", type: "income", color: "#94a3b8", icon: "plus-circle" },
  { id: "expense-food", name: "Food", type: "expense", color: "#fb923c", icon: "utensils" },
  { id: "expense-transport", name: "Transport", type: "expense", color: "#38bdf8", icon: "bike" },
  { id: "expense-shopping", name: "Shopping", type: "expense", color: "#f472b6", icon: "shopping-bag" },
  { id: "expense-education", name: "Education", type: "expense", color: "#818cf8", icon: "book" },
  { id: "expense-bills", name: "Bills", type: "expense", color: "#facc15", icon: "receipt" },
  { id: "expense-entertainment", name: "Entertainment", type: "expense", color: "#c084fc", icon: "gamepad-2" },
  { id: "expense-health", name: "Health", type: "expense", color: "#4ade80", icon: "heart-pulse" },
  { id: "expense-other", name: "Other Expense", type: "expense", color: "#94a3b8", icon: "circle-help" }
];

const EMPTY_DATA: AppData = {
  transactions: [],
  pendingPayments: [],
  categories: DEFAULT_CATEGORIES,
  accounts: [],
  budgets: []
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

function migrateData(data: AppData): AppData {
  const existingIds = new Set(data.categories.map(category => category.id));

  return {
    ...data,
    categories: [
      ...data.categories,
      ...DEFAULT_CATEGORIES.filter(category => !existingIds.has(category.id))
    ],
    budgets: Array.isArray(data.budgets) ? data.budgets : []
  };
}

function mergeRecords<T extends { id: string; updatedAt?: number; createdAt?: number }>(
  local: T[],
  cloud: T[]
): T[] {
  const records = new Map<string, T>();

  for (const item of local) records.set(item.id, item);

  for (const item of cloud) {
    const existing = records.get(item.id);

    const existingTime = existing?.updatedAt ?? existing?.createdAt ?? 0;
    const cloudTime = item.updatedAt ?? item.createdAt ?? 0;

    if (!existing || cloudTime > existingTime) {
      records.set(item.id, item);
    }
  }

  return Array.from(records.values());
}

function mergeData(local: AppData, cloud: AppData): AppData {
  return migrateData({
    transactions: mergeRecords(local.transactions, cloud.transactions),
    pendingPayments: mergeRecords(local.pendingPayments, cloud.pendingPayments),
    categories: mergeRecords(local.categories, cloud.categories),
    accounts: mergeRecords(local.accounts, cloud.accounts),
    budgets: mergeRecords(local.budgets, cloud.budgets)
  });
}

async function readLocalData(): Promise<AppData> {
  try {
    const result = await Preferences.get({ key: STORAGE_KEY });

    if (result.value) {
      const parsed: unknown = JSON.parse(result.value);
      if (isValidData(parsed)) return migrateData(parsed);
    }
  } catch (error) {
    console.warn("Capacitor storage unavailable:", error);
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isValidData(parsed)) return migrateData(parsed);
    }
  } catch (error) {
    console.error("Unable to load local data:", error);
  }

  return { ...EMPTY_DATA, categories: [...DEFAULT_CATEGORIES] };
}

async function writeLocalData(data: AppData): Promise<void> {
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

export async function loadData(): Promise<AppData> {
  const localData = await readLocalData();
  const user = auth.currentUser;

  if (!user) return localData;

  try {
    const cloudRecord = await getCloudData(user.uid);

    if (!cloudRecord) {
      await saveCloudData(user.uid, localData);
      return localData;
    }

    const cloudPayload = cloudRecord.data;

    if (!isValidData(cloudPayload)) {
      console.warn("Cloud data format was not recognised. Keeping local data.");
      return localData;
    }

    const merged = mergeData(localData, cloudPayload);

    await writeLocalData(merged);
    await saveCloudData(user.uid, merged);

    return merged;
  } catch (error) {
    console.warn("Cloud sync unavailable. Using local data:", error);
    return localData;
  }
}

export async function saveData(data: AppData): Promise<void> {
  await writeLocalData(data);

  const user = auth.currentUser;

  if (user) {
    try {
      await saveCloudData(user.uid, data);
    } catch (error) {
      console.warn("Cloud save failed. Local data is safe:", error);
    }
  }
}

export async function clearLocalData(): Promise<void> {
  await Preferences.remove({ key: STORAGE_KEY });
  localStorage.removeItem(STORAGE_KEY);
}
