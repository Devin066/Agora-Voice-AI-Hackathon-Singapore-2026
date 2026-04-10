const http = require("http");
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
} = require("./game-state");
const { spawnNpcAgent, despawnNpcAgent } = require("./npc-manager");

loadEnvFile();

const port = Number(process.env.AGORA_SESSION_SERVER_PORT || 8080);

const BREAKDOWN_PER_CONVERSATION = 15;

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

  try {
    // ── Existing routes (unchanged) ──────────────────────────────────────────

    if (req.method === "GET" && pathname === "/health") {
      send(
        res,
        createJsonResponse(200, { ok: true, service: "agora-session-server" })
      );
      return;
    }

    if (req.method === "POST" && pathname === "/api/agora/session/start") {
      const result = await startSession(await readRequestBody(req));
      send(res, createJsonResponse(200, result));
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
      send(res, createJsonResponse(200, result));
      return;
    }

    // ── Game routes ──────────────────────────────────────────────────────────

    if (req.method === "POST" && pathname === "/api/game/start") {
      const body = parseJsonBody(await readRequestBody(req));
      if (!body.sessionId) {
        send(res, createJsonResponse(400, { error: "sessionId is required" }));
        return;
      }

      const state = createSession(body.sessionId);
      send(
        res,
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
        send(res, createJsonResponse(400, { error: "sessionId is required" }));
        return;
      }
      const state = getFullState(sessionId);
      send(res, createJsonResponse(200, state));
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

      if (!correct) {
        npcs.forEach((npc) => {
          applyTrustDelta(npc, -15);
        });
        addJournalEntry(
          body.sessionId,
          "Wrong accusation. The NPCs trust you less now."
        );
      }

      send(
        res,
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
      send(res, createJsonResponse(200, { ok: true, entry }));
      return;
    }

    // ── NPC routes ───────────────────────────────────────────────────────────

    const interactNpcId = matchNpcRoute(pathname, "interact");
    if (req.method === "POST" && interactNpcId) {
      const body = parseJsonBody(await readRequestBody(req));
      const { sessionId, playerUid } = body;
      const session = requireSession(sessionId);
      const npcState = getNpcState(sessionId, interactNpcId);
      const npcProfile = getNpcProfile(interactNpcId);

      if (npcState.activeAgentId) {
        await despawnNpcAgent(npcState);
      }

      const result = await spawnNpcAgent(
        npcProfile,
        npcState,
        session.scenario,
        Number(playerUid) || 5000
      );

      send(
        res,
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

      await despawnNpcAgent(npcState);

      const { oldTier, newTier, tierChanged } = applyBreakdownDelta(
        npcState,
        BREAKDOWN_PER_CONVERSATION
      );

      const entry = addJournalEntry(
        body.sessionId,
        `You spoke with ${npcProfile.name} (${npcProfile.role}). ` +
          `They appeared ${npcState.emotion}. ` +
          `Breakdown: ${Math.round(npcState.breakdown)}%.` +
          (tierChanged ? ` Their composure shifted from ${oldTier} to ${newTier}.` : "")
      );

      send(
        res,
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
        npcState.emotion = body.emotion;
      }
      send(res, createJsonResponse(200, { ok: true, emotion: npcState.emotion }));
      return;
    }

    // ── 404 ──────────────────────────────────────────────────────────────────

    send(
      res,
      createJsonResponse(404, {
        error: "Not found",
        routes: [
          "GET  /health",
          "POST /api/agora/session/start",
          "POST /api/agora/session/stop",
          "POST /api/game/start",
          "GET  /api/game/state?sessionId=",
          "POST /api/game/accuse",
          "POST /api/game/evidence",
          "POST /api/npc/:id/interact",
          "POST /api/npc/:id/end",
          "POST /api/npc/:id/emotion",
        ],
      })
    );
  } catch (error) {
    send(
      res,
      createJsonResponse(400, {
        error: error.message,
      })
    );
  }
});

server.listen(port, () => {
  console.log(`Agora session server listening on http://localhost:${port}`);
  console.log("Game routes active:");
  console.log("  POST /api/game/start");
  console.log("  GET  /api/game/state?sessionId=...");
  console.log("  POST /api/game/accuse");
  console.log("  POST /api/npc/:id/interact");
  console.log("  POST /api/npc/:id/end");
  console.log("  POST /api/npc/:id/emotion");
});
