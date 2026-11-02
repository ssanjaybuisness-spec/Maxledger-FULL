
export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  category: string;
  type: TransactionType;
  date: string;
  notes?: string;
  accountId?: string;
  createdAt: number;
  updatedAt: number;
}

export type PaymentStatus =
  | "pending"
  | "partially_paid"
  | "paid"
  | "cancelled";

export interface PaymentReceipt {
  id: string;
  amount: number;
  receivedDate: string;
  method: string;
  notes?: string;
}

export interface PendingPayment {
  id: string;
  customerName: string;
  expectedAmount: number;
  expectedDate: string;
  status: PaymentStatus;
  receipts: PaymentReceipt[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
}

export interface UpiAccount {
  id: string;
  name: string;
  upiId: string;
  isDefault: boolean;
}

export interface Budget {
  id: string;
  category: string;
  amount: number;
  month: string;
}

export interface AppData {
  transactions: Transaction[];
  pendingPayments: PendingPayment[];
  categories: Category[];
  accounts: UpiAccount[];
  budgets: Budget[];
  deletedTransactionIds?: string[];
}
