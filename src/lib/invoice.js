import { formatDate, formatTime } from './utils'

const PAYMENT_METHOD_LABELS = {
  cash:     'מזומן',
  credit:   'כרטיס אשראי',
  bit:      'ביט',
  paybox:   'Paybox',
  transfer: 'העברה בנקאית',
  check:    "צ'ק",
}

/**
 * Returns the raw HTML string for a legally compliant Hebrew invoice.
 * Compliant with Israeli Tax Authority (רשות המיסים) requirements.
 */
export function generateInvoiceHTML({
  appointment,
  business,
  footerText,
  vatRate = 18,
  businessType = 'osek_morsheh',
  invoiceNumber,
  businessTaxId,
  paymentMethod,
  invoiceDate,
  logoUrl,
  taxSoftwareRegNumber,
  isCreditNote = false,
  isCopy = false,
  items,
}) {
  const invoiceNum     = invoiceNumber || `INV-${String(appointment.id).slice(0, 8).toUpperCase()}`
  const isPatur        = businessType === 'osek_patur'
  const rate           = vatRate / 100

  // Build line items — either from `items[]` (multi-line) or a single service line.
  const lineItems = (Array.isArray(items) && items.length > 0)
    ? items.map(it => ({
        name: it.name || '-',
        quantity: Number(it.quantity || 1),
        unitPriceGross: Number(it.unit_price || 0),
        lineTotalGross: Number(it.line_total || (Number(it.unit_price || 0) * Number(it.quantity || 1))),
      }))
    : [{
        name: appointment?.services?.name || '-',
        quantity: 1,
        unitPriceGross: Number(appointment?.services?.price) || 0,
        lineTotalGross: Number(appointment?.services?.price) || 0,
      }]

  const totalGross     = lineItems.reduce((s, it) => s + it.lineTotalGross, 0)
  const price          = totalGross
  const priceBeforeVat = isPatur ? totalGross : Math.round((totalGross / (1 + rate)) * 100) / 100
  const vatAmount      = isPatur ? 0 : Math.round((totalGross - priceBeforeVat) * 100) / 100
  const docTitle       = isCreditNote ? 'חשבונית זיכוי' : (isPatur ? 'קבלה' : 'חשבונית מס קבלה')
  const businessTypeLabel = isPatur ? 'עוסק פטור' : 'עוסק מורשה'
  const serviceDate    = formatDate(appointment.start_at)
  const timeStr        = formatTime(appointment.start_at)
  const issueDateStr   = invoiceDate ? formatDate(invoiceDate) : new Date().toLocaleDateString('he-IL')
  const footer         = footerText || ''
  const methodLabel    = PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod || ''
  const taxIdLine      = businessTaxId
    ? `${businessTypeLabel} מס׳: ${businessTaxId}`
    : businessTypeLabel

  const fmt = n => Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${docTitle} ${esc(invoiceNum)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Assistant', Arial, sans-serif;
      font-size: 13px;
      color: #111;
      background: #f0f0f0;
      direction: rtl;
    }

    .no-print {
      text-align: center;
      padding: 12px;
      background: #ddd;
    }
    .no-print button {
      background: #333;
      color: #fff;
      border: none;
      padding: 8px 24px;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      font-family: inherit;
    }

    /* A4-style page */
    .page {
      max-width: 680px;
      margin: 24px auto;
      background: #fff;
      border: 1px solid #ccc;
    }

    /* ── Header ── */
    .doc-header {
      padding: 24px 32px 18px;
      border-bottom: 2px solid #111;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .biz-block {
      display: flex;
      align-items: flex-start;
      gap: 14px;
    }
    .biz-logo {
      height: 64px;
      width: auto;
      max-width: 120px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .biz-text {}
    .biz-name {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .biz-meta {
      font-size: 11px;
      color: #555;
      line-height: 1.7;
    }
    .biz-taxid {
      font-size: 11px;
      font-weight: 600;
      color: #111;
      margin-top: 4px;
    }
    .doc-title-block {
      text-align: left;
      flex-shrink: 0;
    }
    .doc-title {
      font-size: 22px;
      font-weight: 700;
      color: #111;
      white-space: nowrap;
    }
    .doc-meta {
      font-size: 11px;
      color: #555;
      margin-top: 6px;
      line-height: 1.8;
      text-align: left;
    }
    .doc-meta strong {
      color: #111;
    }

    /* ── Sections ── */
    .section-row {
      display: flex;
      border-bottom: 1px solid #ddd;
    }
    .section-row .half {
      flex: 1;
      padding: 16px 32px;
    }
    .section-row .half:first-child {
      border-left: 1px solid #ddd;
    }
    .section-title {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 10px;
    }

    /* ── Table ── */
    table {
      width: 100%;
      border-collapse: collapse;
    }
    td {
      padding: 7px 0;
      font-size: 12.5px;
      vertical-align: top;
    }
    td.label {
      color: #666;
      width: 45%;
    }
    td.value {
      font-weight: 500;
      color: #111;
    }

    /* ── Items table ── */
    .items-section {
      padding: 16px 32px;
      border-bottom: 1px solid #ddd;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
    }
    .items-table th {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: #888;
      border-bottom: 1px solid #ddd;
      padding: 0 0 8px;
      text-align: right;
    }
    .items-table th.num {
      text-align: left;
    }
    .items-table td {
      padding: 10px 0;
      font-size: 13px;
      border-bottom: 1px solid #f0f0f0;
      color: #111;
    }
    .items-table td.num {
      text-align: left;
      font-weight: 600;
    }

    /* ── Totals ── */
    .totals-section {
      padding: 16px 32px;
      border-bottom: 1px solid #ddd;
    }
    .totals-table {
      width: 100%;
      max-width: 280px;
      margin-right: 0;
      margin-left: auto;
      border-collapse: collapse;
    }
    .totals-table td {
      padding: 5px 0;
      font-size: 12.5px;
    }
    .totals-table td.t-label {
      color: #666;
    }
    .totals-table td.t-value {
      text-align: left;
      font-weight: 500;
    }
    .totals-table tr.total-row td {
      font-size: 15px;
      font-weight: 700;
      color: #111;
      border-top: 1.5px solid #111;
      padding-top: 10px;
      margin-top: 6px;
    }
    .paid-stamp {
      display: inline-block;
      border: 2px solid #1a7a3a;
      color: #1a7a3a;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 3px;
      letter-spacing: 0.5px;
      margin-top: 12px;
    }

    /* ── Footer ── */
    .doc-footer {
      padding: 14px 32px;
      font-size: 10px;
      color: #888;
      text-align: center;
      line-height: 1.6;
    }

    @media print {
      body { background: #fff; }
      .page { margin: 0; border: none; max-width: 100%; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">הדפס / שמור כ-PDF</button>
  </div>

  <div class="page">

    ${isCopy ? `<div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;text-align:center;padding:6px 0;margin-bottom:14px;font-weight:700;font-size:15px;letter-spacing:4px;color:#374151">העתק</div>` : ''}

    <!-- Header -->
    <div class="doc-header">
      <div class="biz-block">
        ${logoUrl ? `<img src="${logoUrl}" alt="${esc(business.name)}" class="biz-logo" />` : ''}
        <div class="biz-text">
          <div class="biz-name">${esc(business.name)}</div>
          <div class="biz-meta">
            ${business.address ? esc(business.address) + '<br>' : ''}
            ${business.phone   ? 'טל׳: ' + esc(business.phone) + '<br>' : ''}
            ${business.email   ? esc(business.email) : ''}
          </div>
          <div class="biz-taxid">${esc(taxIdLine)}</div>
        </div>
      </div>
      <div class="doc-title-block">
        <div class="doc-title">${esc(docTitle)}</div>
        <div class="doc-meta">
          מספר: <strong>${esc(invoiceNum)}</strong><br>
          תאריך הנפקה: <strong>${esc(issueDateStr)}</strong><br>
          תאריך שירות: <strong>${esc(serviceDate)}</strong>
        </div>
      </div>
    </div>

    <!-- Customer + Service info side by side -->
    <div class="section-row">
      <div class="half">
        <div class="section-title">פרטי לקוח</div>
        <table>
          <tr><td class="label">שם</td><td class="value">${esc(appointment.profiles?.name ?? '-')}</td></tr>
          <tr><td class="label">טלפון</td><td class="value">${esc(appointment.profiles?.phone ?? '-')}</td></tr>
        </table>
      </div>
      <div class="half">
        <div class="section-title">פרטי שירות</div>
        <table>
          <tr><td class="label">נותן שירות</td><td class="value">${esc(appointment.staff?.name ?? '-')}</td></tr>
          <tr><td class="label">תאריך</td><td class="value">${esc(serviceDate)}</td></tr>
          <tr><td class="label">שעה</td><td class="value">${esc(timeStr)}</td></tr>
        </table>
      </div>
    </div>

    <!-- Line items -->
    <div class="items-section">
      <div class="section-title">פירוט</div>
      <table class="items-table">
        <thead>
          <tr>
            <th>תיאור</th>
            <th class="num">כמות</th>
            <th class="num">מחיר יחידה</th>
            <th class="num">סכום</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map(it => {
            const unitBefore = isPatur ? it.unitPriceGross : Math.round((it.unitPriceGross / (1 + rate)) * 100) / 100
            const lineBefore = isPatur ? it.lineTotalGross : Math.round((it.lineTotalGross / (1 + rate)) * 100) / 100
            return `
          <tr>
            <td>${esc(it.name)}</td>
            <td class="num">${it.quantity}</td>
            <td class="num">₪${fmt(unitBefore)}</td>
            <td class="num">₪${fmt(lineBefore)}</td>
          </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-section">
      <table class="totals-table">
        ${!isPatur ? `
        <tr>
          <td class="t-label">סכום לפני מע"מ</td>
          <td class="t-value">₪${fmt(priceBeforeVat)}</td>
        </tr>
        <tr>
          <td class="t-label">מע"מ ${vatRate}%</td>
          <td class="t-value">₪${fmt(vatAmount)}</td>
        </tr>` : ''}
        <tr class="total-row">
          <td class="t-label">סה"כ לתשלום</td>
          <td class="t-value">₪${fmt(price)}</td>
        </tr>
      </table>
      ${methodLabel ? `<div class="paid-stamp">✓ שולם ב${esc(methodLabel)}</div>` : ''}
    </div>

    <!-- Footer -->
    <div class="doc-footer">
      ${footer ? `<div>${esc(footer)}</div>` : ''}
      <div>${[business.address, business.phone ? 'טל׳ ' + business.phone : '', business.email].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div>
      <div style="margin-top:3px">${esc(taxIdLine)}</div>
      ${taxSoftwareRegNumber ? `<div style="margin-top:3px;font-size:10px;color:#888">מס׳ רישום תוכנה: ${esc(taxSoftwareRegNumber)}</div>` : ''}
    </div>

  </div>
</body>
</html>`

  return html
}

/**
 * Opens a new browser window with the invoice for printing / saving as PDF.
 */
export function printInvoice(params) {
  const html = generateInvoiceHTML(params)
  const win = window.open('', '_blank')
  if (!win) { alert('יש לאפשר חלונות קופצים בדפדפן'); return }
  win.document.write(html)
  win.document.close()
}

function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
