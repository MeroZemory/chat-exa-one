import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { queue } from "./src/lib/queue";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, { path: "/api/socketio" });

  // Queue 이벤트 리스너 설정
  queue.onItemAdded((item) => {
    io.emit("itemAdded", item);
  });

  queue.onItemUpdated((item) => {
    io.emit("itemUpdated", item);
  });

  io.on("connection", (socket) => {
    console.log("Client connected");

    // 클라이언트 연결 시 현재 시퀀스 번호 전송
    socket.emit("currentSequence", queue.getCurrentSequence());

    // 클라이언트가 특정 시퀀스 이후의 아이템을 요청할 때
    socket.on("requestItemsAfter", (sequence: number) => {
      const items = queue.getItemsAfterSequence(sequence);
      socket.emit("itemsSync", items);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
