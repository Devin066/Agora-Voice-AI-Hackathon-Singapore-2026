# Diktum AI

An AI-powered legal trial simulator that enables voice-based courtroom practice with AI agents. Practice your legal arguments in a realistic courtroom environment with AI-powered Judge and Opposing Counsel.

## Project Description

Diktum AI is a voice-based legal training platform that allows law students and legal professionals to practice courtroom proceedings through real-time voice conversations. Users can select their persona (Law Student or Legal Professional), choose their role (Prosecutor or Defense Attorney), and engage in realistic trial simulations.

**Key Features:**
- Voice-based courtroom interactions with AI agents
- Dual-agent system: Judge (neutral, authoritative) and Opposing Counsel (argumentative)
- Real-time audio streaming with live transcription
- Sentiment analysis to track judge's bias during proceedings
- Multiple case scenarios (starting with Indonesian PP 35/2021 labor law)
- Role-based difficulty levels: Guided (Law Student) and Advanced (Legal Professional)

## Architecture Overview

### Frontend Stack
- **Framework**: Next.js 16 with React Server Components
- **UI Components**: shadcn/ui with Tailwind CSS
- **State Management**: React hooks and Context API
- **Icons**: Lucide React

### Voice Infrastructure
- **Real-time Communication**: Agora RTC SDK (`agora-rtc-react`)
- **Audio Processing**: Web Audio API integration
- **Audio Visualization**: Agora Agent UI Kit with gradient visualizers

### AI Agent System
- **Agent Orchestration**: Agora Conversational AI Engine (Server SDK)
- **Client Integration**: Agora Agent Client Toolkit
- **Speech-to-Text**: Deepgram STT (nova-3 model)
- **Text-to-Speech**: MiniMax TTS (speech_2_6_turbo)
- **LLM Backend**: Google Gemini 2.5 Flash Lite via OpenAI-compatible API
- **Sentiment Analysis**: Gemini 2.5 Flash Lite for bias tracking

### Dual-Agent Design
The system uses two distinct AI agents with specialized prompts:

1. **Judge Agent** (`judge001`)
   - Neutral, authoritative, brief responses
   - Only speaks when ruling on objections or providing guidance
   - References specific legal articles (PP 35/2021)
   - Voice: English_Wise_Male

2. **Counsel Agent** (`counsel001`)
   - Aggressive, challenges every argument
   - Responds with counter-arguments
   - Focuses on legal strategy and case law
   - Voice: English_captivating_female1

### API Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │ Simulator UI │  │ DualConversationComponent             │ │
│  │              │  │ - RTC Client (agora-rtc-react)        │ │
│  │              │  │ - AgoraVoiceAI (client toolkit)       │ │
│  │              │  │ - Audio Visualizers                   │ │
│  └──────────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js API Routes (/api/v2/*)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ /agora/generate-token → RTC + RTM token generation   │  │
│  │ /agora/invite-agent → Agent session creation          │  │
│  │ /agora/stop-conversation → Session termination       │  │
│  │ /chat/completions/{judge|counsel} → LLM endpoints     │  │
│  │ /sentiment → Judge bias analysis                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│           Agora Conversational AI Engine (Server SDK)       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ AgoraClient → Agora Agent Server → Agora Cloud       │  │
│  │                                                          │
│  │ Agent Configuration:                                     │
│  │ - Instructions (JUDGE_PROMPT / COUNSEL_PROMPT)          │
│  │ - STT: Deepgram nova-3                                  │
│  │ - LLM: Custom OpenAI-compatible endpoint                │
│  │ - TTS: MiniMax speech_2_6_turbo                         │
│  │ - Turn Detection: VAD-based (480ms silence threshold)   │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Agora RTC    │  │ Deepgram STT │  │ MiniMax TTS  │      │
│  │ (Voice)      │  │ (Speech)     │  │ (Synthesis)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Google Gemini 2.5 Flash Lite (via custom API)        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Agora Integration

### RTC SDK Integration

The Agora RTC SDK is used for real-time voice communication between the user and AI agents.

**Key Components:**
- `useRTCClient()`: Manages the Agora RTC client connection
- `useJoin()`: Joins the Agora channel with token authentication
- `useLocalMicrophoneTrack()`: Captures and publishes user's audio
- `useRemoteUsers()`: Receives audio from Judge and Counsel agents
- `RemoteUser`: Renders remote agent audio tracks

**Implementation:** `src/app/simulator/DualConversationComponent.tsx:88-133`

```typescript
const client = useRTCClient();
const remoteUsers = useRemoteUsers();
const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);
const { isConnected: joinSuccess } = useJoin({
  appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
  channel: agoraData.channel,
  token: agoraData.token,
  uid: parseInt(agoraData.uid, 10) || 0,
}, isReady);
```

### Conversational AI Engine Integration

The Agora Conversational AI Engine manages the AI agent lifecycle, speech processing, and turn-based conversation flow.

**Server-Side Agent Creation** (`src/app/api/v2/agora/invite-agent/route.ts:158-217`):

```typescript
const agent = new Agent({
  name: `${agent_role}-${Date.now()}`,
  instructions: prompt,  // JUDGE_PROMPT or COUNSEL_PROMPT
  greeting,
  maxHistory: 50,
  turnDetection: {
    config: {
      speech_threshold: 0.5,
      start_of_speech: { mode: "vad", vad_config: { interrupt_duration_ms: 160 } },
      end_of_speech: { mode: "vad", vad_config: { silence_duration_ms: 480 } },
    },
  },
  advancedFeatures: { enable_rtm: true, enable_tools: true },
})
  .withStt(new DeepgramSTT({ model: "nova-3", language: "en" }))
  .withLlm(new OpenAI({ url: llmUrl, model: "gemini-2.5-flash-lite" }))
  .withTts(new MiniMaxTTS({ model: "speech_2_6_turbo", voiceId: ttsVoice }));

const session = agent.createSession(agoraClient, {
  channel: channel_name,
  agentUid: agentUidFinal,
  remoteUids: [requester_id],
  idleTimeout: 30,
  expiresIn: ExpiresIn.hours(1),
});
await session.start();
```

**Client-Side Voice AI** (`src/app/simulator/DualConversationComponent.tsx:51-77`):

```typescript
const ai = await AgoraVoiceAI.init({
  rtcEngine: client,
  rtmConfig: { rtmEngine: rtmClient },
  renderMode: TranscriptHelperMode.TEXT,
  enableLog: true,
});

ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => onUpdate([...t]));
ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) => onStateChange(event.state));
ai.subscribeMessage(channel);
```

### Token Authentication

The application uses Agora's token-based authentication for both RTC (voice) and RTM (real-time messaging) services.

**Token Generation** (`src/app/api/v2/agora/generate-token/route.ts:42-50`):

```typescript
const token = RtcTokenBuilder.buildTokenWithRtm(
  APP_ID,
  APP_CERTIFICATE,
  channelName,
  uid,
  RtcRole.PUBLISHER,
  expirationTime,  // 1 hour
  expirationTime,
);
```

**Token Renewal** (`src/app/simulator/DualConversationComponent.tsx:285-296`):

The client automatically renews tokens when they're about to expire (30 seconds before expiration).

## Setup Instructions

### Prerequisites

- Node.js 20 or higher
- Agora Account ([sign up here](https://console.agora.io/))
- Google AI API Key ([get from AI Studio](https://aistudio.google.com/app/apikey))

### Environment Variables

Copy `.env.example` to `.env` and configure the following:

```bash
# Google Generative AI (required)
AI_GOOGLE_GENAI_API_URL=https://generativelanguage.googleapis.com/v1beta
AI_GOOGLE_GENAI_API_KEY=your-google-api-key

# Agora Credentials (required)
NEXT_PUBLIC_AGORA_APP_ID=your-agora-app-id
AGORA_APP_ID=your-agora-app-id
AGORA_APP_SECRET=your-agora-app-secret

# Agora REST API (optional, for channel management)
AGORA_CUSTOMER_KEY=your-customer-key
AGORA_CUSTOMER_SECRET=your-customer-secret

# Agent UIDs (optional, defaults provided)
NEXT_PUBLIC_AGENT_UID=12345
NEXT_PUBLIC_JUDGE_UID=1001
NEXT_PUBLIC_COUNSEL_UID=2001

# Custom LLM Endpoints (optional, uses internal routes by default)
CUSTOM_LLM_URL=http://localhost:3000/api/chat/completions
CUSTOM_LLM_URL_JUDGE=http://localhost:3000/api/chat/completions/judge
CUSTOM_LLM_URL_COUNSEL=http://localhost:3000/api/chat/completions/counsel
```

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Running Linting and Formatting

```bash
# Check code with Biome
npm run lint

# Format code with Biome
npm run format
```

## Known Limitations

1. **Case Availability**
   - Currently only Indonesian cases (PP 35/2021 labor law) are available
   - Singapore cases are marked as "Coming Soon" and not yet implemented

2. **Internet Connectivity**
   - Requires stable internet connection for real-time voice streaming
   - Latency may affect conversation flow in poor network conditions

3. **Token Expiration**
   - Agora tokens expire after 1 hour
   - Sessions must be restarted after token expiration

4. **Browser Requirements**
   - Requires modern browser with Web Audio API support
   - Microphone permissions must be granted
   - HTTPS required for microphone access in production

5. **LLM Rate Limits**
   - Dependent on Google AI API rate limits
   - Multiple concurrent conversations may hit API quotas

6. **Voice Recognition**
   - English language only (Deepgram nova-3 English model)
   - Accents and background noise may affect recognition accuracy

## Project Structure

```
src/
├── app/
│   ├── api/v2/
│   │   ├── agora/
│   │   │   ├── generate-token/route.ts    # Token generation
│   │   │   ├── invite-agent/route.ts      # Agent session creation
│   │   │   └── stop-conversation/route.ts # Session termination
│   │   ├── chat/completions/
│   │   │   ├── route.ts                   # Default chat endpoint
│   │   │   ├── judge/route.ts             # Judge-specific LLM
│   │   │   └── counsel/route.ts           # Counsel-specific LLM
│   │   └── sentiment/route.ts             # Sentiment analysis
│   ├── simulator/
│   │   ├── page.tsx                       # Simulator page
│   │   └── DualConversationComponent.tsx  # Voice UI component
│   ├── _features/
│   │   └── simulator-client.tsx           # Persona/role selection
│   ├── layout.tsx                         # Root layout
│   └── page.tsx                           # Home page
├── components/ui/                         # shadcn/ui components
├── lib/
│   ├── sse-stream.ts                      # SSE stream handler
│   └── utils.ts                           # Utility functions
└── types/
    └── conversation.ts                    # TypeScript types
```

## License

This project was submitted to the Agora Voice AI Hackathon Singapore 2026.
