// api/interactions.js
//
// Ini "otak" bot-nya. Discord kirim SEMUA interaction (PING verifikasi,
// slash command, dll) sebagai HTTP POST ke endpoint ini.
//
// Alurnya:
//   1. Verifikasi signature request (WAJIB - biar gak sembarang orang bisa
//      manggil endpoint ini ngaku-ngaku dari Discord)
//   2. Kalau PING -> balas PONG (Discord pakai ini buat verifikasi URL awal)
//   3. Kalau command "/convert" -> balas "sedang diproses" dulu (deferred),
//      lalu di background: download file, convert, kirim hasilnya lewat
//      webhook follow-up message.

import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { waitUntil } from '@vercel/functions';
import JSZip from 'jszip';
import { convertAudio } from '../lib/convert.js';

export const config = {
  api: {
    bodyParser: false, // WAJIB false - kita butuh raw body buat verifikasi signature
  },
};

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const APP_ID = process.env.DISCORD_APP_ID;
// Kalau diisi, bot cuma mau jalan di channel ini aja (ID channel Discord).
// Kosongin/hapus env var ini kalau mau bot bisa dipakai di semua channel lagi.
const ALLOWED_CHANNEL_ID = process.env.ALLOWED_CHANNEL_ID;

// Baca raw body dari request stream (gak boleh pakai req.body biasa,
// karena signature verification butuh bytes PERSIS seperti yang dikirim Discord)
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const rawBody = await getRawBody(req);

  const isValid = verifyKey(rawBody, signature, timestamp, PUBLIC_KEY);
  if (!isValid) {
    res.status(401).send('Bad request signature');
    return;
  }

  const interaction = JSON.parse(rawBody.toString('utf-8'));

  // 1. Discord ping buat verifikasi endpoint URL kita pas pertama kali di-set
  if (interaction.type === InteractionType.PING) {
    res.status(200).json({ type: InteractionResponseType.PONG });
    return;
  }

  // 2. Slash command
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const commandName = interaction.data.name;

    if (commandName === 'convert') {
      // Kalau bot dibatasin cuma buat 1 channel, tolak di sini SEBELUM
      // deferred response, biar balesnya cepet (<3 detik) dan gak perlu
      // proses download/convert sama sekali.
      if (ALLOWED_CHANNEL_ID && interaction.channel_id !== ALLOWED_CHANNEL_ID) {
        res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Command ini cuma bisa dipakai di <#${ALLOWED_CHANNEL_ID}>.`,
            flags: 64, // ephemeral - cuma keliatan sama yang manggil command
          },
        });
        return;
      }

      // Balas dulu "lagi diproses" dalam <3 detik (wajib dari Discord),
      // proses convert yang makan waktu lebih lama kita lakuin di background
      res.status(200).json({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      });

      // waitUntil = biar function tetap "hidup" buat nyelesein kerjaan
      // di background SETELAH response di atas udah dikirim ke Discord
      waitUntil(handleConvertCommand(interaction));
      return;
    }

    res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❓ Command gak dikenali.' },
    });
    return;
  }

  res.status(400).send('Unknown interaction type');
}

async function handleConvertCommand(interaction) {
  const token = interaction.token;
  const followUpUrl = `https://discord.com/api/v10/webhooks/${APP_ID}/${token}/messages/@original`;

  try {
    const options = interaction.data.options;
    const targetFormat = options.find((o) => o.name === 'format').value;
    const attachmentId = options.find((o) => o.name === 'file').value;
    const attachment = interaction.data.resolved.attachments[attachmentId];

    // Validasi ukuran file - jaga-jaga biar gak kelamaan proses & kena timeout
    const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
    if (attachment.size > MAX_SIZE_BYTES) {
      await editOriginalMessage(followUpUrl, {
        content: `❌ File kegedean (${(attachment.size / 1024 / 1024).toFixed(1)}MB). Maks 20MB ya.`,
      });
      return;
    }

    const { sourceBuffer, sourceExt, resultBuffer } = await convertAudio(attachment.url, targetFormat);

    // File hasil convert dibungkus .zip biar Discord nampilinnya sebagai
    // file card biasa (ada tombol download jelas), bukan inline audio
    // player otomatis yang dipaksa Discord buat semua ekstensi audio.
    // File ASLI dikirim apa adanya (gak di-zip) biar tetep bisa
    // di-preview/diputar langsung di chat kayak biasa.
    const convertedFileName = `converted.${targetFormat}`;
    const zip = new JSZip();
    zip.file(convertedFileName, resultBuffer);
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const zipName = `converted-${targetFormat}.zip`;

    const originalFileName = attachment.filename || `original${sourceExt || ''}`;

    await editOriginalMessage(
      followUpUrl,
      {
        content: `✅ Berhasil di-convert ke **${targetFormat.toUpperCase()}**\nFile atas = aslinya, file bawah (.zip) = hasil convert-nya (biar bisa langsung di-download, bukan diputer otomatis).`,
      },
      [
        { buffer: sourceBuffer, filename: originalFileName },
        { buffer: zipBuffer, filename: zipName },
      ]
    );
  } catch (err) {
    console.error('Convert error:', err);
    await editOriginalMessage(followUpUrl, {
      content: `❌ Gagal convert file: ${err.message || 'Terjadi kesalahan tidak dikenal'}`,
    });
  }
}

// Edit pesan "lagi diproses" tadi jadi hasil akhir (teks doang, atau teks + satu/banyak file lampiran)
async function editOriginalMessage(url, jsonPayload, files) {
  if (!files || files.length === 0) {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonPayload),
    });
    return;
  }

  const form = new FormData();
  form.append('payload_json', JSON.stringify(jsonPayload));
  files.forEach((file, index) => {
    form.append(`files[${index}]`, new Blob([file.buffer]), file.filename);
  });

  await fetch(url, {
    method: 'PATCH',
    body: form,
  });
}
