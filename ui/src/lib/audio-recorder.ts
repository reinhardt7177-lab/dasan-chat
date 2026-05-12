// 마이크 → 16kHz mono Int16 PCM 청크를 base64로 콜백 전달.
// 다산챗봇 audio-recorder.js + audio-recording-worklet.js를 React/TS로 리팩터.
// EventEmitter3 dep 제거, 콜백 한 개로 단순화.

const WORKLET_SRC = `
class AudioRecorderWorklet extends AudioWorkletProcessor {
  // 2048 samples @ 16kHz ≈ 128ms → 초당 ~8회 청크. 다산챗봇 원본 값 그대로.
  buffer = new Int16Array(2048);
  bufferWriteIndex = 0;

  process(inputs) {
    if (inputs[0].length) {
      this.processChunk(inputs[0][0]);
    }
    return true;
  }

  sendAndClearBuffer() {
    this.port.postMessage({
      int16Buffer: this.buffer.slice(0, this.bufferWriteIndex).buffer,
    });
    this.bufferWriteIndex = 0;
  }

  processChunk(float32Array) {
    for (let i = 0; i < float32Array.length; i++) {
      // float [-1,1] → int16 [-32768, 32767]
      this.buffer[this.bufferWriteIndex++] = float32Array[i] * 32768;
      if (this.bufferWriteIndex >= this.buffer.length) {
        this.sendAndClearBuffer();
      }
    }
  }
}
registerProcessor('dasan-recorder', AudioRecorderWorklet);
`;

function workletUrl(): string {
  const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export class AudioRecorder {
  private readonly sampleRate = 16000;
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private starting?: Promise<void>;

  /** base64 인코딩된 Int16 PCM 청크가 16kHz로 도착. */
  onChunk: ((base64: string) => void) | null = null;

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = this._start();
    try {
      await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  private async _start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("이 브라우저에서는 마이크를 사용할 수 없습니다.");
    }

    // 다산챗봇 인사이트: iOS Safari는 OS 레벨 noiseSuppression이 한국어 모음을
    // 너무 강하게 깎아서 STT가 일본어로 오인하는 사례가 있다. iOS는 echoCancellation만 유지.
    const ios = isIOS();
    const audio: MediaTrackConstraints = ios
      ? {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        }
      : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: this.sampleRate,
        };

    this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor({ sampleRate: this.sampleRate });
    await this.ctx.resume();

    const url = workletUrl();
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.ctx, "dasan-recorder");
    this.worklet.port.onmessage = (e: MessageEvent<{ int16Buffer: ArrayBuffer }>) => {
      const buf = e.data.int16Buffer;
      if (!buf || !this.onChunk) return;
      this.onChunk(arrayBufferToBase64(buf));
    };
    this.source.connect(this.worklet);
  }

  stop(): void {
    const doStop = () => {
      this.source?.disconnect();
      this.worklet?.port.close?.();
      this.stream?.getTracks().forEach((t) => t.stop());
      this.ctx?.close().catch(() => {});
      this.source = undefined;
      this.worklet = undefined;
      this.stream = undefined;
      this.ctx = undefined;
    };
    if (this.starting) {
      this.starting.then(doStop).catch(doStop);
    } else {
      doStop();
    }
  }
}
