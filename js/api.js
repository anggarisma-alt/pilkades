'use strict';
/* =====================================================================
   api.js — Lapisan komunikasi ke GAS (REST/JSON via fetch)
   - POST pakai Content-Type text/plain agar TIDAK memicu CORS preflight
   - Timeout + retry untuk aksi baca (jaringan HP tidak stabil)
   - Aksi tulis membawa reqId: server mengingat hasilnya 6 jam, jadi
     retry tidak pernah menghitung suara dua kali
   - Perf: catat waktu total vs waktu server (Perf.table() di console)
   ===================================================================== */

const WRITE_ACTIONS = /^(catatTally|simpanTotal|setStatusTps|kunciTps|kunciSemua|simpanKonfigurasi|simpanCalon|hapusCalon|uploadFoto|simpanTps|hapusTps|simpanPengguna|hapusPengguna)$/;

const Perf = {
  rows: [],
  add(action, total, server) {
    this.rows.push({ action: action, total_ms: total, server_ms: server == null ? null : server, jaringan_ms: server == null ? null : total - server });
    if (this.rows.length > 200) this.rows.shift();
  },
  table() { console.table(this.rows.slice(-30)); }
};

function newReqId() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);
}

function apiConfigured() { return typeof GAS_URL === 'string' && /^https:\/\/script\.google\.com\/.+\/exec$/.test(GAS_URL); }

async function postOnce(action, args, reqId, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const t0 = performance.now();
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, args: args, reqId: reqId })
    });
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); }
    catch (e) { return { success: false, network: true, message: 'Server membalas HTTP ' + res.status + ' (bukan JSON). Periksa penerapan Apps Script.' }; }
    Perf.add(action, Math.round(performance.now() - t0), j.ms);
    return j;
  } catch (err) {
    return { success: false, network: true, message: err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus.' };
  } finally { clearTimeout(timer); }
}

function waitOnline(ms) {
  return new Promise(resolve => {
    if (navigator.onLine !== false) return resolve();
    const done = () => { clearTimeout(t); removeEventListener('online', done); resolve(); };
    const t = setTimeout(done, ms);
    addEventListener('online', done);
  });
}

/**
 * Panggil fungsi server. Resolve dengan res.data.
 * Reject dengan Error: kind = 'auth' | 'server' | 'net'
 * opts.reqId: pakai ulang reqId lama untuk mengirim ulang aksi tulis yang sebelumnya gagal.
 */
async function apiCall(action, args, opts) {
  opts = opts || {};
  if (!apiConfigured()) { const e = new Error('GAS_URL belum diisi di js/config.js.'); e.kind = 'server'; throw e; }
  const write = WRITE_ACTIONS.test(action);
  const reqId = write ? (opts.reqId || newReqId()) : '';
  const tries = write ? 3 : 3; // tulis aman di-retry karena reqId sama
  let res;
  for (let i = 0; i < tries; i++) {
    if (i) { await new Promise(r => setTimeout(r, 1200 * i)); if (navigator.onLine === false) await waitOnline(15000); }
    res = await postOnce(action, args, reqId, write ? 60000 : (i ? 40000 : 25000));
    if (!res.network) break;
  }
  if (res.network) { const e = new Error(res.message); e.kind = 'net'; e.reqId = reqId; throw e; }
  if (res.expired) {
    if (typeof forceLogout === 'function') forceLogout('Sesi berakhir, silakan masuk lagi.');
    const e = new Error('SESI_HABIS'); e.kind = 'auth'; throw e;
  }
  if (res.success === false) { const e = new Error(res.message || 'Terjadi kesalahan.'); e.kind = 'server'; throw e; }
  return res.data;
}

/** Pemanasan server (mengurangi cold start) — dipanggil saat app dibuka / kembali dari latar belakang. */
function warmUpServer() {
  if (!apiConfigured()) return;
  fetch(GAS_URL + '?action=ping&t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
}
