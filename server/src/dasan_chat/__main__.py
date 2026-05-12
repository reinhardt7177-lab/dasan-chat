"""`python -m dasan_chat` 진입점.

uvicorn을 코드에서 직접 띄워 .env 로드 순서/리로드 옵션을 한 곳에서 관리.
"""

from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="다산초당 챗봇 서버")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument(
        "--reload",
        action="store_true",
        help="개발용 자동 리로드",
    )
    args = parser.parse_args()

    uvicorn.run(
        "dasan_chat.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
