import type {Branch, Order, Settings} from './types.js';

type Translate = (text: string) => string;
type ReceiptOptions = {
  locale?: 'en' | 'si';
  tr?: Translate;
  tableName?: string;
  orderDetail?: [string, string];
  itemDetails?: (line: Order['lines'][number]) => string[];
  demo?: boolean;
};
export type ReceiptDimensions = ReturnType<typeof getReceiptDimensions>;
export const receiptLineStyles = ['center', 'title', 'bold', 'total'] as const;
export type ReceiptLine = {text: string; style?: typeof receiptLineStyles[number]};

export function getReceiptDimensions(settings: Settings) {
  const paper = Math.min(120, Math.max(40, Number(settings.receiptPaperWidthMm) || 80));
  const margin = Math.min(15, Math.max(0, Number(settings.receiptMarginMm) || 0));
  const content = Math.min(paper - 2 * margin, Math.max(20, Number(settings.receiptContentWidthMm) || 72));
  const maxOffset = Math.max(0, (paper - content) / 2 - margin);
  const offset = Math.min(maxOffset, Math.max(-maxOffset, Number(settings.receiptOffsetMm) || 0));
  const font = Math.min(18, Math.max(6, Number(settings.receiptFontSize) || 10));
  return {paper, margin, content, offset, font};
}

const amountFormat = new Intl.NumberFormat('en-LK', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const receiptDate = new Intl.DateTimeFormat('en-LK', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo',
});
const formatAmount = (value: number) => amountFormat.format((value || 0) / 100);
const money = (value: number) => 'Rs. ' + formatAmount(value);
export const escapeReceiptText = (value: string) => value.replace(/[&<>"']/g, char =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[char]!);

function receiptData(order: Order, branch: Branch, settings: Settings, options: ReceiptOptions = {}) {
  const {locale = 'en', tr = text => text, itemDetails, tableName, orderDetail} = options;
  const itemDiscount = order.lines.reduce((sum, line) => sum + (line.discount ?? 0), 0);
  const cartDiscount = order.cartDiscount ?? Math.max(0, order.discount - itemDiscount);
  const saleType = order.type === 'takeaway' ? tr('Counter sale') : order.type === 'dine-in' ? tr('Dine in') : tr('Delivery');
  const priceMode = 'priceMode' in order && order.priceMode === 'wholesale' ? tr('Wholesale') : tr('Retail');
  const outstanding = Math.max(0, order.total - order.paid);
  const loan = order.payments.filter(payment => payment.method === 'credit').reduce((sum, payment) => sum + payment.amount, 0);
  const paymentLabel = {cash: 'Cash', card: 'Card', qr: 'QR', credit: 'Customer Loan'};
  const charges: [string, number][] = [[tr('Subtotal'), order.subtotal]];
  if (itemDiscount) charges.push([tr('Item discounts'), -itemDiscount]);
  if (cartDiscount) charges.push([tr(order.cartDiscount !== undefined || itemDiscount ? 'Cart discount' : 'Discount'), -cartDiscount]);
  if (order.serviceCharge) charges.push([tr('Service charge'), order.serviceCharge]);
  if (order.tax) charges.push([tr('Tax'), order.tax]);
  const payments = order.payments.filter(payment => payment.method !== 'credit');
  const paid = Math.max(0, order.paid - loan);
  const settlement: [string, number][] = [];
  if (payments.length !== 1 || payments[0].amount !== paid) settlement.push([tr('Paid'), paid]);
  for (const payment of payments) {
    settlement.push([tr(paymentLabel[payment.method]), payment.amount]);
    if (payment.change > 0) settlement.push([tr('Change'), payment.change]);
  }
  if (loan) settlement.push([tr('Customer Loan'), loan]);
  if (order.refunded > 0) settlement.push([tr('Refunded'), order.refunded]);
  if (outstanding) settlement.push([tr('Balance due'), outstanding]);

  return {
    businessName: settings.businessName || branch.name || tr('Receipt'),
    contact: [branch.name !== settings.businessName ? branch.name : '', branch.address, branch.phone].filter(Boolean),
    date: receiptDate.format(new Date(order.createdAt)),
    sale: [order.type !== 'dine-in' && 'priceMode' in order ? priceMode : '', saleType, tableName].filter(Boolean).join(' / '),
    orderDetail,
    number: order.number,
    lines: order.lines.map(line => ({
      name: locale === 'si' && line.nameSi ? line.nameSi : line.name,
      quantity: line.quantity + ('saleUnit' in line && typeof line.saleUnit === 'string' ? ' ' + tr(line.saleUnit) : ''),
      unitPrice: line.unitPrice,
      discount: line.discount ?? 0,
      total: line.lineTotal,
      details: itemDetails?.(line) ?? [],
    })),
    charges,
    settlement,
    footer: settings.receiptFooter || tr('Thank you for shopping with us.'),
  };
}

const signedMoney = (value: number) => (value < 0 ? '− ' : '') + money(Math.abs(value));

export function receiptMarkup(order: Order, branch: Branch, settings: Settings, options: ReceiptOptions = {}) {
  const {tr = text => text, demo} = options;
  const data = receiptData(order, branch, settings, options);
  const esc = escapeReceiptText;
  const rows = (lines: [string, number][]) => lines.map(([label, amount]) =>
    '<tr><td>' + esc(label) + '</td><td class="receipt-amount">' + signedMoney(amount) + '</td></tr>').join('');
  const lines = data.lines.map(line =>
    '<li class="receipt-item"><div class="receipt-item-pricing"><span class="receipt-item-name">' + esc(line.name) + '</span>' +
    '<strong class="receipt-line-amount receipt-amount">' + money(line.total) + '</strong></div>' +
    '<div class="receipt-unit">' + esc(line.quantity) + ' × ' + money(line.unitPrice) + '</div>' +
    (line.discount ? '<small class="receipt-item-detail">' + esc(tr('Item discount −')) + ' ' + money(line.discount) + '</small>' : '') +
    line.details.map(detail => '<small class="receipt-item-detail">' + esc(detail) + '</small>').join('') + '</li>').join('');
  return '<header class="receipt-heading"><h2>' + esc(data.businessName) + '</h2>' +
    (data.contact.length ? '<p>' + data.contact.map(esc).join('<br>') + '</p>' : '') + '</header>' +
    '<div class="receipt-meta"><div class="receipt-identification"><span>' + esc(tr('Receipt')) + '</span><strong>' + esc(data.number) + '</strong></div>' +
    '<div class="receipt-meta-row"><span>' + esc(tr('Date')) + '</span><span>' + esc(data.date) + '</span></div>' +
    '<div class="receipt-meta-row"><span>' + esc(tr('Service')) + '</span><span>' + esc(data.sale) + '</span></div>' +
    (data.orderDetail ? '<div class="receipt-meta-row"><span>' + esc(data.orderDetail[0]) + '</span><span>' + esc(data.orderDetail[1]) + '</span></div>' : '') + '</div>' +
    (demo ? '<p class="receipt-demo">DEMO — SAMPLE DATA</p>' : '') +
    '<div class="receipt-columns"><span>' + esc(tr('Item')) + '</span><span>' + esc(tr('Amount')) + '</span></div>' +
    '<ul class="receipt-items">' + lines + '</ul>' +
    '<section class="receipt-summary"><table><tbody>' + rows(data.charges) + '</tbody></table>' +
    '<div class="receipt-grand-total"><strong>' + esc(tr('Total')) + '</strong><strong class="receipt-amount">' + money(order.total) + '</strong></div>' +
    '<table class="receipt-settlement"><tbody>' + rows(data.settlement) + '</tbody></table></section>' +
    '<footer class="receipt-footer">' + esc(data.footer) + '</footer>';
}

export function receiptPrintLines(order: Order, branch: Branch, settings: Settings, dimensions: ReceiptDimensions, options: ReceiptOptions = {}): ReceiptLine[] | null {
  const data = receiptData(order, branch, settings, options);
  const rawText = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/·/g, '-');
  const width = Math.max(13, Math.min(dimensions.paper <= 60 ? 32 : 48, Math.floor(dimensions.content / 1.5)));
  const divider = '-'.repeat(width);
  const pair = (label: string, amount: number) => {
    const value = (amount < 0 ? '-' : '') + money(Math.abs(amount));
    return label.length + value.length < width
      ? label + ' '.repeat(width - label.length - value.length) + value
      : label + '\n' + value.padStart(width);
  };
  const lines: ReceiptLine[] = [
    {text: data.businessName, style: 'center'},
    ...data.contact.map(text => ({text, style: 'center' as const})),
    {text: divider},
    {text: 'RECEIPT\n' + data.number, style: 'center'},
    {text: data.date + '\n' + data.sale, style: 'center'},
    ...(data.orderDetail ? [{text: data.orderDetail.join(' ')}] : []),
    {text: divider},
    ...data.lines.flatMap<ReceiptLine>(line => [
      {text: line.name},
      {text: pair(line.quantity + ' x ' + formatAmount(line.unitPrice), line.total), style: 'bold'},
      ...(line.discount ? [{text: pair('Item discount', -line.discount)}] : []),
      ...line.details.map(text => ({text})),
    ]),
    {text: divider},
    ...data.charges.map(([label, amount]) => ({text: pair(label, amount)})),
    {text: divider},
    {text: pair('TOTAL', order.total), style: 'total'},
    {text: divider},
    ...data.settlement.map(([label, amount]) => ({text: pair(label, amount)})),
    {text: divider},
    {text: data.footer, style: 'center'},
  ];
  const printable = lines.map(line => ({...line, text: rawText(line.text)}));
  // Use the browser for scripts that the printer's ASCII text mode cannot render.
  return printable.some(line => /[^\x20-\x7e\r\n]/.test(line.text)) ? null : printable;
}
