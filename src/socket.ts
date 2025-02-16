import { io, Socket } from "socket.io-client";

const isBrowser = typeof window !== "undefined";

export const socket: Socket = isBrowser
  ? io({
      autoConnect: false, // 클라이언트가 컴포넌트 마운트 시점에 이벤트 핸들러를 먼저 등록한 후, 소켓 연결을 시작할 수 있도록 구성
      path: "/api/socketio",
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 3000,
      timeout: 5000,
      transports: ["websocket", "polling"],
    })
  : ({} as Socket);
