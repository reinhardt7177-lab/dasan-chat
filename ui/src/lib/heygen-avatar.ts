import { StreamingAvatarApi, Configuration, NewSessionRequestQualityEnum } from "@heygen/streaming-avatar/dist";
import type { NewSessionData } from "@heygen/streaming-avatar/dist";

const AVATAR_ID = "1c690fe7-23e0-49f9-bfba-14344450285b";
const API_KEY = import.meta.env.VITE_HEYGEN_API_KEY as string;

async function fetchAccessToken(): Promise<string> {
  const res = await fetch("https://api.heygen.com/v1/streaming.create_token", {
    method: "POST",
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) throw new Error(`HeyGen 토큰 발급 실패: ${res.status}`);
  const json = (await res.json()) as { data: { token: string } };
  return json.data.token;
}

export class HeyGenSession {
  private api: StreamingAvatarApi | null = null;
  private sessionData: NewSessionData | null = null;

  onStream?: (stream: MediaStream) => void;
  onTalkStart?: () => void;
  onTalkEnd?: () => void;

  async start(): Promise<void> {
    const token = await fetchAccessToken();
    const config = new Configuration({ accessToken: token });
    this.api = new StreamingAvatarApi(config);

    this.api.addEventHandler("avatar_start_talking", () => this.onTalkStart?.());
    this.api.addEventHandler("avatar_stop_talking", () => this.onTalkEnd?.());

    this.sessionData = await this.api.createStartAvatar({
      newSessionRequest: {
        quality: NewSessionRequestQualityEnum.Low,
        avatarName: AVATAR_ID,
      },
    });

    const stream = this.api.mediaStream;
    if (stream) this.onStream?.(stream);
  }

  async speak(text: string): Promise<void> {
    if (!this.api || !this.sessionData?.sessionId || !text.trim()) return;
    await this.api.speak({
      taskRequest: {
        text,
        sessionId: this.sessionData.sessionId,
        taskType: "repeat",
      },
    });
  }

  async interrupt(): Promise<void> {
    if (!this.api || !this.sessionData?.sessionId) return;
    try {
      await this.api.interrupt({
        interruptRequest: { sessionId: this.sessionData.sessionId },
      });
    } catch {
      // 말 안 하는 중 interrupt 무시
    }
  }

  async stop(): Promise<void> {
    if (!this.api || !this.sessionData?.sessionId) return;
    try {
      await this.api.stopAvatar({
        stopSessionRequest: { sessionId: this.sessionData.sessionId },
      });
    } catch {
      // 이미 끊겼으면 무시
    } finally {
      this.api = null;
      this.sessionData = null;
    }
  }
}
