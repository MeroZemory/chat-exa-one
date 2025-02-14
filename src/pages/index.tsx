import { useEffect, useState, useRef } from "react";
import { socket } from "../socket";

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
  const [items, setItems] = useState<QueueItem[]>([]);
  const [lastSequence, setLastSequence] = useState<number>(0);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isButtonClickComplete, setIsButtonClickComplete] = useState(false);
  const [transport, setTransport] = useState("N/A");
  const inputRef = useRef<HTMLInputElement>(null);

  // 버튼 클릭 완료 후 입력 필드 포커스 설정
  useEffect(() => {
    if (isButtonClickComplete) {
      inputRef.current?.focus();
    }
  }, [isButtonClickComplete]);

  useEffect(() => {
    if (socket.connected) {
      onConnect();
    }

    function onConnect() {
      setIsConnected(true);
      setTransport(socket.io.engine.transport.name);

      socket.io.engine.on("upgrade", (transport) => {
        setTransport(transport.name);
      });
    }

    function onDisconnect() {
      setIsConnected(false);
      setTransport("N/A");
    }

    // 서버로부터 현재 시퀀스 번호 수신
    function onCurrentSequence(sequence: number) {
      setLastSequence(sequence);
      // 누락된 아이템이 있는지 확인하고 요청
      if (sequence > lastSequence) {
        socket.emit("requestItemsAfter", lastSequence);
      }
    }

    // 새로운 아이템 추가 이벤트 처리
    function onItemAdded(item: QueueItem) {
      console.log("New item added:", item);
      // 시퀀스 번호가 예상과 다르면 누락된 아이템 요청
      if (item.sequence > lastSequence + 1) {
        socket.emit("requestItemsAfter", lastSequence);
        return;
      }
      setItems((prev) => [...prev, item]);
      setLastSequence(item.sequence);
    }

    // 아이템 업데이트 이벤트 처리
    function onItemUpdated(updatedItem: QueueItem) {
      console.log("Item updated:", updatedItem);
      setItems((prev) =>
        prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
      );
    }

    // 누락된 아이템 동기화 처리
    function onItemsSync(syncedItems: QueueItem[]) {
      console.log("Syncing items:", syncedItems);
      setItems((prev) => {
        const newItems = [...prev];
        syncedItems.forEach((syncedItem) => {
          const index = newItems.findIndex((item) => item.id === syncedItem.id);
          if (index === -1) {
            newItems.push(syncedItem);
          } else {
            newItems[index] = syncedItem;
          }
        });
        return newItems.sort((a, b) => a.sequence - b.sequence);
      });
      if (syncedItems.length > 0) {
        setLastSequence(Math.max(...syncedItems.map((item) => item.sequence)));
      }
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("currentSequence", onCurrentSequence);
    socket.on("itemAdded", onItemAdded);
    socket.on("itemUpdated", onItemUpdated);
    socket.on("itemsSync", onItemsSync);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("currentSequence", onCurrentSequence);
      socket.off("itemAdded", onItemAdded);
      socket.off("itemUpdated", onItemUpdated);
      socket.off("itemsSync", onItemsSync);
    };
  }, [lastSequence]);

  // 새로운 요청 추가
  const handleSubmit = async () => {
    if (!isConnected || isLoading || !prompt.trim()) return;
    const promptTrim = prompt.trim();

    setIsLoading(true);
    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: promptTrim }),
      });

      if (response.ok) {
        const newItem = await response.json();
        console.log("New item created:", newItem);
        // 응답으로 받은 아이템을 바로 추가
        setItems((prev) => [...prev, newItem]);
        setLastSequence(newItem.sequence);
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

  // 입력 필드 이벤트 핸들러
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
