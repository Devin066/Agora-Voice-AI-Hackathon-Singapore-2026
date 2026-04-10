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

For more detail information related how to setup and run the project, please go to `./source-code` folder.
