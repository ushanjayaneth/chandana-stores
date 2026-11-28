import type {ReceiptDimensions} from './receipt.js';

export const receiptStyles = `
.receipt-sheet {
  box-sizing: border-box;
  width: min(100%, var(--receipt-width));
  margin: 0 auto;
  padding: 6mm 5mm 3mm;
  background: #e7ede2;
  color: #263329;
  font: var(--receipt-font) / 1.38 "Inter Variable", Arial, "Noto Sans Sinhala", sans-serif;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  --receipt-rule: #a8b6a1;
  --receipt-muted: #53634f;
}
.receipt-sheet h2, .receipt-sheet p { margin: 0; }
.receipt-sheet .receipt-heading { text-align: center; padding-bottom: 1.6em; }
.receipt-sheet .receipt-heading h2 { font-size: var(--receipt-heading-size); font-weight: 650; line-height: 1.2; letter-spacing: var(--receipt-heading-spacing); }
.receipt-sheet .receipt-heading p { margin-top: .8em; font-size: .83em; line-height: 1.7; color: var(--receipt-muted); white-space: pre-line; }
.receipt-sheet .receipt-meta { border-block: 1px dashed var(--receipt-rule); padding: 1em 0; font-size: .76em; }
.receipt-sheet .receipt-meta-row, .receipt-sheet .receipt-identification { display: flex; justify-content: space-between; align-items: baseline; gap: .55em; }
.receipt-sheet .receipt-meta > div + div { margin-top: .46em; }
.receipt-sheet .receipt-meta > div > :first-child { flex-shrink: 0; max-width: 42%; }
.receipt-sheet .receipt-meta-row > :last-child { text-align: right; min-width: 0; }
.receipt-sheet .receipt-identification strong { min-width: 0; font-weight: 600; line-height: 1.2; }
.receipt-sheet .receipt-columns {
  display: flex; justify-content: space-between; gap: .6em; margin-top: 1.48em; margin-bottom: .45em;
  color: var(--receipt-muted); font-size: .76em; font-weight: 600;
}
.receipt-sheet .receipt-items { margin: 0; padding: .1em 0 1.1em; list-style: none; border-bottom: 1px dashed var(--receipt-rule); }
.receipt-sheet .receipt-item { padding: .5em 0; break-inside: avoid; }
.receipt-sheet .receipt-item-pricing { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, max-content); align-items: baseline; gap: .65em; font-size: .86em; }
.receipt-sheet .receipt-item-name { min-width: 0; }
.receipt-sheet .receipt-item-detail { display: block; font-size: .74em; line-height: 1.28; color: var(--receipt-muted); }
.receipt-sheet .receipt-amount { text-align: right; }
.receipt-sheet .receipt-line-amount { font-weight: 500; }
.receipt-sheet .receipt-summary { padding-top: 1em; break-inside: avoid; }
.receipt-sheet .receipt-summary table { width: 100%; border-collapse: collapse; font: inherit; font-size: .85em; }
.receipt-sheet .receipt-summary td { padding: .23em 0; vertical-align: top; }
.receipt-sheet .receipt-summary td:last-child { padding-left: .65em; }
.receipt-sheet .receipt-grand-total {
  display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: .15em .5em;
  padding-top: .72em; margin: .68em 0 .25em; border-top: 1px solid var(--receipt-rule);
  font-size: 1.26em; line-height: 1.22;
}
.receipt-sheet .receipt-grand-total strong { font-weight: 650; }
.receipt-sheet .receipt-grand-total .receipt-amount { margin-left: auto; min-width: 0; }
.receipt-sheet .receipt-demo { text-align: center; font-weight: 700; }
.receipt-sheet .receipt-footer {
  text-align: center; white-space: pre-line; border-top: 1px dashed var(--receipt-rule);
  margin-top: 1.65em; padding-top: 1.2em; color: var(--receipt-muted); font-size: .84em;
}
.receipt-sheet .receipt-copy { display: block; font-size: .75em; letter-spacing: .06em; margin-top: 1em; }
.receipt-print-only { display: none; }
@media screen {
  .receipt-preview { border-radius: 5px; box-shadow: 0 4px 20px #0002; }
}
`;

export function receiptLayoutCss({paper, margin, content, offset, font}: ReceiptDimensions) {
  return `
:root { --receipt-width: ${content}mm; --receipt-font: ${font}pt; --receipt-heading-size: ${content < 56 ? 1.28 : 1.48}em; --receipt-heading-spacing: ${content < 56 ? ".018em" : ".038em"}; }
@page { size: auto; margin: 0; }
@media print {
  html, body { width: ${paper}mm !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; color: #000 !important; }
  .app, .modal-backdrop, .toast-stack, .receipt-no-print { display: none !important; }
  .receipt-print-only { display: block; }
  .receipt-sheet {
    width: ${content}mm; margin-left: ${(paper - content) / 2 + offset}mm; margin-right: 0; padding: ${margin}mm 0;
    color: #111; background: #fff; --receipt-rule: #888; --receipt-muted: #333;
  }
}
`;
}
