# Chandana Stores POS

An English-language retail and wholesale POS for Chandana Stores.

## Shared shop

Enable `VITE_ENABLE_CLOUD=true` in the build environment and configure `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `CLOUD_POS_PIN_HASH`, `CLOUD_SESSION_SECRET` and `CLOUD_TENANT_ID=chandana-stores` on the server. Keep the service-account JSON and private environment files out of Git. The included Firebase rules deny direct public reads and writes.

On each new device, open the installed app online, sign in with the Shop PIN and wait for **Offline ready** before disconnecting. The app can then reopen using its local shop data and sync pending changes when the connection returns.

## Run locally

For a local server with the private Firebase settings, use `npm run build` followed by `npm start`. Set `HOST=127.0.0.1` and `PORT=4179` in the local `.env` to use http://127.0.0.1:4179/.

Use Node.js 24.14 or newer.

Double-click **START-RETAIL-POS.cmd** to open the built application on **http://localhost:4175/**. The script installs dependencies/builds on the first run if needed. Keep its terminal window open while using the site. Alternatively, after building, use `npm run preview`.

For development with automatic source-code reloads:

```powershell
npm ci
npm run dev:web
```

Open http://localhost:5173 for development, or http://localhost:4175 for the built preview. Choose **Create your store**, enter a private owner PIN with 6-12 digits, and select **Include sample grocery products and stock** for evaluation. A device workspace uses the PIN you choose, including when samples are selected. Leave samples unchecked for real trading. The optional branch-hub demonstration account uses PIN **1234**.

Optional local branch server: run `npm run dev` instead. It starts the same website and an isolated SQLite hub; the normal browser workspace does not need that hub.

## Included

- Counter sales, barcode search/scanners, weighted goods and touch quantity entry.
- Retail / Wholesale toggle with a separate trade price per product; held bills and receipts preserve the price mode.
- Cash, card, QR/bank payment records; item and bill discounts; held bills and history.
- Customer Loan sales, an immediate part payment, remaining dues and later installments.
- Categories, SKU/barcodes, product photos, purchase/selling prices and low-stock alerts.
- Stock counts/adjustments, wastage, suppliers, goods receipts and supplier payments.
- Daily expenses, cash shifts, sales/profit reports and CSV downloads.
- Staff attendance, employee loans, salary advances, installment recovery, payroll and printable payslips.
- Configurable receipt paper widths, browser printing and optional hardware integration.
- Device backups, restore, installable PWA and in-app update prompts.
- Optional server-side Firebase shared-shop access and offline transaction replay.

See [Quick start](docs/QUICK-START.md), [Feature guide](docs/FEATURES.md), [Firebase setup later](docs/FIREBASE-SETUP.md) and [Reusing this template](docs/TEMPLATE-GUIDE.md).

## Build and verify

```powershell
npm run build
npm test
```

This repository includes transaction-engine regression tests inherited from the original platform as well as retail-specific tests. Browser tests need a completed build before their test server starts; do not rebuild while that server is running.

## Data and connection status

Local-only records stay on this device until exported or connected to a cloud service. An internet connection by itself does not mean data is backed up. With Firebase still blank, cloud synchronization is unavailable by design. Do not clear site data without a verified export or a completed cloud sync. Installing the PWA does not exempt its storage from manual browser-data deletion.

This template has no deployed website, production credentials or connection to the hotel project. Its local databases use a separate retail namespace.
