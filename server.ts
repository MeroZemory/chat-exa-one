import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { queue } from "./shared/lib/queue";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// 메시지 처리 워커 함수
async function processMessages() {
  while (true) {
    const item = queue.dequeue();
    if (item) {
      try {
        // 실제 ExaOne API 호출 대신 임시로 에코 응답
        queue.updateItem(item.id, {
          status: "completed",
          result: `응답은 이제 구현해야 합니다. 서버 시간: ${new Date().toLocaleString()}`,
        });
      } catch (error) {
        console.error("Message processing failed:", error);
        queue.updateItem(item.id, {
          status: "failed",
          result: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    // 다음 메시지 처리 전 최소한의 대기
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

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

    // 클라이언트 연결 시 전체 큐 목록 전송
    socket.emit("itemsSync", queue.getAllItems());

    // 클라이언트가 특정 시퀀스 이후의 아이템을 요청할 때
    socket.on("requestItemsAfter", (sequence: number) => {
      const items = queue.getItemsAfterSequence(sequence);
      socket.emit("itemsSync", items);
    });

    // 새로운 큐 아이템 추가 요청 처리
    socket.on("enqueueItem", (prompt: string) => {
      console.log("Received enqueueItem request:", prompt);
      try {
        const item = queue.enqueue(prompt);
        socket.emit("enqueueResult", { success: true, item });
        console.log("Enqueued item successfully:", item);
      } catch (error) {
        console.error("Failed to enqueue item:", error);
        socket.emit("enqueueResult", {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
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

  // 메시지 처리 워커 시작
  processMessages().catch((error) => {
    console.error("Message processing worker failed:", error);
    process.exit(1);
  });
});
