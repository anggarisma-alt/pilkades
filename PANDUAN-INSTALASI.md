# Panduan Instalasi — Real Count Pilkades

Dua bagian: **Backend** (Google Apps Script) lalu **Frontend** (GitHub Pages). Kerjakan berurutan.

---

## BAGIAN 1 — Backend (Google Apps Script)

1. Buka https://script.google.com lalu klik **Proyek baru**.
2. Ganti nama `Code.gs` menjadi `Kode`, hapus isinya, tempel seluruh isi berkas **Kode.gs**.
3. (Disarankan) **Pengaturan proyek** > centang *Tampilkan file manifes appsscript.json*, lalu ganti isinya dengan berkas **appsscript.json**.
4. Pilih fungsi `setupAppEnvironment` > **Jalankan** > izinkan akses Google. Lakukan **sekali saja**. Hasilnya: Spreadsheet database, folder foto di Drive, dan data contoh.
5. **Terapkan** > **Penerapan baru** > jenis **Aplikasi web**
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**
6. **Salin URL berakhiran `/exec`**.
7. Uji: tempel URL itu di browser. Harus muncul teks JSON `{"success":true,...}`, bukan halaman login Google.

Login awal: username `admin`, PIN `123456`. Segera ganti di Pengaturan > Akun.

> Setiap kali `Kode.gs` diubah: **Terapkan > Kelola penerapan > ikon pensil > Versi: Versi baru > Terapkan**. Jangan buat "Penerapan baru", karena URL `/exec` akan berubah dan frontend berhenti bekerja.

---

## BAGIAN 2 — Frontend (GitHub Pages)

### Folder kerja
Ekstrak `pilkades-frontend.zip`. Folder hasil ekstraksi harus langsung berisi `index.html`, `css`, `js`. **Folder inilah yang dipakai untuk `git init`**, jangan masuk lebih dalam dan jangan naik satu level.

### Langkah 0 — Isi URL backend
Buka `js/config.js` dengan Notepad, ganti `PASTE_URL_EXEC_DI_SINI` dengan URL `/exec` dari Bagian 1, simpan.

### Langkah 1 — Pasang Git
- Windows: https://git-scm.com/download/win (install dengan pengaturan default), lalu buka **PowerShell**.
- Mac: buka Terminal, ketik `git --version` (macOS akan menawarkan instalasi).
- Cek: `git --version`

### Langkah 2 — Akun GitHub
Daftar di https://github.com. Username Anda menjadi bagian alamat situs: `username.github.io`.

### Langkah 3 — Identitas Git (sekali per komputer)
```
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```

### Langkah 4 — Buat repository
Di github.com: tombol **+** > **New repository** > beri nama (mis. `hitung-suara`) > pilih **Public** > **jangan** centang README/.gitignore/license > **Create repository**. Biarkan halamannya terbuka.

### Langkah 5 — Masuk ke folder kerja dan cek isinya
Di File Explorer buka folder hasil ekstraksi, klik address bar, ketik `powershell`, Enter. Lalu:
```
dir
```
Harus terlihat **`index.html`**, folder `css`, dan folder `js`. Jika yang terlihat hanya satu folder lain, berarti Anda satu level terlalu tinggi: masuk dulu ke folder itu (`cd namafolder`) dan ulangi `dir`. **Jangan lanjut sebelum `index.html` terlihat.**

### Langkah 6 — Kirim ke GitHub (satu per satu)
```
git init
git add .
git commit -m "Upload pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```
Ganti `USERNAME` dan `NAMA-REPO`. Perhatikan titik pada `git add .`.

Saat diminta password, tempel **Personal Access Token** (bukan password akun). Layar terlihat kosong saat paste, itu normal. Lalu tekan Enter.

**Membuat token:** https://github.com/settings/tokens > *Generate new token (classic)* > centang **repo** > Generate > salin `ghp_...` (hanya tampil sekali).
Alternatif tanpa terminal: **GitHub Desktop** (https://desktop.github.com) > Add Local Repository > Publish.

Tanda berhasil: muncul `* [new branch] main -> main`.

### Langkah 7 — Aktifkan Pages
Repo di GitHub > **Settings** > **Pages** > Source: **Deploy from a branch** > Branch **main** / **(root)** > **Save**. Tunggu 1-2 menit. Alamatnya: `https://USERNAME.github.io/NAMA-REPO/`. Centang **Enforce HTTPS**.

Cek halaman repo: `index.html` harus ada di daftar teratas, bukan di dalam folder.

### Cara memperbarui
Ubah berkas, lalu dari folder yang sama:
```
git add .
git commit -m "Perubahan"
git push
```
Jika masih tampil versi lama: **Ctrl+Shift+R**.

---

## Pemecahan masalah

| Gejala | Penyebab | Solusi |
|---|---|---|
| Muncul tulisan "GAS_URL belum diisi" | `js/config.js` belum diedit | Isi URL `/exec`, push ulang |
| "Server membalas ... bukan JSON" | Akses penerapan bukan **Siapa saja**, atau URL salah | Terapkan ulang dengan akses **Siapa saja**, periksa URL |
| Setelah ubah `Kode.gs`, hasil tidak berubah | Belum ada versi baru | Kelola penerapan > pensil > **Versi baru** |
| 404 di GitHub Pages | `index.html` tidak di root repo | Pastikan `git init` dijalankan di folder yang berisi `index.html` |
| Halaman tanpa warna/gaya | Folder `css`/`js` tidak ikut | Cek repo di github.com: harus ada folder `css` dan `js` |
| `Password authentication is not supported` | GitHub menolak password biasa | Pakai Personal Access Token |
| `remote origin already exists` | Sudah pernah disambungkan | Lewati langkah itu, lanjut `git push` |
| `LF will be replaced by CRLF` | Peringatan format baris Windows | Abaikan |

---

## BAGIAN 3 — Hari perhitungan

- **Operator (HP Android):** buka alamat GitHub Pages > masuk > **Input Suara** > pilih TPS > ketuk kartu calon (+1). **Undo** membatalkan ketukan terakhir. Setelah selesai, **Tandai Selesai**.
- **Proyektor:** buka alamat yang sama di laptop > **Buka Layar Hasil** di halaman login (tanpa login). Sentuh layar atau gerakkan mouse untuk memunculkan kontrol (Gabungan / Per TPS / Otomatis, layar penuh, tema).
- **Akhir:** **Laporan** > Pratinjau, unduh PDF/Excel, lalu **Kunci semua TPS**.

Catatan: ketukan operator dikirim otomatis dengan penanda unik. Bila sinyal putus, aplikasi mencoba lagi dan server membuang kiriman ganda, jadi suara tidak terhitung dua kali.
