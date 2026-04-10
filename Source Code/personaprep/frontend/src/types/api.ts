export interface StartInterviewRequest {
  persona_id: 'skeptical_technical' | 'friendly_recruiter' | 'startup_founder' | 'senior_hiring_manager'
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
