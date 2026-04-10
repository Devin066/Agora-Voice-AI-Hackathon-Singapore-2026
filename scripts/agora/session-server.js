const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const {
  createJsonResponse,
  parseJsonBody,
  startSession,
  stopSession,
} = require("./agora-service");
const { loadEnvFile } = require("./load-env");
const {
  createSession,
  requireSession,
  getNpcState,
  getNpcProfile,
  applyBreakdownDelta,
  applyTrustDelta,
  addJournalEntry,
  getPublicNpcState,
  getFullState,
  deleteSession,
} = require("./game-state");
const { spawnNpcAgent, despawnNpcAgent } = require("./npc-manager");

loadEnvFile();

const port = Number(process.env.AGORA_SESSION_SERVER_PORT || 8080);

const BREAKDOWN_PER_CONVERSATION = 15;

const VOICE_HTML = path.join(__dirname, "talk", "agora_voice.html");
const AGORA_WEB_SDK = path.join(
  __dirname,
  "..",
  "..",
  "node_modules",
  "agora-rtc-sdk-ng",
  "AgoraRTC_N-production.js"
);

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

function sendBinary(res, status, contentType, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Missing file: ${filePath}`);
    return;
  }
  res.writeHead(status, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function send(res, response) {
  res.writeHead(response.statusCode, response.headers);
  res.end(response.body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parsePath(req) {
  const parsed = new URL(req.url, `http://localhost:${port}`);
  return { pathname: parsed.pathname, searchParams: parsed.searchParams };
}

function matchNpcRoute(pathname, suffix) {
  const re = new RegExp(`^/api/npc/([^/]+)/${suffix}$`);
  const m = pathname.match(re);
  return m ? m[1] : null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const { pathname, searchParams } = parsePath(req);
  const startMs = Date.now();
  log(`→ ${req.method} ${pathname}`);

  function reply(response) {
    const ms = Date.now() - startMs;
    log(`← ${response.statusCode} ${pathname} (${ms}ms)`);
    send(res, response);
  }

  try {
    if (req.method === "GET" && pathname === "/health") {
      reply(createJsonResponse(200, { ok: true, service: "agora-session-server" }));
      return;
    }

    if (req.method === "GET" && (pathname === "/" || pathname === "/agora-voice")) {
      sendBinary(res, 200, "text/html; charset=utf-8", VOICE_HTML);
      return;
    }

    if (req.method === "GET" && pathname === "/static/agora-rtc.js") {
      sendBinary(res, 200, "application/javascript; charset=utf-8", AGORA_WEB_SDK);
      return;
    }

    if (req.method === "POST" && pathname === "/api/agora/session/start") {
      const result = await startSession(await readRequestBody(req));
      reply(createJsonResponse(200, result));
      return;
    }

    if (req.method === "POST" && pathname === "/api/agora/session/stop") {
      const body = parseJsonBody(await readRequestBody(req));
      const result = await stopSession({
        agentId: body.agentId,
        channel: body.channel,
        agentUid: body.agentUid,
        agentTokenExpirySeconds: body.agentTokenExpirySeconds,
      });
      reply(createJsonResponse(200, result));
      return;
    }

    // ── Game routes ──────────────────────────────────────────────────────────

    if (req.method === "POST" && pathname === "/api/game/start") {
      const body = parseJsonBody(await readRequestBody(req));
      if (!body.sessionId) {
        reply(createJsonResponse(400, { error: "sessionId is required" }));
        return;
      }

      const state = createSession(body.sessionId);
      log(`[game/start] session="${body.sessionId}" murderer=${state.scenario.murdererNpcId} victim="${state.scenario.victim}"`);
      reply(
        createJsonResponse(200, {
          sessionId: state.sessionId,
          scenario: { victim: state.scenario.victim },
          npcs: state.npcs.map((n) => ({
            npcId: n.npcId,
            name: n.name,
            role: n.role,
          })),
        })
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/game/state") {
      const sessionId = searchParams.get("sessionId");
      if (!sessionId) {
        reply(createJsonResponse(400, { error: "sessionId is required" }));
        return;
      }
      const state = getFullState(sessionId);
      log(`[game/state] session="${sessionId}" journal=${state.journal.length} entries`);
      reply(createJsonResponse(200, state));
      return;
    }

    if (req.method === "POST" && pathname === "/api/game/accuse") {
      const body = parseJsonBody(await readRequestBody(req));
      const session = requireSession(body.sessionId);
      const { suspectNpcId, weapon, room } = body;
      const { scenario, npcs } = session;

      const correct =
        suspectNpcId === scenario.murdererNpcId &&
        weapon === scenario.weapon &&
        room === scenario.room;

      log(
        `[game/accuse] session="${body.sessionId}" guess: ${suspectNpcId}+${weapon}+${room} → ${correct ? "CORRECT ✓" : "WRONG ✗"} (answer: ${scenario.murdererNpcId}+${scenario.weapon}+${scenario.room})`
      );

      if (!correct) {
        npcs.forEach((npc) => applyTrustDelta(npc, -15));
        addJournalEntry(body.sessionId, "Wrong accusation. The NPCs trust you less now.");
        log(`[game/accuse] All NPC trust reduced by 15`);
      }

      reply(
        createJsonResponse(200, {
          correct,
          reveal: {
            murderer: scenario.murdererNpcId,
            weapon: scenario.weapon,
            room: scenario.room,
            victim: scenario.victim,
            murderTime: scenario.murderTime,
          },
        })
      );
      return;
    }

    if (req.method === "POST" && pathname === "/api/game/evidence") {
      const body = parseJsonBody(await readRequestBody(req));
      const entry = addJournalEntry(body.sessionId, body.content);
      log(`[game/evidence] session="${body.sessionId}" entry #${entry.id}: "${body.content}"`);
      reply(createJsonResponse(200, { ok: true, entry }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/game/end") {
      const body = parseJsonBody(await readRequestBody(req));
      const session = requireSession(body.sessionId);
      log(`[game/end] session="${body.sessionId}" — stopping all active agents`);
      for (const npc of session.npcs) {
        if (npc.activeAgentId) {
          try {
            await despawnNpcAgent(npc);
          } catch (e) {
            console.warn(`[game/end] Failed to stop agent for ${npc.npcId}: ${e.message}`);
          }
        }
      }
      deleteSession(body.sessionId);
      log(`[game/end] session="${body.sessionId}" deleted`);
      reply(createJsonResponse(200, { ok: true, sessionId: body.sessionId }));
      return;
    }

    // ── NPC routes ───────────────────────────────────────────────────────────

    const interactNpcId = matchNpcRoute(pathname, "interact");
    if (req.method === "POST" && interactNpcId) {
      const body = parseJsonBody(await readRequestBody(req));
      const { sessionId, playerUid, round, phase } = body;
      const session = requireSession(sessionId);
      const npcState = getNpcState(sessionId, interactNpcId);
      const npcProfile = getNpcProfile(interactNpcId);
      const roundInfo = (round != null) ? { round: Number(round), phase: phase || "investigation" } : null;

      log(`[npc/interact] session="${sessionId}" npc=${interactNpcId} tier=${npcState.breakdown < 30 ? "calm" : npcState.breakdown < 60 ? "nervous" : npcState.breakdown < 90 ? "cracking" : "shutdown"} breakdown=${Math.round(npcState.breakdown)}% trust=${Math.round(npcState.trust)}% emotion=${npcState.emotion}`);

      // Stop this NPC's own agent if already running (re-approach).
      if (npcState.activeAgentId) {
        log(`[npc/interact] ${interactNpcId} already has agent ${npcState.activeAgentId} — stopping first`);
        await despawnNpcAgent(npcState);
      }

      const resolvedUid = Number(playerUid);
      if (!resolvedUid) {
        console.warn(
          `[npc/interact] playerUid missing or zero for NPC ${interactNpcId} — defaulting to 5000. ` +
          `Agent will only respond to UID 5000; ensure client joins with the same UID.`
        );
      }

      // Enforce one active NPC agent at a time for stable demos and lower quota usage.
      const activeOthers = session.npcs.filter(
        (n) => n.npcId !== interactNpcId && n.activeAgentId
      );
      if (activeOthers.length > 0) {
        log(`[npc/interact] Stopping ${activeOthers.length} other active NPC(s) before switching to ${interactNpcId}: ${activeOthers.map((n) => n.npcId).join(", ")}`);
        for (const otherNpc of activeOthers) {
          try {
            await despawnNpcAgent(otherNpc);
          } catch (e) {
            console.warn(
              `[npc/interact] Failed to stop ${otherNpc.npcId}: ${e.message}`
            );
          }
        }
      }

      const result = await spawnNpcAgent(
        npcProfile,
        npcState,
        session.scenario,
        resolvedUid || 5000,
        roundInfo
      );

      log(`[npc/interact] ${interactNpcId} ready — channel=${result.channel} agentId=${result.agent.agent_id}`);
      reply(
        createJsonResponse(200, {
          channelName: result.channel,
          appId: result.appId,
          rtcToken: result.rtc_token,
          agentId: result.agent.agent_id,
          npcState: getPublicNpcState(npcState),
        })
      );
      return;
    }

    const endNpcId = matchNpcRoute(pathname, "end");
    if (req.method === "POST" && endNpcId) {
      const body = parseJsonBody(await readRequestBody(req));
      const npcState = getNpcState(body.sessionId, endNpcId);
      const npcProfile = getNpcProfile(endNpcId);

      log(`[npc/end] session="${body.sessionId}" npc=${endNpcId} breakdown before=${Math.round(npcState.breakdown)}%`);
      await despawnNpcAgent(npcState);

      const { oldTier, newTier, tierChanged } = applyBreakdownDelta(
        npcState,
        BREAKDOWN_PER_CONVERSATION
      );

      log(
        `[npc/end] ${endNpcId} breakdown +${BREAKDOWN_PER_CONVERSATION} → ${Math.round(npcState.breakdown)}% tier=${oldTier}${tierChanged ? ` → ${newTier} (TIER CHANGE)` : " (unchanged)"}`
      );

      const entry = addJournalEntry(
        body.sessionId,
        `You spoke with ${npcProfile.name} (${npcProfile.role}). ` +
          `They appeared ${npcState.emotion}. ` +
          `Breakdown: ${Math.round(npcState.breakdown)}%.` +
          (tierChanged ? ` Their composure shifted from ${oldTier} to ${newTier}.` : "")
      );

      reply(
        createJsonResponse(200, {
          breakdown: Math.round(npcState.breakdown),
          trust: Math.round(npcState.trust),
          tier: newTier,
          tierChanged,
          oldTier,
          journalEntry: entry,
        })
      );
      return;
    }

    const emotionNpcId = matchNpcRoute(pathname, "emotion");
    if (req.method === "POST" && emotionNpcId) {
      const body = parseJsonBody(await readRequestBody(req));
      const npcState = getNpcState(body.sessionId, emotionNpcId);
      const validEmotions = ["calm", "scared", "angry", "nervous", "guilty"];
      if (body.emotion && validEmotions.includes(body.emotion)) {
        const prev = npcState.emotion;
        npcState.emotion = body.emotion;
        log(`[npc/emotion] ${emotionNpcId}: ${prev} → ${npcState.emotion}`);
      } else if (body.emotion) {
        console.warn(`[npc/emotion] Invalid emotion "${body.emotion}" — ignored. Valid: ${validEmotions.join(", ")}`);
      }
      reply(createJsonResponse(200, { ok: true, emotion: npcState.emotion }));
      return;
    }

    // ── 404 ──────────────────────────────────────────────────────────────────

    log(`[404] Unmatched route: ${req.method} ${pathname}`);
    reply(
      createJsonResponse(404, {
        error: "Not found",
        routes: [
          "GET  /health",
          "GET  /agora-voice",
          "GET  /static/agora-rtc.js",
          "POST /api/agora/session/start",
          "POST /api/agora/session/stop",
          "POST /api/game/start",
          "GET  /api/game/state?sessionId=",
          "POST /api/game/accuse",
          "POST /api/game/evidence",
          "POST /api/game/end",
          "POST /api/npc/:id/interact",
          "POST /api/npc/:id/end",
          "POST /api/npc/:id/emotion",
        ],
      })
    );
  } catch (error) {
    const msg = error.message || "Unknown error";
    const status =
      msg.startsWith("No active game session") ||
      msg.startsWith("Unknown NPC") ||
      msg.startsWith("No profile for NPC") ||
      msg.startsWith("No agent UID")
        ? 404
        : msg.startsWith("Agora API")
        ? 502
        : 400;
    console.error(`[${ts()}] ERROR ${req.method} ${pathname} → ${status}: ${msg}`);
    if (error.stack) console.error(error.stack);
    reply(createJsonResponse(status, { error: msg }));
  }
});

server.listen(port, () => {
  console.log(`Agora session server listening on http://localhost:${port}`);
  console.log(`In-Godot voice page: http://localhost:${port}/agora-voice`);
  console.log("Game routes active:");
  console.log("  POST /api/game/start");
  console.log("  GET  /api/game/state?sessionId=...");
  console.log("  POST /api/game/accuse");
  console.log("  POST /api/game/end");
  console.log("  POST /api/npc/:id/interact");
  console.log("  POST /api/npc/:id/end");
  console.log("  POST /api/npc/:id/emotion");
});
