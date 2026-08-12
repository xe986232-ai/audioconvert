// lib/convert.js
//
// Logic inti: download file audio dari URL Discord, convert pakai ffmpeg,
// balikin file ASLI (sebelum convert) dan file HASIL convert sebagai Buffer.
//
// Pakai /tmp buat file sementara karena itu satu-satunya folder yang bisa
// ditulis di lingkungan serverless Vercel.

import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

ffmpeg.setFfmpegPath(ffmpegPath);

export async function convertAudio(sourceUrl, targetFormat) {
  const jobId = randomUUID();
  const tmpDir = os.tmpdir();

  // Ambil ekstensi asli dari URL biar ffmpeg tau format sumbernya
  const sourceExt = path.extname(new URL(sourceUrl).pathname) || '.tmp';
  const inputPath = path.join(tmpDir, `${jobId}-input${sourceExt}`);
  const outputPath = path.join(tmpDir, `${jobId}-output.${targetFormat}`);

  try {
    // 1. Download file dari Discord ke /tmp
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Gagal download file sumber (status ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const sourceBuffer = Buffer.from(arrayBuffer);
    await writeFile(inputPath, sourceBuffer);

    // 2. Convert pakai ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat(targetFormat)
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    // 3. Baca hasil convert-nya buat dikirim balik
    const resultBuffer = await readFile(outputPath);

    // Balikin file asli JUGA (bukan cuma hasil convert) biar bisa
    // dibundel bareng jadi satu zip di pemanggilnya
    return { sourceBuffer, sourceExt, resultBuffer };
  } finally {
    // 4. Bersihin file sementara, apapun hasilnya (sukses/gagal)
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
