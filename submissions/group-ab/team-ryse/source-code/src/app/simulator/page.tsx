"use client";

import { useChat } from "@ai-sdk/react";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Loader2, Mic, MicOff, PhoneOff } from "lucide-react";
import type { RTMClient } from "agora-rtm";
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
  VoiceMessage,
} from "@/types/conversation";

const DualConversationComponent = dynamic(
  () => import("./DualConversationComponent"),
  { ssr: false },
);

const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } =
      await import("agora-rtc-react");
    return {
      default: function AgoraProviders({
        children,
      }: {
        children: React.ReactNode;
      }) {
        const clientRef = useRef<ReturnType<
          typeof AgoraRTC.createClient
        > | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({
            mode: "rtc",
            codec: "vp8",
          });
        }
        return (
          <AgoraRTCProvider client={clientRef.current}>
            {children}
          </AgoraRTCProvider>
        );
      },
    };
  },
  { ssr: false },
);

type Sentiment = {
  score: number;
  reasoning: string;
};

type ColumnMessage = {
  id: string;
  text: string;
  source: "text" | "voice";
  timestamp: number;
};

export default function ConvoV3Page() {
  return (
    <Suspense>
      <ConvoV3Content />
    </Suspense>
  );
}

function ConvoV3Content() {
  const searchParams = useSearchParams();
  const role = useMemo<"prosecutor" | "defense">(() => {
    const param = searchParams.get("role");
    return param === "defense_attorney" ? "defense" : "prosecutor";
  }, [searchParams]);
  const [textInput, setTextInput] = useState("");
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);

  const [showRTC, setShowRTC] = useState(false);
  const [isLoadingRTC, setIsLoadingRTC] = useState(false);
  const [rtcError, setRtcError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [voiceMessages, setVoiceMessages] = useState<VoiceMessage[]>([]);
  const sentimentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSentiment = useCallback(async (msgs: typeof messages) => {
    if (msgs.length === 0) return;
    setSentimentLoading(true);
    try {
      const res = await fetch("/api/sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });
      const data: Sentiment = await res.json();
      setSentiment(data);
    } catch {
      setSentiment(null);
    } finally {
      setSentimentLoading(false);
    }
  }, []);

  const handleAgentTurnComplete = useCallback(() => {
    if (sentimentTimerRef.current) clearTimeout(sentimentTimerRef.current);
    sentimentTimerRef.current = setTimeout(async () => {
      setSentimentLoading(true);
      try {
        const res = await fetch("/api/sentiment/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: voiceMessages }),
        });
        const data: Sentiment = await res.json();
        setSentiment(data);
      } catch {
        setSentiment(null);
      } finally {
        setSentimentLoading(false);
      }
    }, 1000);
  }, [voiceMessages]);

  const { messages, sendMessage, status } = useChat({
    onFinish: ({ messages: msgs }) => {
      fetchSentiment(msgs);
    },
  });

  const scrollRef1 = useRef<HTMLDivElement>(null);
  const scrollRef2 = useRef<HTMLDivElement>(null);
  const scrollRef3 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    [scrollRef1, scrollRef2, scrollRef3].forEach((ref) => {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    });
  });

  const isLoading = status === "submitted" || status === "streaming";

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isLoading) return;
    await sendMessage({ text: textInput }, { body: { role } });
    setTextInput("");
  };

  const getTextContent = useCallback(
    (m: (typeof messages)[number]) =>
      m.parts
        .filter(
          (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
        )
        .map((p) => p.text)
        .join(""),
    [],
  );

  const extractRoleContent = useCallback((content: string, prefix: string) => {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `${escaped}\\s*([\\s\\S]*?)(?=\\[(?:JUDGE|PROSECUTOR|DEFENSE)\\]|$)`,
      "i",
    );
    const match = content.match(regex);
    const text = match?.[1]?.trim();
    return text || null;
  }, []);

  const handleVoiceTranscripts = useCallback((msgs: VoiceMessage[]) => {
    setVoiceMessages(msgs);
  }, []);

  const handleStartRTC = async () => {
    setIsLoadingRTC(true);
    setRtcError(null);

    try {
      const agoraResponse = await fetch("/api/agora/generate-token");
      const responseData = await agoraResponse.json();
      if (!agoraResponse.ok) {
        throw new Error(
          `Token generation failed: ${JSON.stringify(responseData)}`,
        );
      }

      const rtmImport = import("agora-rtm").then(
        async ({ default: AgoraRTM }) => {
          const rtm = new AgoraRTM.RTM(
            process.env.NEXT_PUBLIC_AGORA_APP_ID!,
            String(Date.now()),
          );
          await rtm.login({ token: responseData.token });
          await rtm.subscribe(responseData.channel);
          return rtm as RTMClient;
        },
      );

      const [judgeRes, counselRes, rtm] = await Promise.all([
        fetch("/api/agora/invite-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
            agent_role: "judge",
            user_role: role,
          } as ClientStartRequest),
        }).then(async (res) => {
          if (!res.ok) throw new Error("Failed to start judge agent");
          return res.json() as Promise<AgentResponse>;
        }),
        fetch("/api/agora/invite-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
            agent_role: "counsel",
            user_role: role,
          } as ClientStartRequest),
        }).then(async (res) => {
          if (!res.ok) throw new Error("Failed to start counsel agent");
          return res.json() as Promise<AgentResponse>;
        }),
        rtmImport,
      ]);

      setRtmClient(rtm);
      setAgoraData({
        ...responseData,
        judgeAgentId: judgeRes.agent_id,
        counselAgentId: counselRes.agent_id,
      });
      setShowRTC(true);
    } catch (err) {
      setRtcError(
        err instanceof Error ? err.message : "Failed to start voice session",
      );
      console.error("Error starting RTC:", err);
    } finally {
      setIsLoadingRTC(false);
    }
  };

  const handleTokenWillExpire = async (uid: string) => {
    try {
      const response = await fetch(
        `/api/agora/generate-token?channel=${agoraData?.channel}&uid=${uid}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error("Failed to generate new token");
      return data.token;
    } catch (error) {
      console.error("Error renewing token:", error);
      throw error;
    }
  };

  const handleEndConversation = async () => {
    if (sentimentTimerRef.current) clearTimeout(sentimentTimerRef.current);
    const agentIds = [
      agoraData?.judgeAgentId,
      agoraData?.counselAgentId,
    ].filter(Boolean);
    await Promise.all(
      agentIds.map((agentId) =>
        fetch("/api/agora/stop-conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: agentId }),
        }).catch((err) => console.error("Error stopping agent:", err)),
      ),
    );
    rtmClient?.logout().catch((err) => console.error("RTM logout error:", err));
    setRtmClient(null);
    setShowRTC(false);
    setVoiceMessages([]);
  };

  const getColumnMessages = useCallback(
    (columnType: "prosecution" | "judge" | "defense"): ColumnMessage[] => {
      const result: ColumnMessage[] = [];

      for (const m of messages) {
        const content = getTextContent(m);

        if (m.role === "user") {
          if (
            (columnType === "prosecution" && role === "prosecutor") ||
            (columnType === "defense" && role === "defense")
          ) {
            result.push({
              id: m.id,
              text: content,
              source: "text",
              timestamp: messages.indexOf(m),
            });
          }
          continue;
        }

        const prefix =
          columnType === "judge"
            ? "[JUDGE]"
            : columnType === "prosecution"
              ? "[PROSECUTOR]"
              : "[DEFENSE]";
        const roleContent = extractRoleContent(content, prefix);
        if (roleContent) {
          result.push({
            id: m.id,
            text: roleContent,
            source: "text",
            timestamp: messages.indexOf(m),
          });
        }
      }

      for (const vm of voiceMessages) {
        if (vm.role === "user") {
          if (
            (columnType === "prosecution" && role === "prosecutor") ||
            (columnType === "defense" && role === "defense")
          ) {
            result.push({
              id: vm.id,
              text: vm.text,
              source: "voice",
              timestamp: vm.timestamp,
            });
          }
        } else if (vm.role === "judge" && columnType === "judge") {
          result.push({
            id: vm.id,
            text: vm.text,
            source: "voice",
            timestamp: vm.timestamp,
          });
        } else if (vm.role === "counsel") {
          const counselColumn =
            role === "prosecutor" ? "defense" : "prosecution";
          if (columnType === counselColumn) {
            result.push({
              id: vm.id,
              text: vm.text,
              source: "voice",
              timestamp: vm.timestamp,
            });
          }
        }
      }

      return result.sort((a, b) => a.timestamp - b.timestamp);
    },
    [messages, voiceMessages, role, getTextContent, extractRoleContent],
  );

  const renderColumn = (
    title: string,
    columnType: "prosecution" | "judge" | "defense",
    scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  ) => {
    const columnMessages = getColumnMessages(columnType);

    useEffect(() => {
      console.dir(columnMessages);
    }, [columnMessages]);

    return (
      <div className="flex flex-col h-[60vh] border-2 border-black rounded-lg bg-white overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="p-2 bg-black text-white font-bold text-[10px] uppercase tracking-widest text-center">
          {title}
        </div>
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-white"
          ref={scrollContainerRef}
        >
          {columnMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 border-2 border-black text-black text-sm font-medium ${
                msg.source === "voice"
                  ? "bg-blue-50 italic flex items-start gap-2"
                  : msg.text.startsWith("[") || msg.source === "text"
                    ? "bg-white italic"
                    : "bg-zinc-100"
              }`}
            >
              {msg.source === "voice" && (
                <Mic className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
              )}
              <span>{msg.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const markerPosition = sentiment ? ((sentiment.score + 1) / 2) * 100 : 50;

  const sentimentLabel = sentiment
    ? sentiment.score <= -0.3
      ? "LEANING PROSECUTOR"
      : sentiment.score >= 0.3
        ? "LEANING DEFENSE"
        : "NEUTRAL"
    : null;

  return (
    <main className="container mx-auto p-8 min-h-screen bg-white">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8 border-b-4 border-black pb-6">
        <div>
          <p className="font-bold text-sm">
            SIMULATION {"//"} CASE: LIGHTER_THEFT_001
            {showRTC && (
              <span className="ml-3 text-green-600">● VOICE ACTIVE</span>
            )}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {!showRTC ? (
            <button
              type="button"
              onClick={handleStartRTC}
              disabled={isLoadingRTC}
              className="flex items-center gap-2 px-4 py-2 border-2 border-black bg-black text-white font-black uppercase text-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all disabled:opacity-50"
            >
              {isLoadingRTC ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" />
                  Start Voice Session
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleEndConversation}
              className="flex items-center gap-2 px-4 py-2 border-2 border-red-600 bg-red-600 text-white font-black uppercase text-xs hover:bg-white hover:text-red-600 transition-all"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              End Voice
            </button>
          )}
          {rtcError && <p className="text-xs text-red-600">{rtcError}</p>}
        </div>
      </div>

      {showRTC && agoraData && rtmClient && (
        <div className="mb-6">
          <AgoraProvider>
            <DualConversationComponent
              agoraData={agoraData}
              rtmClient={rtmClient}
              userRole={role}
              onTokenWillExpire={handleTokenWillExpire}
              onEndConversation={handleEndConversation}
              onVoiceTranscripts={handleVoiceTranscripts}
              onAgentTurnComplete={handleAgentTurnComplete}
            />
          </AgoraProvider>
        </div>
      )}

      <div className="mt-8 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-5">
        <div className="bg-black text-white font-bold text-[10px] uppercase tracking-widest text-center p-2">
          {sentimentLoading ? "ANALYZING SENTIMENT..." : "JUDGE SENTIMENT"}
        </div>
        <div className="p-6 bg-white">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <img
              src="/img/03judge.jpeg"
              alt="Judge"
              className="w-20 h-20 object-cover border-2 border-black flex-shrink-0"
            />
            <div className="flex-1 w-full">
              <div className="relative h-8 border-4 border-black bg-zinc-100">
                <div className="absolute top-0 left-1/2 w-0 h-full border-l-2 border-dashed border-zinc-400 -translate-x-1/2" />
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-black border-2 border-black transition-all duration-700 ease-out"
                  style={{ left: `${markerPosition}%` }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Prosecutor
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Neutral
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Defense
                </span>
              </div>

              {sentiment && !sentimentLoading && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-black uppercase tracking-widest px-3 py-1 border-2 border-black ${
                        sentiment.score <= -0.3
                          ? "bg-black text-white"
                          : sentiment.score >= 0.3
                            ? "bg-black text-white"
                            : "bg-zinc-100 text-black"
                      }`}
                    >
                      {sentimentLabel}
                    </span>
                    <span className="text-xs font-mono font-bold">
                      {sentiment.score > 0 ? "+" : ""}
                      {sentiment.score.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-sm text-black border-2 border-black p-3 bg-zinc-50 italic">
                    {sentiment.reasoning}
                  </p>
                </div>
              )}

              {!sentiment && !sentimentLoading && (
                <p className="mt-4 text-xs font-bold uppercase text-zinc-400 tracking-widest text-center">
                  Submit an argument to begin sentiment analysis
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {renderColumn("Prosecution", "prosecution", scrollRef1)}
        {renderColumn("Judicial Bench", "judge", scrollRef2)}
        {renderColumn("Defense", "defense", scrollRef3)}
      </div>

      {/*<form onSubmit={onFormSubmit} className="mt-12 flex flex-col gap-4">
        <label htmlFor="legal-input" className="text-xs font-black uppercase">
          Your Argument ({role}):
        </label>
        <div className="flex gap-4">
          <input
            id="legal-input"
            className="flex-1 p-4 border-4 border-black font-bold text-lg text-black focus:outline-none placeholder:text-zinc-300"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type your legal reasoning here..."
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !textInput}
            className="bg-black text-white px-10 font-black uppercase text-xl border-4 border-black hover:bg-zinc-800 disabled:bg-zinc-200"
          >
            {isLoading ? "..." : "EXECUTE"}
          </button>
        </div>
      </form>*/}
    </main>
  );
}
