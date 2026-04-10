import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { randomUUID } from "crypto";

export async function createSSEStream(
  request: NextRequest,
  systemPrompt: string,
) {
  const apiKey = process.env.AI_GOOGLE_GENAI_API_KEY;
  const baseURL = process.env.AI_GOOGLE_GENAI_API_URL;
  const modelId = "gemini-2.5-flash-lite";

  if (!apiKey || !baseURL) {
    return NextResponse.json(
      {
        error:
          "AI_GOOGLE_GENAI_API_KEY and AI_GOOGLE_GENAI_API_URL must be set",
      },
      { status: 500 },
    );
  }

  let body: {
    messages?: Array<{ role: string; content: unknown }>;
    model?: string;
    stream?: boolean;
    [key: string]: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const google = createGoogleGenerativeAI({ baseURL, apiKey });

  const result = streamText({
    model: google(modelId),
    system: systemPrompt,
    messages: (body.messages ?? []) as NonNullable<
      Parameters<typeof streamText>[0]["messages"]
    >,
  });

  const encoder = new TextEncoder();
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model ?? modelId;

  const sseChunk = (
    delta: Record<string, unknown>,
    finishReason: string | null = null,
  ) =>
    encoder.encode(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      })}\n\n`,
    );

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(sseChunk({ role: "assistant", content: "" }));

        for await (const chunk of result.textStream) {
          controller.enqueue(sseChunk({ content: chunk }));
        }

        controller.enqueue(sseChunk({}, "stop"));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        console.error("[chat/completions] Stream error:", err);
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
