const fs = require("fs");
const path = require("path");
const { startSession } = require("./agora-service");

function parseInput() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    return {};
  }

  const resolvedPath = path.resolve(process.cwd(), inputPath);
  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

async function main() {
  const result = await startSession(parseInput());
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
