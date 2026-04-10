import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, UIMessage, convertToModelMessages } from "ai";

export const maxDuration = 30;

const google = createGoogleGenerativeAI({
  baseURL: process.env.AI_GOOGLE_GENAI_API_URL as string,
  apiKey: process.env.AI_GOOGLE_GENAI_API_KEY as string,
});

export async function POST(req: Request) {
  const { messages, role }: { messages: UIMessage[]; role?: string } =
    await req.json();
  const userRole = role || "prosecutor";

  const result = streamText({
    model: google("gemini-2.5-flash-lite"),
    system: `You are a legal simulator.
    Roles:
    1. [JUDGE]: Neutral, evaluates the law based on PP 35/2021.
    2. [PROSECUTOR]: Aggressive, focuses on worker rights and proportionality.
    3. [DEFENSE]: Focuses on internal regulations and the fact that theft occurred.

    Current User is playing as: ${userRole}.
    Your task: Respond as BOTH the Judge and the OPPOSING counsel.

    Format:
    [JUDGE]: ...
    [${userRole === "prosecutor" ? "DEFENSE" : "PROSECUTOR"}]: ...`,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
