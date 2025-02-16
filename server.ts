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
  let currentProcessingSequence = 0;

  while (true) {
    const item = queue.dequeue();
    if (item) {
      try {
        // 현재 처리 중인 시퀀스 업데이트
        currentProcessingSequence = item.sequence;
        console.log(
          `Processing message #${currentProcessingSequence}: ${item.prompt}`
        );

        // 실제 ExaOne API 호출 대신 임시로 에코 응답
        await new Promise((resolve) => setTimeout(resolve, 250));

        queue.updateItem(item.id, {
          status: "completed",
          result: `[시퀀스 #${item.sequence}] 응답: ${
            item.prompt
          }\n처리 시간: ${new Date().toLocaleString()}`,
        });

        console.log(`Completed message #${currentProcessingSequence}`);
      } catch (error) {
        console.error(
          `Failed to process message #${currentProcessingSequence}:`,
          error
        );
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
  queue.onItemUpdated((item) => {
    // completed나 failed 상태일 때만 클라이언트에 알림
    if (item.status === "completed" || item.status === "failed") {
      io.emit("itemUpdated", item);
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected");

    // 클라이언트 연결 시 전체 큐 목록 전송 (이력만)
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
