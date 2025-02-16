import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { queue } from "./shared/lib/queue";

class LeakyBucket {
  private capacity: number;
  private leakRate: number; // 분당 처리할 수 있는 요청 수
  private lastLeakTime: number;
  private tokens: number;

  constructor(capacity: number, leakRatePerMinute: number) {
    this.capacity = capacity;
    this.leakRate = leakRatePerMinute;
    this.lastLeakTime = Date.now();
    this.tokens = 0;
  }

  private leak() {
    const now = Date.now();
    const elapsedMinutes = (now - this.lastLeakTime) / (1000 * 60);
    const leakedTokens = Math.floor(elapsedMinutes * this.leakRate);

    this.tokens = Math.max(0, this.tokens - leakedTokens);
    this.lastLeakTime = now;
  }

  tryConsume(): { allowed: boolean; nextResetTime: Date } {
    this.leak();

    const minutesToNextToken = 1 / this.leakRate;
    const nextResetTime = new Date(Date.now() + minutesToNextToken * 60 * 1000);

    if (this.tokens < this.capacity) {
      this.tokens++;
      return { allowed: true, nextResetTime };
    }

    return { allowed: false, nextResetTime };
  }
}

// 소켓별 버킷 관리
const socketBuckets = new Map<string, LeakyBucket>();
const socketTimeouts = new Map<string, NodeJS.Timeout>();
const SOCKET_TIMEOUT = 5 * 1000; // 5초 동안 사용하지 않으면 연결 해제

// 소켓 활성 상태 추적
const activeSocketIds = new Set<string>();

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
        await new Promise((resolve) => setTimeout(resolve, 100));

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
    // 상태에 따라 다른 이벤트 타입으로 전송
    io.emit("itemUpdated", {
      type: item.status,
      item,
    });
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    activeSocketIds.add(socket.id);

    // 소켓 타임아웃 설정/갱신 함수
    const resetSocketTimeout = () => {
      // 활성 상태가 아닌 경우에만 타임아웃 설정
      if (!activeSocketIds.has(socket.id)) {
        return;
      }

      // 기존 타임아웃이 있다면 제거
      const existingTimeout = socketTimeouts.get(socket.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // 새로운 타임아웃 설정
      const timeout = setTimeout(() => {
        console.log("Socket timeout, disconnecting:", socket.id);
        activeSocketIds.delete(socket.id);
        socket.disconnect(true);
        socketBuckets.delete(socket.id);
        socketTimeouts.delete(socket.id);
      }, SOCKET_TIMEOUT);

      socketTimeouts.set(socket.id, timeout);
    };

    // 소켓별 리키버킷 생성 (용량: 10, 분당 처리율: 5)
    socketBuckets.set(socket.id, new LeakyBucket(10, 5));
    resetSocketTimeout(); // 초기 타임아웃 설정

    // 클라이언트 연결 시 전체 큐 목록 전송 (이력만)
    socket.emit("itemsSync", queue.getAllItems());

    // 클라이언트가 특정 시퀀스 이후의 아이템을 요청할 때
    socket.on("requestItemsAfter", (sequence: number) => {
      const items = queue.getItemsAfterSequence(sequence);
      socket.emit("itemsSync", items);
    });

    // 현재 시퀀스 번호 요청 처리
    socket.on("getCurrentSequence", (callback) => {
      callback(queue.getCurrentSequence());
    });

    // 새로운 큐 아이템 추가 요청 처리
    socket.on("enqueueItem", (prompt: string, requestId: string) => {
      resetSocketTimeout(); // 메시지 전송 시 타임아웃 리셋

      const bucket = socketBuckets.get(socket.id);
      if (!bucket) {
        socket.emit(
          "enqueueResult",
          {
            success: false,
            error: "버킷이 초기화되지 않았습니다.",
          },
          requestId
        );
        return;
      }

      const result = bucket.tryConsume();
      if (!result.allowed) {
        socket.emit(
          "enqueueResult",
          {
            success: false,
            error: "요청 빈도가 너무 높습니다.",
            nextResetTime: result.nextResetTime,
          },
          requestId
        );
        return;
      }

      console.log(
        "Received enqueueItem request:",
        prompt,
        "requestId:",
        requestId
      );
      try {
        const item = queue.enqueue(prompt);
        socket.emit("enqueueResult", { success: true }, requestId);
        // 생성된 아이템을 별도 이벤트로 전송
        io.emit("itemUpdated", { type: "created", item });
        console.log("Enqueued item successfully:", item);
      } catch (error) {
        console.error("Failed to enqueue item:", error);
        socket.emit(
          "enqueueResult",
          {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          requestId
        );
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      activeSocketIds.delete(socket.id);
      socketBuckets.delete(socket.id);
      const timeout = socketTimeouts.get(socket.id);
      if (timeout) {
        clearTimeout(timeout);
        socketTimeouts.delete(socket.id);
      }
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
