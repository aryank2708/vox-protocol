// ==================================================================
// AYN AI · Generator shared JS
// Helpers used across all generators.
// ==================================================================

window.GenLib = (function () {

  // ---- date utils ----
  function todayISO() {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }
  function addDaysISO(iso, days) {
    if (!iso) return '';
    const d = new Date(iso);
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().split('T')[0];
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${m}.${d}.${y.slice(2)}`;
  }
  function fmtDateRange(a, b) {
    if (!a || !b) return '—';
    const [ya, ma, da] = a.split('-');
    const [yb, mb, db] = b.split('-');
    return `${ma}.${da} – ${mb}.${db}`;
  }

  // ---- money ----
  function currencySymbol(c) {
    return { USD: '$', INR: '₹', EUR: '€', GBP: '£' }[c] || '$';
  }
  function fmtMoney(n, currency) {
    const sym = currencySymbol(currency);
    const sign = n < 0 ? '−' : '';
    const abs = Math.abs(Number(n) || 0);
    return sign + sym + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---- escape ----
  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- state path setter ----
  function setPath(obj, path, v) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
    cur[keys[keys.length - 1]] = v;
  }

  // ---- brand mark ----
  const APERTURE_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M 22 2 L 22 22 L 2 22 L 13.6 2 Z" fill="#0b0b0c" />
    <path d="M 2 1 L 13.6 1 L 2 21 Z" fill="none" stroke="#0b0b0c" stroke-width="0.85" />
    <path d="M 14.4 1 L 2.4 21" stroke="#c4360a" stroke-width="0.7" />
  </svg>`;

  function brandLockup() {
    return `<div class="brand-lockup">${APERTURE_SVG}<span>ayn<span class="slash">/</span>ai</span></div>`;
  }

  // ---- payment rails ----
  const PAY_RAILS = {
    USD: {
      title: 'USD · ACH / Wire (Skydo)',
      body: `Beneficiary: Aryan Khudlain
Bank: Community Federal Savings Bank
ACH routing: 026073150
Account: 8331708563
Beneficiary address:
5 Penn Plaza, 14th Floor
New York, NY 10001, US`
    },
    INR: {
      title: 'INR · Domestic / Remitly',
      body: `Account name: Aryan Khudlain
Bank: AU Small Finance Bank
Branch: Delhi · Shalimar Bagh
Account: 2401255859763298
IFSC: AUBL0002558
SWIFT: AUBLINBBXXX`
    }
  };

  // ---- standard guarantee text ----
  const GUARANTEE_TEXT = 'Full refund if the system is not deployed within 21 days of project start. Subject to standard terms & conditions.';

  return {
    todayISO, addDaysISO, fmtDate, fmtDateRange,
    currencySymbol, fmtMoney,
    escapeAttr, escapeHtml,
    setPath,
    APERTURE_SVG, brandLockup,
    PAY_RAILS, GUARANTEE_TEXT,
  };
})();
