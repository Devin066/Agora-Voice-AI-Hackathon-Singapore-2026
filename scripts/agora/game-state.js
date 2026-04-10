const npcProfiles = require("./data/npc-profiles.json");
const scenarios = require("./data/scenarios.json");

const sessions = new Map();

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
      log(`[game-state] Expired session "${id}" (TTL exceeded)`);
    }
  }
}, 10 * 60 * 1000).unref();

function getTier(breakdown) {
  if (breakdown < 30) return "calm";
  if (breakdown < 60) return "nervous";
  if (breakdown < 90) return "cracking";
  return "shutdown";
}

function createSession(sessionId) {
  if (sessions.has(sessionId)) {
    log(`[game-state] Reusing existing session "${sessionId}"`);
    return sessions.get(sessionId);
  }

  const scenario = scenarios[0];

  const npcs = npcProfiles.map((profile) => ({
    npcId: profile.npcId,
    name: profile.name,
    role: profile.role,
    personality: profile.personality,
    isMurderer: profile.npcId === scenario.murdererNpcId,
    breakdown: 0,
    trust: 50,
    emotion: "calm",
    activeAgentId: null,
    channelName: `cluedo_${sessionId}_${profile.npcId}`,
    currentLocation: profile.gravityToward,
  }));

  const state = {
    sessionId,
    scenario,
    npcs,
    journal: [],
    createdAt: Date.now(),
  };

  sessions.set(sessionId, state);
  log(
    `[game-state] Created session "${sessionId}" — scenario: "${scenario.victim}" murdered with ${scenario.weapon} in ${scenario.room} by ${scenario.murdererNpcId}`
  );
  return state;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function requireSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`No active game session: ${sessionId}`);
  return s;
}

function getNpcState(sessionId, npcId) {
  const session = requireSession(sessionId);
  const npc = session.npcs.find((n) => n.npcId === npcId);
  if (!npc) throw new Error(`Unknown NPC: ${npcId}`);
  return npc;
}

function getNpcProfile(npcId) {
  const profile = npcProfiles.find((p) => p.npcId === npcId);
  if (!profile) throw new Error(`No profile for NPC: ${npcId}`);
  return profile;
}

function applyBreakdownDelta(npcState, rawDelta) {
  const effectiveDelta = rawDelta * (1 - npcState.trust / 200);
  const oldTier = getTier(npcState.breakdown);
  const before = npcState.breakdown;
  npcState.breakdown = Math.max(0, Math.min(100, npcState.breakdown + effectiveDelta));
  const newTier = getTier(npcState.breakdown);
  const tierChanged = oldTier !== newTier;
  log(
    `[game-state] ${npcState.npcId} breakdown: ${Math.round(before)}% +${Math.round(effectiveDelta)} (raw ${rawDelta}, trust ${Math.round(npcState.trust)}%) → ${Math.round(npcState.breakdown)}%${tierChanged ? ` | TIER ${oldTier} → ${newTier}` : ""}`
  );
  return { oldTier, newTier, tierChanged };
}

function applyTrustDelta(npcState, delta) {
  const before = npcState.trust;
  npcState.trust = Math.max(0, Math.min(100, npcState.trust + delta));
  log(
    `[game-state] ${npcState.npcId} trust: ${Math.round(before)}% ${delta >= 0 ? "+" : ""}${delta} → ${Math.round(npcState.trust)}%`
  );
}

function addJournalEntry(sessionId, content) {
  const session = requireSession(sessionId);
  const entry = {
    id: session.journal.length + 1,
    content,
    timestamp: Date.now(),
  };
  session.journal.push(entry);
  log(`[game-state] Journal #${entry.id} → "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"`);
  return entry;
}

function getPublicNpcState(npcState) {
  return {
    npcId: npcState.npcId,
    name: npcState.name,
    role: npcState.role,
    breakdown: Math.round(npcState.breakdown),
    trust: Math.round(npcState.trust),
    emotion: npcState.emotion,
    tier: getTier(npcState.breakdown),
    isActive: npcState.activeAgentId !== null,
    currentLocation: npcState.currentLocation,
  };
}

function getFullState(sessionId) {
  const session = requireSession(sessionId);
  return {
    sessionId: session.sessionId,
    scenario: {
      victim: session.scenario.victim,
    },
    npcs: session.npcs.map(getPublicNpcState),
    journal: session.journal,
  };
}

function deleteSession(sessionId) {
  const existed = sessions.delete(sessionId);
  if (existed) log(`[game-state] Deleted session "${sessionId}"`);
  return existed;
}

module.exports = {
  getTier,
  createSession,
  getSession,
  requireSession,
  getNpcState,
  getNpcProfile,
  applyBreakdownDelta,
  applyTrustDelta,
  addJournalEntry,
  getPublicNpcState,
  getFullState,
  deleteSession,
  npcProfiles,
  scenarios,
};
