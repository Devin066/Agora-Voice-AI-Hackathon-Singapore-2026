const { startSession, stopSession } = require("./agora-service");
const { buildSystemPrompt } = require("./prompt-builder");

const NPC_AGENT_UIDS = {
  butler: 1001,
  chef: 1002,
  gardener: 1003,
  maid: 1004,
};

const NPC_GREETING = "Good evening, detective. What is it you want?";

function useInlineConfig() {
  const llmKey = process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY;
  return Boolean(llmKey && process.env.ELEVENLABS_API_KEY);
}

function usePipelineConfig() {
  return Boolean(process.env.AGORA_DEFAULT_PIPELINE_ID);
}

function buildLlmConfig(systemPrompt) {
  const mistralKey = process.env.MISTRAL_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  const url = mistralKey
    ? "https://api.mistral.ai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const api_key = mistralKey || openAiKey;
  const model = process.env.LLM_MODEL || (mistralKey ? "mistral-small-latest" : "gpt-4o-mini");

  return {
    url,
    api_key,
    model,
    system_messages: [{ role: "system", content: systemPrompt }],
    max_tokens: 512,
  };
}

function buildTtsConfig(npcProfile) {
  const voiceId =
    process.env[`ELEVENLABS_VOICE_${npcProfile.npcId.toUpperCase()}`] ||
    npcProfile.voiceId;

  return {
    vendor: "elevenlabs",
    params: {
      key: process.env.ELEVENLABS_API_KEY,
      voice_id: voiceId,
      model_id: "eleven_turbo_v2",
    },
  };
}

async function spawnNpcAgent(npcProfile, npcState, scenario, playerUid) {
  const agentUid = NPC_AGENT_UIDS[npcProfile.npcId];
  if (!agentUid) {
    throw new Error(`No agent UID configured for NPC: ${npcProfile.npcId}`);
  }

  const systemPrompt = buildSystemPrompt(npcProfile, npcState, scenario);
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
    idleTimeout: 180,
  };

  if (inline) {
    sessionInput.llm = buildLlmConfig(systemPrompt);
    sessionInput.tts = buildTtsConfig(npcProfile);
  } else {
    sessionInput.pipelineId = process.env.AGORA_DEFAULT_PIPELINE_ID;
  }

  const result = await startSession(sessionInput);

  npcState.activeAgentId = result.agent.agent_id;
  return result;
}

async function despawnNpcAgent(npcState) {
  if (!npcState.activeAgentId) {
    return null;
  }

  const agentId = npcState.activeAgentId;
  try {
    await stopSession({
      agentId,
      channel: npcState.channelName,
      agentUid: NPC_AGENT_UIDS[npcState.npcId],
    });
  } finally {
    npcState.activeAgentId = null;
  }

  return { ok: true, agent_id: agentId };
}

module.exports = { spawnNpcAgent, despawnNpcAgent, NPC_AGENT_UIDS };
