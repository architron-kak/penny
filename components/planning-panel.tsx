"use client";
import { useState } from "react";
import type { ChatContext, PlanningCommand, PlanningView } from "@/lib/planning-types";
import type { Transaction } from "@/lib/types";
import { money } from "@/lib/money";
export default function PlanningPanel({
  view,
  context,
  transactions,
  busy,
  onPreview,
  onQuestion,
}: {
  view: PlanningView;
  context: ChatContext;
  transactions: Transaction[];
  busy: boolean;
  onPreview: (command: PlanningCommand) => void;
  onQuestion: (text: string, context?: ChatContext) => void;
}) {
  const [person, setPerson] = useState(context.debtDraft?.person || ""),
    [direction, setDirection] = useState<"payable" | "receivable">(
      context.debtDraft?.direction || "payable",
    ),
    [amount, setAmount] = useState(context.debtDraft ? String(context.debtDraft.amount) : ""),
    [date, setDate] = useState(view.profile.nextIncome?.date || view.profile.asOf),
    [debtId, setDebtId] = useState(
      view.debts.find((d) => d.id === context.entityId)?.id || view.debts[0]?.id || "",
    ),
    [purchaseId, setPurchaseId] = useState(
      transactions.find((t) => t.id === context.entityId)?.id ||
        transactions.find((t) => t.amount > 0)?.id ||
        "",
    );
  const [balance, setBalance] = useState(
      String(context.options?.balance ?? view.profile.balance ?? ""),
    ),
    [reserve, setReserve] = useState(
      String(context.options?.reserve ?? view.profile.reserve ?? ""),
    ),
    [incomeDate, setIncomeDate] = useState(
      context.options?.incomeDate || view.profile.nextIncome?.date || "",
    ),
    [incomeAmount, setIncomeAmount] = useState(
      String(context.options?.incomeAmount ?? view.profile.nextIncome?.amount ?? ""),
    ),
    [lunch, setLunch] = useState(String(view.purchase.lunchPrice)),
    [schedule, setSchedule] = useState<"daily" | "weekdays">(
      context.options?.schedule || view.profile.lunchSchedule,
    ),
    [delay, setDelay] = useState(String(view.delay.days));
  const [scheduleRows, setScheduleRows] = useState([
    { date, amount: context.debtDraft ? String(context.debtDraft.firstAmount) : "" },
    ...(context.debtDraft && context.debtDraft.amount > context.debtDraft.firstAmount
      ? [{ date, amount: String(context.debtDraft.amount - context.debtDraft.firstAmount) }]
      : []),
  ]);
  const preview = (command: PlanningCommand) => onPreview(command);
  const [goalName, setGoalName] = useState(view.profile.savingsGoal?.name || "");
  const [goalTarget, setGoalTarget] = useState(String(view.profile.savingsGoal?.target || ""));
  const [goalSaved, setGoalSaved] = useState(String(view.profile.savingsGoal?.saved || 0));
  if (context.topic === "savings")
    return (
      <div className="planning-tools">
        <h4>Your savings jar</h4>
        <p>
          Track money already set aside. Exclude it from your available balance. No transfer is
          made.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            preview({
              type: "savings-save",
              name: goalName,
              target: Number(goalTarget),
              saved: Number(goalSaved),
            });
          }}
        >
          <label>
            Saving for
            <input
              required
              maxLength={60}
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="Headphones, a trip, an emergency fund…"
            />
          </label>
          <label>
            Target · USD
            <input
              required
              type="number"
              min="0.01"
              max="100000"
              step="0.01"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
            />
          </label>
          <label>
            Already set aside · USD
            <input
              required
              type="number"
              min="0"
              max={goalTarget || "100000"}
              step="0.01"
              value={goalSaved}
              onChange={(e) => setGoalSaved(e.target.value)}
            />
          </label>
          <button className="outline-button" disabled={busy}>
            Preview savings goal
          </button>
        </form>
      </div>
    );
  if (context.topic === "purchase")
    return (
      <div className="planning-tools">
        <h4>Try your assumptions</h4>
        <p>UTC snapshot: {view.profile.asOf}. Preview first, then confirm to save.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onQuestion("Recalculate headphones", {
              topic: "purchase",
              options: {
                balance: Number(balance),
                reserve: Number(reserve),
                incomeDate,
                incomeAmount: Number(incomeAmount),
                lunchPrice: Number(lunch),
                schedule,
              },
            });
          }}
        >
          <label>
            Available balance · USD
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </label>
          <label>
            Next income
            <input
              required
              type="date"
              value={incomeDate}
              onChange={(e) => setIncomeDate(e.target.value)}
            />
          </label>
          <label>
            Income amount · USD
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={incomeAmount}
              onChange={(e) => setIncomeAmount(e.target.value)}
            />
          </label>
          <label>
            Reserve · USD
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={reserve}
              onChange={(e) => setReserve(e.target.value)}
            />
          </label>
          <label>
            Usual lunch · USD
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={lunch}
              onChange={(e) => setLunch(e.target.value)}
            />
          </label>
          <label>
            Lunch schedule
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as typeof schedule)}
            >
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays only</option>
            </select>
          </label>
          <button className="outline-button" disabled={busy}>
            Recalculate in chat
          </button>
        </form>
        <h4>Demo headphone catalog</h4>
        {view.purchase.candidates.length ? (
          view.purchase.candidates.map((h) => (
            <div className="catalog-item" key={h.id}>
              <strong>
                {h.name} · {money(h.price)}
              </strong>
              <p>{h.features}</p>
              <p>
                Balance after purchase {money(h.remaining)} · budget left{" "}
                {money(view.purchase.limit - h.price)}
              </p>
            </div>
          ))
        ) : (
          <p>No matching demo headphones.</p>
        )}
      </div>
    );
  if (context.topic === "delay")
    return (
      <div className="planning-tools">
        <h4>Try a different payment date</h4>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onQuestion(`Delay by ${delay} days`, { topic: "delay" });
          }}
        >
          <label>
            Days later
            <input
              type="number"
              min="0"
              max="60"
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
            />
          </label>
          <button className="outline-button" disabled={busy}>
            Compare scenario
          </button>
        </form>
        <p>Original income: {view.profile.nextIncome?.date}. Trying dates never moves it.</p>
        <div className="cash-comparison">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Original</th>
                <th>Delayed</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {view.delay.delayed.days.map((d, i) => (
                <tr key={d.date}>
                  <td>{d.date.slice(5)}</td>
                  <td>{money(view.delay.baseline.days[i]?.balance || 0)}</td>
                  <td className={d.balance < 0 ? "cash-negative" : ""}>{money(d.balance)}</td>
                  <td>{d.payments.map((p) => p.title).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  if (context.topic === "refunds")
    return (
      <div className="planning-tools">
        <h4>Track an expected refund</h4>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            preview({
              type: "refund-create",
              transactionId: purchaseId,
              amount: Number(amount),
              dueDate: date,
            });
          }}
        >
          <label>
            Original purchase
            <select value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}>
              {transactions
                .filter((t) => t.amount > 0)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.date} · {t.merchant} · {money(t.amount)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Expected amount · USD
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Promised by
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className="outline-button" disabled={busy}>
            Preview refund record
          </button>
        </form>
        {view.refunds.map((r) => (
          <button
            key={r.id}
            className="planning-list-button"
            onClick={() => onQuestion("Show refund", { topic: "refunds", entityId: r.id })}
          >
            {r.purchase?.merchant} · {money(r.amount)} ·{" "}
            {r.receivedAt ? "received" : r.overdue ? "overdue" : "expected"}
          </button>
        ))}
      </div>
    );
  if (context.topic === "debts")
    return (
      <div className="planning-tools">
        <h4>Your debts and repayments</h4>
        {view.debts.map((d) => (
          <button
            className="planning-list-button"
            key={d.id}
            onClick={() => {
              setDebtId(d.id);
              onQuestion("Show debt plan", { topic: "debts", entityId: d.id });
            }}
          >
            {d.direction === "payable" ? `You owe ${d.person}` : `${d.person} owes you`} ·{" "}
            {money(d.remaining)}
          </button>
        ))}
        <details open={!view.debts.length}>
          <summary>Add a debt</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              preview({
                type: "debt-create",
                person,
                direction,
                amount: Number(amount),
                installments: scheduleRows.map((r) => ({ date: r.date, amount: Number(r.amount) })),
              });
            }}
          >
            <label>
              Person
              <input
                required
                maxLength={60}
                value={person}
                onChange={(e) => setPerson(e.target.value)}
              />
            </label>
            <label>
              Direction
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as typeof direction)}
              >
                <option value="payable">I owe them</option>
                <option value="receivable">They owe me</option>
              </select>
            </label>
            <label>
              Total · USD
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {scheduleRows.map((r, i) => (
              <div className="installment-row" key={i}>
                <label>
                  Due date
                  <input
                    required
                    type="date"
                    value={r.date}
                    onChange={(e) =>
                      setScheduleRows((rows) =>
                        rows.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <label>
                  Installment · USD
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={r.amount}
                    onChange={(e) =>
                      setScheduleRows((rows) =>
                        rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove installment ${i + 1}`}
                  disabled={scheduleRows.length === 1}
                  onClick={() => setScheduleRows((rows) => rows.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              disabled={scheduleRows.length >= 12}
              onClick={() => setScheduleRows((rows) => [...rows, { date, amount: "" }])}
            >
              + Add installment
            </button>
            <button className="outline-button" disabled={busy}>
              Preview new debt
            </button>
          </form>
        </details>
        {view.debts.some((d) => d.remaining > 0) && (
          <>
            <details>
              <summary>Record money already paid / received</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  preview({ type: "debt-payment", debtId, amount: Number(amount), date });
                }}
              >
                <label>
                  Debt
                  <select value={debtId} onChange={(e) => setDebtId(e.target.value)}>
                    {view.debts
                      .filter((d) => d.remaining > 0)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.person} · {d.direction} · {money(d.remaining)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Amount · USD
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label>
                  Actually paid on
                  <input
                    type="date"
                    required
                    max={view.profile.asOf}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <button className="outline-button" disabled={busy}>
                  Preview cash record
                </button>
              </form>
            </details>
            <details>
              <summary>Try a different repayment schedule</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  preview({
                    type: "debt-schedule",
                    debtId,
                    installments: scheduleRows.map((r) => ({
                      date: r.date,
                      amount: Number(r.amount),
                    })),
                  });
                }}
              >
                <label>
                  Debt
                  <select value={debtId} onChange={(e) => setDebtId(e.target.value)}>
                    {view.debts
                      .filter((d) => d.remaining > 0 && d.direction === "payable")
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.person} · {money(d.remaining)}
                        </option>
                      ))}
                  </select>
                </label>
                {scheduleRows.map((r, i) => (
                  <div className="installment-row" key={i}>
                    <label>
                      Due
                      <input
                        required
                        type="date"
                        value={r.date}
                        onChange={(e) =>
                          setScheduleRows((rows) =>
                            rows.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                    <label>
                      Amount
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={r.amount}
                        onChange={(e) =>
                          setScheduleRows((rows) =>
                            rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setScheduleRows((rows) => [...rows, { date, amount: "" }])}
                >
                  + Add installment
                </button>
                <button className="outline-button" disabled={busy}>
                  Preview schedule
                </button>
              </form>
            </details>
          </>
        )}
        <p>Local cash records are separate from PayPal transfers to the Sandbox merchant.</p>
      </div>
    );
  return null;
}
