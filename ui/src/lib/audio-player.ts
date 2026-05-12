// Gemini Live → 24kHz Int16 PCM 청크를 받아 Web Audio로 즉시 재생.
// 다산챗봇의 avatar.js fallback PCM scheduler를 단독 모듈로 추출.
//
// 핵심:
// - 청크들을 시간축에 이어 붙여 끊김 없이 재생 (다음 시작 = 직전 끝).
// - 청크별 RMS amplitude를 onAmplitude로 흘려서 캐릭터 입 벌림을 구동.
// - reset()으로 큐를 잘라 barge-in(말 중간 끼어들기) 처리.

const OUTPUT_SAMPLE_RATE = 24000;

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function int16ToFloat32(int16: Int16Array): Float32Array {
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 32768;
  return out;
}

function rms(float32: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
  return Math.sqrt(sum / float32.length);
}

export class AudioPlayer {
  private ctx?: AudioContext;
  /** 다음 청크가 시작될 절대 시간(ctx.currentTime 기준). */
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  /** RMS amplitude [0, ~1]. 청크 재생이 끝날 때마다 (또는 매 청크) 호출. */
  onAmplitude: ((level: number) => void) | null = null;

  /** 한 turn이 끝나서 입을 다물어야 할 때 (외부에서 명시적 호출). */
  closeMouth(): void {
    this.onAmplitude?.(0);
  }

  /** 사용자 제스처 후 호출 — 브라우저 autoplay 정책 통과. */
  async ensureContext(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor({ sampleRate: OUTPUT_SAMPLE_RATE });
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** base64 PCM 청크를 스케줄해 끊김 없이 재생. */
  async play(base64Pcm: string): Promise<void> {
    await this.ensureContext();
    const ctx = this.ctx!;

    const int16 = new Int16Array(base64ToArrayBuffer(base64Pcm));
    if (int16.length === 0) return;
    const float32 = int16ToFloat32(int16);

    // 청크 amplitude로 입 벌림 구동. 청크가 ~128ms 단위로 들어와 부드럽게 보임.
    this.onAmplitude?.(rms(float32));

    const buffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    // 큐 비어있으면 즉시(currentTime + small lead), 아니면 직전 끝에 이어 붙임.
    const now = ctx.currentTime;
    const start = Math.max(this.nextStartTime, now + 0.02);
    src.start(start);
    this.nextStartTime = start + buffer.duration;

    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
      if (this.activeSources.size === 0) {
        // 청크 다 끝났으면 입 다물기 신호. (turn_complete 핸들러도 별도로 호출함.)
        this.onAmplitude?.(0);
      }
    };
  }

  /** barge-in / turn 종료 시 진행 중인 재생을 즉시 멈춤. */
  reset(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.activeSources.clear();
    if (this.ctx) this.nextStartTime = this.ctx.currentTime;
    this.onAmplitude?.(0);
  }

  destroy(): void {
    this.reset();
    this.ctx?.close().catch(() => {});
    this.ctx = undefined;
  }
}
