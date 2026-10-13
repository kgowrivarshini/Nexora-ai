const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_SIZE = 1024 * 1024;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
        tooLarge = true;
        body = "";
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new Error("Request is too large."));
        return;
      }
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendStaticFile(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const requestedFile = path.resolve(PUBLIC_DIR, relativePath);
  const pathFromPublic = path.relative(PUBLIC_DIR, requestedFile);
  if (pathFromPublic.startsWith("..") || path.isAbsolute(pathFromPublic)) {
    sendJson(response, 403, { error: "Access denied." });
    return;
  }

  const filePath = requestedFile;
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(response, 404, { error: "Page not found." });
        return;
      }
      console.error("Unable to read a public asset:", error.message);
      sendJson(response, 500, { error: "Unable to load this page." });
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
    } else {
      response.end(content);
    }
  });
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/status" && request.method === "GET") {
    sendJson(response, 200, {
      aiAvailable: Boolean(process.env.OPENAI_API_KEY),
      knowledgeBaseConnected: false,
      resultsConnected: false,
      downloadsConnected: false,
    });
    return;
  }

  if (pathname === "/api/chat" && request.method === "POST") {
    let payload;
    try {
      payload = await readJson(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      sendJson(response, 400, { error: "Add a message before starting a chat." });
      return;
    }

    const messages = payload.messages.slice(-20);
    const validMessages = messages.every((message) =>
      message &&
      ["user", "assistant"].includes(message.role) &&
      typeof message.content === "string" &&
      message.content.trim().length > 0 &&
      message.content.length <= 8000
    );
    if (!validMessages || messages[messages.length - 1].role !== "user") {
      sendJson(response, 400, { error: "Chat messages are invalid or exceed the supported length." });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      sendJson(response, 503, {
        error: "AI chat is not configured yet. Add OPENAI_API_KEY to the server environment and restart Nexora AI.",
        code: "AI_NOT_CONFIGURED",
      });
      return;
    }

    try {
      const aiResponse = await fetch(
        process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are Nexora AI, a helpful college information assistant. Be clear when official college information is not present in the conversation. Do not invent regulations, results, placement statistics, faculty details, or college schedules. The connected college knowledge base is not configured, so ask the student to verify college-specific facts with an official source.",
              },
              ...messages,
            ],
          }),
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!aiResponse.ok) {
        console.error("AI provider returned HTTP", aiResponse.status);
        sendJson(response, 502, {
          error: "The AI provider could not complete this request. Check the server provider configuration and try again.",
          code: "AI_PROVIDER_ERROR",
        });
        return;
      }

      const result = await aiResponse.json();
      const answer = result.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) {
        sendJson(response, 502, { error: "The AI provider returned an empty response. Please try again." });
        return;
      }
      sendJson(response, 200, { answer: answer.trim() });
    } catch (error) {
      console.error("AI request failed:", error.name === "TimeoutError" ? "request timed out" : error.message);
      sendJson(response, 502, {
        error: error.name === "TimeoutError"
          ? "The AI request timed out. Please try again."
          : "Could not reach the AI provider. Check the server connection and try again.",
        code: "AI_REQUEST_FAILED",
      });
    }
    return;
  }

  if (pathname === "/api/results" && request.method === "GET") {
    sendJson(response, 503, {
      error: "Student results are unavailable because the secure college results service is not connected.",
      code: "RESULTS_NOT_CONFIGURED",
    });
    return;
  }

  if (pathname === "/api/downloads" && request.method === "GET") {
    sendJson(response, 200, {
      configured: false,
      items: [],
      message: "Study materials will appear here when an authorized college document library is connected.",
    });
    return;
  }

  sendJson(response, 404, { error: "API endpoint not found." });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url.pathname).catch((error) => {
      console.error("API request failed:", error.message);
      if (!response.headersSent) {
        sendJson(response, 500, { error: "The request could not be completed." });
      }
    });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  sendStaticFile(request, response, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Nexora AI is running at http://${HOST}:${PORT}`);
});
