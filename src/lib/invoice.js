import { formatDate, formatTime } from './utils'

/**
 * Opens a new browser window with a styled Hebrew invoice
 * and triggers the print dialog (user can Print → Save as PDF).
 */
export function printInvoice({ appointment, business, footerText, vatRate = 18, businessType = 'osek_morsheh', invoiceNumber }) {
  const invoiceNum = invoiceNumber || `INV-${appointment.id.slice(0, 8).toUpperCase()}`
  const price      = Number(appointment.services?.price) || 0
  const isPatur    = businessType === 'osek_patur'
  const rate       = vatRate / 100
  const priceBeforeVat = isPatur ? price : Math.round(price / (1 + rate))
  const vat        = isPatur ? 0 : price - priceBeforeVat
  const docTitle   = isPatur ? 'חשבונית עסקה' : 'חשבונית מס'
  const dateStr    = formatDate(appointment.start_at)
  const timeStr    = formatTime(appointment.start_at)
  const footer     = footerText || `תודה על בחירתך ב-${business.name}!`

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${docTitle} ${invoiceNum}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Assistant', 'Arial Hebrew', Arial, sans-serif;
      background: #f8f8f8;
      color: #111;
      direction: rtl;
    }

    .page {
      max-width: 700px;
      margin: 40px auto;
      background: #fff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 40px rgba(0,0,0,0.10);
    }

    .header {
      background: #111;
      color: #fff;
      padding: 36px 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .biz-name {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }

    .biz-details {
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      margin-top: 8px;
      line-height: 1.7;
    }

    .invoice-title {
      font-size: 36px;
      font-weight: 800;
      color: #c9a96e;
      text-align: left;
    }

    .invoice-meta {
      font-size: 13px;
      color: rgba(255,255,255,0.55);
      text-align: left;
      margin-top: 6px;
      line-height: 1.7;
    }

    .body {
      padding: 40px;
    }

    .section {
      margin-bottom: 32px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #eee;
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 0;
      border-bottom: 1px solid #f3f3f3;
      font-size: 14px;
    }

    .row:last-child { border-bottom: none; }

    .row-label { color: #777; }

    .row-value { font-weight: 700; }

    .total-box {
      background: #111;
      color: #fff;
      border-radius: 12px;
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
    }

    .total-label { font-size: 16px; font-weight: 700; }

    .total-value { font-size: 32px; font-weight: 800; color: #c9a96e; }

    .footer {
      border-top: 1px solid #eee;
      padding: 20px 40px;
      text-align: center;
      font-size: 12px;
      color: #aaa;
      line-height: 1.7;
    }

    @media print {
      body { background: #fff; }
      .page {
        margin: 0;
        box-shadow: none;
        border-radius: 0;
        max-width: 100%;
      }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:16px;background:#f0f0f0">
    <button onclick="window.print()" style="background:#111;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:15px;cursor:pointer;font-family:inherit">
      🖨 הדפס / שמור PDF
    </button>
  </div>
  <div class="page">
    <div class="header">
      <div>
        <div class="biz-name">${esc(business.name)}</div>
        <div class="biz-details">
          ${business.address ? esc(business.address) + '<br>' : ''}
          ${business.phone   ? esc(business.phone)   + '<br>' : ''}
          ${business.email   ? esc(business.email)          : ''}
        </div>
      </div>
      <div>
        <div class="invoice-title">${docTitle}</div>
        <div class="invoice-meta">
          מס׳: ${invoiceNum}<br>
          תאריך: ${dateStr}
        </div>
      </div>
    </div>

    <div class="body">
      <div class="section">
        <div class="section-title">פרטי לקוח</div>
        <div class="row">
          <span class="row-label">שם</span>
          <span class="row-value">${esc(appointment.profiles?.name ?? '-')}</span>
        </div>
        <div class="row">
          <span class="row-label">טלפון</span>
          <span class="row-value">${esc(appointment.profiles?.phone ?? '-')}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">פרטי שירות</div>
        <div class="row">
          <span class="row-label">שירות</span>
          <span class="row-value">${esc(appointment.services?.name ?? '-')}</span>
        </div>
        <div class="row">
          <span class="row-label">ספר</span>
          <span class="row-value">${esc(appointment.staff?.name ?? '-')}</span>
        </div>
        <div class="row">
          <span class="row-label">תאריך</span>
          <span class="row-value">${dateStr}</span>
        </div>
        <div class="row">
          <span class="row-label">שעה</span>
          <span class="row-value">${timeStr}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">תשלום</div>
        ${isPatur ? '' : `<div class="row">
          <span class="row-label">מחיר לפני מע"מ</span>
          <span class="row-value">₪${priceBeforeVat}</span>
        </div>
        <div class="row">
          <span class="row-label">מע"מ ${vatRate}%</span>
          <span class="row-value">₪${vat}</span>
        </div>`}
        <div class="total-box">
          <span class="total-label">סה"כ לתשלום</span>
          <span class="total-value">₪${price}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <div>${esc(footer)}</div>
      ${business.address || business.phone ? `<div style="margin-top:4px">${[business.address, business.phone, business.email].filter(Boolean).map(esc).join(' | ')}</div>` : ''}
    </div>
  </div>
</body>
</html>`

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
