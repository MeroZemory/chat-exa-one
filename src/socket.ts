import { io, Socket } from "socket.io-client";

const isBrowser = typeof window !== "undefined";

export const socket: Socket = isBrowser
  ? io({
      path: "/api/socketio",
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 3000,
      timeout: 5000,
      transports: ["websocket", "polling"],
    })
  : ({} as Socket);
