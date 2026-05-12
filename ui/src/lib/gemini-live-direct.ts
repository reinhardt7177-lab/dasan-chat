// 브라우저 → Gemini Live API 직접 연결 (Client-to-Server 패턴).
// 서버 프록시(/ws/live) 없이 @google/genai JS SDK로 직접 붙음.
// API 키가 브라우저에 노출되므로 학교 내부 전용 도구에서만 사용.

import { GoogleGenAI, Modality } from "@google/genai";
import { VOICE_PROMPT } from "./persona-prompt";

const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export type DirectHandlers = {
  onAudio?: (base64Pcm: string) => void;
  onOutputTranscript?: (text: string) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onClose?: () => void;
  onError?: (err: Error) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySession = any;

export class GeminiLiveDirect {
  private session: AnySession = null;
  private handlers: DirectHandlers = {};

  on(h: DirectHandlers): void {
    this.handlers = { ...this.handlers, ...h };
  }

  async connect(): Promise<void> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!apiKey) throw new Error("VITE_GEMINI_API_KEY 가 빌드 환경변수에 설정되지 않았습니다.");

    const ai = new GoogleGenAI({ apiKey });

    this.session = await ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: VOICE_PROMPT }] },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Charon" },
          },
        },
      },
      callbacks: {
        onopen: () => {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onmessage: (msg: any) => this._handleMessage(msg),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onerror: (e: any) => {
          const err =
            e instanceof ErrorEvent
              ? new Error(e.message)
              : e instanceof Error
                ? e
                : new Error(String(e));
          this.handlers.onError?.(err);
        },
        onclose: () => this.handlers.onClose?.(),
      },
    });
  }

  async sendText(text: string): Promise<void> {
    if (!this.session) throw new Error("Gemini Live 세션이 없습니다.");
    // sendClientContent: 완성된 한 turn 전달 (전사 결과 주입에 적합).
    // turns: string은 PartUnion → ContentUnion → ContentListUnion으로 유효.
    this.session.sendClientContent({
      turns: text,
      turnComplete: true,
    });
  }

  /** 16kHz Int16 PCM 청크(base64)를 Gemini Live에 실시간 스트리밍. VAD가 발화 끝 감지. */
  sendAudio(base64Pcm: string): void {
    if (!this.session) return;
    this.session.sendRealtimeInput({
      media: { mimeType: "audio/pcm;rate=16000", data: base64Pcm },
    });
  }

  async close(): Promise<void> {
    if (this.session) {
      try {
        await this.session.close();
      } catch {
        /* 이미 닫힌 경우 무시 */
      }
      this.session = null;
    }
  }

  isConnected(): boolean {
    return this.session !== null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _handleMessage(msg: any): void {
    // ── 오디오 청크 ──────────────────────────────────────────────────────
    // SDK 버전마다 전달 방식이 다를 수 있어 두 경로 모두 처리.
    // 경로 A: msg.data (Uint8Array / ArrayBuffer / base64 string)
    if (msg?.data !== undefined && msg.data !== null) {
      const raw: unknown = msg.data;
      if (raw instanceof ArrayBuffer) {
        this.handlers.onAudio?.(arrayBufferToBase64(raw));
        return;
      }
      if (raw instanceof Uint8Array) {
        this.handlers.onAudio?.(uint8ToBase64(raw));
        return;
      }
      if (typeof raw === "string" && raw.length > 0) {
        this.handlers.onAudio?.(raw);
        return;
      }
    }

    const sc = msg?.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this.handlers.onInterrupted?.();
      return;
    }

    // 경로 B: serverContent.modelTurn.parts[].inlineData.data (base64)
    const parts: unknown[] = sc.modelTurn?.parts ?? [];
    for (const part of parts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = part as any;
      if (p?.inlineData?.data) {
        this.handlers.onAudio?.(p.inlineData.data as string);
      }
    }

    // 출력 자막
    const transcript: string | undefined = sc.outputTranscription?.text;
    if (transcript) {
      this.handlers.onOutputTranscript?.(transcript);
    }

    if (sc.turnComplete) {
      this.handlers.onTurnComplete?.();
    }
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  return uint8ToBase64(new Uint8Array(buf));
}

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  const len = bytes.length;
  for (let i = 0; i < len; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
