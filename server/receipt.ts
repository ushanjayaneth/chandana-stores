import type {Branch, Order, Settings} from '../shared/types';
import {escapeReceiptText, getReceiptDimensions, receiptMarkup} from '../shared/receipt';
import {receiptLayoutCss, receiptStyles} from '../shared/receipt-styles';

export function renderReceipt(order: Order, branch: Branch, settings: Settings, options: {tableName?: string; demo?: boolean} = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeReceiptText(order.number)} · Receipt</title>
<style>
  body { box-sizing: border-box; margin: 0; padding: 12px; color: #171717; background: #eceeea; }
  .receipt-no-print { display: block; width: min(100%, var(--receipt-width)); margin: 12px auto; padding: 10px; }
  ${receiptStyles}${receiptLayoutCss(getReceiptDimensions(settings))}
</style></head><body><main class="receipt-sheet receipt-preview">${receiptMarkup(order, branch, settings, options)}</main>
<button type="button" class="receipt-no-print" onclick="window.print()">Print receipt</button></body></html>`;
}
