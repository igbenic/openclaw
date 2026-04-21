#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [text, voiceArg, speedArg] = process.argv.slice(2);

if (!text) {
  console.error('Usage: node scripts/tts.js "<text>" [voice] [speed]');
  process.exit(2);
}

const apiUrl = process.env.KOKORO_API_URL;
if (!apiUrl) {
  console.error('Missing KOKORO_API_URL');
  process.exit(1);
}

const voice = voiceArg || process.env.KOKORO_DEFAULT_VOICE || 'af_heart';
const speed = Number(speedArg || process.env.KOKORO_DEFAULT_SPEED || '1.0');
if (!Number.isFinite(speed) || speed <= 0) {
  console.error(`Invalid speed: ${speedArg}`);
  process.exit(1);
}

const outputDir = path.resolve(process.cwd(), process.env.KOKORO_OUTPUT_DIR || 'media');
await fs.mkdir(outputDir, { recursive: true });

const ts = Date.now();
const baseName = `kokoro_tts_${ts}`;

async function requestSpeech(format) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: format === 'mp3' ? 'audio/mpeg, audio/mp3, */*' : 'audio/wav, audio/x-wav, */*',
    },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice,
      speed,
      response_format: format,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Kokoro API ${response.status}: ${body.slice(0, 400)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) {
    throw new Error('Kokoro API returned empty audio');
  }

  const fileName = `${baseName}.${format}`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

let outputPath;
try {
  outputPath = await requestSpeech('mp3');
} catch (err) {
  outputPath = await requestSpeech('wav');
}

const relative = path.relative(process.cwd(), outputPath) || outputPath;
console.log('[[audio_as_voice]]');
console.log(`MEDIA:${relative}`);
