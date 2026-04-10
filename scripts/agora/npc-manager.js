const { startSession, stopSession } = require("./agora-service");
const { buildSystemPrompt } = require("./prompt-builder");

const NPC_AGENT_UIDS = {
  butler: 1001,
  chef: 1002,
  gardener: 1003,
  maid: 1004,
};

const NPC_GREETING = "Good evening, detective. What is it you want?";

/** Last resort if nothing else validates (Adam — common preset voice). */
const BUILTIN_DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB";

/** Cache validated voice IDs per NPC so we only hit ElevenLabs once per process. */
const voiceIdCache = new Map();

function useInlineConfig() {
  const llmKey = process.env.GROQ_API_KEY || process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY;
  return Boolean(llmKey && process.env.ELEVENLABS_API_KEY);
}

function usePipelineConfig() {
  return Boolean(process.env.AGORA_DEFAULT_PIPELINE_ID);
}

function buildLlmConfig(systemPrompt) {
  const groqKey = process.env.GROQ_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  const url = groqKey
    ? "https://api.groq.com/openai/v1/chat/completions"
    : mistralKey
    ? "https://api.mistral.ai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  const api_key = groqKey || mistralKey || openAiKey;

  const defaultModel = groqKey
    ? "llama-3.3-70b-versatile"
    : mistralKey
    ? "mistral-small-latest"
    : "gpt-4o-mini";

  return {
    url,
    api_key,
    system_messages: [{ role: "system", content: systemPrompt }],
    max_history: 32,
    params: {
      model: process.env.LLM_MODEL || defaultModel,
      max_tokens: 512,
      temperature: 0.7,
    },
  };
}

function preferredVoiceIdSync(npcProfile) {
  const envKey = `ELEVENLABS_VOICE_${npcProfile.npcId.toUpperCase()}`;
  return process.env[envKey] || npcProfile.voiceId;
}

/**
 * Ordered candidates: per-NPC env → profile JSON → global fallback env → built-in default.
 * Deduplicates while preserving order.
 */
function voiceIdCandidates(npcProfile) {
  const parts = [
    process.env[`ELEVENLABS_VOICE_${npcProfile.npcId.toUpperCase()}`],
    npcProfile.voiceId,
    process.env.ELEVENLABS_FALLBACK_VOICE_ID,
    BUILTIN_DEFAULT_VOICE,
  ];
  const seen = new Set();
  const out = [];
  for (const id of parts) {
    if (id && typeof id === "string" && id.trim() && !seen.has(id.trim())) {
      const t = id.trim();
      seen.add(t);
      out.push(t);
    }
  }
  return out.length ? out : [BUILTIN_DEFAULT_VOICE];
}

async function validateElevenLabsVoice(apiKey, voiceId) {
  if (!voiceId || !apiKey) return false;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
    { headers: { "xi-api-key": apiKey } }
  );
  return res.ok;
}

/**
 * Picks the first voice_id that exists for this ElevenLabs API key.
 * Logs warnings for rejected IDs. Set ELEVENLABS_VOICE_DEBUG=1 for per-attempt logs.
 * Set ELEVENLABS_SKIP_VOICE_VALIDATE=1 to skip HTTP checks (first candidate only).
 */
async function resolveVoiceIdForNpc(npcProfile) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required for inline TTS");
  }

  // Return cached result — no need to re-validate on every NPC switch.
  if (voiceIdCache.has(npcProfile.npcId)) {
    return voiceIdCache.get(npcProfile.npcId);
  }

  const candidates = voiceIdCandidates(npcProfile);
  const debug = process.env.ELEVENLABS_VOICE_DEBUG === "1";
  const skipValidate = process.env.ELEVENLABS_SKIP_VOICE_VALIDATE === "1";

  if (skipValidate) {
    const chosen = candidates[0];
    console.warn(
      `[ElevenLabs] ${npcProfile.npcId}: ELEVENLABS_SKIP_VOICE_VALIDATE=1 — using first candidate without check: ${chosen}`
    );
    voiceIdCache.set(npcProfile.npcId, chosen);
    return chosen;
  }

  for (const candidate of candidates) {
    if (debug) {
      console.log(
        `[ElevenLabs] ${npcProfile.npcId}: validating voice_id=${candidate} …`
      );
    }
    const ok = await validateElevenLabsVoice(apiKey, candidate);
    if (ok) {
      if (candidate !== preferredVoiceIdSync(npcProfile)) {
        console.warn(
          `[ElevenLabs] ${npcProfile.npcId}: preferred voice unavailable for this API key; using fallback voice_id=${candidate}`
        );
      } else {
        console.log(
          `[ElevenLabs] ${npcProfile.npcId}: using voice_id=${candidate}`
        );
      }
      voiceIdCache.set(npcProfile.npcId, candidate);
      return candidate;
    }
    console.warn(
      `[ElevenLabs] ${npcProfile.npcId}: voice_id not usable with current API key (404/forbidden): ${candidate}`
    );
  }

  throw new Error(
    `ElevenLabs: no valid voice for NPC "${npcProfile.npcId}". ` +
      `Add voices to the SAME account as ELEVENLABS_API_KEY, or set ELEVENLABS_FALLBACK_VOICE_ID. ` +
      `Run: npm run agora:diagnose`
  );
}

/**
 * @param {string|object} voiceIdOrProfile — resolved voice id string, or npc profile (sync pick only, no API)
 */
function buildTtsConfig(voiceIdOrProfile) {
  const voiceId =
    typeof voiceIdOrProfile === "string"
      ? voiceIdOrProfile
      : preferredVoiceIdSync(voiceIdOrProfile);

  return {
    vendor: "elevenlabs",
    params: {
      base_url: "wss://api.elevenlabs.io/v1",
      key: process.env.ELEVENLABS_API_KEY,
      model_id: "eleven_flash_v2_5",
      voice_id: voiceId,
      sample_rate: 24000,
    },
  };
}

/** Small pause so Agora fully releases a channel before we re-use it. */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function spawnNpcAgent(npcProfile, npcState, scenario, playerUid, roundInfo = null) {
  const agentUid = NPC_AGENT_UIDS[npcProfile.npcId];
  if (!agentUid) {
    throw new Error(`No agent UID configured for NPC: ${npcProfile.npcId}`);
  }

  const systemPrompt = buildSystemPrompt(npcProfile, npcState, scenario, roundInfo);
  const inline = useInlineConfig();
  const pipeline = usePipelineConfig();

  if (!inline && !pipeline) {
    throw new Error(
      "Set OPENAI_API_KEY + ELEVENLABS_API_KEY for inline mode, " +
        "or AGORA_DEFAULT_PIPELINE_ID for pipeline mode."
    );
  }

  const sessionInput = {
    channel: npcState.channelName,
    playerUid,
    agentUid,
    greetingMessage: NPC_GREETING,
    failureMessage:
      "Forgive me — I need a moment. Something is wrong with my thoughts.",
    idleTimeout: 180,
  };

  if (inline) {
    sessionInput.llm = buildLlmConfig(systemPrompt);
    const voiceId = await resolveVoiceIdForNpc(npcProfile);
    sessionInput.tts = buildTtsConfig(voiceId);
  } else {
    sessionInput.pipelineId = process.env.AGORA_DEFAULT_PIPELINE_ID;
  }

  console.log(
    `[npc-manager] Spawning agent for ${npcProfile.npcId} on channel ${npcState.channelName} (playerUid=${playerUid}, agentUid=${agentUid})`
  );
  const result = await startSession(sessionInput);
  console.log(
    `[npc-manager] Agent spawned for ${npcProfile.npcId}: agent_id=${result.agent.agent_id}`
  );

  npcState.activeAgentId = result.agent.agent_id;
  return result;
}

async function despawnNpcAgent(npcState) {
  if (!npcState.activeAgentId) {
    return null;
  }

  const agentId = npcState.activeAgentId;
  console.log(
    `[npc-manager] Stopping agent for ${npcState.npcId}: agent_id=${agentId}`
  );
  try {
    await stopSession({
      agentId,
      channel: npcState.channelName,
      agentUid: NPC_AGENT_UIDS[npcState.npcId],
    });
    console.log(`[npc-manager] Agent stopped for ${npcState.npcId}`);
  } catch (e) {
    console.warn(
      `[npc-manager] Stop failed for ${npcState.npcId} (agent_id=${agentId}): ${e.message} — clearing state anyway`
    );
  } finally {
    npcState.activeAgentId = null;
  }

  // Give Agora ~1s to fully release the channel before the next spawn.
  await sleep(1000);

  return { ok: true, agent_id: agentId };
}

module.exports = {
  spawnNpcAgent,
  despawnNpcAgent,
  NPC_AGENT_UIDS,
  buildLlmConfig,
  buildTtsConfig,
  resolveVoiceIdForNpc,
  voiceIdCandidates,
};
