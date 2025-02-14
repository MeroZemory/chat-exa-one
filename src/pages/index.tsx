import { useEffect, useState } from "react";
import { socket } from "../socket";

interface QueueItem {
  id: string;
  prompt: string;
  status: string;
  result?: string;
  createdAt: string;
}

export default function Home() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState("N/A");

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

    // 초기 동기화 이벤트 처리
    function onInitialSync(initialState: any) {
      console.log("Received initial state");
      setItems(initialState);
    }

    // 큐 업데이트 이벤트 처리
    function onQueueUpdated({ type, item }: { type: string; item: any }) {
      if (type === "added") {
        setItems((prev: any[]) => {
          // 중복 체크
          if (prev.some((existingItem) => existingItem.id === item.id)) {
            return prev;
          }
          return [...prev, item];
        });
      }
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("initialSync", onInitialSync);
    socket.on("queueUpdated", onQueueUpdated);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("initialSync", onInitialSync);
      socket.off("queueUpdated", onQueueUpdated);
    };
  }, []);

  // 새로운 요청 추가
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || !isConnected) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (response.ok) {
        setPrompt("");
      }
    } catch (error) {
      console.error("Failed to add queue item:", error);
    } finally {
      setIsLoading(false);
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
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="프롬프트를 입력하세요"
              className="flex-1 p-2 border rounded"
              disabled={isLoading || !isConnected}
            />
            <button
              type="submit"
              disabled={isLoading || !isConnected}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {isLoading ? "처리 중..." : "요청 추가"}
            </button>
          </div>
        </form>

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
