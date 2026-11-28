import type {ReceiptDimensions} from './receipt.js';

export const receiptStyles = String.raw`
.receipt-sheet {
  box-sizing: border-box;
  width: min(100%, var(--receipt-width));
  margin: 0 auto;
  padding: 4mm 3mm;
  background: #fff;
  color: #171717;
  font: var(--receipt-font) / 1.35 Arial, "Noto Sans Sinhala", sans-serif;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.receipt-sheet h2, .receipt-sheet p { margin: 0; }
.receipt-sheet .receipt-heading { text-align: center; padding-bottom: .8em; }
.receipt-sheet .receipt-heading h2 { font-size: 1.4em; font-weight: 600; line-height: 1.2; }
.receipt-sheet .receipt-heading p { margin-top: .55em; font-size: .86em; white-space: pre-line; }
.receipt-sheet .receipt-meta { border-block: 1px dashed #555; padding: .55em 0; margin-bottom: .72em; font-size: .83em; }
.receipt-sheet .receipt-meta-row, .receipt-sheet .receipt-columns {
  display: flex; justify-content: space-between; align-items: baseline; gap: .5em;
}
.receipt-sheet .receipt-meta-row + .receipt-meta-row { margin-top: .3em; }
.receipt-sheet .receipt-meta-row > :last-child { min-width: 0; text-align: right; }
.receipt-sheet .receipt-meta-row > :first-child { flex-shrink: 0; max-width: 45%; }
.receipt-sheet .receipt-identification { display: grid; gap: .14em; text-align: center; margin-bottom: .65em; }
.receipt-sheet .receipt-identification strong { font-weight: 600; }
.receipt-sheet .receipt-columns { padding: 0 0 .38em; border-bottom: 1px solid #555; font-size: .82em; font-weight: 600; }
.receipt-sheet .receipt-items { margin: 0; padding: 0; list-style: none; }
.receipt-sheet .receipt-item { padding: .52em 0; border-bottom: 1px dotted #aaa; break-inside: avoid; }
.receipt-sheet .receipt-item-name { display: block; min-width: 0; font-weight: 500; }
.receipt-sheet .receipt-item-pricing {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, max-content);
  align-items: baseline; gap: .5em; margin-top: .12em;
}
.receipt-sheet .receipt-unit { font-size: .83em; min-width: 0; }
.receipt-sheet .receipt-item-detail { display: block; font-size: .83em; }
.receipt-sheet .receipt-amount { text-align: right; }
.receipt-sheet .receipt-line-amount { font-size: 1.1em; font-weight: 700; }
.receipt-sheet .receipt-summary { padding-top: .55em; break-inside: avoid; }
.receipt-sheet .receipt-summary table { width: 100%; border-collapse: collapse; font: inherit; font-size: .85em; }
.receipt-sheet .receipt-summary td { padding: .16em 0; vertical-align: top; }
.receipt-sheet .receipt-summary td:last-child { padding-left: .65em; }
.receipt-sheet .receipt-grand-total {
  display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: .15em .5em;
  padding: .43em .48em; margin: .55em 0; border: 1px solid #333;
  font-size: 1.25em; line-height: 1.22;
}
.receipt-sheet .receipt-grand-total strong { font-weight: 700; }
.receipt-sheet .receipt-grand-total .receipt-amount { margin-left: auto; min-width: 0; }
.receipt-sheet .receipt-demo { text-align: center; font-weight: 700; }
.receipt-sheet .receipt-footer { text-align: center; white-space: pre-line; border-top: 1px dashed #555; margin-top: .75em; padding-top: .65em; font-size: .85em; }
.receipt-print-only { display: none; }
@media screen {
  .receipt-preview { border-radius: 8px; box-shadow: 0 4px 20px #0002; }
}
`;

export function receiptLayoutCss({paper, margin, content, offset, font}: ReceiptDimensions) {
  return `
:root { --receipt-width: ${content}mm; --receipt-font: ${font}pt; }
@page { size: auto; margin: 0; }
@media print {
  html, body { width: ${paper}mm !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; color: #000 !important; }
  .app, .modal-backdrop, .toast-stack, .receipt-no-print { display: none !important; }
  .receipt-print-only { display: block; }
  .receipt-sheet { width: ${content}mm; margin-left: ${(paper - content) / 2 + offset}mm; margin-right: 0; padding: ${margin}mm 0; }
}
`;
}
