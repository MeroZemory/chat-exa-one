import { useState, useEffect } from "react";
import type { QueueItem } from "@/lib/queue";

export default function Home() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 큐 아이템 목록 가져오기
  const fetchItems = async () => {
    try {
      const response = await fetch("/api/queue");
      const data = await response.json();
      setItems(data);
    } catch (error) {
      console.error("Failed to fetch queue items:", error);
    }
  };

  // 새로운 요청 추가
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

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
        fetchItems();
      }
    } catch (error) {
      console.error("Failed to add queue item:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 주기적으로 큐 상태 업데이트
  useEffect(() => {
    fetchItems();
    const interval = setInterval(fetchItems, 1000); // 1초마다 업데이트
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">ExaOne 3.5 큐 시스템</h1>

        {/* 새 요청 입력 폼 */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="프롬프트를 입력하세요"
              className="flex-1 p-2 border rounded"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
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
