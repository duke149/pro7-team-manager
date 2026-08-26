export const FINANCE_DIRECTIONS = ["income", "expense"] as const;
export const DUE_STATUSES = ["pending", "paid", "waived"] as const;

export type FinanceDirection = (typeof FINANCE_DIRECTIONS)[number];
export type DueStatus = (typeof DUE_STATUSES)[number];

export type FinanceEntry = Readonly<{
  id: string;
  direction: FinanceDirection;
  amountVnd: number;
  category: string;
  occurredOn: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}>;

export type MemberDue = Readonly<{
  id: string;
  userId: string;
  displayName: string;
  periodStart: string;
  amountVnd: number;
  dueDate: string;
  status: DueStatus;
  paidAt: string | null;
  financeEntryId: string | null;
  updatedAt: string;
}>;

export type FundsData = Readonly<{
  periodStart: string;
  balanceVnd: number;
  monthIncomeVnd: number;
  monthIncomeCount: number;
  monthExpenseVnd: number;
  monthExpenseCount: number;
  pendingDuesVnd: number;
  pendingDuesCount: number;
  paidDuesCount: number;
  totalDuesCount: number;
  dues: readonly MemberDue[];
  recentEntries: readonly FinanceEntry[];
}>;

export type FundsResult =
  | Readonly<{ ok: true; data: FundsData }>
  | Readonly<{ ok: false; error: "server" }>;
