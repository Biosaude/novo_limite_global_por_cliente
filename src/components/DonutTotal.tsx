import { compactMoney, money } from "../domain/money";
export function DonutTotal({ value, label }: { value: number; label: string }) {
  return (
    <div className="donut-total" aria-label={`${label}: ${money(value)}`}>
      <span>{label}</span>
      <strong title={money(value)}>{compactMoney(value)}</strong>
    </div>
  );
}
