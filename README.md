# Discord Convert Bot

Bot Discord buat convert format audio (`/convert`), jalan di atas Vercel
(serverless, gratis, gak perlu server nyala 24 jam).

**Semua langkah di bawah ini bisa dikerjakan lewat browser HP — gak butuh
laptop, command prompt, atau install Node.js sama sekali.**

## Struktur folder

```
discord-convert-bot/
├── api/
│   ├── interactions.js      <- endpoint utama, dipanggil Discord tiap ada interaction
│   └── register.js          <- endpoint buat daftarin "/convert" (buka sekali di browser)
├── lib/
│   └── convert.js           <- logic download + convert ffmpeg
├── vercel.json               <- config timeout function
├── package.json
└── .env.example
```

## Setup dari nol (full HP, gak ada command line)

### 1. Bikin Discord Application

1. Buka https://discord.com/developers/applications di browser HP
2. Klik **New Application**, kasih nama bebas
3. Di tab **General Information**, catat **Application ID** dan **Public Key**
4. Di tab **Bot**, klik **Reset Token** buat dapetin **Bot Token** (simpan baik-baik, cuma muncul sekali)
5. Masih di tab **Bot**, pastikan **Public Bot** aktif kalau mau bot ini bisa diundang ke server lain juga

### 2. Upload kode ini ke GitHub (lewat browser, gak perlu git)

1. Buka https://github.com, login/daftar
2. Klik **New repository**, kasih nama (misal `discord-convert-bot`), **Create repository**
3. Di halaman repo kosong itu, klik link **"uploading an existing file"**
4. Extract/ekstrak isi zip ini di HP kamu dulu (pakai app file manager / ZIP Extractor bawaan), lalu upload SEMUA isinya (folder `api/`, `lib/`, dan file-file lain) ke halaman upload GitHub tadi — drag semua file & foldernya sekaligus, GitHub otomatis pertahankan struktur foldernya
5. Scroll ke bawah, klik **Commit changes**

### 3. Deploy ke Vercel

1. Buka https://vercel.com, sign up/login (bisa langsung pakai akun GitHub kamu)
2. Klik **Add New Project**, pilih repo GitHub yang tadi kamu upload
3. Sebelum klik Deploy, buka bagian **Environment Variables**, tambahin 4 variable ini satu-satu (nilainya dari step 1, kecuali yang terakhir bebas kamu isi sendiri):
   - `DISCORD_APP_ID`
   - `DISCORD_PUBLIC_KEY`
   - `DISCORD_BOT_TOKEN`
   - `REGISTER_SECRET` — isi bebas, semacam kata sandi buatan kamu sendiri (contoh: `rahasia123`)
4. Klik **Deploy**
5. Setelah selesai, Vercel kasih kamu URL (misal `https://nama-project-kamu.vercel.app`)

### 4. Daftarin slash command — cukup buka 1 link di browser

Buka URL ini di browser HP (ganti bagian yang perlu diganti):

```
https://nama-project-kamu.vercel.app/api/register?secret=ISI_REGISTER_SECRET_KAMU
```

Kalau berhasil, muncul teks konfirmasi di layar browser. Command `/convert`
biasanya muncul di Discord dalam beberapa menit. Endpoint ini cuma perlu
dibuka ulang kalau nanti kamu ubah pilihan formatnya di `api/register.js`.

### 5. Hubungkan URL Vercel ke Discord

1. Balik ke Discord Developer Portal -> App kamu -> **General Information**
2. Di field **Interactions Endpoint URL**, isi:
   ```
   https://nama-project-kamu.vercel.app/api/interactions
   ```
3. Kalau Discord berhasil verifikasi (endpoint kita jawab PING dengan benar), field-nya kesimpen otomatis. Kalau error, cek lagi apakah env variable di Vercel udah bener dan deploy udah selesai.

### 6. Invite bot ke server & test

1. Masih di Developer Portal -> tab **OAuth2** -> **URL Generator**
2. Centang scope `applications.commands` dan `bot`
3. Di permission bot, minimal centang **Attach Files**
4. Copy URL yang dihasilkan, buka di browser, invite ke server kamu
5. Di Discord, coba `/convert` -> attach file audio -> pilih format tujuan -> lihat hasilnya

## Kalau nanti mau ubah kode

Cukup edit file langsung di GitHub lewat browser (tombol pensil ✏️ di
halaman file), commit — Vercel otomatis re-deploy tiap ada commit baru ke
branch utama. Gak perlu install apa-apa di HP.

## Cara kerja singkat

- Discord kirim semua interaction (PING, slash command) sebagai HTTP POST ke `/api/interactions`
- Kita verifikasi signature-nya dulu (wajib, biar cuma Discord yang bisa manggil endpoint ini)
- Untuk `/convert`: kita balas "lagi diproses" dalam <3 detik (aturan Discord), lalu proses convert beneran jalan di background pakai `waitUntil`, dan hasilnya dikirim lewat "follow-up message" begitu selesai
- `/api/register`: endpoint terpisah yang dibuka manual sekali dari browser buat daftarin command `/convert` ke Discord, dilindungi `REGISTER_SECRET` biar gak sembarang orang bisa manggil-manggil

## Batasan yang perlu diinget

- Maks ukuran file: **20MB** (bisa diubah di `api/interactions.js`, cari `MAX_SIZE_BYTES`)
- Timeout function: **60 detik** (limit Vercel Hobby plan) — file yang lebih besar/panjang mungkin gak keburu ke-convert
- Vercel Hobby plan = **non-commercial only**, sesuai untuk tools gratis komunitas
- Jaga `REGISTER_SECRET` dan `DISCORD_BOT_TOKEN` — jangan pernah dishare atau ditulis di tempat publik

## Kalau mau nambah format lain

Edit pilihan `choices` di `api/register.js` (lewat browser di GitHub), commit,
tunggu Vercel selesai re-deploy, lalu buka lagi link `/api/register?secret=...`
buat update command-nya di Discord.
