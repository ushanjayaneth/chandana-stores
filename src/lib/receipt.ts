import type {Order, Settings} from '../../shared/types';
import {getReceiptDimensions, receiptMarkup} from '../../shared/receipt';
import {receiptLayoutCss, receiptStyles} from '../../shared/receipt-styles';
import {getDevicePreferences} from './preferences';

export function receiptDimensions(settings: Settings) {
  return getReceiptDimensions({...settings, ...getDevicePreferences().receipt});
}

export function printTestReceipt(settings: Settings): void {
  const popup = window.open('', '_blank', 'width=480,height=650');
  if (!popup) throw new Error('Allow the print window to open, then try the test again.');
  popup.opener = null;
  const now = new Date().toISOString();
  const sample: Order = {
    id: 'alignment-test', number: 'ALIGNMENT TEST', branchId: 'test', type: 'takeaway',
    tableId: null, customerId: null, status: 'completed', paymentStatus: 'paid',
    subtotal: 120000, discount: 0, total: 120000, paid: 120000, tax: 0, serviceCharge: 0, refunded: 0,
    note: '', createdAt: now, updatedAt: now, createdBy: '', version: 1, payments: [],
    lines: [{id: 'sample', menuItemId: 'sample', name: 'Sample product', nameSi: '', quantity: 2, unitPrice: 60000, lineTotal: 120000, note: ''}],
  };
  const {paper, content, offset, font} = receiptDimensions(settings);
  const footer = `Print width ${content} mm / paper ${paper} mm\nOffset ${offset} mm / text ${font} pt`;
  const branch = {id: 'test', code: 'TEST', name: '', nameSi: '', address: '', phone: ''};
  popup.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Printer alignment test</title><style>
body{margin:0;padding:12px;background:#eceeea}.receipt-no-print{display:block;padding:10px;margin:12px auto}
${receiptStyles}${receiptLayoutCss(receiptDimensions(settings))}
</style></head><body><div class="receipt-sheet receipt-preview">${receiptMarkup(sample, branch, {...settings, receiptFooter: footer}, {demo: true})}</div><button type="button" class="receipt-no-print" onclick="window.print()">Print test</button></body></html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 250);
}
