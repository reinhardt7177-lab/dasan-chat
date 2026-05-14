import { LiveAvatarSession, AgentEventsEnum } from "@heygen/liveavatar-web-sdk";

const EMBED_ID = "e9aba2cb-c3d2-46b2-a6ad-970e4ecce41c";
const API_KEY = import.meta.env.VITE_HEYGEN_API_KEY as string;

async function fetchSessionToken(): Promise<string> {
  const res = await fetch("https://api.heygen.com/v1/live_avatar/create_session_token", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ embed_id: EMBED_ID }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HeyGen ${res.status}: ${body}`);
  }
  const json = (await res.json()) as {
    data?: { session_token?: string; token?: string };
    token?: string;
    session_token?: string;
  };
  const token = json.data?.session_token ?? json.data?.token ?? json.token ?? json.session_token;
  if (!token) throw new Error(`토큰 필드 없음: ${JSON.stringify(json)}`);
  return token;
}

export class HeyGenSession {
  private session: LiveAvatarSession | null = null;

  onTalkStart?: () => void;
  onTalkEnd?: () => void;

  async start(): Promise<void> {
    const token = await fetchSessionToken();
    const session = new LiveAvatarSession(token, { voiceChat: false });
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => this.onTalkStart?.());
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => this.onTalkEnd?.());
    this.session = session;
    await session.start();
  }

  attach(el: HTMLMediaElement): void {
    this.session?.attach(el);
  }

  speak(text: string): void {
    if (!this.session || !text.trim()) return;
    this.session.repeat(text);
  }

  interrupt(): void {
    this.session?.interrupt();
  }

  async stop(): Promise<void> {
    if (!this.session) return;
    try {
      await this.session.stop();
    } catch {
      // ignore
    } finally {
      this.session = null;
    }
  }
}
