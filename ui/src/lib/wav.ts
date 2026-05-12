// 16kHz mono Int16 PCM 청크들을 한 WAV 파일로 패킹.
// AudioRecorder가 base64 Int16 청크를 흘려주고, PTT 종료 시 합쳐서 한 발 보낸다.

function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function concatInt16(chunks: Int16Array[]): Int16Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Int16 mono PCM을 WAV(RIFF) 컨테이너로 감싸 Uint8Array 반환. */
function pcmToWav(pcm: Int16Array, sampleRate = 16000): Uint8Array {
  const numSamples = pcm.length;
  const byteRate = sampleRate * 2; // mono * 16bit
  const blockAlign = 2;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt subchunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits/sample

  // data subchunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  const out = new Uint8Array(buffer);
  // little-endian Int16 → bytes
  const pcmBytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  out.set(pcmBytes, 44);
  return out;
}

/** base64-encoded Int16 chunk들을 합쳐 WAV(base64) 반환. */
export function chunksToWavBase64(base64Chunks: string[], sampleRate = 16000): string {
  if (base64Chunks.length === 0) return "";
  const int16Arrs = base64Chunks.map(base64ToInt16);
  const merged = concatInt16(int16Arrs);
  const wav = pcmToWav(merged, sampleRate);
  return bytesToBase64(wav);
}
