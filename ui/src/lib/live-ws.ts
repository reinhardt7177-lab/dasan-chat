// 사랑채(음성) WebSocket 클라이언트.
// /api/ws/live 와 JSON 메시지로 양방향 통신. 서버 protocol은 server/src/dasan_chat/api.py 상단 주석 참고.
//
// 끊김 회복 (Render free plan cold start, Gemini Live 세션 시간 제한 둘 다 대응):
//   - close() 명시 호출이 아닌 한 close 받으면 자동 재연결 (3s 첫 시도, 6s, 12s 까지 backoff)
//   - waitOpen() timeout 길게(기본 25s) — cold start 30s까지도 견딤

export type ServerMessage =
  | { type: "audio"; data: string }
  | { type: "input_transcript"; data: string }
  | { type: "output_transcript"; data: string }
  | { type: "interrupted" }
  | { type: "turn_complete" }
  | { type: "error"; data: { message: string; action?: string } };

type Handlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
  onMessage?: (msg: ServerMessage) => void;
};

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws/live`;
}

const RECONNECT_DELAYS_MS = [3000, 6000, 12000, 12000, 12000];

export class LiveSocket {
  private ws?: WebSocket;
  private handlers: Handlers = {};
  /** 사용자가 명시적으로 close()를 부른 후엔 재연결 시도 멈춤. */
  private closedByUser = false;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;

  on(handlers: Handlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedByUser = false;
    this._openSocket();
  }

  private _openSocket(): void {
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.handlers.onOpen?.();
    };
    ws.onclose = () => {
      this.handlers.onClose?.();
      if (!this.closedByUser) {
        const delay =
          RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
        this.reconnectAttempt += 1;
        this._scheduleReconnect(delay);
      }
    };
    ws.onerror = (e) => this.handlers.onError?.(e);
    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as ServerMessage;
        this.handlers.onMessage?.(parsed);
      } catch (err) {
        console.error("[LiveSocket] parse failed", err, e.data);
      }
    };
  }

  private _scheduleReconnect(delayMs: number): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser) this._openSocket();
    }, delayMs);
  }

  /** 서버 OPEN 될 때까지 최대 timeoutMs 대기. cold start 대비 기본 25s. */
  async waitOpen(timeoutMs = 25000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.ws?.readyState === WebSocket.OPEN) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return this.ws?.readyState === WebSocket.OPEN;
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sendAudioChunk(base64: string): void {
    this.send({ type: "audio", data: base64 });
  }

  sendText(text: string): void {
    this.send({ type: "text", data: text });
  }

  /** push-to-talk에서 학생이 마이크 버튼을 떼면 호출. 서버가 Gemini에 audio_stream_end 전달. */
  sendEndOfTurn(): void {
    this.send({ type: "end_of_turn" });
  }

  private send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = undefined;
    }
  }
}
