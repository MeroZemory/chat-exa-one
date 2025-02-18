import { io } from "socket.io-client";
import { config } from "@server/shared/config";

// 설정값
export const SOCKET_RECONNECT_TIMEOUT_MS = config.socketReconnectTimeoutMs;

export const socket = io(
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000",
  {
    autoConnect: false,
    path: "/api/socketio",
  }
);

// 소켓 연결 보장 함수
export const ensureConnection = async (
  timeoutMs: number = SOCKET_RECONNECT_TIMEOUT_MS
): Promise<boolean> => {
  if (socket.connected) return true;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onConnect = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      socket.off("connect", onConnect);
      clearTimeout(timeoutId);
    };

    socket.on("connect", onConnect);
    socket.connect();
  });
};
