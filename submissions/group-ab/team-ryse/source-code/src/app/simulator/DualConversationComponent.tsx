"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { setParameter } from "agora-rtc-sdk-ng/esm";
import type { IAgoraRTCClient } from "agora-rtc-sdk-ng";
import {
  useRTCClient,
  useLocalMicrophoneTrack,
  useRemoteUsers,
  useClientEvent,
  useJoin,
  usePublish,
  RemoteUser,
  UID,
} from "agora-rtc-react";
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  TurnStatus,
  TranscriptHelperMode,
  type RTMEngine,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
} from "agora-agent-client-toolkit";
import { AudioVisualizer } from "agora-agent-uikit";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import type {
  DualConversationComponentProps,
  VoiceMessage,
} from "@/types/conversation";

const JUDGE_UID = process.env.NEXT_PUBLIC_JUDGE_UID || "judge001";
const COUNSEL_UID = process.env.NEXT_PUBLIC_COUNSEL_UID || "counsel001";

const AGENT_GRADIENTS = {
  judge: ["hsl(45 100% 50%)", "hsl(45 80% 60%)", "hsl(45 60% 70%)"],
  counsel: ["hsl(194 100% 50%)", "hsl(194 80% 60%)", "hsl(194 60% 70%)"],
};

function uidToRole(
  uid: string,
  localUID: string,
): "user" | "judge" | "counsel" {
  if (uid === JUDGE_UID) return "judge";
  if (uid === COUNSEL_UID) return "counsel";
  return "user";
}

function initAgoraVoiceAI(
  client: unknown,
  rtmClient: unknown,
  channel: string,
  onUpdate: (
    items: TranscriptHelperItem<
      Partial<UserTranscription | AgentTranscription>
    >[],
  ) => void,
  onStateChange: (state: AgentState) => void,
): Promise<InstanceType<typeof AgoraVoiceAI>> {
  return AgoraVoiceAI.init({
    rtcEngine: client as IAgoraRTCClient,
    rtmConfig: {
      rtmEngine: rtmClient as unknown as RTMEngine,
    },
    renderMode: TranscriptHelperMode.TEXT,
    enableLog: true,
  }).then((ai) => {
    ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => onUpdate([...t]));
    ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) =>
      onStateChange(event.state),
    );
    ai.subscribeMessage(channel);
    return ai;
  });
}

export default function DualConversationComponent({
  agoraData,
  rtmClient,
  userRole,
  onTokenWillExpire,
  onEndConversation,
  onVoiceTranscripts,
  onAgentTurnComplete,
}: DualConversationComponentProps) {
  const client = useRTCClient();
  const remoteUsers = useRemoteUsers();
  const [isEnabled, setIsEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState("CONNECTING");
  const [joinedUID, setJoinedUID] = useState<UID>(0);

  const [judgeState, setJudgeState] = useState<AgentState | null>(null);
  const [counselState, setCounselState] = useState<AgentState | null>(null);

  const voiceMapRef = useRef<Map<string, VoiceMessage>>(new Map());

  const judgeUser = useMemo(
    () => remoteUsers.find((u) => u.uid.toString() === JUDGE_UID),
    [remoteUsers],
  );
  const counselUser = useMemo(
    () => remoteUsers.find((u) => u.uid.toString() === COUNSEL_UID),
    [remoteUsers],
  );

  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setIsReady(false);
    };
  }, []);

  const { isConnected: joinSuccess } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10) || 0,
    },
    isReady,
  );

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

  useEffect(() => {
    if (!client) return;
    try {
      // @ts-ignore
      setParameter("ENABLE_AUDIO_PTS", true);
    } catch {}
  }, [client]);

  useEffect(() => {
    if (joinSuccess && client) {
      setJoinedUID(client.uid as UID);
    }
  }, [joinSuccess, client]);

  const handleTranscriptUpdate = useCallback(
    (
      items: TranscriptHelperItem<
        Partial<UserTranscription | AgentTranscription>
      >[],
    ) => {
      if (!onVoiceTranscripts || !client) return;

      const localUID = String(client.uid);
      let changed = false;
      let agentTurnCompleted = false;

      for (const item of items) {
        if (
          item.status !== TurnStatus.END &&
          item.status !== TurnStatus.INTERRUPTED
        )
          continue;

        const text = (typeof item.text === "string" ? item.text : "").trim();
        if (!text) continue;

        const remappedUID = item.uid === "0" ? localUID : item.uid;
        const turnKey = `${remappedUID}-${item.turn_id}`;
        const role = uidToRole(remappedUID, localUID);

        const existing = voiceMapRef.current.get(turnKey);
        if (existing) {
          if (existing.text !== text) {
            existing.text = text;
            changed = true;
          }
        } else {
          voiceMapRef.current.set(turnKey, {
            id: `voice-${turnKey}`,
            role,
            text,
            timestamp: item._time || Date.now(),
          });
          changed = true;
          if (role === "judge" || role === "counsel") {
            agentTurnCompleted = true;
          }
        }
      }

      if (changed) {
        onVoiceTranscripts([...voiceMapRef.current.values()]);
      }

      if (agentTurnCompleted && onAgentTurnComplete) {
        onAgentTurnComplete();
      }
    },
    [client, onVoiceTranscripts, onAgentTurnComplete],
  );

  useEffect(() => {
    if (!isReady || !joinSuccess) return;

    let cancelled = false;

    (async () => {
      try {
        const [jAI, cAI] = await Promise.all([
          initAgoraVoiceAI(
            client,
            rtmClient,
            agoraData.channel,
            handleTranscriptUpdate,
            (state) => setJudgeState(state),
          ),
          initAgoraVoiceAI(
            client,
            rtmClient,
            agoraData.channel,
            handleTranscriptUpdate,
            (state) => setCounselState(state),
          ),
        ]);

        if (cancelled) {
          try {
            jAI.unsubscribe();
            jAI.destroy();
          } catch {}
          try {
            cAI.unsubscribe();
            cAI.destroy();
          } catch {}
          return;
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[DualVoiceAI] init failed:", error);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        const ai = AgoraVoiceAI.getInstance();
        if (ai) {
          ai.unsubscribe();
          ai.destroy();
        }
      } catch {}
    };
  }, [
    isReady,
    joinSuccess,
    client,
    rtmClient,
    agoraData.channel,
    handleTranscriptUpdate,
  ]);

  usePublish([localMicrophoneTrack]);

  useClientEvent(client, "connection-state-change", (curState) => {
    setConnectionState(curState);
  });

  const handleMicToggle = useCallback(async () => {
    const next = !isEnabled;
    const track = localMicrophoneTrack;
    if (!track) {
      setIsEnabled(next);
      return;
    }
    try {
      await track.setEnabled(next);
      setIsEnabled(next);
    } catch (error) {
      console.error("Failed to toggle microphone:", error);
    }
  }, [isEnabled, localMicrophoneTrack]);

  const handleTokenWillExpire = useCallback(async () => {
    if (!onTokenWillExpire || !joinedUID) return;
    try {
      const newToken = await onTokenWillExpire(joinedUID.toString());
      await client?.renewToken(newToken);
      await rtmClient.renewToken(newToken);
    } catch (error) {
      console.error("Failed to renew token:", error);
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient]);

  useClientEvent(client, "token-privilege-will-expire", handleTokenWillExpire);

  const renderAgentBar = (
    uid: string,
    label: string,
    audioTrack: (typeof remoteUsers)[number]["audioTrack"],
    gradient: string[],
    agentState: AgentState | null,
  ) => {
    const isConnected = remoteUsers.some((u) => u.uid.toString() === uid);
    return (
      <div className="flex items-center gap-3 p-2 border-2 border-black bg-white">
        <Volume2 className="h-4 w-4 text-black" />
        <div className="w-32 h-8 flex items-center justify-center">
          {isConnected && audioTrack ? (
            <AudioVisualizer track={audioTrack} gradientColors={gradient} />
          ) : (
            <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">
              Waiting...
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest">
            {label}
          </span>
          {isConnected && agentState && (
            <span className="text-[9px] text-zinc-500 capitalize">
              {agentState}
            </span>
          )}
          {!isConnected && (
            <span className="text-[9px] text-zinc-400">Connecting...</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
      <div className="bg-black text-white font-bold text-[10px] uppercase tracking-widest text-center p-2 flex items-center justify-between">
        <span>
          {connectionState === "CONNECTED"
            ? "● VOICE COURTROOM ACTIVE"
            : connectionState === "CONNECTING"
              ? "○ CONNECTING..."
              : "○ " + connectionState}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleMicToggle}
            className={`p-1 border border-white ${
              isEnabled ? "text-white" : "text-red-400"
            }`}
          >
            {isEnabled ? (
              <Mic className="h-3.5 w-3.5" />
            ) : (
              <MicOff className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onEndConversation}
            className="p-1 border border-red-400 text-red-400 hover:bg-red-400 hover:text-white transition-colors"
          >
            <PhoneOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-0 divide-x-2 divide-black">
        {renderAgentBar(
          JUDGE_UID,
          "Judge",
          judgeUser?.audioTrack,
          AGENT_GRADIENTS.judge,
          judgeState,
        )}
        {renderAgentBar(
          COUNSEL_UID,
          userRole === "prosecutor" ? "Defense" : "Prosecution",
          counselUser?.audioTrack,
          AGENT_GRADIENTS.counsel,
          counselState,
        )}
      </div>

      <div className="flex gap-0 divide-x-2 divide-black">
        {remoteUsers.map((user) => (
          <div key={user.uid} className="hidden">
            <RemoteUser user={user} />
          </div>
        ))}
      </div>
    </div>
  );
}
