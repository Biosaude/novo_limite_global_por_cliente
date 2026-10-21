export type Category = "upcoming" | "overdue" | "received";
export const categoryLabel: Record<Category, string> = {
  upcoming: "A Vencer",
  overdue: "Vencidos (inadimplência)",
  received: "Recebido",
};
export type RawCell =
  null | string | number | boolean | RawCell[] | { [key: string]: RawCell };
export interface SourceRow {
  number: number;
  cells: RawCell[];
}
export interface SourceSheet {
  name: string;
  rows: SourceRow[];
  columns: number;
}
export interface SourceWorkbook {
  sheets: SourceSheet[];
  date1904: boolean;
}
export const fieldLabels = {
  client: "Cliente",
  title: "Título completo",
  representative: "Representante",
  amount: "Valor financeiro",
  due: "Vencimento",
  received: "Recebimento",
  days: "Dias informados",
  issued: "Emissão",
  document: "Duplicata",
  installment: "Parcela",
};
export type Field = keyof typeof fieldLabels;
export interface Mapping {
  sheet: string;
  category: Category | "";
  header: number;
  fields: Record<Field, number>;
}
export interface FinancialRecord {
  id: string;
  sheet: string;
  row: number;
  category: Category;
  client: string;
  title: string;
  representative: string;
  cents: number | null;
  due: string | null;
  received: string | null;
  reportedDays: number | null;
  issued?: string | null;
  document?: string;
  installment?: string;
}
export interface Issue {
  id: string;
  severity: "warning" | "error";
  code: string;
  message: string;
  records: string[];
}
export interface Review {
  note: string;
  reviewedAt: string;
}
export interface Dataset {
  version: 1;
  id: string;
  filename: string;
  importedAt: string;
  updatedAt?: string;
  reference: string;
  source: SourceWorkbook;
  mappings: Mapping[];
  records: FinancialRecord[];
  issues: Issue[];
  reviews: Record<string, Review>;
}
export interface Filters {
  year: string;
  month: string;
  client: string;
  representative: string;
  category: string;
}
export interface Totals {
  upcoming: number;
  overdue: number;
  received: number;
  exposure: number;
  /** Movimentação gerencial: saldos da posição + recebimentos YTD; não é dívida. */
  global: number;
  count: number;
}
export interface Group extends Totals {
  name: string;
}
