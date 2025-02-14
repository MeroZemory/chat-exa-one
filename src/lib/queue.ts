import { socket } from "../socket";

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

class Queue {
  private items: QueueItem[] = [];
  private static instance: Queue;
  private currentSequence: number = 0;
  private onItemAddedCallbacks: QueueEventCallback[] = [];
  private onItemUpdatedCallbacks: QueueEventCallback[] = [];

  private constructor() {}

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

  enqueue(prompt: string): QueueItem {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      sequence: ++this.currentSequence,
      prompt,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.items.push(item);
    this.notifyItemAdded(item);
    return item;
  }

  dequeue(): QueueItem | undefined {
    const pendingItem = this.items.find((item) => item.status === "pending");
    if (pendingItem) {
      pendingItem.status = "processing";
      pendingItem.updatedAt = new Date();
      this.notifyItemUpdated(pendingItem);
    }
    return pendingItem;
  }

  getItem(id: string): QueueItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  getAllItems(): QueueItem[] {
    return [...this.items];
  }

  getItemsAfterSequence(sequence: number): QueueItem[] {
    return this.items.filter((item) => item.sequence > sequence);
  }

  updateItem(id: string, update: Partial<QueueItem>): QueueItem | undefined {
    const item = this.items.find((item) => item.id === id);
    if (item) {
      Object.assign(item, { ...update, updatedAt: new Date() });
      this.notifyItemUpdated(item);
      return item;
    }
    return undefined;
  }

  getCurrentSequence(): number {
    return this.currentSequence;
  }
}

export const queue = Queue.getInstance();
