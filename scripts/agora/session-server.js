const http = require("http");
const {
  createJsonResponse,
  parseJsonBody,
  startSession,
  stopSession,
} = require("./agora-service");
const { loadEnvFile } = require("./load-env");

loadEnvFile();

const port = Number(process.env.AGORA_SESSION_SERVER_PORT || 8787);

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

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      send(
        res,
        createJsonResponse(200, { ok: true, service: "agora-session-server" })
      );
      return;
    }

    if (req.method === "POST" && req.url === "/api/agora/session/start") {
      const result = await startSession(await readRequestBody(req));
      send(res, createJsonResponse(200, result));
      return;
    }

    if (req.method === "POST" && req.url === "/api/agora/session/stop") {
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

    send(
      res,
      createJsonResponse(404, {
        error: "Not found",
        routes: [
          "GET /health",
          "POST /api/agora/session/start",
          "POST /api/agora/session/stop",
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
});
