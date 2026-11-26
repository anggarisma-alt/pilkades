'use strict';
/* =====================================================================
   REAL COUNT PILKADES — app.js (frontend statis, GitHub Pages)
   Backend: Google Apps Script REST API (lihat js/api.js & config.js).
   Token sesi disimpan di memori + localStorage (agar tidak keluar saat
   layar HP mati), TIDAK PERNAH di URL.
   ===================================================================== */

const AppState = {
  token: null, user: null, page: null, timers: [], theme: 'light',
  boot: { desa: '', judul: '', logo: '', layarAktif: false },
  hasil: null, inputData: null, input: null, layar: null, P: null, setTab: 'umum', prevPage: 'dashboard', fotoTmp: null
};
const COLORS = ['#2563EB', '#0891B2', '#7C3AED', '#F59E0B', '#059669', '#DB2777', '#EA580C', '#4F46E5'];
const colorOf = i => COLORS[i % COLORS.length];

/* ---------- Utilitas ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (Number(n) || 0).toLocaleString('id-ID');
const pct = n => (Number(n) || 0).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const num = v => parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10) || 0;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } }
};

/** Pembungkus ke api.js: api('namaFungsi', ...argumen) -> Promise<data> */
const api = (fn, ...args) => apiCall(fn, args);
const apiA = (fn, ...args) => api(fn, AppState.token, ...args);

function toast(msg, type) {
  const icons = { success: 'bi-check-circle-fill', error: 'bi-exclamation-octagon-fill', warn: 'bi-exclamation-triangle-fill' };
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.innerHTML = '<i class="bi ' + (icons[type] || 'bi-info-circle-fill') + '"></i><span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}
const errToast = e => { if (e && e.message !== 'SESI_HABIS') toast(e.message, 'error'); };

function openModal(title, body, opts) {
  closeModal();
  const el = document.createElement('div');
  el.className = 'modal-back';
  el.innerHTML = '<div class="modal ' + (opts && opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true"><div class="modal-head"><h3>' + esc(title) +
    '</h3><button class="icon-btn" aria-label="Tutup" onclick="closeModal()"><i class="bi bi-x-lg"></i></button></div><div class="modal-body">' + body + '</div></div>';
  el.addEventListener('mousedown', e => { if (e.target === el) closeModal(); });
  $('#modalRoot').appendChild(el);
  document.body.classList.add('modal-open');
  return el;
}
function closeModal() { $('#modalRoot').innerHTML = ''; if (!AppState.layar) document.body.classList.remove('modal-open'); }

let _confirmCb = null;
function confirmBox(msg, onYes, yesLabel, danger) {
  _confirmCb = onYes;
  openModal('Konfirmasi', '<p style="margin:0 0 16px">' + esc(msg) + '</p><div class="row"><button class="btn btn-ghost spacer" onclick="closeModal()">Batal</button><button class="btn ' +
    (danger ? 'btn-danger' : 'btn-primary') + ' spacer" onclick="runConfirm()">' + esc(yesLabel || 'Ya, lanjutkan') + '</button></div>');
}
function runConfirm() { const cb = _confirmCb; _confirmCb = null; closeModal(); if (cb) cb(); }

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn._h = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> ' + (label || 'Memproses...'); }
  else { btn.disabled = false; if (btn._h) btn.innerHTML = btn._h; }
}

function statusBadge(st) {
  const c = st === 'Selesai' ? 'green' : st === 'Sedang dihitung' ? 'amber' : 'gray';
  return '<span class="badge ' + c + '">' + esc(st) + '</span>';
}
const statusDot = st => '<span class="dot ' + (st === 'Selesai' ? 'green' : st === 'Sedang dihitung' ? 'amber' : 'gray') + '"></span>';
const skeleton = () => '<div class="page skeleton"><i></i><i></i><i></i></div>';
const emptyBox = (icon, text) => '<div class="empty"><i class="bi ' + icon + '"></i>' + text + '</div>';
const isAdmin = () => AppState.user && AppState.user.peran === 'admin';
function fotoOrIcon(url, icon) { return url ? '<img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<i class="bi ' + (icon || 'bi-person-fill') + '"></i>'; }

/* ---------- Cache perangkat (tampil instan, lalu segarkan di latar) ---------- */
function saveBoot() { store.set('rcp_boot', JSON.stringify(AppState.boot)); }
function hasilKey() { return 'rcp_hasil_' + (AppState.user ? AppState.user.username : 'x'); }
function cacheHasil(h) { store.set(hasilKey(), JSON.stringify(h)); }
function loadHasil() { try { return JSON.parse(store.get(hasilKey()) || 'null'); } catch (e) { return null; } }
function clearSessionStore() { store.del('rcp_token'); store.del('rcp_user'); if (AppState.user) store.del(hasilKey()); }

/* ---------- Tema ---------- */
function applyTheme(t) {
  AppState.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  const ic = $('#themeIcon'); if (ic) ic.className = 'bi ' + (t === 'dark' ? 'bi-sun' : 'bi-moon-stars');
  store.set('rcp_theme', t);
}
function toggleTheme() { applyTheme(AppState.theme === 'dark' ? 'light' : 'dark'); }

/* ---------- Router SPA ---------- */
const PAGES = {};
function clearTimers() { AppState.timers.forEach(clearInterval); AppState.timers = []; }

function navItems() {
  const a = [{ id: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard' }, { id: 'input', icon: 'bi-pencil-square', label: 'Input Suara' }];
  if (isAdmin()) a.push({ id: 'layar', icon: 'bi-display', label: 'Layar' });
  a.push({ id: 'laporan', icon: 'bi-file-earmark-text', label: 'Laporan' });
  if (isAdmin()) a.push({ id: 'pengaturan', icon: 'bi-gear', label: 'Pengaturan' });
  return a;
}
function renderChrome() {
  const logged = !!AppState.user;
  $('#appbar').hidden = !logged; $('#sidenav').hidden = !logged; $('#bottomnav').hidden = !logged;
  if (!logged) return;
  const b = AppState.boot;
  $('#brandDesa').textContent = b.desa || 'Real Count';
  $('#brandJudul').textContent = b.judul || 'Pilkades';
  $('#brandLogo').innerHTML = b.logo ? '<img src="' + esc(b.logo) + '" alt="" referrerpolicy="no-referrer">' : '<i class="bi bi-bar-chart-fill"></i>';
  $('#whoBox').innerHTML = '<b>' + esc(AppState.user.nama) + '</b>' + (isAdmin() ? 'Admin' : 'Operator');
  const html = navItems().map(n => '<button class="nav-item" data-page="' + n.id + '" onclick="navigateTo(\'' + n.id + '\')"><i class="bi ' + n.icon + '"></i><span>' + n.label + '</span></button>').join('');
  $('#sidenav').innerHTML = html; $('#bottomnav').innerHTML = html;
}
function updateActiveNav() {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === AppState.page));
}

async function navigateTo(page) {
  if (AppState.page === 'input') await flushTally(true);
  clearTimers(); closeModal();
  if (AppState.layar && page !== 'layar') closeLayarUI();
  if (page === 'layar') {
    if (AppState.page && AppState.page !== 'layar') AppState.prevPage = AppState.page;
    AppState.page = 'layar'; openLayar(); return;
  }
  AppState.page = page;
  renderChrome(); updateActiveNav();
  const v = $('#view');
  window.scrollTo(0, 0);
  v.innerHTML = skeleton();
  try { await PAGES[page](v); }
  catch (e) { if (e.message !== 'SESI_HABIS') v.innerHTML = '<div class="page">' + emptyBox('bi-wifi-off', esc(e.message) + '<br><br><button class="btn btn-primary" onclick="navigateTo(\'' + page + '\')"><i class="bi bi-arrow-clockwise"></i> Coba lagi</button>') + '</div>'; }
}

function forceLogout(msg) {
  clearSessionStore();
  AppState.token = null; AppState.user = null; AppState.page = null; AppState.input = null; clearTimers(); closeModal();
  if (AppState.layar) closeLayarUI();
  navigateTo('login');
  if (msg) toast(msg, 'warn');
}
async function handleLogout() {
  const tk = AppState.token;
  if (AppState.page === 'input') await flushTally(true);
  clearSessionStore();
  AppState.token = null; AppState.user = null; AppState.page = null; AppState.input = null;
  if (tk) api('doLogout', tk).catch(() => {});
  navigateTo('login');
}

/* ======================= HALAMAN: LOGIN ======================= */
PAGES.login = async function (v) {
  const b = AppState.boot;
  v.innerHTML = '<div class="page login-wrap"><div class="login-card"><div class="login-hero"><div class="brand-logo">' +
    (b.logo ? '<img src="' + esc(b.logo) + '" alt="" referrerpolicy="no-referrer">' : '<i class="bi bi-bar-chart-fill"></i>') + '</div>' +
    '<h1>' + esc(b.desa || 'Real Count Pilkades') + '</h1><p>' + esc(b.judul || 'Perhitungan suara pemilihan kepala desa') + '</p></div>' +
    '<div class="login-body"><form onsubmit="return handleLogin(event)" autocomplete="on">' +
    '<label class="field"><span>Username</span><input class="input" id="lgUser" autocomplete="username" autocapitalize="none" required></label>' +
    '<label class="field"><span>PIN / Password</span><div class="pw"><input class="input" id="lgPin" type="password" autocomplete="current-password" required>' +
    '<button type="button" class="eye" onclick="togglePw()" aria-label="Tampilkan password"><i class="bi bi-eye" id="eyeIc"></i></button></div></label>' +
    '<button class="btn btn-primary btn-block" id="lgBtn" type="submit"><i class="bi bi-box-arrow-in-right"></i> Masuk</button></form>' +
    (b.layarAktif ? '<div class="divider">atau</div><button class="btn btn-soft btn-block" onclick="navigateTo(\'layar\')"><i class="bi bi-display"></i> Buka Layar Hasil (Proyektor)</button>' : '') +
    '</div></div></div>';
  setTimeout(() => { const u = $('#lgUser'); if (u) u.focus(); }, 50);
};
function togglePw() {
  const i = $('#lgPin'); const show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  $('#eyeIc').className = 'bi ' + (show ? 'bi-eye-slash' : 'bi-eye');
}
async function handleLogin(ev) {
  ev.preventDefault();
  const btn = $('#lgBtn');
  busy(btn, true, 'Memeriksa...');
  try {
    const r = await api('doLogin', $('#lgUser').value, $('#lgPin').value);
    AppState.token = r.token; AppState.user = r.user;
    if (r.boot) { AppState.boot = r.boot; saveBoot(); }
    if (r.hasil) cacheHasil(r.hasil);
    store.set('rcp_token', r.token); store.set('rcp_user', JSON.stringify(r.user));
    toast('Selamat datang, ' + r.user.nama, 'success');
    navigateTo('dashboard');
  } catch (e) { busy(btn, false); errToast(e); }
  return false;
}

/* ======================= HALAMAN: DASHBOARD ======================= */
function barsHtml(calon, vals, sah) {
  if (!calon.length) return emptyBox('bi-person-badge', 'Belum ada calon. Tambahkan di menu Pengaturan.');
  return '<div class="bars">' + calon.map((c, i) => {
    const n = vals[i], p = sah > 0 ? n / sah * 100 : 0;
    return '<div class="bar-row" style="--c:' + colorOf(i) + '"><div class="top"><span class="numdot">' + c.no + '</span><div class="nm">' + esc(c.nama) +
      '</div><div class="v">' + fmt(n) + '<small>' + pct(p) + '</small></div></div><div class="track"><i style="width:' + p.toFixed(1) + '%"></i></div></div>';
  }).join('') + '</div>';
}
function rekapTable(h) {
  let t = '<table class="tbl"><thead><tr><th>TPS</th><th>DPT</th>' + h.calon.map(c => '<th>No. ' + c.no + '</th>').join('') + '<th>Sah</th><th>Tdk Sah</th><th class="c">Status</th></tr></thead><tbody>';
  h.perTps.forEach(x => {
    t += '<tr><td>' + (x.terkunci ? '<i class="bi bi-lock-fill" style="color:var(--muted)"></i> ' : '') + esc(x.nama) + '</td><td>' + fmt(x.dpt) + '</td>' +
      h.calon.map(c => '<td>' + fmt(x.calon[c.id] || 0) + '</td>').join('') + '<td>' + fmt(x.sah) + '</td><td>' + fmt(x.tidakSah) + '</td><td class="c">' + statusBadge(x.status) + '</td></tr>';
  });
  t += '<tr class="total"><td>Gabungan</td><td>' + fmt(h.total.dpt) + '</td>' + h.calon.map(c => '<td>' + fmt(c.total) + '</td>').join('') +
    '<td>' + fmt(h.total.sah) + '</td><td>' + fmt(h.total.tidakSah) + '</td><td></td></tr></tbody></table>';
  return t;
}
function paintDashboard(v, h, first) {
  const t = h.total;
  v.innerHTML = '<div class="page" ' + (first ? '' : 'style="animation:none"') + '><div class="page-head"><div><h2>Ringkasan Hasil</h2><small>Diperbarui ' + esc(h.updatedAt) +
    ' WIB • otomatis tiap 10 detik</small></div><div class="row"><span class="badge ' + (h.final ? 'green' : 'amber') + '">' + (h.final ? 'FINAL' : 'SEMENTARA') +
    '</span><button class="btn btn-soft btn-sm" onclick="refreshDashboard(this)"><i class="bi bi-arrow-clockwise"></i> Muat ulang</button></div></div>' +
    '<div class="grid stats">' +
    '<div class="stat"><small><i class="bi bi-people"></i> Total DPT</small><b>' + fmt(t.dpt) + '</b></div>' +
    '<div class="stat"><small><i class="bi bi-check2-square"></i> Suara Sah</small><b>' + fmt(t.sah) + '</b></div>' +
    '<div class="stat"><small><i class="bi bi-x-square"></i> Tidak Sah</small><b>' + fmt(t.tidakSah) + '</b></div>' +
    '<div class="stat"><small><i class="bi bi-percent"></i> Partisipasi</small><b>' + pct(t.partisipasi) + '</b></div>' +
    '<div class="stat"><small><i class="bi bi-building"></i> TPS Selesai</small><b>' + t.tpsSelesai + '/' + t.tpsTotal + '</b></div></div>' +
    '<div class="two-col"><div class="card"><h3><i class="bi bi-bar-chart-fill"></i> Perolehan Suara Gabungan</h3>' + barsHtml(h.calon, h.calon.map(c => c.total), t.sah) + '</div>' +
    '<div class="card"><h3><i class="bi bi-lightbulb"></i> Insight Otomatis</h3><ul class="insight">' + h.insight.map(x => '<li><i class="bi bi-dot"></i><span>' + esc(x) + '</span></li>').join('') +
    '</ul><p style="color:var(--muted);font-size:12.5px;margin:12px 0 0">Partisipasi dihitung dari DPT TPS yang sudah mulai dihitung. Penetapan calon terpilih tetap oleh panitia.</p></div></div>' +
    '<div class="card"><h3><i class="bi bi-table"></i> Rekap per TPS</h3>' + (h.perTps.length ? '<div class="table-wrap">' + rekapTable(h) + '</div>' : emptyBox('bi-building', 'Belum ada TPS.')) + '</div></div>';
}
PAGES.dashboard = async function (v) {
  const c = loadHasil();
  if (c) { AppState.hasil = c; paintDashboard(v, c, true); }   // tampil instan dari perangkat
  try {
    const h = await apiA('getHasil');
    AppState.hasil = h; cacheHasil(h);
    if (AppState.page === 'dashboard') paintDashboard(v, h, !c);
  } catch (e) { if (!c) throw e; if (e.kind === 'net') toast('Offline: menampilkan data terakhir.', 'warn'); }
  AppState.timers.push(setInterval(() => {
    if (document.hidden || AppState.page !== 'dashboard') return;
    apiA('getHasil').then(h => { AppState.hasil = h; cacheHasil(h); if (AppState.page === 'dashboard') paintDashboard(v, h, false); }).catch(() => {});
  }, 10000));
};
async function refreshDashboard(btn) {
  busy(btn, true, 'Memuat');
  try { AppState.hasil = await apiA('getHasil'); paintDashboard($('#view'), AppState.hasil, false); }
  catch (e) { busy(btn, false); errToast(e); }
}

/* ======================= HALAMAN: INPUT SUARA ======================= */
PAGES.input = async function (v) {
  const d = await apiA('getDataInput');
  AppState.inputData = d;
  if (!d.tps.length) {
    v.innerHTML = '<div class="page">' + emptyBox('bi-building', isAdmin() ? 'Belum ada TPS. Tambahkan di Pengaturan &gt; TPS.' : 'Anda belum ditugaskan di TPS manapun. Hubungi admin.') + '</div>';
    return;
  }
  if (!d.calon.length) { v.innerHTML = '<div class="page">' + emptyBox('bi-person-badge', 'Belum ada calon. Tambahkan di Pengaturan &gt; Calon.') + '</div>'; return; }
  const last = store.get('rcp_tps');
  selectTps((d.tps.find(t => t.id === last) || d.tps[0]).id, true);
};

function curTps() { return AppState.inputData.tps.find(t => t.id === AppState.input.tpsId); }
function canEditTps(t) { return !(t.terkunci && !isAdmin()); }
function recorded(S) { let n = S.counts.TS || 0; AppState.inputData.calon.forEach(c => { n += S.counts[c.id] || 0; }); return n; }

async function selectTps(id, force) {
  if (AppState.input && AppState.input.tpsId === id && !force) return;
  if (AppState.input) await flushTally(true);
  const t = AppState.inputData.tps.find(x => x.id === id);
  const counts = Object.assign({}, t.calon, { TS: t.tidakSah });
  const mode = AppState.input ? AppState.input.mode : 'tally';
  AppState.input = { tpsId: id, mode: mode, counts: counts, pending: {}, undo: [], inflight: false, again: false, timer: null, inflightP: null, resend: null, status: t.status };
  store.set('rcp_tps', id);
  paintInput();
}
function setMode(m) { flushTally(false); AppState.input.mode = m; paintInput(); }

function paintStatusSeg() {
  const el = $('#statusSeg'); if (!el) return;
  const t = curTps(), S = AppState.input;
  el.innerHTML = ['Belum mulai', 'Sedang dihitung', 'Selesai'].map(s =>
    '<button class="' + (S.status === s ? 'on' : '') + '" ' + (canEditTps(t) ? '' : 'disabled') + ' onclick="setStatus(\'' + s + '\')">' + s + '</button>').join('');
}
function paintInfobar() {
  const S = AppState.input, t = curTps(); if (!t) return;
  const rec = recorded(S);
  const a = $('#ibRec'), b = $('#ibSisa');
  if (a) a.textContent = fmt(rec);
  if (b) b.textContent = fmt(Math.max(0, t.dpt - rec));
}

function paintInput() {
  const v = $('#view'), S = AppState.input, D = AppState.inputData, t = curTps();
  const editable = canEditTps(t);
  let body = '';
  if (S.mode === 'tally') {
    body = '<div class="tally-grid">' + D.calon.map((c, i) =>
      '<button class="tally" id="tl-' + c.id + '" style="--c:' + colorOf(i) + '" ' + (editable ? '' : 'disabled') + ' onclick="tap(\'' + c.id + '\')"><span class="photo">' + fotoOrIcon(c.foto) +
      '<span class="no">' + c.no + '</span></span><span class="nm">' + esc(c.nama) + '<small>Ketuk untuk +1 suara sah</small></span><span class="cnt" id="cnt-' + c.id + '">' + fmt(S.counts[c.id] || 0) + '</span></button>').join('') +
      '<button class="tally" id="tl-TS" style="--c:#64748B" ' + (editable ? '' : 'disabled') + ' onclick="tap(\'TS\')"><span class="photo"><i class="bi bi-x-octagon"></i></span><span class="nm">Suara Tidak Sah<small>Ketuk untuk +1 tidak sah</small></span><span class="cnt" id="cnt-TS">' + fmt(S.counts.TS || 0) + '</span></button></div>' +
      '<div class="actionbar"><button class="btn btn-ghost" onclick="undoTap()" ' + (editable ? '' : 'disabled') + '><i class="bi bi-arrow-counterclockwise"></i> Undo</button>' +
      '<button class="btn btn-primary" onclick="tandaiSelesai()" ' + (editable ? '' : 'disabled') + '><i class="bi bi-check2-circle"></i> Tandai Selesai</button></div>';
  } else {
    body = '<div class="total-form">' + D.calon.map((c, i) =>
      '<div class="total-row" style="--c:' + colorOf(i) + '"><span class="numdot">' + c.no + '</span><span class="nm">' + esc(c.nama) + '</span><input class="input" id="tot-' + c.id + '" inputmode="numeric" pattern="[0-9]*" value="' + (S.counts[c.id] || 0) + '" ' + (editable ? '' : 'disabled') + ' oninput="hitungTotalLive()" onfocus="this.select()"></div>').join('') +
      '<div class="total-row" style="--c:#64748B"><span class="numdot"><i class="bi bi-x-lg"></i></span><span class="nm">Suara Tidak Sah</span><input class="input" id="tot-TS" inputmode="numeric" pattern="[0-9]*" value="' + (S.counts.TS || 0) + '" ' + (editable ? '' : 'disabled') + ' oninput="hitungTotalLive()" onfocus="this.select()"></div>' +
      '<div class="alert info" id="totInfo"></div></div>' +
      '<div class="actionbar"><button class="btn btn-primary" id="btnTotal" onclick="simpanTotalForm(this)" ' + (editable ? '' : 'disabled') + '><i class="bi bi-save"></i> Simpan Total</button>' +
      '<button class="btn btn-soft" onclick="tandaiSelesai()" ' + (editable ? '' : 'disabled') + '><i class="bi bi-check2-circle"></i> Tandai Selesai</button></div>';
  }
  v.innerHTML = '<div class="page"><div class="page-head"><div><h2>Input Suara</h2><small>' + esc(t.nama) + ' • DPT ' + fmt(t.dpt) + '</small></div>' +
    '<span class="save-ind ok" id="saveInd"><i class="bi bi-check2-circle"></i> Tersimpan</span></div>' +
    '<div class="tps-chips">' + D.tps.map(x => '<button class="tps-chip ' + (x.id === S.tpsId ? 'on' : '') + '" onclick="selectTps(\'' + x.id + '\')">' + statusDot(x.id === S.tpsId ? S.status : x.status) + esc(x.nama) + (x.terkunci ? ' <i class="bi bi-lock-fill"></i>' : '') + '</button>').join('') + '</div>' +
    (t.terkunci ? '<div class="alert ' + (isAdmin() ? 'warn' : 'danger') + '"><i class="bi bi-lock-fill"></i><span>' + (isAdmin() ? 'TPS ini terkunci. Perubahan oleh admin tetap dicatat di riwayat.' : 'TPS ini sudah dikunci. Hubungi admin untuk koreksi.') + '</span></div>' : '') +
    '<div class="infobar"><div><small>DPT</small><b>' + fmt(t.dpt) + '</b></div><div><small>Tercatat</small><b id="ibRec">0</b></div><div><small>Sisa</small><b id="ibSisa">0</b></div></div>' +
    '<div class="seg" id="statusSeg" style="margin-bottom:10px"></div>' +
    '<div class="seg" style="margin-bottom:6px"><button class="' + (S.mode === 'tally' ? 'on' : '') + '" onclick="setMode(\'tally\')"><i class="bi bi-hand-index-thumb"></i> Tally satu per satu</button>' +
    '<button class="' + (S.mode === 'total' ? 'on' : '') + '" onclick="setMode(\'total\')"><i class="bi bi-123"></i> Input total</button></div>' + body + '</div>';
  paintStatusSeg(); paintInfobar();
  if (S.mode === 'total') hitungTotalLive();
}

function setSave(state) {
  const el = $('#saveInd'); if (!el) return;
  const map = { ok: ['bi-check2-circle', 'Tersimpan'], pending: ['bi-hourglass-split', 'Menunggu...'], saving: ['bi-cloud-arrow-up', 'Menyimpan...'], offline: ['bi-wifi-off', 'Offline, mencoba lagi'] };
  el.className = 'save-ind ' + state;
  el.innerHTML = '<i class="bi ' + map[state][0] + '"></i> ' + map[state][1];
}

function tap(key) {
  const S = AppState.input, t = curTps();
  if (!t || !canEditTps(t) || S.mode !== 'tally') return;
  if (recorded(S) >= t.dpt) { toast('Total suara sudah mencapai DPT (' + fmt(t.dpt) + ').', 'warn'); return; }
  S.counts[key] = (S.counts[key] || 0) + 1;
  S.pending[key] = (S.pending[key] || 0) + 1;
  S.undo.push(key);
  if (S.status === 'Belum mulai') { S.status = 'Sedang dihitung'; t.status = 'Sedang dihitung'; paintStatusSeg(); }
  if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* abaikan */ } }
  bumpCount(key); paintInfobar(); schedFlush();
}
function bumpCount(key) {
  const c = $('#cnt-' + key), b = $('#tl-' + key);
  if (c) c.textContent = fmt(AppState.input.counts[key] || 0);
  if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}
function undoTap() {
  const S = AppState.input;
  const key = S.undo.pop();
  if (!key) { toast('Tidak ada ketukan yang bisa dibatalkan.', 'warn'); return; }
  if ((S.counts[key] || 0) <= 0) return;
  S.counts[key]--; S.pending[key] = (S.pending[key] || 0) - 1;
  bumpCount(key); paintInfobar(); schedFlush();
}
function schedFlush() {
  const S = AppState.input; if (!S) return;
  clearTimeout(S.timer); setSave('pending');
  S.timer = setTimeout(() => flushTally(false), 700);
}
function syncTpsItem(tpsId, counts, status) {
  const t = AppState.inputData && AppState.inputData.tps.find(x => x.id === tpsId); if (!t) return;
  AppState.inputData.calon.forEach(c => { t.calon[c.id] = counts[c.id] || 0; });
  t.tidakSah = counts.TS || 0; t.status = status;
}
async function flushTally(wait) {
  const S = AppState.input; if (!S) return;
  clearTimeout(S.timer);
  if (S.inflight) { S.again = true; if (wait) { await S.inflightP; return flushTally(false); } return; }
  // Kiriman yang sebelumnya putus di tengah jalan dikirim ulang dengan reqId SAMA (server membuang duplikat)
  let deltas = {}, reqId = null, any = false;
  if (S.resend) { deltas = S.resend.deltas; reqId = S.resend.reqId; any = true; }
  else {
    Object.keys(S.pending).forEach(k => { if (S.pending[k]) { deltas[k] = S.pending[k]; any = true; } });
    S.pending = {};
  }
  if (!any) { setSave('ok'); return; }
  S.inflight = true; setSave('saving');
  const tpsId = S.tpsId;
  S.inflightP = apiCall('catatTally', [AppState.token, tpsId, deltas], reqId ? { reqId: reqId } : {}).then(r => {
    S.inflight = false; S.resend = null;
    const still = Object.keys(S.pending).some(k => S.pending[k]);
    syncTpsItem(tpsId, r.counts, r.status);
    if (AppState.input === S) {
      if (!still) { S.counts = Object.assign({}, r.counts); S.status = r.status; paintStatusSeg(); paintInfobar(); AppState.inputData.calon.concat([{ id: 'TS' }]).forEach(c => { const el = $('#cnt-' + c.id); if (el) el.textContent = fmt(S.counts[c.id] || 0); }); }
      setSave(still ? 'pending' : 'ok');
      if (S.again || still) { S.again = false; schedFlush(); }
    }
  }).catch(e => {
    S.inflight = false;
    if (e.kind === 'auth') return;
    if (e.kind === 'net') {
      S.resend = { deltas: deltas, reqId: e.reqId || reqId }; // tetap tersimpan di perangkat, dicoba lagi otomatis
      setSave('offline'); clearTimeout(S.timer); S.timer = setTimeout(() => flushTally(false), 4000);
    } else {
      toast(e.message, 'error'); S.resend = null; S.pending = {}; S.undo = [];
      refreshInputData();
    }
  });
  return S.inflightP;
}
async function refreshInputData() {
  try {
    const keep = AppState.input ? AppState.input.tpsId : null, mode = AppState.input ? AppState.input.mode : 'tally';
    AppState.inputData = await apiA('getDataInput');
    if (AppState.page === 'input' && AppState.inputData.tps.length) { AppState.input = null; if (mode) { await selectTps((AppState.inputData.tps.find(t => t.id === keep) || AppState.inputData.tps[0]).id, true); AppState.input.mode = mode; paintInput(); } }
  } catch (e) { errToast(e); }
}

function hitungTotalLive() {
  const t = curTps(); let sum = 0;
  AppState.inputData.calon.forEach(c => { const el = $('#tot-' + c.id); if (el) sum += num(el.value); });
  const ts = $('#tot-TS'); sum += ts ? num(ts.value) : 0;
  const box = $('#totInfo'); if (!box) return;
  const over = sum > t.dpt;
  box.className = 'alert ' + (over ? 'danger' : 'info');
  box.innerHTML = '<i class="bi ' + (over ? 'bi-exclamation-triangle-fill' : 'bi-calculator') + '"></i><span>Total ' + fmt(sum) + ' dari DPT ' + fmt(t.dpt) + (over ? ' — melebihi DPT!' : ' (sisa ' + fmt(t.dpt - sum) + ')') + '</span>';
  const b = $('#btnTotal'); if (b && canEditTps(t)) b.disabled = over;
}
async function simpanTotalForm(btn) {
  const S = AppState.input;
  const angka = {}; AppState.inputData.calon.forEach(c => { angka[c.id] = num($('#tot-' + c.id).value); });
  busy(btn, true, 'Menyimpan');
  try {
    await flushTally(true);
    const r = await apiA('simpanTotal', S.tpsId, angka, num($('#tot-TS').value));
    S.counts = Object.assign({}, r.counts); S.status = r.status; S.undo = [];
    syncTpsItem(S.tpsId, r.counts, r.status);
    toast('Total suara tersimpan.', 'success'); paintInput();
  } catch (e) { busy(btn, false); errToast(e); }
}
function tandaiSelesai() {
  confirmBox('Tandai ' + curTps().nama + ' sebagai SELESAI dihitung? Pastikan semua surat suara sudah tercatat.', () => setStatus('Selesai'), 'Ya, selesai');
}
async function setStatus(st) {
  const S = AppState.input;
  try {
    await flushTally(true);
    const r = await apiA('setStatusTps', S.tpsId, st);
    S.status = r.status; syncTpsItem(S.tpsId, S.counts, r.status);
    toast('Status: ' + st, 'success'); paintInput();
  } catch (e) { errToast(e); }
}

/* ======================= LAYAR PROYEKTOR ======================= */
function openLayar() {
  clearTimers();
  const root = $('#layarRoot');
  const prev = AppState.layar;
  AppState.layar = { mode: prev ? prev.mode : 'gabungan', idx: 0, data: null, ok: true, sig: '', timers: [], ctlTimer: null };
  root.hidden = false; document.body.classList.add('layar-open');
  root.className = 'layar show-ctrl';
  root.innerHTML = '<div class="l-head"><div class="l-logo" id="lLogo"><i class="bi bi-bar-chart-fill"></i></div><div class="l-title"><small id="lDesa">Memuat...</small><h1 id="lJudul"></h1></div>' +
    '<div class="l-meta"><span class="l-badge" id="lBadge">SEMENTARA</span><span class="live" id="lLive"><i></i><span id="lTime">--:--:--</span></span></div></div>' +
    '<div class="l-view" id="lView"></div><div class="l-main" id="lMain"><div class="l-msg"><div><div class="spinner" style="margin:0 auto 12px"></div>Memuat hasil...</div></div></div><div class="l-stats" id="lStats"></div>' +
    '<div class="l-controls" id="lCtl"><div class="seg" id="lSeg"></div><button class="icon-btn" onclick="layarGeser(-1)" aria-label="Sebelumnya"><i class="bi bi-chevron-left"></i></button>' +
    '<button class="icon-btn" onclick="layarGeser(1)" aria-label="Berikutnya"><i class="bi bi-chevron-right"></i></button>' +
    '<button class="icon-btn" onclick="layarFullscreen()" aria-label="Layar penuh"><i class="bi bi-fullscreen"></i></button>' +
    '<button class="icon-btn" onclick="toggleTheme()" aria-label="Ganti tema"><i class="bi bi-circle-half"></i></button>' +
    '<button class="icon-btn" onclick="layarTutup()" aria-label="Tutup layar"><i class="bi bi-x-lg"></i></button></div>';
  paintLayarSeg();
  const L = AppState.layar;
  const show = () => { root.classList.add('show-ctrl'); clearTimeout(L.ctlTimer); L.ctlTimer = setTimeout(() => root.classList.remove('show-ctrl'), 4500); };
  L.showFn = show;
  ['mousemove', 'touchstart', 'click', 'keydown'].forEach(ev => root.addEventListener(ev, show, { passive: true }));
  document.addEventListener('keydown', layarKey);
  show();
  pollLayar();
  L.timers.push(setInterval(pollLayar, 5000));
  L.timers.push(setInterval(() => { if (L.mode === 'auto' && L.data) { L.idx++; paintLayar(); } }, 12000));
}
function layarKey(e) {
  if (!AppState.layar) return;
  if (e.key === 'Escape') layarTutup();
  else if (e.key === 'ArrowRight') layarGeser(1);
  else if (e.key === 'ArrowLeft') layarGeser(-1);
  else if (e.key === 'f' || e.key === 'F') layarFullscreen();
}
function paintLayarSeg() {
  const L = AppState.layar, el = $('#lSeg'); if (!el) return;
  el.innerHTML = [['gabungan', 'Gabungan'], ['tps', 'Per TPS'], ['auto', 'Otomatis']].map(m => '<button class="' + (L.mode === m[0] ? 'on' : '') + '" onclick="layarMode(\'' + m[0] + '\')">' + m[1] + '</button>').join('');
}
function layarMode(m) { const L = AppState.layar; L.mode = m; L.idx = 0; paintLayarSeg(); paintLayar(); }
function layarGeser(d) {
  const L = AppState.layar; if (!L.data) return;
  if (L.mode === 'gabungan') { L.mode = 'tps'; paintLayarSeg(); }
  L.idx += d; paintLayar();
}
function layarFullscreen() {
  const el = document.documentElement, fn = el.requestFullscreen || el.webkitRequestFullscreen;
  const warn = () => toast('Layar penuh tidak tersedia di sini. Tekan F11 pada browser.', 'warn');
  try {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (!fn) { warn(); return; }
    const p = fn.call(el); if (p && p.catch) p.catch(warn);
  } catch (e) { warn(); }
}
function closeLayarUI() {
  const L = AppState.layar; if (!L) return;
  L.timers.forEach(clearInterval); clearTimeout(L.ctlTimer);
  document.removeEventListener('keydown', layarKey);
  AppState.layar = null;
  const root = $('#layarRoot'); root.hidden = true; root.innerHTML = '';
  document.body.classList.remove('layar-open');
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* abaikan */ }
}
function layarTutup() {
  closeLayarUI();
  navigateTo(AppState.user ? (AppState.prevPage === 'layar' ? 'dashboard' : AppState.prevPage) : 'login');
}
async function pollLayar() {
  const L = AppState.layar; if (!L) return;
  try {
    const h = AppState.token ? await apiA('getHasil') : await api('getHasilPublik');
    if (AppState.layar !== L) return;
    L.data = h; L.ok = true; paintLayar();
  } catch (e) {
    if (AppState.layar !== L || e.kind === 'auth') return;
    L.ok = false;
    const live = $('#lLive'); if (live) { live.classList.add('off'); }
    if (e.kind === 'server' && !L.data) {
      $('#lMain').innerHTML = '<div class="l-msg"><div><i class="bi bi-slash-circle"></i>' + esc(e.message) + '</div></div>';
      $('#lStats').innerHTML = '';
    }
  }
}
function paintLayar() {
  const L = AppState.layar, h = L && L.data; if (!h) return;
  $('#lDesa').textContent = h.desa || 'Desa';
  $('#lJudul').textContent = h.judul || '';
  const logo = $('#lLogo'); if (L.logo !== h.logo) { L.logo = h.logo; logo.innerHTML = h.logo ? '<img src="' + esc(h.logo) + '" alt="" referrerpolicy="no-referrer">' : '<i class="bi bi-bar-chart-fill"></i>'; }
  const bd = $('#lBadge'); bd.textContent = h.final ? 'FINAL' : 'SEMENTARA'; bd.className = 'l-badge' + (h.final ? ' final' : '');
  $('#lTime').textContent = 'Diperbarui ' + h.updatedAt; $('#lLive').classList.toggle('off', !L.ok);

  const nT = h.perTps.length;
  let vid = 'gab';
  if (L.mode === 'tps' && nT) { L.idx = ((L.idx % nT) + nT) % nT; vid = h.perTps[L.idx].id; }
  else if (L.mode === 'auto') { const views = ['gab'].concat(h.perTps.map(t => t.id)); L.idx = L.idx % views.length; vid = views[L.idx]; }
  let vals, sah, ts, dpt, part, label, prog;
  if (vid === 'gab') {
    vals = h.calon.map(c => c.total); sah = h.total.sah; ts = h.total.tidakSah; dpt = h.total.dpt; part = h.total.partisipasi;
    label = 'Gabungan semua TPS'; prog = h.total.tpsSelesai + ' / ' + h.total.tpsTotal + ' TPS';
  } else {
    const t = h.perTps.find(x => x.id === vid);
    vals = h.calon.map(c => t.calon[c.id] || 0); sah = t.sah; ts = t.tidakSah; dpt = t.dpt;
    part = (t.status !== 'Belum mulai' && t.dpt > 0) ? (sah + ts) / t.dpt * 100 : 0; label = t.nama; prog = t.status;
  }
  $('#lView').innerHTML = '<i class="bi bi-geo-alt-fill"></i> ' + esc(label);

  if (!h.calon.length) { $('#lMain').innerHTML = '<div class="l-msg"><div><i class="bi bi-person-badge"></i>Belum ada calon.</div></div>'; L.sig = ''; return; }
  const sig = vid + '|' + h.calon.map(c => c.id + c.foto).join(',');
  if (sig !== L.sig) {
    L.sig = sig;
    $('#lMain').innerHTML = h.calon.map((c, i) => '<div class="lc" style="--c:' + colorOf(i) + '"><div class="lc-photo"><div class="ph">' + fotoOrIcon(c.foto) + '</div><span class="lc-no">' + c.no + '</span></div>' +
      '<div><div class="lc-name">' + esc(c.nama) + '</div><div class="lc-votes" id="lv-' + c.id + '">0</div><div class="lc-pct" id="lp-' + c.id + '">0,0%</div></div>' +
      '<div class="lc-bar"><i id="lb-' + c.id + '" style="width:0"></i></div></div>').join('');
  }
  h.calon.forEach((c, i) => {
    const p = sah > 0 ? vals[i] / sah * 100 : 0;
    $('#lv-' + c.id).textContent = fmt(vals[i]); $('#lp-' + c.id).textContent = pct(p);
    $('#lb-' + c.id).style.width = p.toFixed(1) + '%';
  });
  $('#lStats').innerHTML = [['DPT', fmt(dpt)], ['Suara Sah', fmt(sah)], ['Tidak Sah', fmt(ts)], ['Partisipasi', pct(part)], [vid === 'gab' ? 'TPS Selesai' : 'Status', esc(prog)]]
    .map(x => '<div class="l-stat"><small>' + x[0] + '</small><b>' + x[1] + '</b></div>').join('');
}

/* ======================= HALAMAN: LAPORAN ======================= */
PAGES.laporan = async function (v) {
  v.innerHTML = '<div class="page"><div class="page-head"><div><h2>Laporan</h2><small>Berita acara dan rekap hasil perhitungan</small></div></div>' +
    '<div class="card"><h3><i class="bi bi-file-earmark-text"></i> Berita Acara Rekapitulasi</h3><p style="margin:0 0 14px;color:var(--muted)">Memuat data terbaru saat dibuat: rekap gabungan, rincian per TPS, dan kolom tanda tangan panitia.</p>' +
    '<div class="row"><button class="btn btn-primary" onclick="pratinjauBA(this)"><i class="bi bi-eye"></i> Pratinjau</button>' +
    '<button class="btn btn-soft" onclick="unduh(\'pdf\',this)"><i class="bi bi-file-earmark-pdf"></i> Unduh PDF</button>' +
    '<button class="btn btn-soft" onclick="unduh(\'xlsx\',this)"><i class="bi bi-file-earmark-excel"></i> Unduh Excel</button></div></div>' +
    (isAdmin() ? '<div class="card"><h3><i class="bi bi-lock"></i> Kunci Perhitungan</h3><p style="margin:0 0 14px;color:var(--muted)">Setelah semua TPS selesai, kunci agar data tidak bisa diubah operator. Koreksi admin tetap tercatat di riwayat.</p>' +
      '<div class="row"><button class="btn btn-primary" onclick="kunciSemuaUI(true)"><i class="bi bi-lock-fill"></i> Kunci semua TPS</button><button class="btn btn-ghost" onclick="kunciSemuaUI(false)"><i class="bi bi-unlock"></i> Buka kunci semua</button></div></div>' : '') + '</div>';
};
async function pratinjauBA(btn) {
  busy(btn, true, 'Menyiapkan');
  try {
    const html = await apiA('getBeritaAcaraHtml');
    busy(btn, false);
    openModal('Pratinjau Berita Acara', '<iframe class="paper-frame" id="paperFrame" title="Pratinjau berita acara"></iframe>' +
      '<div class="row" style="margin-top:12px"><button class="btn btn-primary spacer" onclick="unduh(\'pdf\',this)"><i class="bi bi-download"></i> PDF</button>' +
      '<button class="btn btn-soft spacer" onclick="unduh(\'xlsx\',this)"><i class="bi bi-file-earmark-excel"></i> Excel</button>' +
      '<button class="btn btn-ghost spacer" onclick="cetakFrame()"><i class="bi bi-printer"></i> Cetak</button></div>', { wide: true });
    $('#paperFrame').srcdoc = html;
  } catch (e) { busy(btn, false); errToast(e); }
}
function cetakFrame() {
  const f = $('#paperFrame');
  try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Cetak langsung tidak tersedia. Gunakan Unduh PDF lalu cetak dari file.', 'warn'); }
}
async function unduh(format, btn) {
  busy(btn, true, 'Membuat file');
  try {
    const r = await apiA('buatLaporan', format);
    const bin = atob(r.base64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
    const a = document.createElement('a'); a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    busy(btn, false); toast('File siap: ' + r.filename, 'success');
  } catch (e) { busy(btn, false); errToast(e); }
}
function kunciSemuaUI(kunci) {
  confirmBox(kunci ? 'Kunci semua TPS sebagai hasil final? Operator tidak bisa lagi mengubah data.' : 'Buka kunci semua TPS?', async () => {
    try { await apiA('kunciSemua', kunci); toast(kunci ? 'Semua TPS dikunci.' : 'Kunci dibuka.', 'success'); } catch (e) { errToast(e); }
  }, kunci ? 'Ya, kunci' : 'Ya, buka kunci');
}

/* ======================= HALAMAN: PENGATURAN (ADMIN) ======================= */
PAGES.pengaturan = async function (v) {
  AppState.P = await apiA('getPengaturan');
  paintPengaturan(v);
};
async function reloadPengaturan() {
  AppState.P = await apiA('getPengaturan');
  AppState.boot = await api('getBootstrap'); renderChrome();
  paintPengaturan($('#view'));
}
function setTab(t) { AppState.setTab = t; paintPengaturan($('#view')); }
function paintPengaturan(v) {
  const tab = AppState.setTab;
  const tabs = [['umum', 'bi-sliders', 'Umum'], ['calon', 'bi-person-badge', 'Calon'], ['tps', 'bi-building', 'TPS'], ['akun', 'bi-people', 'Akun'], ['log', 'bi-clock-history', 'Riwayat']];
  v.innerHTML = '<div class="page"><div class="page-head"><div><h2>Pengaturan</h2><small>Kelola identitas, calon, TPS, dan akun panitia</small></div></div><div class="tabs">' +
    tabs.map(t => '<button class="' + (tab === t[0] ? 'on' : '') + '" onclick="setTab(\'' + t[0] + '\')"><i class="bi ' + t[1] + '"></i> ' + t[2] + '</button>').join('') + '</div><div id="tabBody"></div></div>';
  const body = $('#tabBody');
  if (tab === 'umum') tabUmum(body); else if (tab === 'calon') tabCalon(body); else if (tab === 'tps') tabTps(body); else if (tab === 'akun') tabAkun(body); else tabLog(body);
}

/* Foto: perkecil di browser agar ringan */
function resizeImage(file, maxPx, mime) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const data = c.toDataURL(mime, 0.85);
        res({ b64: data.split(',')[1], mime: mime, preview: data });
      };
      img.onerror = () => rej(new Error('Foto tidak bisa dibaca.'));
      img.src = fr.result;
    };
    fr.onerror = () => rej(new Error('Foto tidak bisa dibaca.'));
    fr.readAsDataURL(file);
  });
}
async function pilihFoto(input, previewId, maxPx, mime) {
  const f = input.files && input.files[0]; if (!f) return;
  try {
    AppState.fotoTmp = await resizeImage(f, maxPx, mime);
    $('#' + previewId).innerHTML = '<img src="' + AppState.fotoTmp.preview + '" alt="">';
  } catch (e) { errToast(e); }
}

function tabUmum(b) {
  const c = AppState.P.config, logo = c.LOGO_URL;
  b.innerHTML = '<div class="card"><h3><i class="bi bi-image"></i> Logo Desa</h3><div class="row"><div class="avatar" id="logoPrev" style="width:76px;height:76px">' + fotoOrIcon(logo, 'bi-building') + '</div>' +
    '<label class="btn btn-soft btn-sm"><i class="bi bi-upload"></i> Pilih logo<input type="file" accept="image/*" hidden onchange="unggahLogo(this)"></label></div></div>' +
    '<form class="card" onsubmit="return simpanUmum(event)"><h3><i class="bi bi-sliders"></i> Identitas Pemilihan</h3>' +
    '<label class="field"><span>Nama desa</span><input class="input" id="uDesa" value="' + esc(c.DESA_NAMA) + '" required></label>' +
    '<label class="field"><span>Judul pemilihan</span><input class="input" id="uJudul" value="' + esc(c.JUDUL) + '" required></label>' +
    '<label class="field"><span>Ketua panitia (untuk berita acara)</span><input class="input" id="uKetua" value="' + esc(c.KETUA_PANITIA) + '"></label>' +
    '<label class="field"><span>Sekretaris (untuk berita acara)</span><input class="input" id="uSek" value="' + esc(c.SEKRETARIS) + '"></label>' +
    '<label class="switch"><div><b>Layar hasil publik aktif</b><small style="display:block;color:var(--muted)">Jika mati, tombol layar di halaman login disembunyikan dan layar tanpa login ditolak.</small></div>' +
    '<input type="checkbox" id="uLayar" ' + (String(c.LAYAR_AKTIF).toUpperCase() === 'TRUE' ? 'checked' : '') + '></label>' +
    '<button class="btn btn-primary btn-block" id="btnUmum" type="submit"><i class="bi bi-save"></i> Simpan</button></form>';
}
async function unggahLogo(input) {
  const f = input.files && input.files[0]; if (!f) return;
  try {
    const img = await resizeImage(f, 400, 'image/png');
    $('#logoPrev').innerHTML = '<img src="' + img.preview + '" alt="">';
    await apiA('uploadFoto', 'logo', '', img.b64, img.mime);
    toast('Logo tersimpan.', 'success'); await reloadPengaturan();
  } catch (e) { errToast(e); }
}
async function simpanUmum(ev) {
  ev.preventDefault(); const btn = $('#btnUmum'); busy(btn, true, 'Menyimpan');
  try {
    await apiA('simpanKonfigurasi', { DESA_NAMA: $('#uDesa').value, JUDUL: $('#uJudul').value, KETUA_PANITIA: $('#uKetua').value, SEKRETARIS: $('#uSek').value, LAYAR_AKTIF: $('#uLayar').checked });
    toast('Pengaturan tersimpan.', 'success'); await reloadPengaturan();
  } catch (e) { busy(btn, false); errToast(e); }
  return false;
}

/* --- Calon --- */
function tabCalon(b) {
  const L = AppState.P.calon;
  b.innerHTML = '<div class="row" style="margin-bottom:12px"><span class="spacer" style="color:var(--muted)">' + L.length + ' calon</span><button class="btn btn-primary btn-sm" onclick="formCalon(\'\')"><i class="bi bi-plus-lg"></i> Tambah Calon</button></div>' +
    (L.length ? '<div class="list">' + L.map((c, i) => '<div class="item"><div class="avatar" style="color:' + colorOf(i) + '">' + (c.foto_url ? fotoOrIcon(c.foto_url) : esc(c.no_urut)) + '</div><div class="grow"><b>No. ' + esc(c.no_urut) + ' — ' + esc(c.nama) + '</b><small>' +
      (String(c.aktif).toUpperCase() === 'TRUE' ? 'Aktif' : 'Nonaktif (tidak tampil)') + '</small></div><button class="btn btn-soft btn-sm" onclick="formCalon(\'' + c.id + '\')" aria-label="Ubah"><i class="bi bi-pencil"></i></button>' +
      '<button class="btn btn-danger btn-sm" onclick="hapusCalonUI(\'' + c.id + '\')" aria-label="Hapus"><i class="bi bi-trash"></i></button></div>').join('') + '</div>' : emptyBox('bi-person-badge', 'Belum ada calon.'));
}
function formCalon(id) {
  const P = AppState.P, c = id ? P.calon.find(x => x.id === id) : null;
  AppState.fotoTmp = null;
  const nextNo = c ? c.no_urut : Math.max(0, ...P.calon.map(x => Number(x.no_urut))) + 1;
  openModal(c ? 'Ubah Calon' : 'Tambah Calon',
    '<form onsubmit="return simpanCalonForm(event,\'' + (c ? c.id : '') + '\')"><div class="row" style="margin-bottom:14px"><div class="avatar" id="fotoPrev" style="width:92px;height:92px">' + fotoOrIcon(c ? c.foto_url : '') + '</div>' +
    '<div><label class="btn btn-soft btn-sm"><i class="bi bi-image"></i> Pilih foto<input type="file" accept="image/*" hidden onchange="pilihFoto(this,\'fotoPrev\',700,\'image/jpeg\')"></label><small style="display:block;color:var(--muted);margin-top:6px">Foto otomatis diperkecil.</small></div></div>' +
    '<label class="field"><span>Nomor urut</span><input class="input" id="cNo" inputmode="numeric" value="' + esc(nextNo) + '" required></label>' +
    '<label class="field"><span>Nama calon</span><input class="input" id="cNama" value="' + esc(c ? c.nama : '') + '" required></label>' +
    '<label class="switch"><span>Aktif (tampil di input & layar)</span><input type="checkbox" id="cAktif" ' + (!c || String(c.aktif).toUpperCase() === 'TRUE' ? 'checked' : '') + '></label>' +
    '<button class="btn btn-primary btn-block" id="btnCalon" type="submit"><i class="bi bi-save"></i> Simpan</button></form>');
}
async function simpanCalonForm(ev, id) {
  ev.preventDefault(); const btn = $('#btnCalon'); busy(btn, true, 'Menyimpan');
  try {
    const r = await apiA('simpanCalon', { id: id, no_urut: num($('#cNo').value), nama: $('#cNama').value, aktif: $('#cAktif').checked });
    if (AppState.fotoTmp) await apiA('uploadFoto', 'calon', r.id, AppState.fotoTmp.b64, AppState.fotoTmp.mime);
    AppState.fotoTmp = null; closeModal(); toast('Calon tersimpan.', 'success'); await reloadPengaturan();
  } catch (e) { busy(btn, false); errToast(e); }
  return false;
}
function hapusCalonUI(id) {
  const c = AppState.P.calon.find(x => x.id === id);
  confirmBox('Hapus calon "' + c.nama + '"?', async () => {
    try { await apiA('hapusCalon', id); toast('Calon dihapus.', 'success'); await reloadPengaturan(); } catch (e) { errToast(e); }
  }, 'Hapus', true);
}

/* --- TPS --- */
function tabTps(b) {
  const L = AppState.P.tps;
  b.innerHTML = '<div class="row" style="margin-bottom:12px"><span class="spacer" style="color:var(--muted)">' + L.length + ' TPS</span><button class="btn btn-primary btn-sm" onclick="formTps(\'\')"><i class="bi bi-plus-lg"></i> Tambah TPS</button></div>' +
    (L.length ? '<div class="list">' + L.map(t => {
      const lock = String(t.terkunci).toUpperCase() === 'TRUE';
      return '<div class="item"><div class="avatar"><i class="bi bi-building"></i></div><div class="grow"><b>' + esc(t.nama_tps) + '</b><small>DPT ' + fmt(t.dpt) + ' • ' + esc(t.status) + (lock ? ' • terkunci' : '') + '</small></div>' +
        '<button class="btn btn-ghost btn-sm" onclick="kunciTpsUI(\'' + t.id + '\',' + (!lock) + ')" aria-label="' + (lock ? 'Buka kunci' : 'Kunci') + '"><i class="bi ' + (lock ? 'bi-lock-fill' : 'bi-unlock') + '"></i></button>' +
        '<button class="btn btn-soft btn-sm" onclick="formTps(\'' + t.id + '\')" aria-label="Ubah"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-danger btn-sm" onclick="hapusTpsUI(\'' + t.id + '\')" aria-label="Hapus"><i class="bi bi-trash"></i></button></div>';
    }).join('') + '</div>' : emptyBox('bi-building', 'Belum ada TPS.'));
}
function formTps(id) {
  const t = id ? AppState.P.tps.find(x => x.id === id) : null;
  const next = 'TPS ' + (AppState.P.tps.length + 1);
  openModal(t ? 'Ubah TPS' : 'Tambah TPS', '<form onsubmit="return simpanTpsForm(event,\'' + (t ? t.id : '') + '\')">' +
    '<label class="field"><span>Nama TPS</span><input class="input" id="tNama" value="' + esc(t ? t.nama_tps : next) + '" required></label>' +
    '<label class="field"><span>Jumlah DPT di TPS ini</span><input class="input" id="tDpt" inputmode="numeric" value="' + esc(t ? t.dpt : '') + '" required></label>' +
    '<button class="btn btn-primary btn-block" id="btnTps" type="submit"><i class="bi bi-save"></i> Simpan</button></form>');
}
async function simpanTpsForm(ev, id) {
  ev.preventDefault(); const btn = $('#btnTps'); busy(btn, true, 'Menyimpan');
  try { await apiA('simpanTps', { id: id, nama: $('#tNama').value, dpt: num($('#tDpt').value) }); closeModal(); toast('TPS tersimpan.', 'success'); await reloadPengaturan(); }
  catch (e) { busy(btn, false); errToast(e); }
  return false;
}
function hapusTpsUI(id) {
  const t = AppState.P.tps.find(x => x.id === id);
  confirmBox('Hapus ' + t.nama_tps + '?', async () => { try { await apiA('hapusTps', id); toast('TPS dihapus.', 'success'); await reloadPengaturan(); } catch (e) { errToast(e); } }, 'Hapus', true);
}
async function kunciTpsUI(id, kunci) {
  try { await apiA('kunciTps', id, kunci); toast(kunci ? 'TPS dikunci.' : 'Kunci dibuka.', 'success'); await reloadPengaturan(); } catch (e) { errToast(e); }
}

/* --- Akun --- */
function tabAkun(b) {
  const L = AppState.P.pengguna, tpsMap = {}; AppState.P.tps.forEach(t => { tpsMap[t.id] = t.nama_tps; });
  b.innerHTML = '<div class="row" style="margin-bottom:12px"><span class="spacer" style="color:var(--muted)">' + L.length + ' akun panitia</span><button class="btn btn-primary btn-sm" onclick="formAkun(\'\')"><i class="bi bi-plus-lg"></i> Tambah Akun</button></div>' +
    '<div class="list">' + L.map(u => '<div class="item"><div class="avatar"><i class="bi ' + (u.peran === 'admin' ? 'bi-shield-lock' : 'bi-person') + '"></i></div><div class="grow"><b>' + esc(u.nama) + '</b><small>@' + esc(u.username) + ' • ' + (u.peran === 'admin' ? 'Admin' : 'Operator: ' +
      (String(u.id_tps).split(',').filter(Boolean).map(i => tpsMap[i] || '?').join(', ') || 'belum ada TPS')) + (u.aktif ? '' : ' • nonaktif') + '</small></div>' +
      '<button class="btn btn-soft btn-sm" onclick="formAkun(\'' + u.id + '\')" aria-label="Ubah"><i class="bi bi-pencil"></i></button>' +
      (u.id === AppState.user.id ? '' : '<button class="btn btn-danger btn-sm" onclick="hapusAkunUI(\'' + u.id + '\')" aria-label="Hapus"><i class="bi bi-trash"></i></button>') + '</div>').join('') + '</div>';
}
function formAkun(id) {
  const u = id ? AppState.P.pengguna.find(x => x.id === id) : null;
  const sel = u ? String(u.id_tps).split(',') : [];
  openModal(u ? 'Ubah Akun' : 'Tambah Akun', '<form onsubmit="return simpanAkunForm(event,\'' + (u ? u.id : '') + '\')">' +
    '<label class="field"><span>Nama lengkap</span><input class="input" id="aNama" value="' + esc(u ? u.nama : '') + '" required></label>' +
    '<label class="field"><span>Username</span><input class="input" id="aUser" autocapitalize="none" value="' + esc(u ? u.username : '') + '" required><small>Huruf kecil/angka, 3-30 karakter.</small></label>' +
    '<label class="field"><span>PIN / Password</span><input class="input" id="aPin" type="text" autocomplete="off" placeholder="' + (u ? 'Kosongkan jika tidak diubah' : 'Minimal 4 karakter') + '"></label>' +
    '<label class="field"><span>Peran</span><select class="input" id="aPeran" onchange="aksiPeran()"><option value="operator" ' + (u && u.peran === 'operator' ? 'selected' : '') + '>Operator (input suara)</option><option value="admin" ' + (u && u.peran === 'admin' ? 'selected' : (u ? '' : '')) + '>Admin (semua fitur)</option></select></label>' +
    '<div class="field" id="aTpsBox"><span>TPS yang ditugaskan</span><div class="checks">' + AppState.P.tps.map(t => '<label><input type="checkbox" name="aTps" value="' + t.id + '" ' + (sel.indexOf(t.id) >= 0 ? 'checked' : '') + '>' + esc(t.nama_tps) + '</label>').join('') + '</div></div>' +
    '<label class="switch"><span>Akun aktif</span><input type="checkbox" id="aAktif" ' + (!u || u.aktif ? 'checked' : '') + '></label>' +
    '<button class="btn btn-primary btn-block" id="btnAkun" type="submit"><i class="bi bi-save"></i> Simpan</button></form>');
  aksiPeran();
}
function aksiPeran() { const b = $('#aTpsBox'); if (b) b.hidden = $('#aPeran').value !== 'operator'; }
async function simpanAkunForm(ev, id) {
  ev.preventDefault(); const btn = $('#btnAkun'); busy(btn, true, 'Menyimpan');
  const tps = Array.from(document.querySelectorAll('input[name="aTps"]:checked')).map(x => x.value);
  try {
    await apiA('simpanPengguna', { id: id, nama: $('#aNama').value, username: $('#aUser').value, pin: $('#aPin').value, peran: $('#aPeran').value, id_tps: tps, aktif: $('#aAktif').checked });
    closeModal(); toast('Akun tersimpan.', 'success'); await reloadPengaturan();
  } catch (e) { busy(btn, false); errToast(e); }
  return false;
}
function hapusAkunUI(id) {
  const u = AppState.P.pengguna.find(x => x.id === id);
  confirmBox('Hapus akun "' + u.nama + '"?', async () => { try { await apiA('hapusPengguna', id); toast('Akun dihapus.', 'success'); await reloadPengaturan(); } catch (e) { errToast(e); } }, 'Hapus', true);
}

/* --- Riwayat --- */
async function tabLog(b) {
  b.innerHTML = skeleton();
  try {
    const L = await apiA('getLog', 100);
    b.innerHTML = L.length ? '<div class="card" style="padding:0"><div class="table-wrap" style="border:0"><table class="tbl"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Detail</th></tr></thead><tbody>' +
      L.map(x => '<tr><td>' + esc(x.waktu) + '</td><td style="text-align:left">' + esc(x.user) + '</td><td style="text-align:left">' + esc(x.aksi) + '</td><td style="text-align:left;white-space:normal;min-width:180px">' + esc(x.detail) + '</td></tr>').join('') +
      '</tbody></table></div></div><p style="color:var(--muted);font-size:12.5px">Menampilkan 100 aktivitas terakhir.</p>' : emptyBox('bi-clock-history', 'Belum ada aktivitas.');
  } catch (e) { errToast(e); }
}

/* ======================= INISIALISASI ======================= */
function hideSplash() { const s = $('#splash'); s.classList.add('out'); setTimeout(() => { s.hidden = true; }, 300); }

async function init() {
  applyTheme(store.get('rcp_theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  if (!apiConfigured()) {
    hideSplash();
    $('#view').innerHTML = '<div class="page">' + emptyBox('bi-gear', '<b>GAS_URL belum diisi.</b><br>Buka berkas <code>js/config.js</code>, isi dengan URL Web App Apps Script (berakhiran /exec), lalu unggah ulang ke GitHub.') + '</div>';
    return;
  }
  warmUpServer();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) warmUpServer(); });
  let cb = null, cu = null;
  try { cb = JSON.parse(store.get('rcp_boot') || 'null'); cu = JSON.parse(store.get('rcp_user') || 'null'); } catch (e) { /* abaikan */ }
  if (cb) AppState.boot = cb;
  const tk = store.get('rcp_token');
  if (tk && cu) {                                   // sudah pernah login: langsung tampil, validasi di latar belakang
    AppState.token = tk; AppState.user = cu; hideSplash(); navigateTo('dashboard');
    api('getSession', tk).then(r => {
      if (r.boot) { AppState.boot = r.boot; saveBoot(); renderChrome(); }
      if (!r.valid) forceLogout('Sesi berakhir, silakan masuk lagi.');
    }).catch(() => {});
    return;
  }
  if (cb) {                                         // belum login, tetapi identitas desa sudah tersimpan
    hideSplash(); navigateTo('login');
    api('getBootstrap').then(b => {
      if (JSON.stringify(b) !== JSON.stringify(AppState.boot)) {
        AppState.boot = b; saveBoot();
        const u = $('#lgUser'); if (AppState.page === 'login' && u && !u.value) PAGES.login($('#view'));
      }
    }).catch(() => {});
    return;
  }
  try { AppState.boot = await api('getBootstrap'); saveBoot(); }
  catch (e) { toast('Server belum siap: ' + e.message, 'error'); }
  hideSplash(); navigateTo('login');
}
window.addEventListener('beforeunload', () => { try { if (AppState.input) flushTally(false); } catch (e) { /* abaikan */ } });
document.addEventListener('DOMContentLoaded', init);
