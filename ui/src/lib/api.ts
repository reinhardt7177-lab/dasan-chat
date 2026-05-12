// 서재(글) 모드 + 사랑채 음성 입력용 REST 클라이언트.
// WebSocket(/api/ws/live)은 사랑채에서 별도로 다룬다.

export type ChatTurn = { role: "user" | "model"; text: string };

export type ChatResponse = { reply: string };

export async function postChat(
  message: string,
  history: ChatTurn[],
): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ChatResponse;
}

/** WAV(base64)를 보내 한국어 텍스트로 전사받음. PTT에서 발화 모은 후 호출. */
export async function postTranscribe(wavBase64: string): Promise<string> {
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio: wavBase64 }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { text: string };
  return json.text ?? "";
}
