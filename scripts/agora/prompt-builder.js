const { getTier } = require("./game-state");

const EMOTION_LINES = {
  calm: "You are composed and in full control of your emotions.",
  scared:
    "You are visibly frightened. Something terrible has happened in this house and you feel unsafe.",
  angry:
    "You are furious at being questioned like a common suspect. You feel wrongly targeted.",
  nervous:
    "You are anxious and second-guessing every word you say. You keep fidgeting.",
  guilty:
    "You are deeply unsettled and struggling to hold yourself together. You cannot meet the detective's eyes.",
};

const TIER_BEHAVIOR_LINES = {
  calm: "You are polite and composed. You deflect sensitive questions smoothly and volunteer absolutely nothing. You are the picture of calm innocence.",
  nervous:
    "You are visibly uncomfortable. You occasionally let slip emotional reactions — a flash of anger, a trembling hand — then immediately try to walk them back. You say things like \"I — I didn't mean that, forget I said it.\" You are not yet contradicting yourself.",
  cracking:
    "Your composure is gone. Your story is starting to fall apart and you contradict details you gave earlier. You react badly under direct pressure — you become snappy, defensive, or emotional. You are clearly hiding something.",
  shutdown:
    'You have completely shut down. You say exactly this, once: "I\'m sorry. I have nothing more to say to you." After that you fall completely silent. You do not respond to anything the detective says, no matter how they press you.',
};

function buildSystemPrompt(npcProfile, npcState, scenario, roundInfo = null) {
  const tier = getTier(npcState.breakdown);

  const identity = [
    `You are ${npcProfile.name}, the ${npcProfile.role} at Blackwell Manor.`,
    `Personality: ${npcProfile.personality}.`,
    `A detective is questioning you about the death of ${scenario.victim}.`,
    `Keep every response short — 2 to 3 sentences maximum. You are speaking out loud in real time. Do not use lists or stage directions.`,
  ].join(" ");

  const emotion = EMOTION_LINES[npcState.emotion] || EMOTION_LINES.calm;

  const alibi = `Your alibi for the night of the murder: ${npcProfile.baseAlibi}`;

  const behavior = TIER_BEHAVIOR_LINES[tier];

  let knowledge;
  if (tier === "calm" || tier === "nervous") {
    knowledge = `You know ${scenario.victim} was found dead. You have no idea who is responsible and you are shaken by it.`;
  } else if (npcState.isMurderer) {
    knowledge = [
      `You know ${scenario.victim} is dead.`,
      `There is a gap in your alibi: between 11:45pm and 12:10am you cannot account for your whereabouts.`,
      `If the detective presses you on this gap, you say: "I was walking. Alone." and you become visibly agitated.`,
      `You do not confess. You deflect, but cracks show.`,
    ].join(" ");
  } else {
    knowledge = [
      `You know ${scenario.victim} is dead. You did not do it.`,
      `However, you are hiding something completely unrelated that is making you look guilty: ${npcProfile.personalSecret}.`,
      `This secret — not the murder — is the source of your nervousness. You will not reveal it unless you absolutely have to.`,
    ].join(" ");
  }

  const parts = [identity, emotion, alibi, behavior, knowledge];
  if (roundInfo && roundInfo.round) {
    const phaseDesc = roundInfo.phase === "blackout" ? "a blackout is active — something terrible may have happened" : "detectives are investigating";
    parts.push(`It is currently round ${roundInfo.round} of the investigation. ${phaseDesc}.`);
  }
  return parts.join("\n\n");
}

module.exports = { buildSystemPrompt };
