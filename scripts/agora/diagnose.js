/**
 * Full pipeline diagnostics for the Agora voice agent backend.
 *
 * Usage:
 *   npm run agora:diagnose              — runs all offline checks
 *   npm run agora:diagnose -- --live    — also does a real Agora join/leave (uses quota)
 *   npm run agora:diagnose -- --voices  — validates voice IDs for all 4 NPCs
 *   npm run agora:diagnose -- --server  — also hits the local running server
 */

const { loadEnvFile } = require("./load-env");
loadEnvFile();

const { ExpiresIn, generateRtcToken, generateConvoAIToken } = require("agora-agent-server-sdk");
const { buildLlmConfig, buildTtsConfig, resolveVoiceIdForNpc } = require("./npc-manager");
const { buildSystemPrompt } = require("./prompt-builder");
const npcProfiles = require("./data/npc-profiles.json");
const scenarios = require("./data/scenarios.json");

const LIVE  = process.argv.includes("--live");
const VOICES = process.argv.includes("--voices");
const SERVER = process.argv.includes("--server");
const SERVER_URL = `http://localhost:${process.env.AGORA_SESSION_SERVER_PORT || 8080}`;

// ── Output helpers ────────────────────────────────────────────────────────────

const PASS  = "\x1b[32m✓ PASS\x1b[0m";
const FAIL  = "\x1b[31m✗ FAIL\x1b[0m";
const SKIP  = "\x1b[33m– SKIP\x1b[0m";
const WARN  = "\x1b[33m⚠ WARN\x1b[0m";
const INFO  = "\x1b[36mℹ\x1b[0m";

const results = [];

function mask(v) {
  if (!v || typeof v !== "string") return v ? "\x1b[32m(set)\x1b[0m" : "\x1b[31m(missing)\x1b[0m";
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} chars)`;
}

function redactDeep(obj) {
  return JSON.parse(
    JSON.stringify(obj, (k, val) => {
      if (k === "api_key" || k === "key") return typeof val === "string" ? mask(val) : val;
      return val;
    })
  );
}

async function step(name, fn) {
  process.stdout.write(`\n${"─".repeat(60)}\n${name}\n`);
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    if (result === "skip") {
      console.log(`${SKIP}  (${ms}ms)`);
      results.push({ name, status: "skip" });
    } else {
      console.log(`${PASS}  (${ms}ms)`);
      results.push({ name, status: "pass" });
    }
  } catch (e) {
    const ms = Date.now() - t0;
    console.error(`${FAIL}  (${ms}ms)\n  ${e.message || e}`);
    if (e.detail) console.error("  Detail:", e.detail);
    results.push({ name, status: "fail", error: e.message });
  }
}

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkEnv() {
  const required = [
    ["AGORA_APP_ID",          process.env.AGORA_APP_ID],
    ["AGORA_APP_CERTIFICATE", process.env.AGORA_APP_CERTIFICATE],
    ["ELEVENLABS_API_KEY",    process.env.ELEVENLABS_API_KEY],
  ];
  const optional = [
    ["MISTRAL_API_KEY",       process.env.MISTRAL_API_KEY],
    ["OPENAI_API_KEY",        process.env.OPENAI_API_KEY],
    ["LLM_MODEL",             process.env.LLM_MODEL],
    ["AGORA_DEFAULT_PIPELINE_ID", process.env.AGORA_DEFAULT_PIPELINE_ID],
    ["ELEVENLABS_FALLBACK_VOICE_ID", process.env.ELEVENLABS_FALLBACK_VOICE_ID],
  ];

  console.log("  Required:");
  let missing = 0;
  for (const [k, v] of required) {
    const label = v ? `\x1b[32m(set)\x1b[0m` : `\x1b[31m(MISSING)\x1b[0m`;
    console.log(`    ${k.padEnd(30)} ${label}`);
    if (!v) missing++;
  }
  console.log("  Optional:");
  for (const [k, v] of optional) {
    console.log(`    ${k.padEnd(30)} ${v ? `\x1b[32m(set)\x1b[0m` : "(not set)"}`);
  }

  const llmKey = process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY;
  if (!llmKey) {
    console.log(`  ${WARN}  No LLM key set (MISTRAL_API_KEY or OPENAI_API_KEY required for inline mode)`);
  }

  if (missing > 0) throw new Error(`${missing} required env var(s) missing — see above`);
}

async function checkMistral() {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return "skip";
  const model = process.env.LLM_MODEL || "mistral-small-latest";
  console.log(`  Model: ${model}`);
  const t0 = Date.now();
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 16,
      stream: false,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content;
  const tokens = data.usage?.total_tokens ?? "?";
  console.log(`  Response: ${JSON.stringify(content)}  (${tokens} tokens, ${Date.now() - t0}ms latency)`);
}

async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "skip";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  console.log(`  Model: ${model}`);
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 16,
      stream: false,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content;
  console.log(`  Response: ${JSON.stringify(content)}  (${Date.now() - t0}ms latency)`);
}

async function checkElevenLabsAccount() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return "skip";
  const res = await fetch("https://api.elevenlabs.io/v1/user", {
    headers: { "xi-api-key": key },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const tier = data.subscription?.tier || data.subscription?.tier_name || "unknown";
  const chars = data.subscription?.character_count ?? "?";
  const limit = data.subscription?.character_limit ?? "?";
  console.log(`  Account tier: ${tier}`);
  console.log(`  Characters used: ${chars.toLocaleString()} / ${limit.toLocaleString()}`);
}

async function checkVoicesForAllNpcs() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return "skip";
  let anyFailed = false;
  for (const profile of npcProfiles) {
    try {
      const t0 = Date.now();
      const voiceId = await resolveVoiceIdForNpc(profile);
      console.log(`  ${profile.npcId.padEnd(12)} → voice_id=${voiceId}  (${Date.now() - t0}ms)`);
    } catch (e) {
      console.error(`  ${profile.npcId.padEnd(12)} → \x1b[31mFAILED: ${e.message}\x1b[0m`);
      anyFailed = true;
    }
  }
  if (anyFailed) throw new Error("One or more NPC voices could not be resolved — see above");
}

async function checkElevenLabsButlerOnly() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return "skip";
  const profile = npcProfiles.find((p) => p.npcId === "butler");
  const t0 = Date.now();
  const voiceId = await resolveVoiceIdForNpc(profile);
  console.log(`  Butler voice_id: ${voiceId}  (${Date.now() - t0}ms)`);
  console.log(`  ${INFO} Run with --voices to check all 4 NPCs`);
}

function checkAgoraTokens() {
  const appId = process.env.AGORA_APP_ID;
  const cert  = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !cert) return "skip";

  const channel = "diag-token-check";
  const rtc = generateRtcToken({ appId, appCertificate: cert, channel, uid: 5001, expirySeconds: 3600 });
  const convo = generateConvoAIToken({ appId, appCertificate: cert, channelName: channel, account: "1001", tokenExpire: ExpiresIn.HOUR });

  console.log(`  RTC token:    length=${rtc.length}  prefix=${rtc.slice(0, 6)}…`);
  console.log(`  ConvoAI token: length=${convo.length}  prefix=${convo.slice(0, 6)}…`);

  if (rtc.length < 50 || convo.length < 50) throw new Error("Token looks suspiciously short — check appId/certificate");
}

async function checkPayloadShape() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return "skip";
  const profile = npcProfiles.find((p) => p.npcId === "butler");
  const scenario = scenarios[0];
  const fakeNpcState = {
    breakdown: 0, trust: 50, emotion: "calm", isMurderer: false, npcId: "butler",
    name: profile.name, role: profile.role, personality: profile.personality,
    channelName: "cluedo_diag_butler", currentLocation: profile.gravityToward,
  };

  const systemPrompt = buildSystemPrompt(profile, fakeNpcState, scenario);
  const llm = buildLlmConfig(systemPrompt);
  const voiceId = await resolveVoiceIdForNpc(profile);
  const tts = buildTtsConfig(voiceId);

  console.log("  System prompt (first 200 chars):");
  console.log(`    "${systemPrompt.slice(0, 200).replace(/\n/g, "↵")}…"`);
  console.log("\n  LLM config (redacted):");
  console.log(JSON.stringify(redactDeep(llm), null, 2).replace(/^/gm, "    "));
  console.log("\n  TTS config (redacted):");
  console.log(JSON.stringify(redactDeep(tts), null, 2).replace(/^/gm, "    "));
}

async function checkServerHealth() {
  if (!SERVER) return "skip";
  const res = await fetch(`${SERVER_URL}/health`).catch((e) => {
    throw new Error(`Cannot reach ${SERVER_URL}/health — is the server running? (${e.message})`);
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(`Server returned ${res.status}: ${JSON.stringify(data)}`);
  console.log(`  ${INFO} Server at ${SERVER_URL} is healthy`);
}

async function checkServerGameFlow() {
  if (!SERVER) return "skip";
  const h = { "Content-Type": "application/json" };
  const sid = `diag-${Date.now()}`;

  // Start session
  const startRes = await fetch(`${SERVER_URL}/api/game/start`, {
    method: "POST", headers: h, body: JSON.stringify({ sessionId: sid }),
  });
  if (!startRes.ok) throw new Error(`/api/game/start failed: ${await startRes.text()}`);
  const startData = await startRes.json();
  console.log(`  /api/game/start → session="${sid}" npcs=${startData.npcs.map((n) => n.npcId).join(",")}`);

  // Get state
  const stateRes = await fetch(`${SERVER_URL}/api/game/state?sessionId=${sid}`);
  if (!stateRes.ok) throw new Error(`/api/game/state failed: ${await stateRes.text()}`);
  const stateData = await stateRes.json();
  console.log(`  /api/game/state → journal=${stateData.journal.length} entries npcCount=${stateData.npcs.length}`);

  // Check all NPCs are in expected default state
  for (const npc of stateData.npcs) {
    if (npc.breakdown !== 0 || npc.trust !== 50 || npc.tier !== "calm") {
      throw new Error(`NPC ${npc.npcId} has unexpected initial state: ${JSON.stringify(npc)}`);
    }
  }
  console.log(`  All NPCs at default state: breakdown=0 trust=50 tier=calm ✓`);

  // Test wrong accusation (trust penalty)
  const accuseRes = await fetch(`${SERVER_URL}/api/game/accuse`, {
    method: "POST", headers: h,
    body: JSON.stringify({ sessionId: sid, suspectNpcId: "maid", weapon: "rope", room: "kitchen" }),
  });
  if (!accuseRes.ok) throw new Error(`/api/game/accuse failed: ${await accuseRes.text()}`);
  const accuseData = await accuseRes.json();
  console.log(`  /api/game/accuse (wrong guess) → correct=${accuseData.correct} murderer=${accuseData.reveal.murderer}`);
  if (accuseData.correct) throw new Error("Wrong accusation returned correct=true — check scenario");

  // Verify trust dropped
  const stateAfter = await (await fetch(`${SERVER_URL}/api/game/state?sessionId=${sid}`)).json();
  const trustDropped = stateAfter.npcs.every((n) => n.trust < 50);
  console.log(`  Trust after wrong accusation: ${stateAfter.npcs.map((n) => `${n.npcId}=${n.trust}`).join(" ")} ${trustDropped ? "✓" : "⚠ unexpected"}`);

  // End session
  const endRes = await fetch(`${SERVER_URL}/api/game/end`, {
    method: "POST", headers: h, body: JSON.stringify({ sessionId: sid }),
  });
  if (!endRes.ok) throw new Error(`/api/game/end failed: ${await endRes.text()}`);
  console.log(`  /api/game/end → session cleaned up ✓`);
}

async function checkLiveAgoraJoin() {
  if (!LIVE) return "skip";
  const { startSession, stopSession } = require("./agora-service");
  const profile = npcProfiles.find((p) => p.npcId === "butler");
  const voiceId  = await resolveVoiceIdForNpc(profile);
  const channel  = `diag-live-${Date.now()}`;

  console.log(`  ${WARN} This uses Agora quota. Channel: ${channel}`);
  console.log("  Joining …");

  const t0 = Date.now();
  const result = await startSession({
    channel,
    playerUid: 5001,
    agentUid: 1001,
    greetingMessage: "Diagnostic test. Leaving immediately.",
    failureMessage: "Diagnostic failure.",
    llm: buildLlmConfig("You are a test assistant. Say exactly: Diagnostic OK."),
    tts: buildTtsConfig(voiceId),
    idleTimeout: 30,
  });
  const agentId = result.agent?.agent_id;
  console.log(`  Join OK in ${Date.now() - t0}ms — agent_id=${agentId}`);
  console.log(`  Channel: ${result.channel}  playerUid=${result.player_uid}  agentUid=${result.agent_uid}`);

  if (!agentId) throw new Error("Join succeeded but no agent_id returned");

  const t1 = Date.now();
  await stopSession({ agentId, channel, agentUid: 1001 });
  console.log(`  Stop OK in ${Date.now() - t1}ms`);
  console.log(`  ${INFO} To hear the agent: join channel "${channel}" with playerUid=5001 and the rtcToken before stopping`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const line = "═".repeat(60);
  console.log(`\n${line}`);
  console.log("  Agora voice agent — full pipeline diagnostics");
  console.log(`  ${new Date().toLocaleString()}  node ${process.version}`);
  console.log(`  Flags: ${[LIVE && "--live", VOICES && "--voices", SERVER && "--server"].filter(Boolean).join(" ") || "none"}`);
  console.log(line);

  await step("1) Environment variables",          checkEnv);
  await step("2) Mistral LLM (direct REST)",       checkMistral);
  await step("3) OpenAI LLM (direct REST)",        checkOpenAI);
  await step("4) ElevenLabs — account info",       checkElevenLabsAccount);

  if (VOICES) {
    await step("5) ElevenLabs — voice IDs for all 4 NPCs", checkVoicesForAllNpcs);
  } else {
    await step("5) ElevenLabs — butler voice ID",  checkElevenLabsButlerOnly);
  }

  await step("6) Agora token generation",          () => Promise.resolve(checkAgoraTokens()));
  await step("7) Full join payload shape",          checkPayloadShape);
  await step("8) Local server health + game flow", checkServerGameFlow);
  await step("9) LIVE Agora join/leave",           checkLiveAgoraJoin);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const pass  = results.filter((r) => r.status === "pass").length;
  const fail  = results.filter((r) => r.status === "fail").length;
  const skip  = results.filter((r) => r.status === "skip").length;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Summary: ${pass} passed  ${fail > 0 ? `\x1b[31m${fail} failed\x1b[0m` : "0 failed"}  ${skip} skipped`);

  if (fail > 0) {
    console.log("\nFailed checks:");
    results.filter((r) => r.status === "fail").forEach((r) => {
      console.log(`  \x1b[31m✗\x1b[0m ${r.name}`);
      if (r.error) console.log(`    ${r.error}`);
    });
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log("Client reminder:");
  console.log("  To hear the agent you must join the SAME channel");
  console.log("  with the SAME playerUid and the rtcToken from /interact.");
  console.log("  This script tests the pipeline — not your speakers.\n");

  if (!SERVER) console.log(`${INFO} Re-run with --server to also hit the local game server.`);
  if (!VOICES) console.log(`${INFO} Re-run with --voices to validate all 4 NPC voice IDs.`);
  if (!LIVE)   console.log(`${INFO} Re-run with --live to do a real Agora join/leave (uses quota).`);
  console.log();

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nUnexpected crash:", e);
  process.exit(1);
});
