export interface QueueItem {
  id: string;
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: string;
  createdAt: Date;
  updatedAt: Date;
}

class Queue {
  private items: QueueItem[] = [];
  private static instance: Queue;

  private constructor() {}

  public static getInstance(): Queue {
    if (!Queue.instance) {
      Queue.instance = new Queue();
    }
    return Queue.instance;
  }

  enqueue(prompt: string): QueueItem {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      prompt,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.items.push(item);
    return item;
  }

  dequeue(): QueueItem | undefined {
    const pendingItem = this.items.find((item) => item.status === "pending");
    if (pendingItem) {
      pendingItem.status = "processing";
      pendingItem.updatedAt = new Date();
    }
    return pendingItem;
  }

  getItem(id: string): QueueItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  getAllItems(): QueueItem[] {
    return [...this.items];
  }

  updateItem(id: string, update: Partial<QueueItem>): QueueItem | undefined {
    const item = this.items.find((item) => item.id === id);
    if (item) {
      Object.assign(item, { ...update, updatedAt: new Date() });
      return item;
    }
    return undefined;
  }
}

export const queue = Queue.getInstance();
