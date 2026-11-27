import {useTranslation} from "../lib/language";
import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarDays, Download, Leaf, TrendingUp } from 'lucide-react';
import type { Snapshot } from '../../shared/types';
import { businessDate, profitability, profitCsv, type LoanSummary } from '../../shared/costing';
import { money, number } from '../lib/format';
import '../styles/profit.css';

export function LoanReceivables({summary, asOf}: {summary: LoanSummary | null; asOf: string}) {
  const tr = useTranslation();
  if (!summary) return <section className="loan-receivables loan-unavailable" aria-label={tr("Customer loans to collect")}><h3>{tr("Customer loans to collect")}</h3><p>Loan balances are unavailable because the customer ledger was not included in this view.</p></section>;
  return <section className={`loan-receivables ${summary.outstanding > 0 ? 'loan-outstanding' : 'loan-settled'}`} aria-label={tr("Customer loans to collect")}>
    <div className="loan-receivables-heading"><div><span className="eyebrow">{tr("MONEY STILL TO RECEIVE")}</span><h3>{tr("Customer loans to collect")}</h3><p>{tr("Outstanding as of")} {asOf} {tr("· includes loans from before this report period")}</p></div><strong aria-label={tr("Outstanding customer loans")}>{money(summary.outstanding)}</strong></div>
    <div className="loan-period-metrics"><div><span>{tr("New Customer Loans in period")}</span><strong>{money(summary.creditSales)}</strong></div><div className="loan-repayments"><span>{tr("Repayments received in period")}</span><strong>{money(summary.collections)}</strong></div><div><span>{tr("Credit refunds reducing loans")}</span><strong>{money(summary.creditRefunds)}</strong></div></div>
    {summary.customers.length > 0 ? <div className="loan-customer-scroll"><table className="profit-table"><thead><tr><th>{tr("Customer")}</th><th>{tr("Phone")}</th><th>{tr("Amount to collect")}</th><th>{tr("Customer advance")}</th></tr></thead><tbody>{summary.customers.map(customer => <tr key={customer.customerId}><td><strong>{customer.name}</strong></td><td>{customer.phone || '—'}</td><td className={customer.balance > 0 ? 'profit-negative' : undefined}>{money(Math.max(0, customer.balance))}</td><td className={customer.balance < 0 ? 'profit-positive' : undefined}>{money(Math.max(0, -customer.balance))}</td></tr>)}</tbody></table></div> : <p className="loan-clear">{tr("No customer loans or advances are outstanding as of this date.")}</p>}
    {summary.advances > 0 && <p className="loan-advance-note">{tr("Customer advances:")} {money(summary.advances)}{tr(". These do not reduce amounts owed by other customers.")}</p>}
    <p className="loan-explanation">{tr("Loan balances show money still to receive. Repayments reduce the loan balance; they are not another sale or additional profit. Credit refunds reduce debt without receiving money. Loan amounts include any bill tax and service charges.")}</p>
  </section>;
}

export default function ProfitSummary({ data, from, to }: { data: Snapshot; from?: string; to?: string }) {
  const tr = useTranslation();
  const today = businessDate(new Date().toISOString());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  if (!['owner', 'manager', 'accountant'].includes(data.user.role)) return null;
  const selectedFrom = from ?? start;
  const selectedTo = to ?? end;
  const invalidRange = selectedFrom > selectedTo;
  const report = profitability(data, selectedFrom, selectedTo);
  const profitable = report.operatingProfit >= 0;
  function download() {
    const url = URL.createObjectURL(new Blob([profitCsv(report)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `profit-${data.branch.code}-${selectedFrom}-${selectedTo}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="profit-summary panel" aria-label={tr("Daily profitability")}>
    <div className="profit-heading">
      <div className="profit-title"><span className="profit-icon"><TrendingUp size={20} /></span><div><span className="eyebrow">{tr("KNOW YOUR MARGIN")}</span><h2>{tr("Daily profitability")}</h2><p>{tr("Bill profit and money still owed, shown separately.")}</p></div></div>
      <div className="profit-controls">
        {!from && <label><CalendarDays size={14} /><span className="sr-only">{tr("Profit from date")}</span><input aria-label={tr("Profit from date")} type="date" value={start} max={end} onChange={event => setStart(event.target.value || today)} /></label>}
        {!to && <label><span className="sr-only">{tr("Profit to date")}</span><input aria-label={tr("Profit to date")} type="date" value={end} min={selectedFrom} onChange={event => setEnd(event.target.value || today)} /></label>}
        <button className="button secondary" disabled={invalidRange} onClick={download}><Download size={15} /> {tr("Profit CSV")}</button>
      </div>
    </div>
    {invalidRange ? <p className="profit-notice">{tr("Choose an end date on or after the start date.")}</p> : <>
      <p className="profit-bill-basis"><strong>{tr("Bill basis · includes unpaid bills and Customer Loans")}</strong><span>{tr("Profit below is based on confirmed sales. It does not mean all of the money has been received.")}</span></p>
      <LoanReceivables summary={report.loanSummary} asOf={selectedTo} />
      <div className="profit-metrics">
        <div><span>{tr("Net product sales")}</span><strong>{money(report.netSales)}</strong><small>{number(report.bills)} {tr("confirmed bills · after discounts / refunds")}</small></div>
        <div><span>{tr("Cost of sales")}</span><strong>{money(report.costOfSales)}</strong><small>{tr("Purchase costs captured when goods were sold")}</small></div>
        <div className={report.grossProfit >= 0 ? 'profit-positive' : 'profit-negative'}><span>{tr("Gross profit · bill basis")}</span><strong>{money(report.grossProfit)}</strong><small>{report.margin.toFixed(1)}{tr("% gross margin · includes unpaid / loan sales · before overheads")}</small></div>
      </div>
      <div className="profit-result">
        <div className={`profit-result-main ${profitable ? 'profit-positive' : 'profit-negative'}`}>
          {profitable ? <ArrowUpRight size={27} /> : <ArrowDownRight size={27} />}
          <div><span>Operating profit estimate · bill basis</span><strong>{money(report.operatingProfit)}</strong></div>
        </div>
        <div className="profit-deductions"><span>{tr("Gross profit")} <b>{money(report.grossProfit)}</b></span><span>{tr("Cancelled stock cost")} <b>− {money(report.cancelledCost)}</b></span><span>{tr("Recorded wastage")} <b>? {money(report.wastageCost)}</b></span><span>{tr("Recorded operating expenses")} <b>− {money(report.operatingExpenses)}</b></span></div>
      </div>
      {(report.estimatedLines > 0 || report.missingCostLines > 0) && <p className="profit-notice"><Leaf size={16} /><span>{report.estimatedLines > 0 ? tr("{0} bill lines use estimated costs. Older bills without a saved cost use current product costs.", number(report.estimatedLines)) : ''}{report.missingCostLines > 0 ? tr("{0} lines have incomplete cost setup. Complete recipes and linked stock for future sales.", number(report.missingCostLines)) : tr("New bills retain the cost captured when they are confirmed.")}</span></p>}
      <div className="profit-table-heading"><h3>{tr("Profit by product")}</h3><span>{selectedFrom === selectedTo ? selectedFrom : `${selectedFrom} — ${selectedTo}`} {tr("· Asia/Colombo")}</span></div>
      <div className="profit-table-scroll"><table className="profit-table"><thead><tr><th>{tr("Product")}</th><th>{tr("Units")}</th><th>{tr("Net sales")}</th><th>{tr("Cost")}</th><th>{tr("Gross profit")}</th><th>{tr("Margin")}</th></tr></thead><tbody>
        {report.products.map(product => <tr key={product.id}><td><strong>{product.name}</strong>{product.estimated && <small>{tr("Includes estimated costs")}</small>}{product.wasteCost > 0 && <small>{tr("Cancelled stock cost:")} {money(product.wasteCost)}</small>}</td><td>{number(product.quantity)}</td><td>{money(product.netSales)}</td><td>{money(product.cost)}</td><td className={product.grossProfit >= 0 ? 'profit-positive' : 'profit-negative'}>{money(product.grossProfit)}</td><td>{product.netSales > 0 ? `${(product.grossProfit / product.netSales * 100).toFixed(1)}%` : '—'}</td></tr>)}
        {report.products.length === 0 && <tr><td colSpan={6} className="profit-empty">{tr("No confirmed bills in this period. Product costs will appear after your first sale.")}</td></tr>}
      </tbody></table></div>
      <p className="profit-basis">{tr("Confirmed-bill basis, including unpaid bills and customer credit; collections are not counted again. Tax and service charges are excluded. Refunds adjust the original bill date and do not restore consumed food cost. Stock purchases are counted through cost of sales, not deducted twice. The operating estimate includes recorded expenses, wastage and cancelled food; unrecorded overheads and other stock write-offs are excluded.")}</p>
      {report.excludedInventoryExpenses > 0 && <p className="profit-basis">Inventory purchase expense entries excluded: {money(report.excludedInventoryExpenses)}.</p>}
    </>}
  </section>;
}
