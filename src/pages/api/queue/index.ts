import type { NextApiRequest, NextApiResponse } from "next";
import { queue } from "@/lib/queue";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    const items = queue.getAllItems();
    return res.status(200).json(items);
  }

  if (req.method === "POST") {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Prompt is required and must be a string",
      });
    }

    const item = queue.enqueue(prompt);
    return res.status(201).json(item);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
