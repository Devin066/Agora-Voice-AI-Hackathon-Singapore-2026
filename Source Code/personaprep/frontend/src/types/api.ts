export interface StartInterviewRequest {
  persona_id: string
  role: 'AI Engineer' | 'SWE' | 'Product Manager' | 'Startup Founder'
  interview_type: 'behavioral' | 'technical' | 'recruiter_screen'
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface StartInterviewResponse {
  channel: string
  appid: string
  rtc_token: string
  rtm_token: string
  agent_uid: string
  user_uid: string
  agent_video_uid: string | null  // "200" if avatar enabled, null otherwise
}

export interface FeedbackResponse {
  overall_score: number
  summary: string
  rubric: {
    clarity: number
    specificity: number
    technical_depth: number
    confidence: number
  }
  strengths: string[]
  weaknesses: string[]
  improved_answer_examples: Array<{ question: string; suggestion: string }>
}

export interface PersonaInfo {
  id: string
  name: string
  description: string
  tone_tags: string[]
}

export interface PersonaBuildRequest {
  name: string
  sources: Array<
    | { type: 'youtube'; url: string }
    | { type: 'url'; url: string }
    | { type: 'text'; text: string; label?: string }
  >
  photo_url?: string
}

export interface PersonaBuildStatus {
  status: 'queued' | 'collecting' | 'synthesizing' | 'cloning_voice' | 'building_avatar' | 'done' | 'failed'
  progress_label: string
  persona_id?: string
  error?: string
}

export interface PersonaListItem {
  id: string
  name: string
  description?: string
  tone_tags?: string[]
  type: 'builtin' | 'custom'
  has_voice_clone?: boolean
  has_avatar?: boolean
  source_summary?: string
}
