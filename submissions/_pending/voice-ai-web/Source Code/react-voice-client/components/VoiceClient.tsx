"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  MessageCircle,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Pill,
  Play,
  RotateCcw,
  SendHorizontal,
  Settings,
  ShieldAlert,
  Utensils,
  Video,
  Volume2,
  X,
} from "lucide-react";
import {
  useAgoraVoiceClient,
  type IMessageListItem,
} from "@/hooks/useAgoraVoiceClient";
import { useAudioVisualization } from "@/hooks/useAudioVisualization";

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8082";
const DEFAULT_PROFILE = process.env.NEXT_PUBLIC_DEFAULT_PROFILE || "VOICE";
const STORAGE_KEY = "carekaki:v1:session";

const CAREKAKI_PROMPT = `You are CareKaki, a calm voice companion for an elderly person in Singapore.
Speak warmly and use simple English.
Keep every response between 8 and 18 words.
Ask only one question at a time, then wait for the senior to answer.
Do not give long explanations.
Do not diagnose, prescribe, or replace professional care.
For everyday chat, be friendly and brief.
For food, medicine, mood, or loneliness, acknowledge and ask one gentle follow-up.
If the user mentions dizziness, falling, chest pain, breathing trouble, severe distress, or possible double medication, calmly say: sit down safely, do not take another pill now, keep the phone nearby, and I will alert family.
Repeat safety language only when there is a risk signal.`;

const CAREKAKI_GREETING = "Hi Grandpa, I'm CareKaki. I'm here with you.";

type AppMode = "grandpa" | "family" | "demo";
type CareStatus = "okay" | "check-in" | "urgent";
type MedicationState = "unknown" | "taken" | "uncertain" | "missed" | "urgent";
type MoodLabel = "calm" | "quiet" | "lonely" | "anxious" | "confused" | "urgent";
type TranscriptRole = "user" | "assistant" | "family";
type RoomStage = "idle" | "connecting" | "connected";

type TranscriptEntry = {
  id: string;
  role: TranscriptRole;
  text: string;
  timestamp: number;
  source: "live" | "demo";
};

type CareState = {
  status: CareStatus;
  medication: {
    state: MedicationState;
    note: string;
  };
  meals: {
    eaten: boolean;
    hydration: boolean;
    notes: string[];
  };
  mood: {
    label: MoodLabel;
    note: string;
  };
  healthMentions: string[];
  importantQuote: string;
  suggestedAction: string;
  timeline: Array<{
    id: string;
    time: string;
    title: string;
    detail: string;
    severity: CareStatus;
  }>;
  summary: string;
};

type StoredSession = {
  entries: TranscriptEntry[];
  familyJoined: boolean;
  summaryGenerated: boolean;
  updatedAt: number;
};

type DemoScene = {
  id: string;
  label: string;
  helper: string;
  messages: Array<{
    role: TranscriptRole;
    text: string;
  }>;
};

const DEMO_SCENES: DemoScene[] = [
  {
    id: "normal",
    label: "Morning check-in",
    helper: "Quiet morning check-in",
    messages: [
      {
        role: "user",
        text: "CareKaki, I'm having kopi. It's a bit quiet today.",
      },
      {
        role: "assistant",
        text: "That sounds nice. Did you have lunch already?",
      },
    ],
  },
  {
    id: "meal-medicine",
    label: "Lunch and medicine",
    helper: "Lunch and white tablet",
    messages: [
      {
        role: "user",
        text: "Yes, rice and fish soup. I also took my white tablet after breakfast.",
      },
      {
        role: "assistant",
        text: "Good. I will note that for your family.",
      },
    ],
  },
  {
    id: "memory",
    label: "Family moment",
    helper: "Knee soreness and family note",
    messages: [
      {
        role: "assistant",
        text: "How is your knee today? Yesterday you said it was sore.",
      },
      {
        role: "user",
        text: "Still sore, but not worse. I miss my grandson today.",
      },
    ],
  },
  {
    id: "urgent",
    label: "Safety check",
    helper: "Possible double dose",
    messages: [
      {
        role: "user",
        text: "I don't remember if I took the night pill. Maybe I took it twice. I feel a bit dizzy.",
      },
      {
        role: "assistant",
        text: "Please sit down safely. Don't take another pill. I am alerting family.",
      },
    ],
  },
];

const GUIDED_STORY: Array<{
  role: TranscriptRole;
  text: string;
  delay: number;
}> = [
  {
    role: "assistant",
    text: "Good morning Grandpa. Did you have kopi today?",
    delay: 700,
  },
  {
    role: "user",
    text: "CareKaki, I'm having kopi. It's a bit quiet today.",
    delay: 4200,
  },
  {
    role: "assistant",
    text: "I hear you. Did you eat lunch already?",
    delay: 8000,
  },
  {
    role: "user",
    text: "Yes, rice and fish soup. I also took my white tablet after breakfast.",
    delay: 12000,
  },
  {
    role: "assistant",
    text: "Good, noted. How is your knee today?",
    delay: 16000,
  },
  {
    role: "user",
    text: "Still sore, but not worse. I miss my grandson today.",
    delay: 20000,
  },
  {
    role: "assistant",
    text: "I will tell him. Are you feeling steady?",
    delay: 24000,
  },
  {
    role: "user",
    text: "I don't remember if I took the night pill. Maybe I took it twice. I feel a bit dizzy.",
    delay: 28500,
  },
  {
    role: "assistant",
    text: "Please sit down safely. Don't take another pill. I am alerting family.",
    delay: 33000,
  },
];

const formatTime = (timestamp: number) => {
  const normalized = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Intl.DateTimeFormat("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(normalized || Date.now()));
};

const makeId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));
const hasPattern = (text: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(text));
const normalizeTranscript = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const readStoredSession = (): StoredSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredSession = (session: StoredSession) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

const selectCareKakiVoice = (voices: SpeechSynthesisVoice[]) => {
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  return (
    englishVoices.find((voice) => voice.lang.toLowerCase().startsWith("en-sg")) ||
    englishVoices.find((voice) => voice.lang.toLowerCase().startsWith("en-gb")) ||
    englishVoices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ||
    englishVoices[0] ||
    voices[0] ||
    null
  );
};

const baseCareState = (): CareState => ({
  status: "okay",
  medication: {
    state: "unknown",
    note: "Waiting for today's medication check.",
  },
  meals: {
    eaten: false,
    hydration: false,
    notes: [],
  },
  mood: {
    label: "calm",
    note: "No concern detected yet.",
  },
  healthMentions: [],
  importantQuote: "No important quote yet.",
  suggestedAction: "No action needed yet.",
  timeline: [],
  summary:
    "Waiting for Grandpa's first check-in. Start a live session or open Care session.",
});

const buildCareState = (entries: TranscriptEntry[]): CareState => {
  const state = baseCareState();
  const userEntries = entries.filter((entry) => entry.role === "user");

  const addEvent = (
    entry: TranscriptEntry,
    title: string,
    detail: string,
    severity: CareStatus,
  ) => {
    state.timeline.push({
      id: `${entry.id}-${title}`,
      time: formatTime(entry.timestamp),
      title,
      detail,
      severity,
    });
  };

  for (const entry of userEntries) {
    const raw = entry.text.trim();
    const text = normalizeTranscript(raw);
    const mentionsFood = hasAny(text, [
      "kopi",
      "coffee",
      "breakfast",
      "lunch",
      "dinner",
      "meal",
      "food",
      "rice",
      "fish soup",
      "porridge",
      "noodles",
      "bread",
      "ate",
      "eaten",
      "had food",
      "had lunch",
      "had dinner",
    ]) || hasPattern(text, [/\b(i|we)\s+(had|ate|finished)\b/]);
    const mentionsHydration = hasAny(text, [
      "drink",
      "drank",
      "water",
      "kopi",
      "coffee",
      "tea",
      "milo",
      "hydrated",
    ]);
    const mentionsMedicine = hasAny(text, [
      "tablet",
      "pill",
      "medicine",
      "medication",
      "meds",
      "med",
      "capsule",
      "dose",
      "dosage",
      "white tablet",
      "night pill",
      "morning pill",
      "blood pressure",
      "diabetes",
      "panadol",
      "paracetamol",
    ]) || hasPattern(text, [/\bmedicin(e|es)\b/, /\bmedication(s)?\b/]);
    const uncertainMedicine =
      mentionsMedicine &&
      hasAny(text, [
        "not sure",
        "unsure",
        "don't remember",
        "dont remember",
        "cannot remember",
        "can't remember",
        "forgot",
        "forget",
        "maybe",
        "think so",
        "not certain",
        "night pill",
      ]);
    const doubleDose =
      mentionsMedicine &&
      (hasAny(text, ["twice", "double", "again", "two times", "second time", "extra pill"]) ||
        hasPattern(text, [/\btook\b.*\btook\b/, /\bmaybe\b.*\btwice\b/]));
    const tookMedicine =
      mentionsMedicine &&
      !uncertainMedicine &&
      !doubleDose &&
      (hasAny(text, [
        "took",
        "taken",
        "had my",
        "ate my medicine",
        "swallowed",
        "after breakfast",
        "white tablet",
        "done already",
        "already took",
        "finished medicine",
      ]) ||
        hasPattern(text, [/\b(i|already)\s+(took|taken|had)\b/]));
    const missedMedicine =
      mentionsMedicine &&
      hasAny(text, ["missed", "skip", "skipped", "didn't take", "did not take", "haven't taken"]);
    const lonely = hasAny(text, [
      "quiet",
      "alone",
      "lonely",
      "miss",
      "boring",
      "bored",
      "nobody",
      "no one",
    ]);
    const confused = hasAny(text, [
      "confused",
      "don't remember",
      "dont remember",
      "cannot remember",
      "can't remember",
      "forgot",
      "forget",
      "blur",
    ]);
    const dizzy = hasAny(text, ["dizzy", "giddy", "lightheaded", "faint", "fainting", "spinning"]);
    const pain = hasAny(text, ["knee", "pain", "sore", "ache", "hurt", "hurts", "back", "leg"]);
    const fall = hasAny(text, ["fell", "fall", "fallen", "cannot stand", "can't stand", "slipped"]);
    const chestOrBreath = hasAny(text, [
      "chest",
      "breath",
      "breathe",
      "breathing",
      "can't breathe",
      "cannot breathe",
      "short of breath",
    ]);
    const severeDistress = hasAny(text, [
      "scared",
      "emergency",
      "help me",
      "need help",
      "call someone",
      "not okay",
    ]);

    if (mentionsFood) {
      state.meals.eaten = true;
      state.meals.notes.push(raw);
      addEvent(entry, "Meal mentioned", raw, "okay");
    }

    if (mentionsHydration) {
      state.meals.hydration = true;
    }

    if (tookMedicine) {
      state.medication.state = state.medication.state === "urgent" ? "urgent" : "taken";
      state.medication.note = "Grandpa said today's medicine was taken.";
      addEvent(entry, "Medication taken", raw, "okay");
    }

    if (missedMedicine && state.medication.state !== "urgent") {
      state.medication.state = "missed";
      state.medication.note = "Grandpa mentioned medicine may have been missed.";
      addEvent(entry, "Medication missed", raw, "check-in");
    }

    if (uncertainMedicine) {
      state.medication.state = doubleDose ? "urgent" : "uncertain";
      state.medication.note = doubleDose
        ? "Possible double dose or repeated night pill mentioned."
        : "Grandpa is unsure whether the night pill was taken.";
      addEvent(entry, "Medication uncertainty", raw, doubleDose ? "urgent" : "check-in");
    }

    if (lonely) {
      state.mood = {
        label: "lonely",
        note: "Grandpa sounds quiet or misses family.",
      };
      state.importantQuote = raw;
      addEvent(entry, "Loneliness signal", raw, "check-in");
    }

    if (confused && state.mood.label !== "urgent") {
      state.mood = {
        label: "confused",
        note: "Memory or medication uncertainty was mentioned.",
      };
    }

    if (pain) {
      state.healthMentions.push(raw);
      addEvent(entry, "Health mention", raw, "check-in");
    }

    if (dizzy || fall || chestOrBreath || severeDistress || doubleDose) {
      state.healthMentions.push(raw);
      state.status = "urgent";
      state.mood = {
        label: "urgent",
        note: "A safety-sensitive care signal was detected.",
      };
      state.importantQuote = raw;
      state.suggestedAction = "Call Grandpa now. Confirm medicine and keep him seated.";
      addEvent(entry, "Urgent care signal", raw, "urgent");
    }
  }

  if (state.status !== "urgent") {
    const needsCheckIn =
      state.medication.state === "uncertain" ||
      state.medication.state === "missed" ||
      state.mood.label === "lonely" ||
      state.mood.label === "confused" ||
      state.healthMentions.length > 0;
    state.status = needsCheckIn ? "check-in" : "okay";
    state.suggestedAction = needsCheckIn
      ? "Send a voice note or call later today."
      : "No immediate action. Let him keep chatting.";
  }

  if (state.timeline.length === 0 && userEntries.length > 0) {
    const last = userEntries[userEntries.length - 1];
    addEvent(last, "Check-in captured", last.text, "okay");
  }

  state.meals.notes = unique(state.meals.notes).slice(-3);
  state.healthMentions = unique(state.healthMentions).slice(-4);
  state.timeline = state.timeline.slice(-5);

  const latestFood = state.meals.notes.slice(-1)[0];
  const latestHealth = state.healthMentions.slice(-1)[0];
  const medicationLine =
    state.medication.state === "unknown"
      ? "Medication has not come up yet."
      : state.medication.note;
  const mealLine = latestFood
    ? `Grandpa mentioned: ${latestFood}`
    : "No meal or drink captured yet.";
  const healthLine = latestHealth ? `Health note: ${latestHealth}` : "No health concern captured.";

  if (state.status === "urgent") {
    state.summary = `${mealLine} ${medicationLine} ${healthLine} Please call Grandpa now.`;
  } else if (state.status === "check-in") {
    state.summary = `${mealLine} ${medicationLine} Mood: ${state.mood.note} ${healthLine} Check in later today.`;
  } else {
    state.summary = `${mealLine} ${medicationLine} Mood: ${state.mood.note} No immediate action.`;
  }

  return state;
};

const statusCopy: Record<CareStatus, { label: string; soft: string; strong: string; dot: string }> = {
  okay: {
    label: "Grandpa is okay",
    soft: "bg-emerald-50 text-emerald-950 border-emerald-200",
    strong: "bg-emerald-700 text-white",
    dot: "bg-emerald-500",
  },
  "check-in": {
    label: "Check in later",
    soft: "bg-amber-50 text-amber-950 border-amber-200",
    strong: "bg-amber-400 text-stone-950",
    dot: "bg-amber-500",
  },
  urgent: {
    label: "Call Grandpa now",
    soft: "bg-red-50 text-red-950 border-red-300",
    strong: "bg-red-600 text-white",
    dot: "bg-red-600",
  },
};

export function VoiceClient() {
  return <CareKakiApp mode="demo" />;
}

export function CareKakiApp({ mode }: { mode: AppMode }) {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [channelName, setChannelName] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [showPresenter, setShowPresenter] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [language] = useState("en-US");
  const [profile, setProfile] = useState("");
  const [prompt] = useState(CAREKAKI_PROMPT);
  const [greeting] = useState(CAREKAKI_GREETING);
  const [autoConnect, setAutoConnect] = useState(false);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [savedMessages, setSavedMessages] = useState<TranscriptEntry[]>([]);
  const [localMessages, setLocalMessages] = useState<TranscriptEntry[]>([]);
  const [familyJoined, setFamilyJoined] = useState(false);
  const [summaryGenerated, setSummaryGenerated] = useState(false);
  const [roomStage, setRoomStage] = useState<RoomStage>("idle");
  const [isStoryPlaying, setIsStoryPlaying] = useState(false);
  const [isDemoVoiceEnabled, setIsDemoVoiceEnabled] = useState(true);
  const [storyStepIndex, setStoryStepIndex] = useState(0);
  const [selectedMic, setSelectedMic] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("selectedMicId") || ""
      : "",
  );
  const chatEndRef = useRef<HTMLDivElement>(null);
  const storyTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const spokenEntryIdsRef = useRef<Set<string>>(new Set());

  const {
    isConnected,
    isMuted,
    messageList,
    currentInProgressMessage,
    isAgentSpeaking,
    localAudioTrack,
    joinChannel,
    leaveChannel,
    toggleMute,
    sendMessage,
    agentUid,
  } = useAgoraVoiceClient();

  const audioBars = useAudioVisualization(localAudioTrack, isConnected && !isMuted, {
    barCount: 16,
    amplification: 5,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlProfile = params.get("profile");
    if (urlProfile) setProfile(urlProfile);
    if (params.get("autoconnect") === "true") setAutoConnect(true);
    const ru = params.get("returnurl");
    if (ru) setReturnUrl(ru);
  }, []);

  useEffect(() => {
    const load = () => {
      const stored = readStoredSession();
      if (!stored) return;
      setSavedMessages(stored.entries);
      setFamilyJoined(stored.familyJoined);
      setSummaryGenerated(stored.summaryGenerated);
      setRoomStage(stored.familyJoined ? "connected" : "idle");
      stored.entries
        .filter((entry) => entry.role === "assistant" && entry.source === "demo")
        .forEach((entry) => spokenEntryIdsRef.current.add(entry.id));
    };

    load();
    window.addEventListener("storage", load);
    window.addEventListener("carekaki-session-updated", load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("carekaki-session-updated", load);
    };
  }, []);

  useEffect(() => {
    return () => {
      storyTimersRef.current.forEach((timer) => clearTimeout(timer));
      storyTimersRef.current = [];
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const cancelCareKakiVoice = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
  }, []);

  const speakCareKaki = useCallback(
    (text: string) => {
      if (!isDemoVoiceEnabled) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = selectCareKakiVoice(synth.getVoices());
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = "en-SG";
      }
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;
      synth.speak(utterance);
    },
    [isDemoVoiceEnabled],
  );

  const isAgentMessage = useCallback(
    (uid: string) => {
      return agentUid ? uid === agentUid : false;
    },
    [agentUid],
  );

  const liveEntries = useMemo<TranscriptEntry[]>(
    () =>
      messageList.map((msg, index) => ({
        id: `live-${msg.turn_id}-${msg.uid}-${index}`,
        role: isAgentMessage(msg.uid) ? "assistant" : "user",
        text: msg.text,
        timestamp: msg.timestamp ?? Date.now(),
        source: "live",
      })),
    [isAgentMessage, messageList],
  );

  const transcriptEntries = useMemo(
    () =>
      [...savedMessages, ...localMessages, ...liveEntries]
        .sort((a, b) => a.timestamp - b.timestamp)
        .filter(
          (entry, index, entries) =>
            entries.findIndex((candidate) => candidate.id === entry.id) === index,
        ),
    [liveEntries, localMessages, savedMessages],
  );

  const careState = useMemo(() => buildCareState(transcriptEntries), [transcriptEntries]);
  const currentStatus = statusCopy[careState.status];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcriptEntries.length, currentInProgressMessage?.text]);

  useEffect(() => {
    if (mode === "family") return;
    writeStoredSession({
      entries: transcriptEntries,
      familyJoined,
      summaryGenerated,
      updatedAt: Date.now(),
    });
  }, [familyJoined, mode, summaryGenerated, transcriptEntries]);

  useEffect(() => {
    if (mode !== "demo" || isConnected || !isDemoVoiceEnabled) return;
    const nextAssistantEntry = transcriptEntries.find(
      (entry) =>
        entry.role === "assistant" &&
        entry.source === "demo" &&
        !spokenEntryIdsRef.current.has(entry.id),
    );
    if (!nextAssistantEntry) return;
    spokenEntryIdsRef.current.add(nextAssistantEntry.id);
    speakCareKaki(nextAssistantEntry.text);
  }, [isConnected, isDemoVoiceEnabled, mode, speakCareKaki, transcriptEntries]);

  useEffect(() => {
    if (isDemoVoiceEnabled) return;
    cancelCareKakiVoice();
    transcriptEntries
      .filter((entry) => entry.role === "assistant" && entry.source === "demo")
      .forEach((entry) => spokenEntryIdsRef.current.add(entry.id));
  }, [cancelCareKakiVoice, isDemoVoiceEnabled, transcriptEntries]);

  const handleStart = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        enable_aivad: "true",
        asr_language: language,
        profile: profile.trim() || DEFAULT_PROFILE,
        prompt,
        greeting,
      });

      params.append("connect", "false");
      const tokenResponse = await fetch(`${backendUrl}/start-agent?${params.toString()}`);

      if (!tokenResponse.ok) {
        throw new Error(`Backend error: ${tokenResponse.statusText}`);
      }

      const data = await tokenResponse.json();
      setChannelName(data.channel);

      await joinChannel({
        appId: data.appid,
        channel: data.channel,
        token: data.token || null,
        uid: parseInt(data.uid),
        rtmUid: data.user_rtm_uid,
        agentUid: data.agent?.uid ? String(data.agent.uid) : undefined,
        agentRtmUid: data.agent_rtm_uid,
        ...(selectedMic ? { microphoneId: selectedMic } : {}),
      });

      params.delete("connect");
      params.append("channel", data.channel);
      params.append("debug", "true");
      const agentResponse = await fetch(`${backendUrl}/start-agent?${params.toString()}`);

      if (!agentResponse.ok) {
        throw new Error(`Agent start error: ${agentResponse.statusText}`);
      }

      const agentData = await agentResponse.json();
      const response = agentData.agent_response?.response;
      const parsedResponse =
        typeof response === "string" ? JSON.parse(response || "{}") : response;

      if (parsedResponse?.agent_id) {
        setAgentId(parsedResponse.agent_id);
      }
    } catch (error) {
      console.error("Failed to start CareKaki:", error);
      alert(
        `Failed to start CareKaki: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    backendUrl,
    greeting,
    joinChannel,
    language,
    profile,
    prompt,
    selectedMic,
  ]);

  useEffect(() => {
    if (!autoConnect) return;
    setAutoConnect(false);
    handleStart();
  }, [autoConnect, handleStart]);

  const handleStop = async () => {
    if (agentId) {
      try {
        const params = new URLSearchParams({ agent_id: agentId });
        if (channelName) params.append("channel", channelName);
        if (profile.trim()) params.append("profile", profile.trim());
        await fetch(`${backendUrl}/hangup-agent?${params}`);
      } catch (error) {
        console.error("Hangup failed:", error);
      }
    }

    setAgentId(undefined);
    setChannelName(undefined);
    await leaveChannel();

    if (returnUrl) {
      window.location.href = returnUrl;
    }
  };

  const appendDemoMessages = (scene: DemoScene) => {
    setLocalMessages((existing) => {
      const allEntries = [...savedMessages, ...existing];
      const latestTimestamp = allEntries.reduce(
        (latest, entry) => Math.max(latest, entry.timestamp),
        0,
      );
      const base = Math.max(Date.now(), latestTimestamp + 1400);
      return [
        ...existing,
        ...scene.messages.map((message, index) => ({
          id: makeId(scene.id),
          role: message.role,
          text: message.text,
          timestamp: base + index * 800,
          source: "demo" as const,
        })),
      ];
    });
    setSummaryGenerated(false);
  };

  const playGuidedStory = () => {
    cancelCareKakiVoice();
    spokenEntryIdsRef.current.clear();
    storyTimersRef.current.forEach((timer) => clearTimeout(timer));
    storyTimersRef.current = [];
    setSavedMessages([]);
    setLocalMessages([]);
    setFamilyJoined(false);
    setRoomStage("idle");
    setSummaryGenerated(false);
    setIsStoryPlaying(true);
    setStoryStepIndex(DEMO_SCENES.length);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event("carekaki-session-updated"));
    }

    const base = Date.now();
    for (const step of GUIDED_STORY) {
      const timer = setTimeout(() => {
        setLocalMessages((existing) => [
          ...existing,
          {
            id: makeId("story"),
            role: step.role,
            text: step.text,
            timestamp: base + step.delay,
            source: "demo" as const,
          },
        ]);
      }, step.delay);
      storyTimersRef.current.push(timer);
    }

    storyTimersRef.current.push(
      setTimeout(() => {
        setSummaryGenerated(true);
        setIsStoryPlaying(false);
      }, GUIDED_STORY[GUIDED_STORY.length - 1].delay + 900),
    );
  };

  const playNextStoryBeat = () => {
    const shouldStartOver = storyStepIndex === 0 || storyStepIndex >= DEMO_SCENES.length;
    if (shouldStartOver) {
      cancelCareKakiVoice();
      spokenEntryIdsRef.current.clear();
      setSavedMessages([]);
      setLocalMessages([]);
      setFamilyJoined(false);
      setRoomStage("idle");
      setSummaryGenerated(false);
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new Event("carekaki-session-updated"));
      }
    }

    const currentIndex = shouldStartOver ? 0 : storyStepIndex;
    const scene = DEMO_SCENES[currentIndex];
    appendDemoMessages(scene);
    const nextIndex = currentIndex + 1;
    setStoryStepIndex(Math.min(nextIndex, DEMO_SCENES.length));
    if (scene.id === "urgent") {
      setSummaryGenerated(true);
    }
  };

  const handleNeedHelp = () => {
    appendDemoMessages({
      id: "need-help",
      label: "Need help",
      helper: "Senior help request",
      messages: [
        {
          role: "user",
          text: "CareKaki, I need help. I feel scared and a bit dizzy.",
        },
        {
          role: "assistant",
          text: "Sit down safely. Keep your phone nearby. I am alerting family.",
        },
      ],
    });
  };

  const handleSendMessage = async () => {
    const trimmed = chatMessage.trim();
    if (!trimmed) return;

    if (isConnected) {
      const success = await sendMessage(trimmed);
      if (success) {
        setChatMessage("");
        return;
      }
    }

    setLocalMessages((existing) => [
      ...existing,
      {
        id: makeId("typed"),
        role: "user",
        text: trimmed,
        timestamp: Date.now(),
        source: "demo",
      },
    ]);
    setChatMessage("");
    setSummaryGenerated(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const resetSession = () => {
    cancelCareKakiVoice();
    spokenEntryIdsRef.current.clear();
    storyTimersRef.current.forEach((timer) => clearTimeout(timer));
    storyTimersRef.current = [];
    setSavedMessages([]);
    setLocalMessages([]);
    setFamilyJoined(false);
    setRoomStage("idle");
    setSummaryGenerated(false);
    setIsStoryPlaying(false);
    setStoryStepIndex(0);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event("carekaki-session-updated"));
    }
  };

  const handleJoinRoom = () => {
    setFamilyJoined(true);
    setRoomStage("connecting");
    setSummaryGenerated(true);
    setTimeout(() => setRoomStage("connected"), 900);
  };

  const handleCloseRoom = () => {
    setRoomStage("idle");
  };

  const handleSendFamilyNote = () => {
    setLocalMessages((existing) => [
      ...existing,
      {
        id: makeId("family"),
        role: "family",
        text: "I'm here, Grandpa. Please sit down. I'm calling you now.",
        timestamp: Date.now(),
        source: "demo" as const,
      },
    ]);
  };

  const isDemoSessionActive = mode === "demo" && !isConnected && transcriptEntries.length > 0;
  const displayConnected = isConnected || isDemoSessionActive;
  const displayMuted = isDemoSessionActive ? false : isMuted;
  const displayAudioBars = isDemoSessionActive
    ? [8, 13, 18, 22, 16, 12, 20, 24, 15, 19, 11, 17, 23, 14, 21, 10]
    : audioBars;

  const micLabel = isDemoSessionActive
    ? isStoryPlaying
      ? "CareKaki is checking in"
      : "CareKaki is with Grandpa"
    : isConnected
    ? isAgentSpeaking
      ? "CareKaki is speaking"
      : isMuted
        ? "Tap to speak"
        : "Listening"
    : "Ready";
  const primaryActionLabel = isDemoSessionActive
    ? "Live check-in active"
    : isConnected
    ? isMuted
      ? "Tap to speak"
      : "Listening - tap to pause"
    : isLoading
      ? "Starting CareKaki..."
      : "Start CareKaki";
  const primaryActionIcon = displayConnected ? (
    displayMuted ? (
      <MicOff className="h-6 w-6" />
    ) : (
      <Mic className="h-6 w-6" />
    )
  ) : (
    <PhoneCall className="h-6 w-6" />
  );

  const grandpaProps = {
    audioBars: displayAudioBars,
    chatEndRef,
    currentInProgressMessage,
    entries: transcriptEntries.slice(-12),
    isAgentMessage,
    isAgentSpeaking,
    isConnected: displayConnected,
    isPrimaryStatic: isDemoSessionActive,
    isLoading,
    isMuted: displayMuted,
    micLabel,
    onNeedHelp: handleNeedHelp,
    onPrimaryAction: isDemoSessionActive ? () => {} : isConnected ? toggleMute : handleStart,
    onStop: isDemoSessionActive ? resetSession : handleStop,
    primaryActionIcon,
    primaryActionLabel,
  };

  const familyProps = {
    careState,
    currentStatus,
    entries: transcriptEntries,
    familyJoined,
    onGenerateSummary: () => setSummaryGenerated(true),
    onJoinRoom: handleJoinRoom,
    onCloseRoom: handleCloseRoom,
    onSendFamilyNote: handleSendFamilyNote,
    roomStage,
    summaryGenerated,
  };

  if (mode === "grandpa") {
    return (
      <RolePage title="CareKaki" subtitle="Grandpa's companion app">
        <AppSurface maxWidth="max-w-[430px]">
          <GrandpaApp {...grandpaProps} />
        </AppSurface>
      </RolePage>
    );
  }

  if (mode === "family") {
    return (
      <RolePage title="Family view" subtitle="Care updates from Grandpa Lim">
        <AppSurface maxWidth="max-w-[430px]">
          <FamilyApp {...familyProps} />
        </AppSurface>
      </RolePage>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f6f1] text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-3 pb-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
              CareKaki
            </p>
            <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">
              Live care session
            </h1>
            <p className="mt-2 max-w-2xl text-base text-zinc-600">
              Grandpa talks. Family sees what matters.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Live sync
          </div>
        </header>

        <section className="grid flex-1 items-center justify-center gap-6 pb-4 lg:grid-cols-2">
          <PhoneFrame label="Grandpa's phone" side="left">
            <GrandpaApp {...grandpaProps} />
          </PhoneFrame>

          <PhoneFrame label="Family's phone" side="right">
            <FamilyApp {...familyProps} />
          </PhoneFrame>
        </section>

        <PresenterControls
          backendUrl={backendUrl}
          chatMessage={chatMessage}
          demoScenes={DEMO_SCENES}
          isConnected={isConnected}
          isDemoVoiceEnabled={isDemoVoiceEnabled}
          onAppendScene={appendDemoMessages}
          onChatChange={setChatMessage}
          onKeyDown={handleKeyDown}
          onNextStoryBeat={playNextStoryBeat}
          onPlayStory={playGuidedStory}
          onReset={resetSession}
          onSend={handleSendMessage}
          onToggle={() => setShowPresenter((value) => !value)}
          profile={profile}
          selectedMic={selectedMic}
          setBackendUrl={setBackendUrl}
          setIsDemoVoiceEnabled={setIsDemoVoiceEnabled}
          setProfile={setProfile}
          setSelectedMic={setSelectedMic}
          showPresenter={showPresenter}
          showSetup={showSetup}
          setShowSetup={setShowSetup}
          isStoryPlaying={isStoryPlaying}
          storyStepIndex={storyStepIndex}
        />
      </div>
    </main>
  );
}

function RolePage({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[#f5f6f1] px-4 py-6 text-zinc-950">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-5xl flex-col items-center justify-center gap-5">
        <header className="w-full max-w-[430px]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
            {title}
          </p>
          <h1 className="mt-1 text-3xl font-semibold">{subtitle}</h1>
        </header>
        {children}
      </div>
    </main>
  );
}

function AppSurface({
  children,
  maxWidth,
}: {
  children: ReactNode;
  maxWidth: string;
}) {
  return (
    <div
      className={`h-[780px] w-full ${maxWidth} overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-2xl`}
    >
      {children}
    </div>
  );
}

function PhoneFrame({
  children,
  label,
  side,
}: {
  children: ReactNode;
  label: string;
  side: "left" | "right";
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm font-medium text-zinc-600">
        {label}
      </div>
      <div
        className={`relative h-[760px] w-full max-w-[390px] rounded-[34px] border-[10px] border-zinc-950 bg-zinc-950 shadow-2xl ${
          side === "left" ? "lg:rotate-[-1deg]" : "lg:rotate-[1deg]"
        }`}
      >
        <div className="absolute left-1/2 top-2 z-10 h-5 w-28 -translate-x-1/2 rounded-b-[14px] bg-zinc-950" />
        <div className="h-full overflow-hidden rounded-[24px] bg-white">
          {children}
        </div>
      </div>
    </div>
  );
}

function MobileStatusBar({ tone = "default" }: { tone?: "default" | "urgent" }) {
  return (
    <div
      className={`flex items-center justify-between px-5 pb-2 pt-3 text-xs font-semibold ${
        tone === "urgent" ? "text-red-950" : "text-zinc-700"
      }`}
    >
      <span>14:58</span>
      <span>5G  82%</span>
    </div>
  );
}

function GrandpaApp({
  audioBars,
  chatEndRef,
  currentInProgressMessage,
  entries,
  isAgentMessage,
  isAgentSpeaking,
  isConnected,
  isLoading,
  isMuted,
  isPrimaryStatic,
  micLabel,
  onNeedHelp,
  onPrimaryAction,
  onStop,
  primaryActionIcon,
  primaryActionLabel,
}: {
  audioBars: number[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  currentInProgressMessage: IMessageListItem | null;
  entries: TranscriptEntry[];
  isAgentMessage: (uid: string) => boolean;
  isAgentSpeaking: boolean;
  isConnected: boolean;
  isLoading: boolean;
  isMuted: boolean;
  isPrimaryStatic: boolean;
  micLabel: string;
  onNeedHelp: () => void;
  onPrimaryAction: () => void;
  onStop: () => void;
  primaryActionIcon: ReactNode;
  primaryActionLabel: string;
}) {
  return (
    <section className="flex h-full flex-col bg-[#fbfbf7]">
      <MobileStatusBar />
      <div className="border-b border-zinc-200 px-5 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
              CareKaki
            </p>
            <h2 className="text-2xl font-semibold">Hi Grandpa</h2>
          </div>
          <span className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
            {isConnected ? "Connected" : "Ready"}
          </span>
        </div>
        <p className="mt-3 text-sm text-zinc-600">
          Speak one sentence, then pause. I am here with you.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-3">
        <div className="flex flex-col items-center">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50">
            <div
              className={`absolute h-24 w-24 rounded-full border border-emerald-300 ${
                isConnected && !isMuted ? "animate-ping" : ""
              }`}
            />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm">
              {isAgentSpeaking ? (
                <Volume2 className="h-8 w-8 text-emerald-700" />
              ) : isMuted ? (
                <MicOff className="h-8 w-8 text-zinc-500" />
              ) : (
                <Mic className="h-8 w-8 text-emerald-700" />
              )}
            </div>
          </div>
          <p className="mt-2 text-lg font-semibold">{micLabel}</p>
          <div className="mt-2 flex h-7 items-end gap-1">
            {audioBars.map((bar, index) => (
              <span
                key={index}
                className={`w-2 rounded-lg ${bar ? "bg-emerald-600" : "bg-zinc-200"}`}
                style={{
                  height: `${8 + ((index % 5) + 1) * 4}px`,
                  opacity: isConnected ? 1 : 0.45,
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg bg-white p-3 shadow-inner">
          {entries.length === 0 && !currentInProgressMessage ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
              Start a check-in when you are ready.
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {entries.map((entry) => (
                <ChatBubble key={entry.id} entry={entry} />
              ))}
              {currentInProgressMessage && (
                <ChatBubble
                  entry={{
                    id: "progress",
                    role: isAgentMessage(currentInProgressMessage.uid)
                      ? "assistant"
                      : "user",
                    text: currentInProgressMessage.text,
                    timestamp: currentInProgressMessage.timestamp ?? 0,
                    source: "live",
                  }}
                  inProgress
                />
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-2 pb-2">
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={isLoading}
            className={`inline-flex min-h-14 items-center justify-center gap-3 rounded-lg bg-emerald-700 px-4 py-3 text-lg font-semibold text-white disabled:opacity-60 ${
              isPrimaryStatic ? "cursor-default" : "hover:bg-emerald-800"
            }`}
          >
            {primaryActionIcon}
            {primaryActionLabel}
          </button>
          {isConnected && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-3 font-semibold text-white hover:bg-zinc-800"
            >
              <PhoneOff className="h-5 w-5" />
              End session
            </button>
          )}
          <button
            type="button"
            onClick={onNeedHelp}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-800 hover:bg-red-100"
          >
            <AlertTriangle className="h-5 w-5" />
            I need help
          </button>
        </div>
      </div>
    </section>
  );
}

function FamilyApp({
  careState,
  currentStatus,
  entries,
  familyJoined,
  onCloseRoom,
  onGenerateSummary,
  onJoinRoom,
  onSendFamilyNote,
  roomStage,
  summaryGenerated,
}: {
  careState: CareState;
  currentStatus: { label: string; soft: string; strong: string; dot: string };
  entries: TranscriptEntry[];
  familyJoined: boolean;
  onCloseRoom: () => void;
  onGenerateSummary: () => void;
  onJoinRoom: () => void;
  onSendFamilyNote: () => void;
  roomStage: RoomStage;
  summaryGenerated: boolean;
}) {
  const showCareRoom = roomStage !== "idle";

  return (
    <section className="relative flex h-full flex-col overflow-hidden bg-[#f9faf7]">
      <MobileStatusBar tone={careState.status === "urgent" ? "urgent" : "default"} />
      <div className={`border-b px-5 pb-4 ${currentStatus.soft}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-75">
              Family view
            </p>
            <h2 className="text-2xl font-semibold">Grandpa Lim</h2>
          </div>
          <span className={`h-3 w-3 rounded-full ${currentStatus.dot}`} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          {careState.status === "urgent" ? (
            <ShieldAlert className="h-8 w-8" />
          ) : (
            <CheckCircle2 className="h-8 w-8" />
          )}
          <div>
            <p className="text-2xl font-semibold">{currentStatus.label}</p>
            <p className="text-sm">{careState.suggestedAction}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniSignal label="Med" value={careState.medication.state} />
          <MiniSignal label="Mood" value={careState.mood.label} />
          <MiniSignal label="Food" value={careState.meals.eaten ? "logged" : "waiting"} />
        </div>
        {careState.status === "urgent" && (
          <button
            type="button"
            onClick={onJoinRoom}
            className="mt-4 inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 font-semibold text-white hover:bg-red-700"
          >
            <Video className="h-5 w-5" />
            {familyJoined ? "Open CareKaki room" : "Join CareKaki room"}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-5">
        <SignalRow
          icon={<Pill className="h-5 w-5" />}
          label="Medication"
          value={careState.medication.state}
          detail={careState.medication.note}
        />
        <SignalRow
          icon={<HeartPulse className="h-5 w-5" />}
          label="Mood"
          value={careState.mood.label}
          detail={careState.mood.note}
        />
        <SignalRow
          icon={<Utensils className="h-5 w-5" />}
          label="Meals/drink"
          value={careState.meals.eaten ? "mentioned" : "waiting"}
          detail={
            careState.meals.notes.slice(-1)[0] ||
            "No meal captured from today's check-in."
          }
        />

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Important quote</p>
            <span className="rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
              {familyJoined ? "In room" : "Watching"}
            </span>
          </div>
          <blockquote className="mt-3 border-l-4 border-emerald-600 pl-3 text-sm text-zinc-700">
            {careState.importantQuote}
          </blockquote>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Today&apos;s care note</p>
              <p className="text-xs text-zinc-500">Message for family</p>
            </div>
            <button
              type="button"
              onClick={onGenerateSummary}
              className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Generate
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">
            {summaryGenerated
              ? careState.summary
              : "Run the check-in, then generate a short family note."}
          </p>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="font-semibold">Recent moments</p>
          <div className="mt-3 space-y-3">
            {careState.timeline.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Updates will appear as Grandpa talks.
              </p>
            ) : (
              careState.timeline.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${statusCopy[item.severity].dot}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <span className="text-xs text-zinc-500">{item.time}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-600">{item.detail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showCareRoom && (
        <CareRoomOverlay
          careState={careState}
          entries={entries}
          onClose={onCloseRoom}
          onSendFamilyNote={onSendFamilyNote}
          roomStage={roomStage}
        />
      )}
    </section>
  );
}

function MiniSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/65 px-2 py-2 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-60">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function CareRoomOverlay({
  careState,
  entries,
  onClose,
  onSendFamilyNote,
  roomStage,
}: {
  careState: CareState;
  entries: TranscriptEntry[];
  onClose: () => void;
  onSendFamilyNote: () => void;
  roomStage: RoomStage;
}) {
  const latestEntries = entries.slice(-3);
  const connecting = roomStage === "connecting";

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-red-950 text-white">
      <MobileStatusBar tone="urgent" />
      <div className="flex items-center justify-between px-5 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-200">
            CareKaki room
          </p>
          <h2 className="text-2xl font-semibold">
            {connecting ? "Joining Grandpa..." : "Family joined"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
          aria-label="Close care room"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="rounded-lg bg-white p-4 text-red-950 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <span className="absolute h-14 w-14 animate-ping rounded-full bg-red-300 opacity-40" />
              <BellRing className="relative h-7 w-7 text-red-700" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-red-700">
                Urgent care signal
              </p>
              <p className="text-lg font-semibold">{careState.suggestedAction}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-red-900">
            {careState.importantQuote}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-red-200">Grandpa</p>
            <p className="mt-1 font-semibold">Audio active</p>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-red-200">CareKaki</p>
            <p className="mt-1 font-semibold">{connecting ? "Connecting" : "Briefing family"}</p>
          </div>
        </div>

        <div className="mt-3 max-h-52 overflow-auto rounded-lg bg-black/20 p-3">
          <p className="mb-3 text-sm font-semibold text-red-100">Live room transcript</p>
          <div className="space-y-2">
            {latestEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg bg-white/10 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-red-200">
                  {entry.role === "assistant"
                    ? "CareKaki"
                    : entry.role === "family"
                      ? "Family"
                      : "Grandpa"}
                </p>
                <p className="mt-1 text-sm leading-relaxed">{entry.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={onSendFamilyNote}
            disabled={connecting}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 font-semibold text-red-950 hover:bg-red-50 disabled:opacity-50"
          >
            <MessageCircle className="h-5 w-5" />
            Reassure Grandpa
          </button>
          <p className="text-center text-xs leading-relaxed text-red-100">
            CareKaki does not diagnose or dispatch. Family decides the next call.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  entry,
  inProgress = false,
}: {
  entry: TranscriptEntry;
  inProgress?: boolean;
}) {
  const isAssistant = entry.role === "assistant";
  const isFamily = entry.role === "family";
  return (
    <div className={`flex ${isAssistant ? "justify-start" : isFamily ? "justify-center" : "justify-end"}`}>
      <div
        className={`max-w-[84%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isAssistant
            ? "bg-zinc-100 text-zinc-950"
            : isFamily
              ? "bg-red-50 text-red-950 ring-1 ring-red-200"
              : "bg-emerald-700 text-white"
        } ${inProgress ? "animate-pulse" : ""}`}
      >
        <div className="mb-1 text-[11px] font-medium opacity-70">
          {isAssistant ? "CareKaki" : isFamily ? "Family" : "Grandpa"} -{" "}
          {formatTime(entry.timestamp)}
        </div>
        {entry.text}
      </div>
    </div>
  );
}

function SignalRow({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-zinc-600">
          {icon}
          <p className="font-semibold text-zinc-950">{label}</p>
        </div>
        <span className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
          {value}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{detail}</p>
    </div>
  );
}

function PresenterControls({
  backendUrl,
  chatMessage,
  demoScenes,
  isConnected,
  isDemoVoiceEnabled,
  isStoryPlaying,
  onAppendScene,
  onChatChange,
  onKeyDown,
  onNextStoryBeat,
  onPlayStory,
  onReset,
  onSend,
  onToggle,
  profile,
  selectedMic,
  setBackendUrl,
  setIsDemoVoiceEnabled,
  setProfile,
  setSelectedMic,
  showPresenter,
  showSetup,
  setShowSetup,
  storyStepIndex,
}: {
  backendUrl: string;
  chatMessage: string;
  demoScenes: DemoScene[];
  isConnected: boolean;
  isDemoVoiceEnabled: boolean;
  isStoryPlaying: boolean;
  onAppendScene: (scene: DemoScene) => void;
  onChatChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onNextStoryBeat: () => void;
  onPlayStory: () => void;
  onReset: () => void;
  onSend: () => void;
  onToggle: () => void;
  profile: string;
  selectedMic: string;
  setBackendUrl: (value: string) => void;
  setIsDemoVoiceEnabled: (value: boolean) => void;
  setProfile: (value: string) => void;
  setSelectedMic: (value: string) => void;
  showPresenter: boolean;
  showSetup: boolean;
  setShowSetup: (value: boolean) => void;
  storyStepIndex: number;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="font-semibold">Care session</p>
          <p className="text-sm text-zinc-500">
            Guide the check-in while recording.
          </p>
        </div>
        {showPresenter ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
      </button>

      {showPresenter && (
        <div className="border-t border-zinc-200 p-4">
          <div className="mb-3 grid gap-2 md:grid-cols-[1.2fr_1fr]">
            <button
              type="button"
              onClick={onNextStoryBeat}
              disabled={isStoryPlaying}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              <Play className="h-5 w-5" />
              {storyStepIndex >= DEMO_SCENES.length
                ? "Start new check-in"
                : "Continue check-in"}
            </button>
            <button
              type="button"
              onClick={onPlayStory}
              disabled={isStoryPlaying}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            >
              <Play className="h-5 w-5" />
              {isStoryPlaying ? "CareKaki is checking in..." : "Run guided check-in"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsDemoVoiceEnabled(!isDemoVoiceEnabled)}
            className="mb-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            <Volume2 className="h-4 w-4" />
            CareKaki voice: {isDemoVoiceEnabled ? "On" : "Off"}
          </button>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {demoScenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => onAppendScene(scene)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left hover:border-emerald-300 hover:bg-emerald-50"
              >
                <span className="block font-semibold">{scene.label}</span>
                <span className="text-xs text-zinc-500">{scene.helper}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <input
              type="text"
              value={chatMessage}
              onChange={(event) => onChatChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                isConnected
                  ? "Add family/session note"
                  : "Add what Grandpa says"
              }
              className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base"
            />
            <button
              type="button"
              onClick={onSend}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 font-semibold text-white hover:bg-zinc-800"
            >
              <SendHorizontal className="h-5 w-5" />
              Add to session
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              <RotateCcw className="h-5 w-5" />
              New session
            </button>
            <button
              type="button"
              onClick={() => setShowSetup(!showSetup)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              <Settings className="h-5 w-5" />
              Device settings
            </button>
          </div>

          {showSetup && (
            <div className="mt-3 grid gap-3 rounded-lg bg-zinc-50 p-3 md:grid-cols-3">
              <label className="block text-sm font-medium text-zinc-700">
                Backend URL
                <input
                  value={backendUrl}
                  onChange={(event) => setBackendUrl(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700">
                Server profile
                <input
                  value={profile}
                  onChange={(event) => setProfile(event.target.value)}
                  placeholder={DEFAULT_PROFILE}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700">
                Microphone device id
                <input
                  value={selectedMic}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedMic(value);
                    if (value) {
                      localStorage.setItem("selectedMicId", value);
                    } else {
                      localStorage.removeItem("selectedMicId");
                    }
                  }}
                  placeholder="Default microphone"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
