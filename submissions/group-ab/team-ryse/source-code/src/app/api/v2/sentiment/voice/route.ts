import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { VoiceMessage } from "@/types/conversation";

const google = createGoogleGenerativeAI({
  baseURL: process.env.AI_GOOGLE_GENAI_API_URL as string,
  apiKey: process.env.AI_GOOGLE_GENAI_API_KEY as string,
});

export async function POST(req: Request) {
  const { messages }: { messages: VoiceMessage[] } = await req.json();

  const transcript = messages
    .map((m) => {
      const label =
        m.role === "judge"
          ? "JUDGE"
          : m.role === "counsel"
            ? "OPPOSING COUNSEL"
            : "USER";
      return `[${label}]: ${m.text}`;
    })
    .join("\n");

  const result = await generateObject({
    model: google("gemini-2.5-flash-lite"),
    schema: z.object({
      score: z
        .number()
        .min(-1)
        .max(1)
        .describe(
          "-1 means strongly favoring prosecutor, 0 means neutral, 1 means strongly favoring defense",
        ),
      reasoning: z
        .string()
        .describe("Brief explanation of why the judge leans this way"),
    }),
    system: `You are analyzing an ongoing legal debate simulation.
    Based on ALL conversation so far — the arguments, the judge's rulings, and the tone — determine which side the judge is currently favoring.

    Score interpretation:
    - -1.0: Strongly favoring the PROSECUTOR
    -  0.0: Perfectly neutral
    - +1.0: Strongly favoring the DEFENSE

    Be objective. Consider the strength of arguments, how the judge responds to each side, and any implied biases.`,
    prompt: `Analyze the following voice court transcript and determine the judge's leaning:\n\n${transcript}`,
  });

  return Response.json(result.object);
}
