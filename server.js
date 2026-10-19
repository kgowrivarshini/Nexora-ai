const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { OAuth2Client } = require("google-auth-library");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_SIZE = 1024 * 1024;
const SESSION_COOKIE_NAME = "nexora_session";
const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const GOOGLE_CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";

function firebaseAuthConfigured() {
  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID || !APP_BASE_URL || !GOOGLE_CREDENTIALS_PATH) return false;
  try {
    const appUrl = new URL(APP_BASE_URL);
    const localDevelopment = ["localhost", "127.0.0.1"].includes(appUrl.hostname);
    return (appUrl.protocol === "https:" || localDevelopment) && fs.existsSync(GOOGLE_CREDENTIALS_PATH);
  } catch {
    return false;
  }
}

function getFirebaseAdminAuth() {
  if (!firebaseAuthConfigured()) {
    throw new Error("Firebase server configuration is incomplete.");
  }
  const appName = "nexora-ai-auth";
  const app = getApps().find((entry) => entry.name === appName) ||
    initializeApp({
      credential: applicationDefault(),
      projectId: FIREBASE_PROJECT_ID,
    }, appName);
  return getAuth(app);
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers,
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

function isSameOriginRequest(request) {
  if (!request.headers.origin || !request.headers.host || !APP_BASE_URL) return false;
  try {
    const appUrl = new URL(APP_BASE_URL);
    const requestOrigin = new URL(request.headers.origin);
    return requestOrigin.origin === appUrl.origin && request.headers.host === appUrl.host;
  } catch {
    return false;
  }
}

function cookieHeader(value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function getCookie(request, name) {
  const cookieHeaderValue = request.headers.cookie || "";
  const cookie = cookieHeaderValue.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : "";
}

async function firebaseIdentityRequest(endpoint, payload) {
  let response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      }
    );
  } catch (error) {
    const requestError = new Error("Unable to reach Firebase Authentication.");
    requestError.name = error.name === "TimeoutError" ? "TimeoutError" : "FirebaseNetworkError";
    throw requestError;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Firebase Authentication returned an invalid response.");
  }
  if (!response.ok) {
    const providerError = new Error("Firebase Authentication rejected the request.");
    providerError.providerCode = result.error?.message || "UNKNOWN";
    throw providerError;
  }
  return result;
}

async function verifyGoogleCredential(credential) {
  try {
    const client = new OAuth2Client(GOOGLE_OAUTH_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_OAUTH_CLIENT_ID,
    });
    const account = ticket.getPayload();
    if (account?.email_verified !== true || typeof account.email !== "string") return null;
    return account.email.trim().toLowerCase();
  } catch (error) {
    const verificationError = new Error("Google could not verify this sign-in token.");
    verificationError.name = error.name === "GaxiosError" && !error.response
      ? "GoogleVerificationUnavailable"
      : "InvalidGoogleCredential";
    throw verificationError;
  }
}

function firebaseErrorResponse(error, operation) {
  if (error.name === "TimeoutError") {
    return { status: 502, body: { error: "Firebase Authentication timed out. Please try again.", code: "AUTH_PROVIDER_TIMEOUT" } };
  }
  if (error.name === "FirebaseNetworkError") {
    return { status: 502, body: { error: "Could not reach Firebase Authentication. Check the server connection.", code: "AUTH_PROVIDER_UNAVAILABLE" } };
  }
  if (error.name === "GoogleVerificationUnavailable") {
    return { status: 502, body: { error: "Could not reach Google's token verification service. Please try again.", code: "GOOGLE_VERIFICATION_UNAVAILABLE" } };
  }
  if (error.name === "InvalidGoogleCredential") {
    return { status: 401, body: { error: "Google sign-in could not be verified. Please try again.", code: "INVALID_GOOGLE_CREDENTIAL" } };
  }

  const messages = {
    EMAIL_EXISTS: { status: 409, error: "An account already exists for this college email.", code: "EMAIL_EXISTS" },
    INVALID_EMAIL: { status: 400, error: "Enter a valid college email address.", code: "INVALID_EMAIL" },
    WEAK_PASSWORD: { status: 400, error: "Choose a password with at least 6 characters.", code: "WEAK_PASSWORD" },
    OPERATION_NOT_ALLOWED: { status: 503, error: "Enable the required sign-in provider in Firebase Authentication.", code: "AUTH_PROVIDER_DISABLED" },
    TOO_MANY_ATTEMPTS_TRY_LATER: { status: 429, error: "Too many attempts. Wait a while and try again.", code: "AUTH_RATE_LIMITED" },
    EMAIL_NOT_FOUND: { status: 401, error: "Email or password is incorrect.", code: "INVALID_CREDENTIALS" },
    INVALID_PASSWORD: { status: 401, error: "Email or password is incorrect.", code: "INVALID_CREDENTIALS" },
    INVALID_LOGIN_CREDENTIALS: { status: 401, error: "Email or password is incorrect.", code: "INVALID_CREDENTIALS" },
    USER_DISABLED: { status: 403, error: "This account is disabled. Contact the college administrator.", code: "USER_DISABLED" },
    EXPIRED_OOB_CODE: { status: 400, error: "This email action link has expired. Sign in to request another one.", code: "EMAIL_ACTION_EXPIRED" },
    INVALID_OOB_CODE: { status: 400, error: "This email action link is invalid or has already been used.", code: "EMAIL_ACTION_INVALID" },
    INVALID_IDP_RESPONSE: { status: 401, error: "Google could not verify this sign-in. Please try again.", code: "GOOGLE_SIGN_IN_FAILED" },
  };
  const mapped = messages[error.providerCode];
  if (mapped) return { status: mapped.status, body: { error: mapped.error, code: mapped.code } };

  console.error(`Firebase ${operation} failed:`, error.providerCode || error.message);
  return { status: 502, body: { error: "Firebase Authentication could not complete this request. Check the server configuration and try again.", code: "AUTH_PROVIDER_ERROR" } };
}

async function readAuthPayload(request, response) {
  try {
    const payload = await readJson(request);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      sendJson(response, 400, { error: "Request body must be a JSON object.", code: "INVALID_REQUEST" });
      return null;
    }
    return payload;
  } catch (error) {
    sendJson(response, 400, { error: error.message, code: "INVALID_REQUEST" });
    return null;
  }
}

function rejectCrossOriginRequest(request, response) {
  if (isSameOriginRequest(request)) return false;
  sendJson(response, 403, { error: "Cross-origin authentication requests are not allowed.", code: "CSRF_REJECTED" });
  return true;
}

async function verifySessionCookie(request) {
  const sessionCookie = getCookie(request, SESSION_COOKIE_NAME);
  if (!sessionCookie) return null;
  try {
    const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie, true);
    return decoded.email_verified ? decoded : null;
  } catch (error) {
    const invalidSessionCodes = [
      "auth/argument-error",
      "auth/invalid-session-cookie",
      "auth/session-cookie-expired",
      "auth/session-cookie-revoked",
      "auth/user-disabled",
      "auth/user-not-found",
    ];
    if (invalidSessionCodes.includes(error.code)) return null;
    throw error;
  }
}

async function createSessionCookie(idToken) {
  const auth = getFirebaseAdminAuth();
  const decoded = await auth.verifyIdToken(idToken, true);
  if (!decoded.email_verified) {
    const error = new Error("Verify your college email before signing in.");
    error.code = "auth/email-not-verified";
    throw error;
  }
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
    const error = new Error("Sign in again before creating a session.");
    error.code = "auth/recent-sign-in-required";
    throw error;
  }
  return auth.createSessionCookie(idToken, { expiresIn: SESSION_DURATION_MS });
}

async function handleAuthApi(request, response, pathname) {
  if (pathname === "/api/auth/session" && request.method === "GET") {
    if (!firebaseAuthConfigured()) {
      sendJson(response, 503, { error: "Firebase Authentication is not configured.", code: "AUTH_NOT_CONFIGURED" });
      return;
    }
    const session = await verifySessionCookie(request);
    sendJson(response, 200, session
      ? { authenticated: true, email: session.email }
      : { authenticated: false });
    return;
  }

  const allowedMethods = {
    "/api/auth/signup": "POST",
    "/api/auth/login": "POST",
    "/api/auth/google": "POST",
    "/api/auth/password-reset": "POST",
    "/api/auth/logout": "POST",
    "/api/auth/bvc": "POST",
  };
  if (Object.prototype.hasOwnProperty.call(allowedMethods, pathname) &&
      request.method !== allowedMethods[pathname]) {
    sendJson(response, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(allowedMethods, pathname)) {
    sendJson(response, 404, { error: "Authentication endpoint not found.", code: "AUTH_ENDPOINT_NOT_FOUND" });
    return;
  }
  if (!firebaseAuthConfigured()) {
    sendJson(response, 503, {
      error: "Firebase Authentication is not configured. No account or email action was performed.",
      code: "AUTH_NOT_CONFIGURED",
    });
    return;
  }
  if (rejectCrossOriginRequest(request, response)) return;

  if (pathname === "/api/auth/logout") {
    const session = await verifySessionCookie(request);
    if (session) await getFirebaseAdminAuth().revokeRefreshTokens(session.uid);
    sendJson(response, 200, { authenticated: false }, {
      "Set-Cookie": cookieHeader("", 0),
    });
    return;
  }

  if (pathname === "/api/auth/bvc") {
    const session = await verifySessionCookie(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in with a verified college email first.", code: "UNAUTHENTICATED" });
      return;
    }
    sendJson(response, 503, {
      error: "BVC student verification is unavailable because no college-approved BVC integration is configured. No student lookup was made.",
      code: "BVC_NOT_CONFIGURED",
    });
    return;
  }

  if (pathname === "/api/auth/google") {
    if (!GOOGLE_OAUTH_CLIENT_ID) {
      sendJson(response, 503, { error: "Google OAuth is not configured for this Firebase project.", code: "GOOGLE_NOT_CONFIGURED" });
      return;
    }
    const payload = await readAuthPayload(request, response);
    if (!payload) return;
    const credential = typeof payload.credential === "string" ? payload.credential : "";
    if (!credential || credential.length > 8192) {
      sendJson(response, 400, { error: "A valid Google sign-in token is required.", code: "INVALID_GOOGLE_TOKEN" });
      return;
    }
    try {
      const googleEmail = await verifyGoogleCredential(credential);
      if (!googleEmail || !/^[^\s@]+@bvcgroup\.in$/i.test(googleEmail)) {
        sendJson(response, 403, { error: "Use a verified Google account with your @bvcgroup.in college email.", code: "GOOGLE_ACCOUNT_NOT_ALLOWED" });
        return;
      }
      const account = await firebaseIdentityRequest("accounts:signInWithIdp", {
        postBody: `id_token=${encodeURIComponent(credential)}&providerId=google.com`,
        requestUri: APP_BASE_URL,
        returnIdpCredential: true,
        returnSecureToken: true,
      });
      const lookup = await firebaseIdentityRequest("accounts:lookup", { idToken: account.idToken });
      const firebaseUser = lookup.users?.[0];
      if (!firebaseUser?.emailVerified || firebaseUser.email?.toLowerCase() !== googleEmail) {
        sendJson(response, 403, { error: "Google did not verify the college email for this Firebase account.", code: "GOOGLE_EMAIL_NOT_VERIFIED" });
        return;
      }
      const sessionCookie = await createSessionCookie(account.idToken);
      sendJson(response, 200, {
        authenticated: true,
        email: googleEmail,
        bvcVerificationRequired: true,
      }, {
        "Set-Cookie": cookieHeader(sessionCookie, SESSION_DURATION_MS / 1000),
      });
    } catch (error) {
      const result = firebaseErrorResponse(error, "Google sign-in");
      sendJson(response, result.status, result.body);
    }
    return;
  }

  const payload = await readAuthPayload(request, response);
  if (!payload) return;
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@bvcgroup\.in$/i.test(email)) {
    sendJson(response, 400, { error: "Use a college email address ending in @bvcgroup.in.", code: "INVALID_COLLEGE_EMAIL" });
    return;
  }

  if (pathname === "/api/auth/password-reset") {
    try {
      await firebaseIdentityRequest("accounts:sendOobCode", {
        requestType: "PASSWORD_RESET",
        email,
        continueUrl: APP_BASE_URL,
      });
      sendJson(response, 200, { message: "If an account exists for that address, a password reset email has been sent." });
    } catch (error) {
      const result = firebaseErrorResponse(error, "password reset");
      if (result.body.code === "EMAIL_NOT_FOUND") {
        sendJson(response, 200, { message: "If an account exists for that address, a password reset email has been sent." });
        return;
      }
      sendJson(response, result.status, result.body);
    }
    return;
  }

  if (pathname === "/api/auth/signup") {
    const password = typeof payload.password === "string" ? payload.password : "";
    if (password.length < 6 || password.length > 128) {
      sendJson(response, 400, { error: "Choose a password between 6 and 128 characters.", code: "INVALID_PASSWORD" });
      return;
    }
    try {
      const account = await firebaseIdentityRequest("accounts:signUp", {
        email,
        password,
        returnSecureToken: true,
      });
      try {
        await firebaseIdentityRequest("accounts:sendOobCode", {
          requestType: "VERIFY_EMAIL",
          idToken: account.idToken,
          continueUrl: APP_BASE_URL,
        });
      } catch (error) {
        const result = firebaseErrorResponse(error, "verification email");
        sendJson(response, 502, {
          error: `Your account was created, but Firebase could not send its verification email. ${result.body.error} Sign in later to retry verification.`,
          code: "VERIFY_EMAIL_SEND_FAILED",
        });
        return;
      }
      sendJson(response, 201, { email: account.email, verificationEmailSent: true });
    } catch (error) {
      const result = firebaseErrorResponse(error, "sign-up");
      sendJson(response, result.status, result.body);
    }
    return;
  }

  if (pathname === "/api/auth/login") {
    const password = typeof payload.password === "string" ? payload.password : "";
    if (!password || password.length > 128) {
      sendJson(response, 400, { error: "Enter your password.", code: "INVALID_PASSWORD" });
      return;
    }
    try {
      const account = await firebaseIdentityRequest("accounts:signInWithPassword", {
        email,
        password,
        returnSecureToken: true,
      });
      const lookup = await firebaseIdentityRequest("accounts:lookup", { idToken: account.idToken });
      if (!lookup.users?.[0]?.emailVerified) {
        await firebaseIdentityRequest("accounts:sendOobCode", {
          requestType: "VERIFY_EMAIL",
          idToken: account.idToken,
          continueUrl: APP_BASE_URL,
        });
        sendJson(response, 403, {
          error: "Verify your email before continuing. A verification link has been sent.",
          code: "EMAIL_NOT_VERIFIED",
          email: account.email,
        });
        return;
      }

      const sessionCookie = await createSessionCookie(account.idToken);
      sendJson(response, 200, {
        authenticated: true,
        email: account.email,
        bvcVerificationRequired: true,
      }, {
        "Set-Cookie": cookieHeader(sessionCookie, SESSION_DURATION_MS / 1000),
      });
    } catch (error) {
      if (error.code === "auth/email-not-verified") {
        sendJson(response, 403, { error: error.message, code: "EMAIL_NOT_VERIFIED", email });
        return;
      }
      if (error.code === "auth/recent-sign-in-required") {
        sendJson(response, 401, { error: error.message, code: "RECENT_SIGN_IN_REQUIRED" });
        return;
      }
      const result = firebaseErrorResponse(error, "sign-in");
      sendJson(response, result.status, result.body);
    }
  }
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/status" && request.method === "GET") {
    const authenticationConfigured = firebaseAuthConfigured();
    sendJson(response, 200, {
      aiAvailable: Boolean(process.env.OPENAI_API_KEY),
      authenticationConfigured,
      emailVerificationConfigured: authenticationConfigured,
      googleAuthConfigured: authenticationConfigured && Boolean(GOOGLE_OAUTH_CLIENT_ID),
      googleClientId: authenticationConfigured && GOOGLE_OAUTH_CLIENT_ID ? GOOGLE_OAUTH_CLIENT_ID : null,
      bvcVerificationConfigured: false,
      knowledgeBaseConnected: false,
      resultsConnected: false,
      downloadsConnected: false,
    });
    return;
  }

  if (pathname.startsWith("/api/auth/")) {
    await handleAuthApi(request, response, pathname);
    return;
  }

  if (["/api/chat", "/api/results", "/api/downloads"].includes(pathname)) {
    if (!firebaseAuthConfigured()) {
      sendJson(response, 503, {
        error: "Dashboard services are unavailable because server-side authentication is not configured.",
        code: "AUTH_NOT_CONFIGURED",
      });
      return;
    }
    if (request.method === "POST" && rejectCrossOriginRequest(request, response)) return;
    const session = await verifySessionCookie(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in with a verified college email first.", code: "UNAUTHENTICATED" });
      return;
    }
    sendJson(response, 503, {
      error: "Dashboard services require an approved BVC student verification service, which is not configured.",
      code: "BVC_NOT_CONFIGURED",
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
