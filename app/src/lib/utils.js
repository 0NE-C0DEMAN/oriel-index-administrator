/* ==========================================================================
   utils.js — Pure helpers (formatters, classnames). No React, no deps.
   Registers on window.App.utils.
   ========================================================================== */
(() => {
  'use strict';

  function cn(...args) {
    return args.filter(Boolean).join(' ');
  }

  function formatNumber(value, opts = {}) {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('en-US', opts).format(n);
  }

  function formatPercent(value, digits = 2) {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(digits)}%`;
  }

  function formatClockUtc(date = new Date()) {
    // YYYY-MM-DD · HH:MM (top-nav clock style)
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} · ${hh}:${mm} UTC`;
  }

  // v7 strftime("%Y-%m-%d %H:%M UTC")
  function nowUtcDateTime(seconds = false) {
    const d = new Date();
    const y = d.getUTCFullYear();
    const M = String(d.getUTCMonth() + 1).padStart(2, '0');
    const D = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return seconds
      ? `${y}-${M}-${D} ${hh}:${mm}:${ss} UTC`
      : `${y}-${M}-${D} ${hh}:${mm} UTC`;
  }

  function todayUtcDate() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  function downloadCsv(filename, rows) {
    if (!rows || !rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  window.App = window.App || {};
  window.App.utils = {
    cn, formatNumber, formatPercent, formatClockUtc,
    nowUtcDateTime, todayUtcDate,
    downloadCsv, slugify,
  };
})();
