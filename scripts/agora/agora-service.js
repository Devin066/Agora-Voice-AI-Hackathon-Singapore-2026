const { randomUUID } = require("crypto");
const AgoraToken = require("agora-token");
const {
  ExpiresIn,
  generateConvoAIToken,
  generateRtcToken,
} = require("agora-agent-server-sdk");
const { loadEnvFile } = require("./load-env");

loadEnvFile();

const DEFAULT_CONVO_API_BASE =
  "https://api.agora.io/api/conversational-ai-agent/v2";
const activeSessions = new Map();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function buildRuntimeConfig() {
  return {
    appId: requiredEnv("AGORA_APP_ID"),
    appCertificate: requiredEnv("AGORA_APP_CERTIFICATE"),
    defaultPipelineId: process.env.AGORA_DEFAULT_PIPELINE_ID || "",
    defaultPreset: process.env.AGORA_DEFAULT_AGENT_PRESET || "",
    defaultIdleTimeout: optionalNumber(
      process.env.AGORA_DEFAULT_IDLE_TIMEOUT,
      120
    ),
    convoApiBase: process.env.AGORA_CONVO_API_BASE || DEFAULT_CONVO_API_BASE,
  };
}

function createJsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload, null, 2),
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonBody(raw) {
  if (!raw) {
    return {};
  }

  if (Buffer.isBuffer(raw)) {
    return JSON.parse(raw.toString("utf8"));
  }

  if (typeof raw === "string") {
    return JSON.parse(raw);
  }

  return raw;
}

function validateUidSet(playerUid, agentUid, enableStringUid) {
  if (enableStringUid) {
    if (typeof playerUid !== "string" || typeof agentUid !== "string") {
      throw new Error(
        "When enableStringUid is true, both playerUid and agentUid must be strings."
      );
    }
    return;
  }

  if (!Number.isInteger(playerUid) || !Number.isInteger(agentUid)) {
    throw new Error(
      "When enableStringUid is false, both playerUid and agentUid must be integers."
    );
  }
}

function buildRtcToken(config, request) {
  if (request.enableStringUid) {
    return AgoraToken.RtcTokenBuilder.buildTokenWithUserAccount(
      config.appId,
      config.appCertificate,
      request.channel,
      request.playerUid,
      AgoraToken.RtcRole.PUBLISHER,
      request.playerTokenExpirySeconds
    );
  }

  return generateRtcToken({
    appId: config.appId,
    appCertificate: config.appCertificate,
    channel: request.channel,
    uid: request.playerUid,
    expirySeconds: request.playerTokenExpirySeconds,
  });
}

function buildAgentToken(config, request) {
  return generateConvoAIToken({
    appId: config.appId,
    appCertificate: config.appCertificate,
    channelName: request.channel,
    account: String(request.agentUid),
    tokenExpire: request.agentTokenExpirySeconds,
  });
}

function buildAgentAuthorizationToken(config, options) {
  if (!options.channel || options.agentUid === undefined || options.agentUid === null) {
    throw new Error(
      "channel and agentUid are required when the server does not already have a stored token for this agent."
    );
  }

  return generateConvoAIToken({
    appId: config.appId,
    appCertificate: config.appCertificate,
    channelName: options.channel,
    account: String(options.agentUid),
    tokenExpire: optionalNumber(options.agentTokenExpirySeconds, ExpiresIn.HOUR),
  });
}

function normalizeStartRequest(input, config = buildRuntimeConfig()) {
  const body = parseJsonBody(input);
  const enableStringUid = Boolean(body.enableStringUid);
  const playerUid = enableStringUid
    ? String(body.playerUid ?? "detective")
    : Number(body.playerUid ?? 1000);
  const agentUid = enableStringUid
    ? String(body.agentUid ?? "npc_agent")
    : Number(body.agentUid ?? 2001);
  const channel = body.channel || `case-${Date.now()}`;
  const name = body.name || `agent-${randomUUID()}`;
  const pipelineId = body.pipelineId || config.defaultPipelineId || undefined;
  const preset = body.preset || config.defaultPreset || undefined;

  validateUidSet(playerUid, agentUid, enableStringUid);

  const request = {
    channel,
    playerUid,
    agentUid,
    enableStringUid,
    name,
    pipelineId,
    preset,
    idleTimeout: optionalNumber(body.idleTimeout, config.defaultIdleTimeout),
    playerTokenExpirySeconds: optionalNumber(
      body.playerTokenExpirySeconds,
      ExpiresIn.HOUR
    ),
    agentTokenExpirySeconds: optionalNumber(
      body.agentTokenExpirySeconds,
      ExpiresIn.HOUR
    ),
    llm: body.llm,
    tts: body.tts,
    asr: body.asr,
    advancedFeatures: body.advancedFeatures,
    turnDetection: body.turnDetection,
    greetingMessage: body.greetingMessage,
    failureMessage: body.failureMessage,
  };

  if (!pipelineId && !preset && (!isObject(body.llm) || !isObject(body.tts))) {
    throw new Error(
      "Provide either pipelineId, preset, or both llm and tts configs."
    );
  }

  return request;
}

function buildJoinPayload(request, agentToken) {
  const properties = {
    channel: request.channel,
    token: agentToken,
    agent_rtc_uid: String(request.agentUid),
    remote_rtc_uids: [String(request.playerUid)],
    enable_string_uid: request.enableStringUid,
    idle_timeout: request.idleTimeout,
  };

  if (request.greetingMessage || request.failureMessage) {
    properties.llm = {
      ...(request.llm || {}),
      greeting_message: request.greetingMessage,
      failure_message: request.failureMessage,
    };
  } else if (request.llm) {
    properties.llm = request.llm;
  }

  if (request.tts) {
    properties.tts = request.tts;
  }

  if (request.asr) {
    properties.asr = request.asr;
  }

  if (request.advancedFeatures) {
    properties.advanced_features = request.advancedFeatures;
  }

  if (request.turnDetection) {
    properties.turn_detection = request.turnDetection;
  }

  return {
    name: request.name,
    ...(request.pipelineId ? { pipeline_id: request.pipelineId } : {}),
    ...(request.preset ? { preset: request.preset } : {}),
    properties,
  };
}

async function callAgora(config, path, options = {}) {
  const response = await fetch(`${config.convoApiBase}${path}`, options);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(
      `Agora API ${response.status} ${response.statusText}: ${detail}`
    );
  }

  return body;
}

async function startSession(input) {
  const config = buildRuntimeConfig();
  const request = normalizeStartRequest(input, config);
  const playerRtcToken = buildRtcToken(config, request);
  const agentToken = buildAgentToken(config, request);
  const joinPayload = buildJoinPayload(request, agentToken);

  const agent = await callAgora(config, `/projects/${config.appId}/join`, {
    method: "POST",
    headers: {
      Authorization: `agora token=${agentToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(joinPayload),
  });

  if (agent?.agent_id) {
    activeSessions.set(agent.agent_id, {
      agentToken,
      channel: request.channel,
      agentUid: request.agentUid,
    });
  }

  return {
    appId: config.appId,
    channel: request.channel,
    player_uid: request.playerUid,
    agent_uid: request.agentUid,
    rtc_token: playerRtcToken,
    agent,
    join_payload: joinPayload,
  };
}

async function stopSession({ agentId, channel, agentUid, agentTokenExpirySeconds }) {
  const config = buildRuntimeConfig();
  if (!agentId) {
    throw new Error("agentId is required to stop a conversational AI session.");
  }

  const session = activeSessions.get(agentId);
  const authorizationToken =
    session?.agentToken ||
    buildAgentAuthorizationToken(config, {
      channel: channel || session?.channel,
      agentUid: agentUid ?? session?.agentUid,
      agentTokenExpirySeconds,
    });
  if (!authorizationToken) {
    throw new Error(
      "No stored authorization token for this agentId. Stop the session from the same server process that started it."
    );
  }

  await callAgora(
    config,
    `/projects/${config.appId}/agents/${agentId}/leave`,
    {
      method: "POST",
      headers: {
        Authorization: `agora token=${authorizationToken}`,
      },
    }
  );

  activeSessions.delete(agentId);

  return { ok: true, agent_id: agentId };
}

module.exports = {
  buildRuntimeConfig,
  createJsonResponse,
  normalizeStartRequest,
  parseJsonBody,
  buildAgentAuthorizationToken,
  startSession,
  stopSession,
};
