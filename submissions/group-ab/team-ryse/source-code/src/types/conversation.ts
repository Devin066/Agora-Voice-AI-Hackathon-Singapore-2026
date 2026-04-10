export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
  judgeAgentId?: string;
  counselAgentId?: string;
}

export type AgentRole = "judge" | "counsel";

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
  agent_role: AgentRole;
  user_role?: "prosecutor" | "defense";
}

export interface StopConversationRequest {
  agent_id: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
}

import type { RTMClient } from "agora-rtm";

export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<string>;
  onEndConversation: () => void;
}

export interface DualConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  userRole: "prosecutor" | "defense";
  onTokenWillExpire: (uid: string) => Promise<string>;
  onEndConversation: () => void;
  onVoiceTranscripts?: (messages: VoiceMessage[]) => void;
  onAgentTurnComplete?: () => void;
  onUserJoined?: () => void;
}

export interface VoiceMessage {
  id: string;
  role: "user" | "judge" | "counsel";
  text: string;
  timestamp: number;
}
