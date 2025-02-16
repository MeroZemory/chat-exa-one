import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

interface QueueItem {
  id: string;
  sequence: number;
  prompt: string;
  status: string;
  result?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
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

  // 컴포넌트 마운트 시 새로운 소켓 인스턴스 생성
  useEffect(() => {
    // window.location.origin을 명시적으로 지정합니다.
    const newSocket = io(window.location.origin, { path: "/api/socketio" });
    setSocket(newSocket);
    return () => {
      newSocket.disconnect();
    };
  }, []);

  // 소켓 이벤트 핸들러 등록 (socket이 있을 때)
  useEffect(() => {
    if (!socket) return;

    function onConnect(socket: Socket) {
      setIsConnected(true);
      setTransport(socket.io.engine.transport.name);
      // 서버는 연결 시 자동으로 전체 큐(itemsSync)를 전송합니다.
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
        (a, b) => a.sequence - b.sequence
      );
      setItems(sortedItems);
      if (sortedItems.length > 0) {
        lastSequenceRef.current = sortedItems[sortedItems.length - 1].sequence;
      } else {
        lastSequenceRef.current = 0;
      }
    }

    // 새로운 항목 추가 이벤트
    function onItemAdded(item: QueueItem) {
      console.log("Received itemAdded:", item);
      // 시퀀스 번호가 중복되거나 이전 항목이면 무시
      if (item.sequence <= lastSequenceRef.current) return;
      setItems((prev) => [...prev, item]);
      lastSequenceRef.current = item.sequence;
    }

    // 항목 업데이트 이벤트
    function onItemUpdated(updatedItem: QueueItem) {
      console.log("Received itemUpdated:", updatedItem);
      setItems((prev) =>
        prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
      );
    }

    socket.on("connect", () => onConnect(socket));
    socket.on("disconnect", onDisconnect);
    socket.on("itemsSync", onItemsSync);
    socket.on("itemAdded", onItemAdded);
    socket.on("itemUpdated", onItemUpdated);

    return () => {
      socket.off("connect", () => onConnect(socket));
      socket.off("disconnect", onDisconnect);
      socket.off("itemsSync", onItemsSync);
      socket.off("itemAdded", onItemAdded);
      socket.off("itemUpdated", onItemUpdated);
    };
  }, [socket]);

  // 새로운 요청 추가 (POST /api/queue)
  const handleSubmit = async () => {
    if (!isConnected || isLoading || !prompt.trim()) return;
    const promptTrim = prompt.trim();

    setIsLoading(true);
    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptTrim }),
      });

      if (response.ok) {
        const newItem = await response.json();
        console.log("New item created (via POST):", newItem);
        // 응답 받은 항목을 바로 추가 (서버에서 itemAdded 이벤트가 발생하더라도 중복되지 않도록)
        setItems((prev) => [...prev, newItem]);
        lastSequenceRef.current = newItem.sequence;
        setPrompt("");
      } else {
        console.error("Failed to add item:", await response.text());
      }
    } catch (error) {
      console.error("Failed to add queue item:", error);
    } finally {
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
          {items.map((item) => (
            <div key={item.id} className="p-4 border rounded shadow">
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium">{item.prompt}</p>
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
          {items.length === 0 && (
            <p className="text-gray-500 text-center py-8">
              아직 큐에 요청이 없습니다.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
