export interface QueueItem {
  id: string;
  sequence: number;
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: string;
  createdAt: Date;
  updatedAt: Date;
}

type QueueEventCallback = (item: QueueItem) => void;

// 전역 상태를 위한 모듈
interface QueueState {
  pendingItems: QueueItem[]; // 처리 대기 중인 항목들
  historyItems: QueueItem[]; // 처리 완료된 이력
  currentSequence: number;
}

// 모듈 스코프의 상태
let queueState: QueueState | undefined;

// 상태 접근을 위한 함수
function getQueueState(): QueueState {
  if (!queueState) {
    queueState = {
      pendingItems: [],
      historyItems: [],
      currentSequence: 0,
    };
  }
  return queueState;
}

class Queue {
  private static instance: Queue;
  private onItemAddedCallbacks: QueueEventCallback[] = [];
  private onItemUpdatedCallbacks: QueueEventCallback[] = [];

  private constructor() {
    // 큐가 비어있을 때만 테스트 데이터 추가
    if (
      getQueueState().pendingItems.length === 0 &&
      getQueueState().historyItems.length === 0
    ) {
      this.addTestData();
    }
  }

  private addTestData() {
    const testItems: Omit<QueueItem, "id" | "sequence">[] = [
      {
        prompt: "안녕",
        status: "completed",
        result: "네, 안녕하세요! 저도 반갑습니다.",
        createdAt: new Date(Date.now() - 3600000), // 1시간 전
        updatedAt: new Date(Date.now() - 3590000), // 59분 50초 전
      },
    ];

    testItems.forEach((item) => {
      this.enqueue(item.prompt, item);
    });
  }

  public static getInstance(): Queue {
    if (!Queue.instance) {
      Queue.instance = new Queue();
    }
    return Queue.instance;
  }

  onItemAdded(callback: QueueEventCallback) {
    this.onItemAddedCallbacks.push(callback);
  }

  onItemUpdated(callback: QueueEventCallback) {
    this.onItemUpdatedCallbacks.push(callback);
  }

  private notifyItemAdded(item: QueueItem) {
    this.onItemAddedCallbacks.forEach((callback) => callback(item));
  }

  private notifyItemUpdated(item: QueueItem) {
    this.onItemUpdatedCallbacks.forEach((callback) => callback(item));
  }

  enqueue(prompt: string, initialData?: Partial<QueueItem>): QueueItem {
    const state = getQueueState();
    const item: QueueItem = {
      id: crypto.randomUUID(),
      sequence: ++state.currentSequence,
      prompt,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...initialData,
    };

    // completed나 failed 상태인 경우 이력에 추가, 그 외에는 대기 큐에 추가
    if (item.status === "completed" || item.status === "failed") {
      state.historyItems.push(item);
    } else {
      state.pendingItems.push(item);
    }

    this.notifyItemAdded(item);
    return item;
  }

  dequeue(): QueueItem | undefined {
    const state = getQueueState();
    const pendingItem = state.pendingItems.find(
      (item: QueueItem) => item.status === "pending"
    );
    if (pendingItem) {
      pendingItem.status = "processing";
      pendingItem.updatedAt = new Date();
      this.notifyItemUpdated(pendingItem);
    }
    return pendingItem;
  }

  getItem(id: string): QueueItem | undefined {
    const state = getQueueState();
    return (
      getQueueState().pendingItems.find((item: QueueItem) => item.id === id) ||
      getQueueState().historyItems.find((item: QueueItem) => item.id === id)
    );
  }

  getAllItems(): QueueItem[] {
    // 이력 큐에서만 가져오기
    return getQueueState().historyItems.filter(
      (item: QueueItem) =>
        item.status === "completed" || item.status === "failed"
    );
  }

  getItemsAfterSequence(sequence: number): QueueItem[] {
    // 이력 큐에서 특정 시퀀스 이후의 항목만 가져오기
    return getQueueState().historyItems.filter(
      (item: QueueItem) => item.sequence > sequence
    );
  }

  updateItem(id: string, update: Partial<QueueItem>): QueueItem | undefined {
    const state = getQueueState();

    // 먼저 대기 큐에서 찾기
    const pendingIndex = state.pendingItems.findIndex((item) => item.id === id);
    if (pendingIndex !== -1) {
      const item = state.pendingItems[pendingIndex];
      Object.assign(item, { ...update, updatedAt: new Date() });

      // completed나 failed 상태로 변경된 경우 이력으로 이동
      if (item.status === "completed" || item.status === "failed") {
        state.pendingItems.splice(pendingIndex, 1);
        state.historyItems.push(item);
      }

      this.notifyItemUpdated(item);
      return item;
    }

    // 이력 큐에서 찾기
    const historyItem = state.historyItems.find((item) => item.id === id);
    if (historyItem) {
      Object.assign(historyItem, { ...update, updatedAt: new Date() });
      this.notifyItemUpdated(historyItem);
      return historyItem;
    }

    return undefined;
  }

  getCurrentSequence(): number {
    return getQueueState().currentSequence;
  }
}

export const queue = Queue.getInstance();
