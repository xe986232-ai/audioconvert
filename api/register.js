// api/register.js
//
// Endpoint buat daftarin slash command "/convert" ke Discord — tinggal
// BUKA URL INI DI BROWSER HP, gak perlu command prompt / install apa-apa.
//
// Cara pakai (SETELAH bot udah ke-deploy di Vercel):
//   Buka di browser:
//   https://nama-project-kamu.vercel.app/api/register?secret=ISI_DENGAN_REGISTER_SECRET_KAMU
//
// "ISI_DENGAN_REGISTER_SECRET_KAMU" itu nilai yang kamu isi sendiri di
// Environment Variable REGISTER_SECRET waktu setup di Vercel. Ini cuma
// buat jaga-jaga biar orang lain gak bisa iseng buka endpoint ini juga
// (karena endpoint ini kebuka ke publik selama URL-nya ketebak).
//
// Cuma perlu dibuka SEKALI. Perlu diulang lagi cuma kalau kamu ubah
// definisi command-nya (misal nambah format baru).

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const REGISTER_SECRET = process.env.REGISTER_SECRET;

const commands = [
  {
    name: 'convert',
    description: 'Convert file audio ke format lain (mp3, wav, flac, ogg, m4a)',
    type: 1, // CHAT_INPUT
    options: [
      {
        name: 'file',
        description: 'File audio yang mau di-convert',
        type: 11, // ATTACHMENT
        required: true,
      },
      {
        name: 'format',
        description: 'Format tujuan',
        type: 3, // STRING
        required: true,
        choices: [
          { name: 'MP3', value: 'mp3' },
          { name: 'WAV', value: 'wav' },
          { name: 'FLAC', value: 'flac' },
          { name: 'OGG', value: 'ogg' },
          { name: 'M4A', value: 'm4a' },
        ],
      },
    ],
  },
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  if (!APP_ID || !BOT_TOKEN || !REGISTER_SECRET) {
    res.status(500).send(
      '❌ Env variable belum lengkap di Vercel (butuh DISCORD_APP_ID, DISCORD_BOT_TOKEN, REGISTER_SECRET).'
    );
    return;
  }

  const suppliedSecret = req.query.secret;
  if (suppliedSecret !== REGISTER_SECRET) {
    res.status(401).send('❌ Secret salah atau belum diisi di URL (?secret=...).');
    return;
  }

  const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

  const discordRes = await fetch(url, {
    method: 'PUT', // PUT = overwrite semua global command dengan definisi di atas
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (discordRes.ok) {
    res
      .status(200)
      .send(
        '✅ Slash command "/convert" berhasil didaftarkan. Biasanya muncul di Discord dalam beberapa menit (maks ~1 jam).'
      );
  } else {
    const errText = await discordRes.text();
    res.status(502).send(`❌ Gagal daftar command (${discordRes.status}): ${errText}`);
  }
}
