import { useEffect, useState, useRef } from "react";
import { Socket } from "socket.io-client";
import { socket } from "../socket"; // 기존 socket 인스턴스 import

interface QueueItem {
  id: string;
  sequence: number;
  prompt: string;
  status: string;
  result?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface EnqueueResult {
  success: boolean;
  item?: QueueItem;
  error?: string;
}

export default function Home() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [pendingItems, setPendingItems] = useState<{
    [key: string]: QueueItem;
  }>({});
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isButtonClickComplete, setIsButtonClickComplete] = useState(false);
  const [transport, setTransport] = useState("N/A");
  const inputRef = useRef<HTMLInputElement>(null);
  // 마지막 시퀀스 번호를 ref로 관리 (항목 순서 관리)
  const lastSequenceRef = useRef<number>(0);

  // 버튼 클릭 후 입력 필드 포커스 설정
  useEffect(() => {
    if (isButtonClickComplete) {
      inputRef.current?.focus();
    }
  }, [isButtonClickComplete]);

  // 컴포넌트 마운트 시 소켓 연결 시작
  useEffect(() => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, []);

  // 소켓 이벤트 핸들러 등록
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      setTransport(socket.io.engine.transport.name);
      console.log("Connected to socket");
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

    // 새로운 항목 추가 이벤트
    function onItemAdded(item: QueueItem) {
      console.log("Received itemAdded:", item);
      setItems((prev) => {
        // 이미 존재하는 항목이면 무시
        if (prev.some((i) => i.sequence === item.sequence)) return prev;

        // 적절한 위치 찾기 (내림차순)
        const index = prev.findIndex((i) => i.sequence < item.sequence);
        const newItems = [...prev];
        if (index === -1) {
          newItems.push(item);
        } else {
          newItems.splice(index, 0, item);
        }
        return newItems;
      });
      // 대기 중인 항목이었다면 제거
      setPendingItems((prev) => {
        const { [item.id]: removed, ...rest } = prev;
        return rest;
      });
    }

    // 항목 업데이트 이벤트
    function onItemUpdated(updatedItem: QueueItem) {
      console.log("Received itemUpdated:", updatedItem);
      if (updatedItem.status !== "pending") {
        // 상태 업데이트를 하나의 배치로 처리
        const updateStates = () => {
          setPendingItems((prev) => {
            const { [updatedItem.id]: removed, ...rest } = prev;
            return rest;
          });
          setItems((prev) =>
            prev.map((item) =>
              item.id === updatedItem.id ? updatedItem : item
            )
          );
        };
        updateStates();
      } else {
        setItems((prev) =>
          prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
        );
      }
    }

    // 큐 아이템 추가 결과 이벤트
    function onEnqueueResult(result: EnqueueResult) {
      console.log("Received enqueueResult:", result);
      if (result.success && result.item) {
        // 응답 받은 항목을 pendingItems에 추가
        setPendingItems((prev) => ({
          ...prev,
          [result.item!.id]: result.item!,
        }));
        setPrompt("");
      } else {
        console.error("Failed to add item:", result.error);
      }
      setIsLoading(false);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("itemsSync", onItemsSync);
    socket.on("itemAdded", onItemAdded);
    socket.on("itemUpdated", onItemUpdated);
    socket.on("enqueueResult", onEnqueueResult);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("itemsSync", onItemsSync);
      socket.off("itemAdded", onItemAdded);
      socket.off("itemUpdated", onItemUpdated);
      socket.off("enqueueResult", onEnqueueResult);
    };
  }, []); // socket is now imported, not from state

  // 새로운 요청 추가
  const handleSubmit = async () => {
    if (!isConnected || isLoading || !prompt.trim()) return;
    const promptTrim = prompt.trim();

    setIsLoading(true);
    try {
      socket.emit("enqueueItem", promptTrim);
    } catch (error) {
      console.error("Failed to add queue item:", error);
      setIsLoading(false);
    }
  };

  // 입력 필드 keyDown 핸들러
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isLoading) return;
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
        <h1 className="text-3xl font-bold mb-8">ExaOne 3.5 큐 시스템</h1>

        {/* 연결 상태 표시 */}
        <div
          className={`mb-4 text-sm ${
            isConnected ? "text-green-600" : "text-red-600"
          }`}
        >
          {isConnected ? `서버와 연결됨 (${transport})` : "서버와 연결 끊김"}
        </div>

        {/* 새 요청 입력 폼 */}
        <div className="mb-8">
          <div className="flex gap-4">
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="프롬프트를 입력하세요"
              className="flex-1 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!isConnected}
              readOnly={isLoading}
            />
            <button
              type="button"
              disabled={!isConnected || isLoading || !prompt.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              onClick={async () => {
                try {
                  setIsButtonClickComplete(false);
                  await handleSubmit();
                } finally {
                  setIsButtonClickComplete(true);
                }
              }}
            >
              {isLoading ? "처리 중..." : "요청 추가"}
            </button>
          </div>
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
                  {item.prompt}
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
                <p className="text-gray-600 mt-2">{item.result}</p>
              )}
              <div className="text-sm text-gray-500 mt-2">
                생성: {new Date(item.createdAt).toLocaleString()}
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
