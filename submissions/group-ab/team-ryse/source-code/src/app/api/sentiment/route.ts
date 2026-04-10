import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, UIMessage, convertToModelMessages } from "ai";
import { z } from "zod";

const google = createGoogleGenerativeAI({
  baseURL: process.env.AI_GOOGLE_GENAI_API_URL as string,
  apiKey: process.env.AI_GOOGLE_GENAI_API_KEY as string,
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

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
    messages: await convertToModelMessages(messages),
  });

  return Response.json(result.object);
}
