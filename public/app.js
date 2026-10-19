const STORAGE_KEY = "nexora-conversations-v1";
const THEME_STORAGE_KEY = "nexora-theme-v1";
const MAX_CONVERSATIONS = 30;

const authShell = document.querySelector("#auth-shell");
const appShell = document.querySelector("#app-shell");
const elements = {
  sidebar: document.querySelector("#sidebar"),
  menuToggle: document.querySelector("#menu-toggle"),
  scrim: document.querySelector("#mobile-scrim"),
  sidebarSearchToggle: document.querySelector("#sidebar-search-toggle"),
  sidebarSearch: document.querySelector("#sidebar-search"),
  sidebarCollapse: document.querySelector("#sidebar-collapse"),
  newChat: document.querySelector("#new-chat"),
  title: document.querySelector("#page-title"),
  chatPage: document.querySelector("#chat-page"),
  welcome: document.querySelector("#welcome-view"),
  conversation: document.querySelector("#conversation-view"),
  messages: document.querySelector("#message-list"),
  utility: document.querySelector("#utility-page"),
  messageInput: document.querySelector("#message-input"),
  conversationInput: document.querySelector("#conversation-input"),
  chatForm: document.querySelector("#chat-form"),
  conversationForm: document.querySelector("#conversation-form"),
  attachments: document.querySelector("#attachment-input"),
  attachButton: document.querySelector("#attach-button"),
  attachmentList: document.querySelector("#attachment-list"),
  conversationAttachmentList: document.querySelector("#conversation-attachment-list"),
  recentList: document.querySelector("#recent-list"),
  recentEmpty: document.querySelector("#recent-empty"),
  profileButton: document.querySelector("#profile-button"),
  toastRegion: document.querySelector("#toast-region"),
  notificationDot: document.querySelector("#notification-dot"),
};

let conversations = loadConversations();
let activeConversationId = null;
let selectedFiles = [];
let currentPage = "chat";
let profileMenu = null;
let notificationDismissed = false;
let requestInProgress = false;
let authState = { email: "", verificationEmailSent: false };
let authAvailability = null;
let authStatusError = "";
let currentAuthScreen = "signin";

function readSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "bright" ? "bright" : "dark";
  } catch (error) {
    console.error("Unable to load the saved appearance:", error);
    return "dark";
  }
}

function applyTheme(theme, save = true) {
  const isBright = theme === "bright";
  document.body.classList.toggle("bright-theme", isBright);
  document.querySelector('meta[name="theme-color"]').content = isBright ? "#FAF8F3" : "#000000";
  if (!save) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, isBright ? "bright" : "dark");
  } catch (error) {
    console.error("Unable to save the appearance preference:", error);
    showToast("Your theme changed, but your browser could not save this preference.");
  }
}

applyTheme(readSavedTheme(), false);

function loadConversations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      Array.isArray(item.messages)
    ).slice(0, MAX_CONVERSATIONS);
  } catch (error) {
    console.error("Unable to load saved chats:", error);
    return [];
  }
}

function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
    return true;
  } catch (error) {
    console.error("Unable to save chats:", error);
    showToast("Your browser could not save this conversation. Check available storage and privacy settings.");
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function validCollegeEmail(value) {
  return /^[^\s@]+@bvcgroup\.in$/i.test(value.trim());
}

function renderAuthNotice() {
  if (authAvailability?.authenticationConfigured) return "";
  const message = authStatusError || (authAvailability
    ? "Firebase sign-in and email verification are not configured. Do not enter a real password."
    : "Checking authentication setup…");
  return `<aside class="auth-setup-notice"><strong>Setup required:</strong> ${escapeHtml(message)}</aside>`;
}

function updateAuthNotice() {
  const notice = authShell.querySelector(".auth-setup-notice");
  if (!notice) return;
  if (authAvailability?.authenticationConfigured) {
    notice.remove();
    return;
  }
  const message = authStatusError || "Firebase sign-in and email verification are not configured. Do not enter a real password.";
  notice.lastChild.textContent = ` ${message}`;
}

function passwordField(id, label, placeholder, autocomplete) {
  return `<label class="auth-field-label" for="${id}">${label}</label>
    <div class="auth-input-wrap">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
      <input id="${id}" type="password" placeholder="${placeholder}" minlength="6" maxlength="128" required autocomplete="${autocomplete}">
      <button class="password-toggle" type="button" data-toggle-password="${id}" aria-label="Show password">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
      </button>
    </div>`;
}

function renderAuthScreen(screen) {
  currentAuthScreen = screen;
  const notice = renderAuthNotice();
  const email = escapeHtml(authState.email);
  const screens = {
    signin: `
      <div class="auth-heading"><h1>Welcome back</h1><p>Log in with your college account</p></div>
      ${notice}
      <form class="auth-form" id="auth-signin">
        <label class="auth-field-label" for="signin-email">College email</label>
        <div class="auth-input-wrap">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
          <input id="signin-email" type="email" placeholder="you@bvcgroup.in" value="${email}" maxlength="254" required autocomplete="username">
        </div>
        ${passwordField("signin-password", "Password", "Enter your password", "off")}
        <div class="auth-forgot-row"><button type="button" class="auth-text-button" data-auth-screen="forgot">Forgot password?</button></div>
        <p class="auth-error" id="auth-error" role="alert" hidden></p>
        <button class="auth-primary" type="submit">Sign in</button>
      </form>
      <div class="auth-divider"><span>or</span></div>
      <div class="auth-google-options">
        <button class="auth-secondary auth-google" type="button" data-auth-action="google"><span aria-hidden="true">G</span>Login with Google</button>
        <div class="auth-google-widget" id="google-signin-widget" hidden></div>
      </div>
      <p class="auth-switch">Don't have an account? <button class="auth-text-button" type="button" data-auth-screen="signup">Sign up</button></p>`,
    signup: `
      <div class="auth-heading"><h1>Create account</h1><p>Use your BVC college email to sign up</p></div>
      ${notice}
      <form class="auth-form" id="auth-signup">
        <label class="auth-field-label" for="signup-email">College email</label>
        <div class="auth-input-wrap">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
          <input id="signup-email" type="email" placeholder="you@bvcgroup.in" maxlength="254" required autocomplete="email">
        </div>
        ${passwordField("signup-password", "Password", "At least 6 characters", "new-password")}
        ${passwordField("signup-confirm", "Confirm password", "Re-enter your password", "new-password")}
        <p class="auth-error" id="auth-error" role="alert" hidden></p>
        <button class="auth-primary" type="submit">Create account</button>
      </form>
      <p class="auth-switch">Already have an account? <button class="auth-text-button" type="button" data-auth-screen="signin">Sign in</button></p>`,
    verify: `
      <div class="auth-mail-icon" aria-hidden="true">
        <svg viewBox="0 0 36 36"><path d="M5 9h26v19H5z"/><path d="m6 11 12 9 12-9"/><circle cx="28" cy="10" r="5"/><path d="m26 10 1.3 1.3 2.7-2.8"/></svg>
      </div>
      <div class="auth-heading"><h1>Check your email</h1><p>${authState.verificationEmailSent ? "We sent a verification link to" : "A verification link would be sent to"}<br><strong>${email || "your BVC college email"}</strong><br>${authState.verificationEmailSent ? "Please verify before continuing." : "No email has been sent."}</p></div>
      ${notice}
      <div class="auth-info-box"><span aria-hidden="true">i</span><p>${authState.verificationEmailSent ? "Check your spam folder if the message does not arrive. Sign in after verifying to continue." : "No email was sent. Configure Firebase Authentication before continuing."}</p></div>
      <button class="auth-primary" type="button" data-auth-action="verified-continue">I've verified - Continue</button>
      <button class="auth-secondary auth-spaced" type="button" data-auth-action="resend">Resend verification email</button>
      <p class="auth-switch"><button class="auth-text-button" type="button" data-auth-action="different-account">Use a different account</button></p>`,
    connect: `
      <div class="auth-heading"><h1>Connect to BVC</h1><p>Connect your BVC student account using the official college verification service.</p></div>
      ${notice}
      <p class="auth-setup-explanation">BVC verification is not connected. No student details will be looked up or displayed. Do not enter your BVC portal password.</p>
      <form class="auth-form" id="auth-connect">
        <label class="auth-field-label" for="roll-number">Roll Number</label>
        <div class="auth-input-wrap">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9h.01M12 9h4M8 13h.01m4 0h4M8 17h.01m4 0h4"/></svg>
          <input id="roll-number" type="text" placeholder="Enter your roll number" maxlength="20" required autocomplete="off" autocapitalize="characters">
        </div>
        <p class="auth-hint">Your roll number is not sent until an approved BVC integration is configured.</p>
        <div class="auth-portal-links">
          <a href="https://byceautonomous.com/" target="_blank" rel="noopener noreferrer">↗ &nbsp;Official BVC Portal</a>
          <a href="https://bvcgroup.in/" target="_blank" rel="noopener noreferrer">◎ &nbsp;Official BVC Website</a>
        </div>
        <p class="auth-error" id="auth-error" role="alert" hidden></p>
        <button class="auth-primary" type="submit">Connect BVC</button>
      </form>
      <p class="auth-switch"><button class="auth-text-button" type="button" data-auth-action="different-account">Use a different account</button></p>`,
    verified: `
      <div class="auth-heading"><h1>Verification unavailable</h1><p>BVC has not verified this student account.</p></div>
      <section class="auth-unavailable-card" aria-label="BVC verification status">
        <h2><span aria-hidden="true">!</span> NOT VERIFIED BY BVC</h2>
        <p>BVC's approved student verification service is not connected. No student details were retrieved.</p>
      </section>
      ${notice}
      <button class="auth-primary auth-after-card" type="button" disabled>Continue unavailable</button>
      <p class="auth-switch"><button class="auth-text-button" type="button" data-auth-screen="connect">Try again</button></p>`,
    forgot: `
      <div class="auth-heading"><h1>Reset your password</h1><p>Enter your college email to request a password reset.</p></div>
      ${notice}
      <form class="auth-form" id="auth-forgot">
        <label class="auth-field-label" for="forgot-email">College email</label>
        <div class="auth-input-wrap">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
          <input id="forgot-email" type="email" placeholder="you@bvcgroup.in" maxlength="254" required autocomplete="email">
        </div>
        <p class="auth-error" id="auth-error" role="alert" hidden></p>
        <button class="auth-primary" type="submit">Send reset link</button>
      </form>
      <p class="auth-switch"><button class="auth-text-button" type="button" data-auth-screen="signin">Return to sign in</button></p>`,
  };
  authShell.innerHTML = `<section class="auth-screen">
    <div class="auth-hero">
      <a class="auth-brand" href="#" aria-label="Nexora AI">
        <span class="auth-brand-mark" aria-hidden="true"><span>N</span><i>+</i></span>
        <span>Nexora</span>
      </a>
      <div class="auth-hero-copy">
        <span class="auth-hero-kicker">NEXORA FOR BVC</span>
        <h2>Your campus.<br>Within reach.</h2>
        <p>A clearer way to find answers, plan your studies, and move forward.</p>
      </div>
      <div class="auth-orbit" aria-hidden="true"><span></span><i></i><b></b></div>
      <p class="auth-footer">Nexora AI · BVC student assistant</p>
    </div>
    <div class="auth-panel">
      <div class="auth-card"><div class="auth-content">${screens[screen] || screens.signin}</div></div>
    </div>
  </section>`;
  if (screen === "signin" && authAvailability?.googleAuthConfigured) configureGoogleSignInButton();
}

function showAuthError(message) {
  const error = authShell.querySelector("#auth-error");
  if (error) {
    error.classList.remove("auth-success");
    error.textContent = message;
    error.hidden = false;
  }
}

function showAuthMessage(message) {
  const status = authShell.querySelector("#auth-error");
  if (status) {
    status.classList.add("auth-success");
    status.textContent = message;
    status.hidden = false;
  }
}

async function getAuthenticationStatus() {
  const response = await fetch("/api/status", { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not check authentication setup.");
  authAvailability = result;
  authStatusError = "";
  updateAuthNotice();
  if (currentAuthScreen === "signin" && result.googleAuthConfigured) configureGoogleSignInButton();
  return result;
}

async function postAuthRequest(path, payload = {}) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Authentication request could not be completed.");
    error.code = result.code;
    throw error;
  }
  return result;
}

let googleIdentityScript = null;

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityScript) return googleIdentityScript;
  googleIdentityScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => window.google?.accounts?.id
      ? resolve()
      : reject(new Error("Google sign-in could not be initialized."));
    script.onerror = () => reject(new Error("Could not load Google's sign-in service."));
    document.head.append(script);
  });
  return googleIdentityScript;
}

async function handleGoogleCredential(response) {
  if (!response.credential) {
    showAuthError("Google did not return a sign-in credential. Please try again.");
    return;
  }
  try {
    const status = await getAuthenticationStatus();
    if (!status.googleAuthConfigured) {
      showAuthError("Google OAuth is not enabled for this Firebase project.");
      return;
    }
    const result = await postAuthRequest("/api/auth/google", { credential: response.credential });
    authState = { email: result.email, verificationEmailSent: false };
    renderAuthScreen("connect");
  } catch (error) {
    console.error("Google sign-in failed:", error.message);
    showAuthError(error.message || "Google sign-in failed. Please try again.");
  }
}

async function configureGoogleSignInButton() {
  const widget = authShell.querySelector("#google-signin-widget");
  const fallback = authShell.querySelector('[data-auth-action="google"]');
  if (!widget || !fallback || !authAvailability?.googleAuthConfigured || !authAvailability.googleClientId) return;
  if (widget.dataset.loading === "true" || widget.dataset.ready === "true") return;
  widget.dataset.loading = "true";
  try {
    await loadGoogleIdentityScript();
    if (!widget.isConnected) return;
    window.google.accounts.id.initialize({
      client_id: authAvailability.googleClientId,
      callback: handleGoogleCredential,
    });
    window.google.accounts.id.renderButton(widget, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
      logo_alignment: "left",
      width: Math.min(400, Math.floor(widget.parentElement.clientWidth)),
    });
    widget.hidden = false;
    fallback.hidden = true;
    widget.dataset.ready = "true";
  } catch (error) {
    widget.dataset.loading = "false";
    console.error("Could not initialize Google sign-in:", error.message);
    showAuthError(error.message || "Google sign-in could not be initialized.");
  }
}

async function initializeAuthentication() {
  renderAuthScreen("signin");
  try {
    const status = await getAuthenticationStatus();
    if (status.authenticationConfigured) {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await response.json();
      if (!response.ok) throw new Error(session.error || "Could not check your sign-in session.");
      if (session.authenticated) {
        authState.email = session.email;
        renderAuthScreen("connect");
        return;
      }
    }
  } catch (error) {
    console.error("Unable to check authentication status:", error.message);
    authStatusError = "Authentication setup could not be checked. Do not submit real credentials.";
    updateAuthNotice();
  }
}

authShell.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    if (form.id === "auth-signin" || form.id === "auth-signup") {
      const email = form.querySelector('input[type="email"]').value.trim().toLowerCase();
      if (!validCollegeEmail(email)) {
        showAuthError("Use a college email address ending in @bvcgroup.in.");
        return;
      }
      const passwordInput = form.querySelector(form.id === "auth-signup" ? "#signup-password" : "#signin-password");
      const password = passwordInput.value;
      if (form.id === "auth-signup" &&
          password !== form.querySelector("#signup-confirm").value) {
        showAuthError("Passwords do not match.");
        return;
      }
      form.reset();
      const availability = await getAuthenticationStatus();
      if (!availability.authenticationConfigured) {
        showAuthError("Firebase Authentication is not configured. No credentials were sent.");
        return;
      }
      if (form.id === "auth-signup") {
        const result = await postAuthRequest("/api/auth/signup", { email, password });
        authState = { email: result.email, verificationEmailSent: result.verificationEmailSent };
        renderAuthScreen("verify");
      } else {
        try {
          const result = await postAuthRequest("/api/auth/login", { email, password });
          authState = { email: result.email, verificationEmailSent: false };
          renderAuthScreen("connect");
        } catch (error) {
          if (error.code === "EMAIL_NOT_VERIFIED") {
            authState = { email: error.email || email, verificationEmailSent: true };
            renderAuthScreen("verify");
            return;
          }
          throw error;
        }
      }
    } else if (form.id === "auth-forgot") {
      const email = form.querySelector("#forgot-email").value.trim().toLowerCase();
      if (!validCollegeEmail(email)) {
        showAuthError("Use a college email address ending in @bvcgroup.in.");
        return;
      }
      const availability = await getAuthenticationStatus();
      form.reset();
      if (!availability.authenticationConfigured) {
        showAuthError("Firebase Authentication is not configured. No reset email was sent.");
        return;
      }
      await postAuthRequest("/api/auth/password-reset", { email });
      showAuthMessage("If an account exists for that address, a password reset email has been sent.");
    } else if (form.id === "auth-connect") {
      const rollNumber = form.querySelector("#roll-number").value.trim().toUpperCase();
      const availability = await getAuthenticationStatus();
      if (!availability.bvcVerificationConfigured) {
        showAuthError("BVC verification is not configured. Your roll number was not sent and no lookup was made.");
        return;
      }
      await postAuthRequest("/api/auth/bvc", { rollNumber });
      showAuthError("The configured BVC service returned no verified student record.");
    }
  } catch (error) {
    console.error("Authentication request failed:", error.message);
    showAuthError(error.message || "Authentication request failed. Please try again.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

authShell.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const toggle = target.closest("[data-toggle-password]");
  if (toggle) {
    const password = authShell.querySelector(`#${toggle.dataset.togglePassword}`);
    if (password) {
      const showPassword = password.type === "password";
      password.type = showPassword ? "text" : "password";
      toggle.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
    }
    return;
  }
  const screenButton = target.closest("[data-auth-screen]");
  if (screenButton) {
    renderAuthScreen(screenButton.dataset.authScreen);
    return;
  }
  const action = target.closest("[data-auth-action]");
  if (!action) return;
  if (action.dataset.authAction === "google") {
    try {
      const status = await getAuthenticationStatus();
      if (!status.googleAuthConfigured) {
        showAuthError("Google OAuth is not configured for this Firebase project. Sign in with your college email instead.");
        return;
      }
      await configureGoogleSignInButton();
    } catch (error) {
      console.error("Unable to initialize Google sign-in:", error.message);
      showAuthError(error.message || "Google sign-in could not be initialized.");
    }
  } else if (action.dataset.authAction === "verified-continue" || action.dataset.authAction === "resend") {
    renderAuthScreen("signin");
    showAuthError(action.dataset.authAction === "resend"
      ? "Sign in with your email and password to request a fresh verification link."
      : "Sign in after verifying your email. Firebase will confirm verification before access is granted.");
  } else if (action.dataset.authAction === "different-account") {
    try {
      if (authAvailability?.authenticationConfigured) await postAuthRequest("/api/auth/logout");
      authState = { email: "", verificationEmailSent: false };
      renderAuthScreen("signin");
    } catch (error) {
      console.error("Unable to sign out:", error.message);
      showAuthError(error.message || "Unable to sign out. Please try again.");
    }
  }
});

function getActiveConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId) || null;
}

function renderRecents() {
  elements.recentList.replaceChildren();
  const query = elements.sidebarSearch.value.trim().toLowerCase();
  let visibleCount = 0;
  conversations.forEach((conversation) => {
    if (query && !conversation.title.toLowerCase().includes(query)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `recent-item${conversation.id === activeConversationId && currentPage === "chat" ? " is-selected" : ""}`;
    button.textContent = conversation.title;
    button.title = conversation.title;
    button.addEventListener("click", () => openConversation(conversation.id));
    elements.recentList.append(button);
    visibleCount += 1;
  });
  elements.recentEmpty.hidden = visibleCount > 0;
  elements.recentEmpty.textContent = query && conversations.length
    ? "No matching chats."
    : "Your pinned chats will appear here.";
}

function formatTitle(message) {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 36 ? `${compact.slice(0, 36).trimEnd()}…` : compact;
}

function showToast(message, duration = 4500) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), duration);
}

function renderMessage(message) {
  const item = document.createElement("article");
  item.className = `message ${message.role === "user" ? "user-message" : "assistant-message"}`;

  if (message.role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "N";
    item.append(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-content";
  if (message.role === "assistant") {
    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = "Nexora AI";
    content.append(label);
  }
  const text = document.createElement("div");
  text.className = `message-text${message.error ? " message-error" : ""}`;
  text.textContent = message.content;
  content.append(text);
  item.append(content);
  return item;
}

function renderConversation() {
  const conversation = getActiveConversation();
  elements.messages.replaceChildren();
  if (conversation) {
    conversation.messages.forEach((message) => elements.messages.append(renderMessage(message)));
  }
  elements.welcome.hidden = Boolean(conversation);
  elements.conversation.hidden = !conversation;
  elements.title.textContent = conversation ? conversation.title : "New chat";
  renderRecents();
  if (conversation) {
    requestAnimationFrame(() => {
      elements.messages.scrollTop = elements.messages.scrollHeight;
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
  }
}

function closeSidebar() {
  elements.sidebar.classList.remove("is-open");
  elements.menuToggle.setAttribute("aria-expanded", "false");
  elements.menuToggle.setAttribute("aria-label", "Open navigation");
  elements.scrim.hidden = true;
}

function openConversation(id) {
  activeConversationId = id;
  currentPage = "chat";
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === "chat"));
  elements.chatPage.hidden = false;
  elements.utility.hidden = true;
  renderConversation();
  closeSidebar();
}

function startNewChat() {
  activeConversationId = null;
  currentPage = "chat";
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === "chat"));
  clearAttachments();
  elements.messageInput.value = "";
  elements.conversationInput.value = "";
  elements.chatPage.hidden = false;
  elements.utility.hidden = true;
  renderConversation();
  elements.messageInput.focus();
  closeSidebar();
}

function setNavigation(page) {
  currentPage = page;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === page);
  });
  elements.chatPage.hidden = page !== "chat";
  elements.utility.hidden = page === "chat";
  if (page === "chat") {
    renderConversation();
  } else if (page === "scheduled") {
    renderScheduled();
  } else if (page === "results") {
    renderResults();
  } else if (page === "downloads") {
    renderDownloads();
  } else if (page === "notifications") {
    renderNotifications();
  } else if (page === "settings") {
    renderSettings();
  }
  closeSidebar();
}

function renderSettings() {
  const selectedTheme = document.body.classList.contains("bright-theme") ? "bright" : "dark";
  renderUtilityFrame(
    "Settings",
    "Choose how Nexora looks on this device.",
    '<path d="M10 2.5v2m0 11v2m7.5-7.5h-2m-11 0h-2m12.8-5.3-1.4 1.4m-7.8 7.8-1.4 1.4m10.6 0-1.4-1.4m-7.8-7.8L5.7 5.7"/><circle cx="10" cy="10" r="3.5"/>',
    `<section class="utility-card appearance-card">
      <h2>Appearance</h2>
      <p>Select a theme for the Nexora interface.</p>
      <div class="theme-options" role="group" aria-label="Appearance theme">
        <button class="theme-option${selectedTheme === "dark" ? " is-selected" : ""}" type="button" data-theme-choice="dark" aria-pressed="${selectedTheme === "dark"}">
          <span class="theme-preview dark-preview" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>Dark</span>
        </button>
        <button class="theme-option${selectedTheme === "bright" ? " is-selected" : ""}" type="button" data-theme-choice="bright" aria-pressed="${selectedTheme === "bright"}">
          <span class="theme-preview bright-preview" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>Bright</span>
        </button>
      </div>
    </section>`
  );
  elements.utility.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.themeChoice);
      renderSettings();
    });
  });
}

function renderScheduled() {
  renderUtilityFrame(
    "Scheduled",
    "Scheduled reminders and tasks for your college life.",
    '<circle cx="10" cy="10" r="7.25"/><path d="M10 5.5v4.8l3 1.8"/>',
    `<section class="utility-card">
      <h2>Nothing scheduled yet</h2>
      <p>Scheduled reminders will be available when a scheduling service is connected.</p>
    </section>`
  );
}

function appendUtilityIcon(pathMarkup) {
  return `<span class="utility-icon" aria-hidden="true"><svg viewBox="0 0 20 20">${pathMarkup}</svg></span>`;
}

function renderUtilityFrame(title, description, icon, content) {
  elements.title.textContent = title;
  elements.utility.innerHTML = `
    <div class="utility-heading">
      ${appendUtilityIcon(icon)}
      <div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
    </div>
    ${content}`;
}

async function renderResults() {
  renderUtilityFrame(
    "Student results",
    "A private space for authorized students to view academic results.",
    '<path d="M4 3.5h12v13H4z"/><path d="M7 7h6m-6 3h6m-6 3h3"/>',
    `<section class="utility-card">
      <h2>Secure results access</h2>
      <p>Results contain private student information. Access will be enabled only after the college's authenticated results service is connected. No student details are stored or displayed here.</p>
      <div class="button-row"><button class="action-button primary" id="check-results">Check secure access</button></div>
      <p class="inline-status" id="results-status" hidden></p>
    </section>
    <section class="utility-card">
      <h2>Your privacy matters</h2>
      <p>Production setup must verify the student's identity and permissions on the server before returning any result data. Never use roll number alone as authentication.</p>
    </section>`
  );
  document.querySelector("#check-results").addEventListener("click", checkResults);
}

async function checkResults(event) {
  const button = event.currentTarget;
  const status = document.querySelector("#results-status");
  button.disabled = true;
  button.textContent = "Checking access…";
  status.hidden = true;
  try {
    const response = await fetch("/api/results");
    const body = await response.json();
    status.textContent = body.error || "Secure results service is unavailable.";
    status.hidden = false;
  } catch (error) {
    status.textContent = "Could not reach the results service. Check your connection and try again.";
    status.hidden = false;
    console.error("Results service request failed:", error);
  } finally {
    button.disabled = false;
    button.textContent = "Check secure access";
  }
}

async function renderDownloads() {
  renderUtilityFrame(
    "Library",
    "Browse approved syllabi, study materials, and previous question papers.",
    '<path d="M10 2.75v9m-3.5-3.5L10 11.75l3.5-3.5M4 13.25v3h12v-3"/>',
    `<section class="utility-card">
      <h2>College study library</h2>
      <p>Materials shared by your college will be listed here.</p>
      <div class="button-row"><button class="action-button" id="refresh-downloads">Refresh library</button></div>
      <div id="downloads-content" aria-live="polite"><div class="empty-state"><strong>Loading library…</strong></div></div>
    </section>`
  );
  document.querySelector("#refresh-downloads").addEventListener("click", loadDownloads);
  await loadDownloads();
}

async function loadDownloads() {
  const button = document.querySelector("#refresh-downloads");
  const content = document.querySelector("#downloads-content");
  button.disabled = true;
  button.textContent = "Refreshing…";
  content.innerHTML = '<div class="empty-state"><strong>Loading library…</strong></div>';
  try {
    const response = await fetch("/api/downloads");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load the library.");
    if (body.items?.length) {
      const list = document.createElement("div");
      list.className = "document-list";
      body.items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "document-row";
        const meta = document.createElement("div");
        meta.className = "document-meta";
        const name = document.createElement("strong");
        name.textContent = item.name;
        const detail = document.createElement("small");
        detail.textContent = item.description || "College study material";
        const link = document.createElement("a");
        link.href = item.url;
        link.textContent = "Download";
        link.setAttribute("download", "");
        meta.append(name, detail);
        row.append(meta, link);
        list.append(row);
      });
      content.replaceChildren(list);
    } else {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const title = document.createElement("strong");
      title.textContent = "No materials available yet";
      const description = document.createElement("p");
      description.textContent = body.message || "The college document library has not been connected.";
      empty.append(title, description);
      content.replaceChildren(empty);
    }
  } catch (error) {
    content.innerHTML = `<p class="inline-status">${escapeHtml(error.message || "Could not load the library.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = "Refresh library";
  }
}

function renderNotifications() {
  elements.notificationDot.hidden = true;
  renderUtilityFrame(
    "Notifications",
    "Service updates and important information for your account.",
    '<path d="M5 8a5 5 0 0 1 10 0c0 5 2 5.5 2 6.5H3C3 13.5 5 13 5 8Zm3.5 9h3"/>',
    `<section class="utility-card"${notificationDismissed ? " hidden" : ""}>
      <div class="notification-status">
        <span class="status-pulse"></span>
        <div><h2>College services are not connected</h2><p>Your chat history is saved only in this browser. College announcements will appear here after an authenticated notification service is connected.</p></div>
      </div>
      <div class="button-row"><button class="action-button" id="notification-dismiss">Dismiss update</button></div>
    </section>
    <div class="empty-state" id="notification-empty"${notificationDismissed ? "" : " hidden"}><strong>You're all caught up</strong><p>New service announcements will appear here.</p></div>`
  );
  document.querySelector("#notification-dismiss")?.addEventListener("click", () => {
    notificationDismissed = true;
    document.querySelector(".notification-status").closest(".utility-card").hidden = true;
    document.querySelector("#notification-empty").hidden = false;
  });
}

function clearAttachments() {
  selectedFiles = [];
  elements.attachments.value = "";
  renderAttachments();
}

function renderAttachments() {
  [elements.attachmentList, elements.conversationAttachmentList].forEach((container) => {
    container.replaceChildren();
    selectedFiles.forEach((file, index) => {
      const chip = document.createElement("span");
      chip.className = "file-chip";
      const name = document.createElement("span");
      name.textContent = file.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${file.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        selectedFiles.splice(index, 1);
        renderAttachments();
      });
      chip.append(name, remove);
      container.append(chip);
    });
  });
}

async function submitMessage(rawText) {
  const text = rawText.trim();
  if (requestInProgress) {
    showToast("Please wait for the current response to finish before sending another message.");
    return;
  }
  if (!text && selectedFiles.length === 0) return;
  if (!text && selectedFiles.length > 0) {
    showToast("Add a message before sending. File contents are not uploaded or processed yet.");
    return;
  }
  if (selectedFiles.length > 0) {
    showToast("Attachments are selected, but document upload is not connected yet. Remove files to send this message.");
    return;
  }
  if (text.length > 8000) {
    showToast("Messages must be 8,000 characters or fewer.");
    return;
  }

  if (!activeConversationId) {
    const conversation = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: formatTitle(text),
      messages: [],
      updatedAt: new Date().toISOString(),
    };
    conversations.unshift(conversation);
    conversations = conversations.slice(0, MAX_CONVERSATIONS);
    activeConversationId = conversation.id;
  }

  const conversation = getActiveConversation();
  conversation.messages.push({ role: "user", content: text });
  conversation.updatedAt = new Date().toISOString();
  conversation.title = conversation.messages.filter((message) => message.role === "user").length === 1
    ? formatTitle(text)
    : conversation.title;
  saveConversations();
  elements.messageInput.value = "";
  elements.conversationInput.value = "";
  clearAttachments();
  currentPage = "chat";
  elements.chatPage.hidden = false;
  elements.utility.hidden = true;
  elements.welcome.hidden = true;
  elements.conversation.hidden = false;
  elements.title.textContent = conversation.title;
  renderRecents();

  const userMessage = renderMessage({ role: "user", content: text });
  elements.messages.append(userMessage);
  const pending = document.createElement("article");
  pending.className = "message assistant-message";
  pending.innerHTML = '<div class="message-avatar" aria-hidden="true">N</div><div class="message-content"><div class="message-label">Nexora AI</div><div class="loading-dots" role="status" aria-label="Nexora AI is responding"><span></span><span></span><span></span></div></div>';
  elements.messages.append(pending);
  requestInProgress = true;
  document.querySelectorAll(".send-button").forEach((button) => { button.disabled = true; });
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conversation.messages.filter((message) => !message.error).slice(-20).map(({ role, content }) => ({ role, content })),
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Chat request failed (${response.status}).`);
    conversation.messages.push({ role: "assistant", content: body.answer });
    saveConversations();
  } catch (error) {
    conversation.messages.push({ role: "assistant", content: error.message || "Could not reach the chat service. Please try again.", error: true });
    saveConversations();
    console.error("Chat request failed:", error);
  } finally {
    pending.remove();
    requestInProgress = false;
    if (activeConversationId === conversation.id && currentPage === "chat") {
      conversation.messages.slice(-1).forEach((message) => elements.messages.append(renderMessage(message)));
    }
    document.querySelectorAll(".send-button").forEach((button) => { button.disabled = false; });
    renderRecents();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }
}

function resizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 130)}px`;
}

elements.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitMessage(elements.messageInput.value);
});
elements.conversationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitMessage(elements.conversationInput.value);
});
[elements.messageInput, elements.conversationInput].forEach((textarea) => {
  textarea.addEventListener("input", () => resizeTextarea(textarea));
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      textarea.closest("form").requestSubmit();
    }
  });
});

elements.newChat.addEventListener("click", startNewChat);
document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    setNavigation(button.dataset.nav);
  });
});
document.querySelectorAll(".suggestion-card").forEach((button) => {
  button.addEventListener("click", () => submitMessage(button.dataset.prompt));
});
elements.attachButton.addEventListener("click", () => elements.attachments.click());
document.querySelectorAll("[data-attach]").forEach((button) => {
  button.addEventListener("click", () => elements.attachments.click());
});
elements.attachments.addEventListener("change", () => {
  selectedFiles = [...selectedFiles, ...Array.from(elements.attachments.files || [])];
  renderAttachments();
});
elements.sidebarSearchToggle.addEventListener("click", () => {
  const isExpanded = elements.sidebarSearchToggle.getAttribute("aria-expanded") === "true";
  elements.sidebarSearchToggle.setAttribute("aria-expanded", String(!isExpanded));
  elements.sidebarSearch.hidden = isExpanded;
  if (isExpanded) {
    elements.sidebarSearch.value = "";
    renderRecents();
  } else {
    elements.sidebarSearch.focus();
  }
});
elements.sidebarSearch.addEventListener("input", renderRecents);
elements.sidebarCollapse.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-collapsed");
});
document.querySelectorAll(".voice-button").forEach((button) => button.addEventListener("click", () => {
  showToast("Voice input is not available yet. You can type your message instead.");
}));
elements.menuToggle.addEventListener("click", () => {
  const open = !elements.sidebar.classList.contains("is-open");
  elements.sidebar.classList.toggle("is-open", open);
  elements.menuToggle.setAttribute("aria-expanded", String(open));
  elements.menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  elements.scrim.hidden = !open;
});
elements.scrim.addEventListener("click", closeSidebar);
document.querySelector("#top-notifications").addEventListener("click", () => setNavigation("notifications"));

elements.profileButton.addEventListener("click", () => {
  const isOpen = elements.profileButton.getAttribute("aria-expanded") === "true";
  if (isOpen) {
    profileMenu?.remove();
    profileMenu = null;
    elements.profileButton.setAttribute("aria-expanded", "false");
    return;
  }
  profileMenu = document.createElement("div");
  profileMenu.className = "profile-menu";
  profileMenu.innerHTML = `
    <div class="profile-menu-account"><span class="avatar">V</span><span><strong>Vinay</strong><small>Go</small></span><span class="profile-menu-chevron">›</span></div>
    <div class="profile-menu-divider"></div>
    <button type="button" data-profile-action="Personalization"><span aria-hidden="true">◷</span>Personalization</button>
    <button type="button" data-profile-action="Profile"><span aria-hidden="true">♙</span>Profile</button>
    <button type="button" data-profile-action="Settings"><span aria-hidden="true">⚙</span>Settings</button>
    <div class="profile-menu-divider"></div>
    <button type="button" data-profile-action="Help"><span aria-hidden="true">◎</span>Help</button>
    <button type="button" data-profile-action="Log out"><span aria-hidden="true">⇥</span>Log out</button>`;
  profileMenu.querySelectorAll("[data-profile-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      profileMenu.remove();
      profileMenu = null;
      elements.profileButton.setAttribute("aria-expanded", "false");
      if (button.dataset.profileAction === "Settings") {
        setNavigation("settings");
      } else if (button.dataset.profileAction === "Log out") {
        try {
          await postAuthRequest("/api/auth/logout");
        } catch (error) {
          console.error("Unable to sign out:", error.message);
          showToast(error.message || "Unable to sign out. Please try again.");
          return;
        }
        authState = { email: "", verificationEmailSent: false };
        appShell.hidden = true;
        authShell.hidden = false;
        renderAuthScreen("signin");
      } else {
        showToast(`${button.dataset.profileAction} is not connected yet.`);
      }
    });
  });
  document.body.append(profileMenu);
  elements.profileButton.setAttribute("aria-expanded", "true");
});
document.addEventListener("click", (event) => {
  if (profileMenu && !elements.profileButton.contains(event.target) && !profileMenu.contains(event.target)) {
    profileMenu.remove();
    profileMenu = null;
    elements.profileButton.setAttribute("aria-expanded", "false");
  }
});

initializeAuthentication();
renderRecents();
renderConversation();
