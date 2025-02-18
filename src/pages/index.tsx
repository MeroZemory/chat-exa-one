import { useEffect, useState, useRef } from "react";
import { socket, ensureConnection } from "../socket"; // 기존 socket 인스턴스 import
import React from "react";
import toast from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";

interface QueueItem {
  id: string;
  sequence: number;
  prompt: string;
  status: string;
  result?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  processedAt: string | Date;
}

interface QueueItemUpdate {
  type: "created" | "processing" | "completed" | "failed";
  item: QueueItem;
}

interface EnqueueResult {
  success: boolean;
  item?: QueueItem;
  error?: string;
  nextResetTime: Date;
}

interface WaitStatus {
  nextRestTime: Date | null;
  requestId?: string; // 현재 대기 중인 요청의 ID
  isCooldown: boolean; // 쿨다운 상태 여부
}

const isCooldownEnd = (waitStatus: WaitStatus) => {
  return (
    waitStatus.nextRestTime !== null && new Date() >= waitStatus.nextRestTime
  );
};

export default function Home() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [pendingItems, setPendingItems] = useState<{
    [key: string]: QueueItem;
  }>({});
  const [prompt, setPrompt] = useState("");
  const [waitStatus, setWaitStatus] = useState<WaitStatus>({
    nextRestTime: null,
    requestId: undefined,
    isCooldown: false,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState("N/A");
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 마지막 시퀀스 번호를 ref로 관리 (항목 순서 관리)
  const lastSequenceRef = useRef<number>(0);
  const cooldownTimerRef = useRef<NodeJS.Timeout>(null);
  const [isInputActive, setIsInputActive] = useState(false);

  // 소켓 연결 상태 풀링
  useEffect(() => {
    const checkConnection = () => {
      const isConnected = socket.connected;
      setIsConnected(isConnected);
    };
    const interval = setInterval(checkConnection, 100);
    return () => clearInterval(interval);
  }, []);

  // 입력 가능 상태가 되면 포커스 복원
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    if (isConnected && !waitStatus.isCooldown && isInputActive) {
      input.focus();
    }
  }, [isConnected, waitStatus.isCooldown, isInputActive]);

  // 쿨다운 종료 풀링
  useEffect(() => {
    const checkWaitingEnd = () => {
      if (isCooldownEnd(waitStatus)) {
        setWaitStatus({
          nextRestTime: null,
          requestId: undefined,
          isCooldown: false,
        });
        toast.error("서버로부터 응답을 받지 못했습니다.", {
          duration: 3000,
          position: "top-center",
          style: {
            background: "#EF4444",
            color: "#fff",
          },
        });
      }
    };
    const interval = setInterval(checkWaitingEnd, 100); // 100ms 마다 검사

    // 연결이 끊어진 경우에만 연결 시도
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      clearInterval(interval);
    };
  }, [waitStatus]);

  // 쿨다운 타이머 관리
  useEffect(() => {
    if (waitStatus.nextRestTime && waitStatus.isCooldown) {
      const updateCooldown = () => {
        const now = new Date();
        const nextRestTime = waitStatus.nextRestTime;
        if (!nextRestTime) return;

        if (now >= nextRestTime) {
          setWaitStatus({
            nextRestTime: null,
            requestId: undefined,
            isCooldown: false,
          });
          setLastErrorMessage(null);
        } else {
          const remainingSeconds = Math.ceil(
            (nextRestTime.getTime() - now.getTime()) / 1000
          );
          setLastErrorMessage(
            `요청 빈도가 너무 높습니다. ${remainingSeconds}초 후에 다시 시도해주세요.`
          );
          cooldownTimerRef.current = setTimeout(updateCooldown, 1000);
        }
      };

      updateCooldown();
      return () => {
        if (cooldownTimerRef.current) {
          clearTimeout(cooldownTimerRef.current);
        }
      };
    } else if (!waitStatus.isCooldown) {
      setLastErrorMessage(null);
    }
  }, [waitStatus]);

  // 소켓 이벤트 핸들러 등록
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      setTransport(socket.io.engine.transport.name);
      setLastErrorMessage(null);
      console.log("Connected to socket");

      // 재연결시 서버의 현재 상태와 클라이언트의 pending 항목들을 비교
      setPendingItems((prev) => {
        const pendingIds = Object.keys(prev);
        if (pendingIds.length > 0) {
          // 서버의 현재 시퀀스 번호 요청
          socket.emit("getCurrentSequence", (serverSequence: number) => {
            // 서버 시퀀스보다 큰 번호를 가진 pending 항목들을 실패 처리
            Object.values(prev).forEach((item) => {
              if (item.sequence > serverSequence) {
                const failedItem: QueueItem = {
                  ...item,
                  status: "failed",
                  result: "서버 재시작으로 인해 요청이 취소되었습니다.",
                  updatedAt: new Date(),
                };
                onItemUpdated({ type: "failed", item: failedItem });
              }
            });
          });
        }
        return prev;
      });
    }

    function onDisconnect() {
      setIsConnected(false);
      setTransport("N/A");
      console.log("Disconnected from socket");
    }

    // 서버에서 전체 큐 목록을 전달할 때
    function onItemsSync(syncedItems: QueueItem[]) {
      console.log("Received itemsSync:", syncedItems);
      const sortedItems = [...syncedItems].sort(
        (a, b) => b.sequence - a.sequence
      );
      setItems(sortedItems);
      if (sortedItems.length > 0) {
        lastSequenceRef.current = sortedItems[0].sequence;
      } else {
        lastSequenceRef.current = 0;
      }
    }

    // 항목 업데이트 이벤트
    function onItemUpdated(update: QueueItemUpdate) {
      console.log("Received itemUpdated:", update);
      const updatedItem = update.item;

      // 해당 ID의 항목이 pending이고 처리가 완료된 경우에만 대기 상태 해제
      if (
        pendingItems[updatedItem.id] &&
        (update.type === "completed" || update.type === "failed")
      ) {
        setWaitStatus({
          nextRestTime: null,
          requestId: undefined,
          isCooldown: false,
        });
      }

      // created 타입일 경우 pendingItems에 추가
      if (update.type === "created") {
        setPendingItems((prev) => ({
          ...prev,
          [updatedItem.id]: updatedItem,
        }));
        return;
      }

      // 나머지 타입들의 경우 items 배열에 추가/업데이트
      setItems((prev) => {
        const newItems = [...prev];
        const existingIndex = newItems.findIndex(
          (i) => i.id === updatedItem.id
        );

        if (existingIndex !== -1) {
          newItems[existingIndex] = updatedItem;
        } else {
          const index = newItems.findIndex(
            (i) => i.sequence < updatedItem.sequence
          );
          if (index === -1) {
            newItems.push(updatedItem);
          } else {
            newItems.splice(index, 0, updatedItem);
          }
        }
        return newItems;
      });

      // completed나 failed 상태일 때 pendingItems에서 제거
      if (update.type === "completed" || update.type === "failed") {
        setPendingItems((prev) => {
          const newPendingItems = { ...prev };
          delete newPendingItems[updatedItem.id];
          return newPendingItems;
        });
        setWaitStatus({
          nextRestTime: null,
          requestId: undefined,
          isCooldown: false,
        });
      }
    }

    // 큐 아이템 추가 결과 이벤트
    function onEnqueueResult(result: EnqueueResult, responseId: string) {
      if (
        !result.success &&
        result.error?.includes("요청 빈도가 너무 높습니다")
      ) {
        const resetTime = new Date(result.nextResetTime);
        // 버킷 초과 시에만 웨이팅 설정
        setWaitStatus({
          nextRestTime: resetTime,
          requestId: responseId,
          isCooldown: true,
        });
        const remainingSeconds = Math.ceil(
          (resetTime.getTime() - Date.now()) / 1000
        );
        setLastErrorMessage(
          `요청 빈도가 너무 높습니다. ${remainingSeconds}초 후에 다시 시도해주세요.`
        );
      } else if (!result.success) {
        setLastErrorMessage(
          result.error || "요청 처리 중 오류가 발생했습니다."
        );
      } else {
        if (inputRef.current) {
          inputRef.current.value = "";
          setPrompt(""); // 버튼 상태 업데이트용
        }
      }
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("itemsSync", onItemsSync);
    socket.on("itemUpdated", onItemUpdated);
    socket.on("enqueueResult", onEnqueueResult);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("itemsSync", onItemsSync);
      socket.off("itemUpdated", onItemUpdated);
      socket.off("enqueueResult", onEnqueueResult);
    };
  }, [pendingItems]); // socket is now imported, not from state

  // 새로운 요청 추가
  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    if (waitStatus.isCooldown) return;

    setLastErrorMessage(null);

    // 연결 보장
    const connected = await ensureConnection();
    if (!connected) {
      setLastErrorMessage("서버 연결에 실패했습니다.");
      return;
    }

    const requestId = uuidv4();

    try {
      socket.emit("enqueueItem", prompt.trim(), requestId);
    } catch (error) {
      console.error("Failed to add queue item:", error);
      setLastErrorMessage("요청 전송 중 오류가 발생했습니다.");
    }
  };

  // 입력 필드 keyDown 핸들러
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (waitStatus.isCooldown) return;

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        // 줄바꿈 처리
        const textArea = e.target as HTMLTextAreaElement;
        textArea.value = textArea.value.replace(/\n/g, "\n");
        return;
      }
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Chat EXA One 3.5</h1>
          {isConnected && (
            <div className="text-xs text-green-600">
              서버 연결됨 ({transport})
            </div>
          )}
        </div>

        {/* 에러 메시지 표시 */}
        {lastErrorMessage && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {lastErrorMessage}
          </div>
        )}

        {/* 새 요청 입력 폼 */}
        <div className="mb-8">
          <div className="flex gap-4">
            <input
              ref={inputRef}
              type="text"
              defaultValue=""
              onChange={(e) => {
                setPrompt(e.target.value);
              }}
              onKeyDown={(e) => {
                if (!isInputActive) setIsInputActive(true);
                handleKeyDown(e);
              }}
              onClick={() => {
                if (!isInputActive) setIsInputActive(true);
              }}
              placeholder="프롬프트를 입력하세요"
              className="flex-1 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={waitStatus.isCooldown}
              readOnly={waitStatus.isCooldown}
              autoFocus // 페이지 로드 시 자동 포커스
              onFocus={() => setIsInputActive(true)}
            />
            <button
              type="button"
              disabled={waitStatus.isCooldown || !prompt.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors relative group"
              onClick={handleSubmit}
            >
              {waitStatus.isCooldown ? "처리 중..." : "요청 추가"}
              {waitStatus.isCooldown && (
                <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  쿨다운 중
                </span>
              )}
            </button>
          </div>
          {waitStatus.isCooldown && (
            <p className="mt-2 text-sm text-gray-500">
              요청을 처리 중입니다. 잠시만 기다려주세요...
            </p>
          )}
        </div>

        {/* 큐 아이템 목록 */}
        <div className="space-y-4">
          {/* 대기 중인 항목 표시 */}
          {Object.values(pendingItems)
            .sort((a, b) => b.sequence - a.sequence)
            .map((item) => (
              <div
                key={item.id}
                className="p-4 border rounded shadow opacity-50"
              >
                <div className="flex justify-between items-start mb-2">
                  <p className="font-medium">
                    <span className="text-gray-500 text-sm mr-2">
                      대기중 #{item.sequence}
                    </span>
                    {item.prompt}
                  </p>
                  <span className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-800 animate-pulse">
                    pending
                  </span>
                </div>
              </div>
            ))}
          {items.map((item) => (
            <div key={item.id} className="p-4 border rounded shadow">
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium">
                  <span className="text-gray-500 text-sm mr-2">
                    #{item.sequence}
                  </span>
                  <pre>{item.prompt}</pre>
                </p>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    item.status === "completed"
                      ? "bg-green-100 text-green-800"
                      : item.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : item.status === "processing"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {item.status}
                </span>
              </div>
              {item.result && (
                <pre className="text-gray-600 mt-2">{item.result}</pre>
              )}
              <div className="text-sm text-gray-500 mt-2">
                {item.processedAt &&
                  `처리: ${new Date(item.processedAt).toLocaleString()}`}
              </div>
            </div>
          ))}
          {items.length === 0 && Object.keys(pendingItems).length === 0 && (
            <p className="text-gray-500 text-center py-8">
              아직 큐에 요청이 없습니다.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
