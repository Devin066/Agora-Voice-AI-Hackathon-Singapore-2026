const fs = require("fs");
const path = require("path");
const { stopSession } = require("./agora-service");

function parseInput() {
  const firstArg = process.argv[2];
  if (!firstArg) {
    throw new Error(
      "Usage: node scripts/agora/stop-agent.js <agentId> [channel] [agentUid] or provide a JSON file path."
    );
  }

  if (firstArg.endsWith(".json")) {
    const resolvedPath = path.resolve(process.cwd(), firstArg);
    return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  }

  return {
    agentId: firstArg,
    channel: process.argv[3],
    agentUid: process.argv[4],
  };
}

async function main() {
  const result = await stopSession(parseInput());
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
