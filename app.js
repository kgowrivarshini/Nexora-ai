const STORAGE_KEY = "nexora-conversations-v1";
const MAX_CONVERSATIONS = 30;

const elements = {
  sidebar: document.querySelector("#sidebar"),
  menuToggle: document.querySelector("#menu-toggle"),
  scrim: document.querySelector("#mobile-scrim"),
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

function getActiveConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId) || null;
}

function renderRecents() {
  elements.recentList.replaceChildren();
  elements.recentEmpty.hidden = conversations.length > 0;
  conversations.forEach((conversation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `recent-item${conversation.id === activeConversationId && currentPage === "chat" ? " is-selected" : ""}`;
    button.textContent = conversation.title;
    button.title = conversation.title;
    button.addEventListener("click", () => openConversation(conversation.id));
    elements.recentList.append(button);
  });
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
  } else if (page === "results") {
    renderResults();
  } else if (page === "downloads") {
    renderDownloads();
  } else if (page === "notifications") {
    renderNotifications();
  }
  closeSidebar();
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
    "Downloads",
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
  profileMenu.innerHTML = "<strong>Priya Sharma</strong><p>Signed-in student profile integration is not connected. This display name is local UI only.</p>";
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

renderRecents();
renderConversation();
