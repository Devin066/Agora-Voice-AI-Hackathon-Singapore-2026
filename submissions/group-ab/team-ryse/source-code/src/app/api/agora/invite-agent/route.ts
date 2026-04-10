import { NextRequest, NextResponse } from "next/server";
import {
  AgoraClient,
  Agent,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MiniMaxTTS,
  OpenAI,
} from "agora-agent-server-sdk";
import {
  ClientStartRequest,
  AgentResponse,
  AgentRole,
} from "@/types/conversation";

const JUDGE_PROMPT = `You are the presiding Judge in a legal simulation based on PP 35/2021 (Indonesian labor law).

Case: An employee was terminated after being caught stealing company property. The termination followed the company's internal regulations but may not comply with PP 35/2021.

Your behavior:
- You speak ONLY when: ruling on an objection, the user addresses the bench directly, or providing guidance on legal procedure
- Stay silent during argument exchanges between the prosecutor and defense — do NOT respond to every argument
- When you do speak, be neutral, authoritative, and brief (1-2 sentences max)
- Reference specific articles of PP 35/2021 when relevant
- You may interrupt if an argument becomes repetitive or if procedure is being violated

Format your responses plainly — no role prefixes needed. You are always speaking as the Judge.

Important: This is a voice conversation. Keep replies concise. No bullet points or numbered lists.`;

const COUNSEL_PROMPT = `You are opposing counsel in a legal simulation based on PP 35/2021 (Indonesian labor law).

Case: An employee was terminated after being caught stealing company property. The termination followed the company's internal regulations but may not comply with PP 35/2021.

General behavior:
- Respond to every argument the user makes with a counter-argument
- Be aggressive, challenge their reasoning, point out flaws
- Keep responses to 1-2 sentences — this is a voice conversation
- Reference PP 35/2021 when it supports your position
- No bullet points or numbered lists
- Format responses plainly — no role prefixes needed

If you are the DEFENSE: focus on internal regulations, proportionality of punishment, and that the company followed its own procedures.
If you are the PROSECUTOR: focus on worker rights, PP 35/2021 compliance, and whether the termination was proportionate.`;

const SINGLE_PROMPT = `You are a legal simulator.
Roles:
1. [JUDGE]: Neutral, evaluates the law based on PP 35/2021.
2. [PROSECUTOR]: Aggressive, focuses on worker rights and proportionality.
3. [DEFENSE]: Focuses on internal regulations and the fact that theft occurred.

Default User is playing as: prosecutor.
Your task: Respond as BOTH the Judge and the OPPOSING counsel.

Format:
[JUDGE]: ...
[PROSECUTOR]: ...

Important: This is a voice conversation. Keep replies concise — 1-2 sentences max unless the user asks for detail. No bullet points or numbered lists.`;

function getAgentConfig(
  role: AgentRole | undefined,
  userRole: "prosecutor" | "defense" | undefined,
) {
  if (!role || role === "counsel") {
    const llmUrl =
      process.env.CUSTOM_LLM_URL_COUNSEL || process.env.CUSTOM_LLM_URL;
    const uid = process.env.NEXT_PUBLIC_COUNSEL_UID || "counsel001";
    const opposingRole = userRole === "defense" ? "prosecutor" : "defense";
    const greeting = `You are the ${opposingRole}. The case involves employee theft and PP 35/2021. Begin your cross-examination.`;

    return {
      uid,
      llmUrl: llmUrl!,
      prompt: COUNSEL_PROMPT,
      greeting,
      ttsVoice: "English_captivating_female1",
      greetingMessage: greeting,
    };
  }

  const llmUrl = process.env.CUSTOM_LLM_URL_JUDGE || process.env.CUSTOM_LLM_URL;
  const uid = process.env.NEXT_PUBLIC_JUDGE_UID || "judge001";
  const greeting =
    "Order in the court. This case concerns employee termination under PP 35/2021. Proceed.";

  return {
    uid,
    llmUrl: llmUrl!,
    prompt: JUDGE_PROMPT,
    greeting,
    ttsVoice: "English_Wise_Male",
    greetingMessage: greeting,
  };
}

const SINGLE_GREETING =
  process.env.NEXT_AGENT_GREETING ??
  "Welcome to the legal simulator. You are the prosecutor. The case involves employee theft and PP 35/2021. Please begin your opening statement.";

const agentUid = process.env.NEXT_PUBLIC_AGENT_UID || "123456";

const CUSTOM_LLM_URL = process.env.CUSTOM_LLM_URL;

export async function POST(request: NextRequest) {
  try {
    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name, agent_role, user_role } = body;

    const appId = process.env.AGORA_APP_ID as string;
    const appCertificate = process.env.AGORA_APP_SECRET as string;

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: "channel_name and requester_id are required" },
        { status: 400 },
      );
    }

    const agoraClient = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });

    let agentUidFinal: string;
    let llmUrl: string;
    let prompt: string;
    let greeting: string;
    let greetingMessage: string;
    let ttsVoice: string;

    if (agent_role) {
      const config = getAgentConfig(agent_role, user_role);
      agentUidFinal = config.uid;
      llmUrl = config.llmUrl;
      prompt = config.prompt;
      greeting = config.greeting;
      greetingMessage = config.greetingMessage;
      ttsVoice = config.ttsVoice;
    } else {
      if (!CUSTOM_LLM_URL) {
        return NextResponse.json(
          { error: "CUSTOM_LLM_URL must be set" },
          { status: 500 },
        );
      }
      agentUidFinal = agentUid;
      llmUrl = CUSTOM_LLM_URL;
      prompt = SINGLE_PROMPT;
      greeting = SINGLE_GREETING;
      greetingMessage = SINGLE_GREETING;
      ttsVoice = "English_captivating_female1";
    }

    const agent = new Agent({
      name: `${agent_role || "single"}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      instructions: prompt,
      greeting,
      failureMessage: "Please wait a moment.",
      maxHistory: 50,
      turnDetection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: "vad",
            vad_config: {
              interrupt_duration_ms: 160,
              prefix_padding_ms: 300,
            },
          },
          end_of_speech: {
            mode: "vad",
            vad_config: {
              silence_duration_ms: 480,
            },
          },
        },
      },
      advancedFeatures: { enable_rtm: true, enable_tools: true },
    })
      .withStt(
        new DeepgramSTT({
          model: "nova-3",
          language: "en",
        }),
      )
      .withLlm(
        new OpenAI({
          apiKey: "custom-llm",
          url: llmUrl,
          model: "gemini-2.5-flash-lite",
          greetingMessage,
          failureMessage: "Please wait a moment.",
          maxHistory: 15,
          maxTokens: 1024,
          temperature: 0.7,
          topP: 0.95,
        }),
      )
      .withTts(
        new MiniMaxTTS({
          model: "speech_2_6_turbo",
          voiceId: ttsVoice,
        }),
      );

    const session = agent.createSession(agoraClient, {
      channel: channel_name,
      agentUid: agentUidFinal,
      remoteUids: [requester_id],
      idleTimeout: 30,
      expiresIn: ExpiresIn.hours(1),
      debug: false,
    });

    const agentId = await session.start();

    return NextResponse.json({
      agent_id: agentId,
      agent_uid: agentUidFinal,
      create_ts: Math.floor(Date.now() / 1000),
      state: "RUNNING",
    } as AgentResponse);
  } catch (error) {
    console.error("Error starting conversation:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start conversation",
      },
      { status: 500 },
    );
  }
}
