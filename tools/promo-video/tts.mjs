// Builds a Hebrew voice-over track from the captions with ElevenLabs.
//   ELEVENLABS_API_KEY=... node tts.mjs out/promo.captions.json out/voice.mp3   (then: node render.mjs ... --voice out/voice.mp3)
// Each caption is spoken in its own time slot (sped up to 1.25x at most if it does not fit). ELEVENLABS_VOICE_ID picks the voice.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const [capsFile, outFile] = [process.argv[2] ?? 'out/promo.captions.json', process.argv[3] ?? 'out/voice.mp3'];
const key = process.env.ELEVENLABS_API_KEY; if (!key) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }
const voice = process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB';
const caps = JSON.parse(readFileSync(capsFile, 'utf8'));
const dir = path.join(path.dirname(path.resolve(outFile)), 'tts'); mkdirSync(dir, { recursive: true });
// optional voice-script.json: the caption text -> the same text with niqqud, so the voice reads it correctly (captions stay unvowelled)
const vowels = process.env.VOICE_SCRIPT ? JSON.parse(readFileSync(process.env.VOICE_SCRIPT, 'utf8')) : {};
const parts = [];
for (const [i, c] of caps.entries()) {
  const raw = path.join(dir, `${i}.mp3`);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: vowels[c.text] ?? c.text, model_id: process.env.ELEVENLABS_MODEL ?? 'eleven_v3', language_code: 'he', voice_settings: { stability: 0.5 } }) });
  if (!res.ok) { console.error(i, res.status, await res.text()); process.exit(1); }
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  const len = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw]).toString();
  const slot = c.b - c.a - 0.1, tempo = Math.min(1.25, Math.max(1, len / slot));
  const fit = path.join(dir, `${i}.fit.wav`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-filter:a', `atempo=${tempo.toFixed(3)}`, '-ar', '44100', '-ac', '1', fit]);
  parts.push({ fit, at: Math.round((c.a + 0.05) * 1000) });
  console.log(i, c.text, len.toFixed(1) + 's', 'x' + tempo.toFixed(2));
}
const inputs = parts.flatMap((p) => ['-i', p.fit]);
const filter = parts.map((p, i) => `[${i}:a]adelay=${p.at}|${p.at}[a${i}]`).join(';') + ';' + parts.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${parts.length}:normalize=0[out]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-b:a', '160k', outFile]);
console.log('wrote', outFile);
