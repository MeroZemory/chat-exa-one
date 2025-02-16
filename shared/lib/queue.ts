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
  items: QueueItem[];
  currentSequence: number;
}

// 모듈 스코프의 상태
let queueState: QueueState | undefined;

// 상태 접근을 위한 함수
function getQueueState(): QueueState {
  if (!queueState) {
    queueState = {
      items: [],
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
    if (getQueueState().items.length === 0) {
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
    state.items.push(item);
    this.notifyItemAdded(item);
    return item;
  }

  dequeue(): QueueItem | undefined {
    const state = getQueueState();
    const pendingItem = state.items.find((item) => item.status === "pending");
    if (pendingItem) {
      pendingItem.status = "processing";
      pendingItem.updatedAt = new Date();
      this.notifyItemUpdated(pendingItem);
    }
    return pendingItem;
  }

  getItem(id: string): QueueItem | undefined {
    return getQueueState().items.find((item) => item.id === id);
  }

  getAllItems(): QueueItem[] {
    return [...getQueueState().items];
  }

  getItemsAfterSequence(sequence: number): QueueItem[] {
    return getQueueState().items.filter((item) => item.sequence > sequence);
  }

  updateItem(id: string, update: Partial<QueueItem>): QueueItem | undefined {
    const state = getQueueState();
    const item = state.items.find((item) => item.id === id);
    if (item) {
      Object.assign(item, { ...update, updatedAt: new Date() });
      this.notifyItemUpdated(item);
      return item;
    }
    return undefined;
  }

  getCurrentSequence(): number {
    return getQueueState().currentSequence;
  }
}

export const queue = Queue.getInstance();
