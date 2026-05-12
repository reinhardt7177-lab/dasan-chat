// 사랑채(음성) WebSocket 클라이언트.
// /api/ws/live 와 JSON 메시지로 양방향 통신. 서버 protocol은 server/src/dasan_chat/api.py 상단 주석 참고.

export type ServerMessage =
  | { type: "audio"; data: string } // base64 PCM 24kHz
  | { type: "input_transcript"; data: string } // 학생 발화 인식 결과
  | { type: "output_transcript"; data: string } // 선생님 답변 텍스트
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
  // 동일 origin 기준이라 dev/prod 한 코드. dev는 Vite가 ws: true로 프록시.
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws/live`;
}

export class LiveSocket {
  private ws?: WebSocket;
  private handlers: Handlers = {};

  on(handlers: Handlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => this.handlers.onOpen?.();
    ws.onclose = () => this.handlers.onClose?.();
    ws.onerror = (e) => this.handlers.onError?.(e);
    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as ServerMessage;
        this.handlers.onMessage?.(parsed);
      } catch (err) {
        console.error("[LiveSocket] failed to parse message", err, e.data);
      }
    };
  }

  /** 서버가 OPEN 될 때까지 최대 timeoutMs 동안 대기. */
  async waitOpen(timeoutMs = 8000): Promise<boolean> {
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

  /** push-to-talk에서 명시적으로 turn 종료 신호. (현재 toggle 모드에선 미사용) */
  sendEndOfTurn(): void {
    this.send({ type: "end_of_turn" });
  }

  private send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  close(): void {
    if (!this.ws) return;
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
    this.ws = undefined;
  }
}
