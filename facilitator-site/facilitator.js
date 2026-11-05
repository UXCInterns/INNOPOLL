
/* =========================================================
   INNOPOLL FACILITATOR DASHBOARD
   FILE: facilitator-site/facilitator.js
   ========================================================= */

const { createClient } = window.supabase;
const config = window.INNOPOLL_CONFIG;
const db = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let sessions = [];
let currentSession = null;
let currentParticipants = [];
let currentParticipantAnswerCounts = {};
let currentQuestions = [];
let currentAnswers = [];
let charts = {};
let editorMode = "create";
let editingSessionId = null;
let modalAction = null;
let countdownInterval = null;
let participantUrl = "";

const pages = ["sessions-page", "editor-page", "qr-page", "analytics-page", "participants-page"];

const categorySettings = {
  culture: {
    label: "Culture",
    colour: "#f59e0b",
    gradientStart: "#f59e0b",
    gradientEnd: "#ea7b16",
    chart: "culture-chart",
    score: "culture-score"
  },
  practices: {
    label: "Practices",
    colour: "#4387f5",
    gradientStart: "#4387f5",
    gradientEnd: "#2864d9",
    chart: "practices-chart",
    score: "practices-score"
  },
  leadership: {
    label: "Leadership",
    colour: "#24b47e",
    gradientStart: "#24b47e",
    gradientEnd: "#159b69",
    chart: "leadership-chart",
    score: "leadership-score"
  }
};

const DEFAULT_QUESTIONS = [
  {
    category: "culture",
    title: "Culture",
    question_text: "Our organisation encourages people to experiment with new ideas and approaches.",
    definition: "Innovation culture refers to the shared values, behaviours and environment that encourage people to explore, experiment and contribute new ideas.",
    statements: ["People feel comfortable sharing new ideas.", "Different perspectives are welcomed.", "Experimentation and learning from mistakes are encouraged."]
  },
  {
    category: "practices",
    title: "Practices",
    question_text: "Our organisation has effective processes for turning ideas into practical solutions.",
    definition: "Innovation practices refer to the methods, processes and activities used to identify opportunities, develop ideas and implement solutions.",
    statements: ["We actively identify opportunities for improvement.", "We use structured methods to develop and test ideas.", "We review outcomes and improve our approaches."]
  },
  {
    category: "leadership",
    title: "Leadership",
    question_text: "Leaders in our organisation actively support and enable innovation.",
    definition: "Innovation leadership refers to how leaders provide direction, resources, encouragement and support for innovation.",
    statements: ["Leaders communicate a clear direction for innovation.", "Leaders provide resources and support for new ideas.", "Leaders encourage collaboration and shared ownership."]
  }
];

// =========================================================
// GENERAL HELPERS
// =========================================================

function setMessage(id, message) {
  const element = $(id);
  if (element) element.textContent = message || "";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getTodayString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function generateRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }
  return code;
}

function getSessionStatus(session) {
  const today = getTodayString();
  return session.is_active && session.start_date <= today && session.end_date >= today
    ? "ongoing"
    : "ended";
}

function toPercentage(mean) {
  if (mean === null || mean === undefined || !Number.isFinite(mean)) return null;
  return Math.round(((mean - 1) / 4) * 100);
}

function getCategoryKey(category) {
  return String(category || "").trim().toLowerCase().replace(/\s+/g, "");
}

function getQuestionStatements(question) {
  if (!Array.isArray(question.statements)) return [];
  return question.statements
    .map((statement) => typeof statement === "string"
      ? statement
      : statement?.text || statement?.statement || "")
    .filter(Boolean);
}

function getProfileName(user = currentUser) {
  const metadata = user?.user_metadata || {};
  return metadata.username ||
    metadata.user_name ||
    metadata.preferred_username ||
    metadata.full_name ||
    metadata.name ||
    user?.email?.split("@")[0] ||
    "Facilitator";
}

function getProfileImage(user = currentUser) {
  const metadata = user?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || metadata.avatar || metadata.photo_url || "";
}

function getInitials(name) {
  return String(name || "F").trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "F";
}

function profileAvatarMarkup(user, className = "creator-avatar") {
  const name = getProfileName(user);
  const image = getProfileImage(user);
  return `<span class="${className}">${image
    ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(name)}" referrerpolicy="no-referrer">`
    : escapeHTML(getInitials(name))}</span>`;
}

function showPage(pageId, breadcrumb) {
  pages.forEach((id) => $(id).classList.add("hidden"));
  $(pageId).classList.remove("hidden");
  $("breadcrumb-current").textContent = breadcrumb || "Sessions";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDashboard() {
  stopCountdown();
  showPage("sessions-page", "Sessions");
  loadSessions();
}

function showApp(user) {
  currentUser = user;
  $("login-screen").classList.add("hidden");
  $("app-screen").classList.remove("hidden");

  const name = getProfileName(user);
  const image = getProfileImage(user);

  $("account-name").textContent = name;
  $("signed-in-label").textContent = "Facilitator account";
  $("account-avatar").innerHTML = image
    ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(name)}" referrerpolicy="no-referrer">`
    : escapeHTML(getInitials(name));

  showPage("sessions-page", "Sessions");
  loadSessions();
}

function showLogin() {
  currentUser = null;
  $("login-screen").classList.remove("hidden");
  $("app-screen").classList.add("hidden");
  stopCountdown();

  Object.values(charts).forEach((chart) => chart?.destroy());
  charts = {};
}

async function getUser() {
  const { data, error } = await db.auth.getUser();
  if (error) return null;
  return data.user;
}

// =========================================================
// AUTHENTICATION
// =========================================================

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("login-error", "");

  const button = $("login-button");
  button.disabled = true;
  button.textContent = "Signing in...";

  const { data, error } = await db.auth.signInWithPassword({
    email: $("login-email").value.trim(),
    password: $("login-password").value
  });

  button.disabled = false;
  button.textContent = "Sign in";

  if (error) {
    setMessage("login-error", "Sign-in failed. Please check your email and password.");
    return;
  }

  showApp(data.user);
});

$("sign-out-button").addEventListener("click", async () => {
  await db.auth.signOut();
  showLogin();
});

$("home-brand").addEventListener("click", (event) => {
  event.preventDefault();
  showDashboard();
});

$("nav-sessions").addEventListener("click", showDashboard);

db.auth.onAuthStateChange((event, session) => {
  if (session?.user) showApp(session.user);
  else if (event === "SIGNED_OUT") showLogin();
});

// =========================================================
// SESSION MANAGEMENT
// =========================================================

async function loadSessions() {
  const user = await getUser();

  if (!user) {
    showLogin();
    return;
  }

  setMessage("sessions-message", "Loading sessions...");
  $("sessions-table-body").innerHTML =
    `<tr><td colspan="7" class="empty-table">Loading sessions...</td></tr>`;

  const { data, error } = await db.from("sessions")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    setMessage("sessions-message", "Unable to load sessions. Please refresh.");
    return;
  }

  sessions = data || [];
  await loadGlobalSessionCount();
  await renderSessions();
}

async function loadGlobalSessionCount() {
  const metric = $("total-sessions");
  const { data, error } = await db.rpc("get_total_sessions_count");

  if (error) {
    console.error("Unable to load global session count:", error);
    metric.textContent = "—";
    return;
  }

  metric.textContent = data ?? 0;
}

async function renderSessions() {
  const search = $("session-search").value.trim().toLowerCase();
  const filter = $("session-filter").value;

  const filtered = sessions.filter((session) => {
    const status = getSessionStatus(session);

    const matchesSearch =
      (session.session_name || "").toLowerCase().includes(search) ||
      (session.room_code || "").toLowerCase().includes(search);

    const matchesFilter = filter === "all" ||
      (filter === "ongoing" && status === "ongoing") ||
      (filter === "ended" && status === "ended");

    return matchesSearch && matchesFilter;
  });

  const sessionIds = sessions.map((session) => session.id);
  const participantCounts = {};

  if (sessionIds.length) {
    const { data, error } = await db.from("participants")
      .select("session_id")
      .in("session_id", sessionIds);

    if (!error) {
      (data || []).forEach((participant) => {
        participantCounts[participant.session_id] =
          (participantCounts[participant.session_id] || 0) + 1;
      });
    }
  }

  $("ongoing-sessions").textContent =
    sessions.filter((session) => getSessionStatus(session) === "ongoing").length;

  $("total-participants").textContent =
    Object.values(participantCounts).reduce((sum, count) => sum + count, 0);

  if (!filtered.length) {
    $("sessions-table-body").innerHTML = `<tr><td colspan="7" class="empty-table">${
      sessions.length
        ? "No sessions match your search."
        : "You haven't created any sessions yet. Create your first session to get started."
    }</td></tr>`;

    setMessage("sessions-message", "");
    return;
  }

  const creatorName = getProfileName(currentUser);
  const creatorImage = getProfileImage(currentUser);

  $("sessions-table-body").innerHTML = filtered.map((session) => {
    const status = getSessionStatus(session);
    const count = participantCounts[session.id] || 0;
    const createdDate = session.created_at ? formatDateTime(session.created_at) : "—";

    return `
      <tr>
        <td><div class="session-name-cell"><strong>${escapeHTML(session.session_name)}</strong></div></td>
        <td>${escapeHTML(createdDate)}</td>
        <td><span class="room-code">${escapeHTML(session.room_code || "—")}</span></td>
        <td>${count}</td>
        <td><span class="status-pill ${status === "ongoing" ? "active" : ""}">${status === "ongoing" ? "Ongoing" : "Ended"}</span></td>
        <td>
          <span class="creator-cell">
            <span class="creator-avatar">
              ${creatorImage
                ? `<img src="${escapeHTML(creatorImage)}" alt="${escapeHTML(creatorName)}" referrerpolicy="no-referrer">`
                : escapeHTML(getInitials(creatorName))}
            </span>
            <span class="creator-name">${escapeHTML(creatorName)}</span>
          </span>
        </td>
        <td>
          <div class="action-buttons">
            <button type="button" class="table-action" data-action="analytics" data-id="${escapeHTML(session.id)}" title="View analytics" aria-label="View analytics">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V7M16 16v-8"/></svg>
            </button>
            <button type="button" class="table-action" data-action="participants" data-id="${escapeHTML(session.id)}" title="View participants" aria-label="View participants">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </button>
            <button type="button" class="table-action" data-action="qr" data-id="${escapeHTML(session.id)}" title="View QR code" aria-label="View QR code">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v2M14 20h2M19 19h2v2h-2z"/></svg>
            </button>
            <button type="button" class="table-action" data-action="edit" data-id="${escapeHTML(session.id)}" title="Edit session" aria-label="Edit session">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            </button>
            <button type="button" class="table-action danger" data-action="delete" data-id="${escapeHTML(session.id)}" title="Delete session" aria-label="Delete session">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join("");

  setMessage("sessions-message", `${filtered.length} session(s) found.`);
}

$("sessions-table-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const session = sessions.find((item) => item.id === button.dataset.id);
  if (!session) return;

  const action = button.dataset.action;

  if (action === "analytics") await openAnalytics(session);
  else if (action === "participants") await openParticipants(session);
  else if (action === "qr") openQrPage(session);
  else if (action === "edit") await openEditor(session);
  else if (action === "delete") confirmDeleteSession(session);
});

$("refresh-button").addEventListener("click", loadSessions);
$("session-search").addEventListener("input", renderSessions);
$("session-filter").addEventListener("change", renderSessions);

// =========================================================
// CREATE / EDIT SESSION
// =========================================================

$("create-session-button").addEventListener("click", () => openEditor());

function resetEditor() {
  $("session-form").reset();
  $("questions-editor").replaceChildren();

  setMessage("editor-error", "");
  setMessage("questions-message", "");

  const today = getTodayString();
  $("editor-start-date").value = today;
  $("editor-end-date").value = addDays(today, 7);
}

function addQuestionEditor(question = {}) {
  const card = document.createElement("article");
  card.className = "question-editor-card";

  const statements = getQuestionStatements(question);

  card.innerHTML = `
    <div class="question-editor-header">
      <strong class="question-number">Question</strong>
      <button class="delete-question-button" type="button" title="Delete question">×</button>
    </div>
    <label>Category</label>
    <input class="question-category" type="text" maxlength="60" placeholder="e.g. culture" value="${escapeHTML(question.category || "")}" />
    <label>Question Title</label>
    <input class="question-title" type="text" maxlength="120" placeholder="e.g. Culture" value="${escapeHTML(question.title || "")}" />
    <label>Question</label>
    <textarea class="question-text-input" placeholder="Enter your survey question...">${escapeHTML(question.question_text || "")}</textarea>
    <label>Definition</label>
    <textarea class="question-definition-input" placeholder="Explain what this category means...">${escapeHTML(question.definition || "")}</textarea>
    <label>Statements</label>
    <div class="statement-list"></div>
    <button class="add-statement-button" type="button">＋ Add Statement</button>`;

  const statementList = card.querySelector(".statement-list");

  statements.forEach((statement) => addStatementEditor(statementList, statement));

  if (!statements.length) {
    addStatementEditor(statementList, "");
  }

  card.querySelector(".add-statement-button").addEventListener("click", () => {
    addStatementEditor(statementList, "");
  });

  card.querySelector(".delete-question-button").addEventListener("click", () => {
    card.remove();
    updateQuestionNumbers();
  });

  $("questions-editor").appendChild(card);
  updateQuestionNumbers();
}

function addStatementEditor(container, value = "") {
  const row = document.createElement("div");
  row.className = "statement-editor";

  row.innerHTML = `
    <input type="text" class="statement-input" maxlength="300" placeholder="Enter a statement..." value="${escapeHTML(value)}" />
    <button type="button" class="delete-statement-button" title="Remove statement">×</button>`;

  row.querySelector(".delete-statement-button").addEventListener("click", () => {
    row.remove();
  });

  container.appendChild(row);
}

function updateQuestionNumbers() {
  document.querySelectorAll(".question-editor-card").forEach((card, index) => {
    card.querySelector(".question-number").textContent = `Question ${index + 1}`;
  });
}

$("add-question-button").addEventListener("click", () => addQuestionEditor());

async function openEditor(session = null) {
  editorMode = session ? "edit" : "create";
  editingSessionId = session?.id || null;

  resetEditor();

  $("editor-heading").textContent = session ? "Edit Session" : "Create Session";
  $("save-session-button").textContent = session ? "Save Changes" : "Create Session";

  if (session) {
    $("editor-session-name").value = session.session_name || "";
    $("editor-start-date").value = session.start_date || getTodayString();
    $("editor-end-date").value = session.end_date || addDays(getTodayString(), 7);

    const { data: participants, error: participantError } = await db.from("participants")
      .select("id")
      .eq("session_id", session.id)
      .limit(1);

    if (participantError) {
      setMessage("editor-error", "Unable to check existing participants.");
      return;
    }

    const hasParticipants = (participants || []).length > 0;

    const { data: questions, error } = await db.from("session_questions")
      .select("*")
      .eq("session_id", session.id)
      .order("sort_order", { ascending: true });

    if (error) {
      setMessage("editor-error", "Unable to load session questions.");
      return;
    }

    currentQuestions = questions || [];
    currentQuestions.forEach((question) => addQuestionEditor(question));

    if (hasParticipants) {
      setMessage("questions-message", "Questions are locked because participants have already started this survey. You can still edit the session details.");

      $("add-question-button").disabled = true;

      $("questions-editor").querySelectorAll("input, textarea, button").forEach((element) => {
        element.disabled = true;
      });
    } else {
      $("add-question-button").disabled = false;
    }
  } else {
    $("add-question-button").disabled = false;
    DEFAULT_QUESTIONS.forEach((question) => addQuestionEditor(question));
  }

  showPage("editor-page", session ? "Edit Session" : "Create Session");
}

$("cancel-editor-button").addEventListener("click", showDashboard);

function collectEditorQuestions() {
  const cards = [...$("questions-editor").querySelectorAll(".question-editor-card")];

  return cards.map((card, index) => ({
    category: card.querySelector(".question-category").value.trim(),
    title: card.querySelector(".question-title").value.trim(),
    question_text: card.querySelector(".question-text-input").value.trim(),
    definition: card.querySelector(".question-definition-input").value.trim(),
    statements: [...card.querySelectorAll(".statement-input")]
      .map((input) => input.value.trim())
      .filter(Boolean),
    sort_order: index + 1
  }));
}

$("session-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("editor-error", "");

  const button = $("save-session-button");
  button.disabled = true;
  button.textContent = "Saving...";

  const sessionName = $("editor-session-name").value.trim();
  const startDate = $("editor-start-date").value;
  const endDate = $("editor-end-date").value;

  const restoreButton = () => {
    button.disabled = false;
    button.textContent = editorMode === "edit" ? "Save Changes" : "Create Session";
  };

  if (endDate < startDate) {
    setMessage("editor-error", "End date cannot be earlier than the start date.");
    restoreButton();
    return;
  }

  const questions = collectEditorQuestions();

  if (!questions.length) {
    setMessage("editor-error", "Please add at least one question.");
    restoreButton();
    return;
  }

  if (questions.some((question) =>
    !question.category || !question.title || !question.question_text
  )) {
    setMessage("editor-error", "Please complete the category, title and question fields for every question.");
    restoreButton();
    return;
  }

  let savedSession = null;

  if (editorMode === "create") {
    const user = await getUser();

    if (!user) {
      restoreButton();
      showLogin();
      return;
    }

    const { data, error } = await db.from("sessions").insert({
      organisation_name: sessionName,
      session_name: sessionName,
      start_date: startDate,
      end_date: endDate,
      room_code: generateRoomCode(),
      created_by: user.id,
      is_active: true
    }).select().single();

    if (error) {
      console.error(error);
      setMessage("editor-error", "Could not create the session. Please try again.");
      restoreButton();
      return;
    }

    savedSession = data;

    const questionRows = questions.map((question) => ({
      ...question,
      session_id: savedSession.id,
      is_default: false
    }));

    const { error: questionError } = await db.from("session_questions").insert(questionRows);

    if (questionError) {
      console.error(questionError);
      await db.from("sessions").delete().eq("id", savedSession.id);
      setMessage("editor-error", "The session could not save its questions. Please try again.");
      restoreButton();
      return;
    }
  } else {
    const { data, error } = await db.from("sessions").update({
      organisation_name: sessionName,
      session_name: sessionName,
      start_date: startDate,
      end_date: endDate
    }).eq("id", editingSessionId).select().single();

    if (error) {
      console.error(error);
      setMessage("editor-error", "Could not update the session.");
      restoreButton();
      return;
    }

    savedSession = data;

    const existingQuestions = await db.from("session_questions")
      .select("id")
      .eq("session_id", editingSessionId);

    if (existingQuestions.error) {
      setMessage("editor-error", "Unable to verify existing questions.");
      restoreButton();
      return;
    }

    const { error: deleteError } = await db.from("session_questions")
      .delete()
      .eq("session_id", editingSessionId);

    if (deleteError) {
      setMessage("editor-error", "Unable to update the questions.");
      restoreButton();
      return;
    }

    const updatedRows = questions.map((question) => ({
      ...question,
      session_id: editingSessionId,
      is_default: false
    }));

    const { error: insertError } = await db.from("session_questions").insert(updatedRows);

    if (insertError) {
      console.error(insertError);
      setMessage("editor-error", "Unable to save the updated questions.");
      restoreButton();
      return;
    }
  }

  restoreButton();
  await loadSessions();

  if (savedSession) {
    await openAnalytics(savedSession);
  }
});

// =========================================================
// DELETE / CONFIRMATION MODAL
// =========================================================

function openModal(title, description, action) {
  $("modal-title").textContent = title;
  $("modal-description").textContent = description;
  modalAction = action;
  $("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  $("modal-overlay").classList.add("hidden");
  modalAction = null;
}

$("modal-close-button").addEventListener("click", closeModal);
$("modal-cancel-button").addEventListener("click", closeModal);

$("modal-confirm-button").addEventListener("click", async () => {
  if (!modalAction) return;

  const button = $("modal-confirm-button");
  button.disabled = true;
  button.textContent = "Please wait...";

  await modalAction();

  button.disabled = false;
  button.textContent = "Confirm";

  closeModal();
});

function confirmDeleteSession(session) {
  openModal(
    "Delete this session?",
    `This will permanently delete "${session.session_name}" and its associated survey records. This action cannot be undone.`,
    async () => {
      const { error } = await db.from("sessions").delete().eq("id", session.id);

      if (error) {
        alert("Unable to delete the session. Please check your permissions.");
        console.error(error);
        return;
      }

      await loadSessions();
    }
  );
}

// =========================================================
// QR CODE
// =========================================================

function buildParticipantUrl(sessionId) {
  const base = (config.PARTICIPANT_SITE_URL || "").trim();

  const url = base
    ? new URL(base)
    : new URL("../participant-site/index.html", window.location.href);

  url.searchParams.set("session", sessionId);
  return url.toString();
}

function openQrPage(session) {
  currentSession = session;

  showPage("qr-page", "QR Code");

  $("qr-session-name").textContent = session.session_name;
  $("room-code-display").textContent = session.room_code || "--------";

  const status = getSessionStatus(session);
  $("qr-session-status").textContent = status === "ongoing" ? "ONGOING" : "ENDED";

  participantUrl = buildParticipantUrl(session.id);

  const qrElement = $("large-qr-code");
  qrElement.replaceChildren();

  new QRCode(qrElement, {
    text: participantUrl,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.H
  });

  setMessage("qr-message", "");
  startCountdown(session);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function startCountdown(session) {
  stopCountdown();

  const countdownElement = $("qr-countdown");

  function updateCountdown() {
    if (!session.end_date) {
      countdownElement.textContent = "No end date available.";
      return;
    }

    const end = new Date(`${session.end_date}T23:59:59`);
    const difference = end.getTime() - Date.now();

    if (difference < 0) {
      countdownElement.textContent = "This session has ended.";
      return;
    }

    const days = Math.floor(difference / 86400000);
    const hours = Math.floor((difference / 3600000) % 24);
    const minutes = Math.floor((difference / 60000) % 60);
    const seconds = Math.floor((difference / 1000) % 60);

    countdownElement.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s remaining`;
  }

  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

$("qr-back-button").addEventListener("click", showDashboard);

$("copy-participant-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(participantUrl);
    setMessage("qr-message", "Survey link copied successfully.");
  } catch {
    setMessage("qr-message", "Copy was blocked. Please copy the link manually.");
  }
});

$("download-large-qr").addEventListener("click", () => {
  const qrElement = $("large-qr-code");
  const canvas = qrElement.querySelector("canvas");
  const image = qrElement.querySelector("img");

  const url = image?.src || canvas?.toDataURL("image/png");

  if (!url) {
    setMessage("qr-message", "The QR code is not ready yet.");
    return;
  }

  downloadDataUrl(url, "innopoll-qr-code.png");
});

function downloadDataUrl(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();
}

// =========================================================
// ANALYTICS
// =========================================================

async function openAnalytics(session) {
  currentSession = session;

  showPage("analytics-page", "Analytics");

  $("analytics-session-name").textContent = session.session_name;
  $("analytics-session-subtitle").textContent =
    `${formatDate(session.start_date)} – ${formatDate(session.end_date)}`;

  await loadAnalytics();
}

$("analytics-back-button").addEventListener("click", showDashboard);
$("refresh-analytics-button").addEventListener("click", loadAnalytics);

async function loadAnalytics() {
  if (!currentSession) return;

  const sessionId = currentSession.id;

  setMessage("analytics-message", "Loading analytics...");

  const [participantsResult, questionsResult] = await Promise.all([
    db.from("participants")
      .select("id, participant_code, started_at, completed_at")
      .eq("session_id", sessionId)
      .order("started_at", { ascending: true }),

    db.from("session_questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true })
  ]);

  if (participantsResult.error || questionsResult.error) {
    console.error(participantsResult.error || questionsResult.error);
    setMessage("analytics-message", "Unable to load analytics. Check your database permissions.");
    return;
  }

  if (!currentSession || currentSession.id !== sessionId) return;

  currentParticipants = participantsResult.data || [];
  currentQuestions = questionsResult.data || [];

  const completedParticipants = currentParticipants.filter(
    (participant) => participant.completed_at
  );

  $("analytics-total-participants").textContent = currentParticipants.length;
  $("analytics-completed-participants").textContent = completedParticipants.length;

  const completionRate = currentParticipants.length
    ? Math.round((completedParticipants.length / currentParticipants.length) * 100)
    : 0;

  $("analytics-completion-rate").textContent = `${completionRate}%`;

  if (!completedParticipants.length || !currentQuestions.length) {
    currentAnswers = [];

    renderAnalyticsCharts();
    renderResponseDistribution();

    setMessage(
      "analytics-message",
      "No completed surveys yet. Results will appear when participants submit their surveys."
    );

    return;
  }

  const participantIds = completedParticipants.map((participant) => participant.id);

  const { data: answers, error: answerError } = await db.from("participant_answers")
    .select("participant_id, question_id, score, answered_at")
    .in("participant_id", participantIds);

  if (answerError) {
    console.error(answerError);
    setMessage("analytics-message", "Unable to load participant answers.");
    return;
  }

  if (!currentSession || currentSession.id !== sessionId) return;

  currentAnswers = answers || [];

  renderAnalyticsCharts();
  renderResponseDistribution();

  setMessage(
    "analytics-message",
    `Results are based on ${completedParticipants.length} completed survey(s).`
  );
}

function getQuestionAnswers(questionId) {
  return currentAnswers.filter((answer) => answer.question_id === questionId);
}

function getCategorySummary(categoryKey) {
  const categoryQuestions = currentQuestions.filter(
    (question) => getCategoryKey(question.category) === categoryKey
  );

  const values = [];

  categoryQuestions.forEach((question) => {
    getQuestionAnswers(question.id).forEach((answer) => {
      const score = Number(answer.score);
      if (Number.isFinite(score)) values.push(score);
    });
  });

  if (!values.length) {
    return { score: null, count: 0 };
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    score: toPercentage(mean),
    count: values.length
  };
}

// =========================================================
// CHART CENTRE LABEL
// =========================================================

function updateChartCentre(scoreElement, score) {
  if (!scoreElement) return;

  if (score === null || score === undefined) {
    scoreElement.innerHTML = `<span class="score-number">—</span>`;
    return;
  }

  scoreElement.innerHTML = `
    <span class="score-number">${score}</span>
    <span class="score-percent">%</span>
  `;
}

// =========================================================
// RENDER DOUGHNUT CHARTS
// =========================================================

function renderAnalyticsCharts() {
  Object.entries(categorySettings).forEach(([key, settings]) => {
    const summary = getCategorySummary(key);
    const score = summary.score;

    updateChartCentre($(settings.score), score);

    const canvas = $(settings.chart);

    if (charts[key]) {
      charts[key].destroy();
    }

    const progress = score ?? 0;
    const remaining = 100 - progress;

    charts[key] = new Chart(canvas, {
      type: "doughnut",

      data: {
        labels: ["Readiness", "Remaining"],
        datasets: [{
          data: [progress, remaining],

          backgroundColor: [
            settings.colour,
            "#e8edf3"
          ],

          borderWidth: 0,
          borderColor: "transparent",
          borderRadius: [18, 0],
          borderSkipped: false,
          spacing: 0,
          hoverOffset: 0
        }]
      },

      options: {
        responsive: true,
        maintainAspectRatio: true,

        cutout: "76%",
        rotation: -90,

        plugins: {
          legend: {
            display: false
          },

          tooltip: {
            enabled: false
          }
        },

        animation: {
          animateRotate: true,
          duration: 800
        },

        events: []
      }
    });
  });
}

// =========================================================
// RESPONSE DISTRIBUTION
// =========================================================

function renderResponseDistribution() {
  const container = $("response-distribution");

  if (!currentQuestions.length) {
    container.innerHTML =
      `<p class="muted">No questions are available for this session.</p>`;
    return;
  }

  container.innerHTML = currentQuestions.map((question) => {
    const answers = getQuestionAnswers(question.id);

    const distribution = [1, 2, 3, 4, 5].map((score) =>
      answers.filter((answer) => Number(answer.score) === score).length
    );

    const total = answers.length;

    return `
      <article class="distribution-item">
        <h4>${escapeHTML(question.title || question.category)}: ${escapeHTML(question.question_text)}</h4>

        <div class="distribution-bars">
          ${distribution.map((count, index) => {
            const percentage = total
              ? Math.round((count / total) * 100)
              : 0;

            const labels = [
              "Strongly disagree",
              "Disagree",
              "Neutral",
              "Agree",
              "Strongly agree"
            ];

            return `
              <div class="distribution-row">
                <span>${index + 1} - ${labels[index]}</span>
                <div class="distribution-track">
                  <div class="distribution-fill" style="width:${percentage}%"></div>
                </div>
                <span class="distribution-value">${count}</span>
              </div>`;
          }).join("")}
        </div>

        <p class="muted small-text">${total} response(s)</p>
      </article>`;
  }).join("");
}

// =========================================================
// CHART IMAGE GENERATION
// =========================================================

function createChartExportCanvas(key) {
  const settings = categorySettings[key];
  if (!settings) return null;

  const scoreText = $(settings.score)?.textContent || "—";
  const scoreMatch = scoreText.match(/\d+/);

  const score = scoreMatch
    ? Math.max(0, Math.min(100, Number(scoreMatch[0])))
    : null;

  const exportCanvas = document.createElement("canvas");
  const context = exportCanvas.getContext("2d");

  // High-resolution export dimensions.
  exportCanvas.width = 960;
  exportCanvas.height = 880;

  const centreX = 480;
  const centreY = 365;

  const radius = 270;
  const lineWidth = 36;

  // Keep the outside of the chart transparent.
  context.clearRect(0, 0, exportCanvas.width, exportCanvas.height);

  // -------------------------------------------------------
  // WHITE CIRCULAR CHART BACKGROUND
  // -------------------------------------------------------

  context.save();

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(centreX, centreY, 310, 0, Math.PI * 2);
  context.fill();

  context.restore();

  // -------------------------------------------------------
  // LIGHT GREY BACKGROUND TRACK
  // -------------------------------------------------------

  context.save();

  context.lineWidth = lineWidth;
  context.lineCap = "butt";
  context.strokeStyle = "#e8edf3";

  context.beginPath();
  context.arc(centreX, centreY, radius, 0, Math.PI * 2);
  context.stroke();

  context.restore();

  // -------------------------------------------------------
  // COLOURED PROGRESS ARC WITH ROUNDED CAPS
  // -------------------------------------------------------

  if (score !== null && score > 0) {
    context.save();

    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.strokeStyle = settings.colour;

    const startAngle = -Math.PI / 2;
    const progressAngle = Math.PI * 2 * (score / 100);
    const endAngle = startAngle + progressAngle;

    context.beginPath();
    context.arc(centreX, centreY, radius, startAngle, endAngle);
    context.stroke();

    context.restore();
  }

  // -------------------------------------------------------
  // WHITE INNER CIRCLE
  // -------------------------------------------------------

  context.save();

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(
    centreX,
    centreY,
    radius - lineWidth / 2 - 3,
    0,
    Math.PI * 2
  );
  context.fill();

  context.restore();

  // -------------------------------------------------------
  // CENTRE SCORE
  // -------------------------------------------------------

  const numberText = score === null ? "—" : String(score);

  context.save();

  context.textBaseline = "middle";
  context.textAlign = "left";

  context.fillStyle = settings.colour;
  context.font = "800 180px Inter, Arial, sans-serif";

  const numberWidth = context.measureText(numberText).width;

  let percentWidth = 0;

  if (score !== null) {
    context.font = "500 65px Inter, Arial, sans-serif";
    percentWidth = context.measureText("%").width;
  }

  const percentSpacing = score === null ? 0 : 12;
  const combinedWidth = numberWidth + percentWidth + percentSpacing;

  const startX = centreX - combinedWidth / 2;

  context.font = "800 180px Inter, Arial, sans-serif";
  context.fillStyle = settings.colour;
  context.fillText(numberText, startX, centreY + 5);

  if (score !== null) {
    context.font = "500 65px Inter, Arial, sans-serif";
    context.fillStyle = "#8b929d";

    context.fillText(
      "%",
      startX + numberWidth + percentSpacing,
      centreY + 28
    );
  }

  context.restore();

  // -------------------------------------------------------
  // CATEGORY GRADIENT PILL
  // -------------------------------------------------------

  const pillText = settings.label.toUpperCase();

  context.save();

  context.font = "800 34px Inter, Arial, sans-serif";

  const pillWidth = Math.max(
    250,
    context.measureText(pillText).width + 90
  );

  const pillHeight = 74;
  const pillX = centreX - pillWidth / 2;
  const pillY = 735;

  const gradient = context.createLinearGradient(
    pillX,
    pillY,
    pillX + pillWidth,
    pillY
  );

  gradient.addColorStop(0, settings.gradientStart);
  gradient.addColorStop(1, settings.gradientEnd);

  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(
    pillX,
    pillY,
    pillWidth,
    pillHeight,
    40
  );
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = "800 34px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    pillText,
    centreX,
    pillY + pillHeight / 2
  );

  context.restore();

  // -------------------------------------------------------
  // AVERAGE SCORE LABEL
  // -------------------------------------------------------

  context.save();

  context.fillStyle = "#94a3b8";
  context.font = "500 30px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  context.fillText(
    "Average score",
    centreX,
    842
  );

  context.restore();

  return exportCanvas;
}

// =========================================================
// COPY INDIVIDUAL CHART AS AN IMAGE
// =========================================================

async function copyChart(key) {
  const canvas = createChartExportCanvas(key);

  if (!canvas) return;

  if (!navigator.clipboard || !window.ClipboardItem) {
    setMessage(
      "analytics-message",
      "Your browser does not support copying chart images. Please use Export as PNG instead."
    );
    return;
  }

  try {
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });

    if (!blob) {
      throw new Error("Unable to create chart image.");
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob
      })
    ]);

    setMessage(
      "analytics-message",
      `${categorySettings[key].label} chart copied as an image.`
    );
  } catch (error) {
    console.error("Unable to copy chart image:", error);

    setMessage(
      "analytics-message",
      "Unable to copy the chart image. Please use Export as PNG instead."
    );
  }
}

document.querySelectorAll(".copy-chart").forEach((button) => {
  button.addEventListener("click", async () => {
    await copyChart(button.dataset.chart);
  });
});

// =========================================================
// EXPORT INDIVIDUAL CHART AS PNG
// =========================================================

async function exportChart(key) {
  const canvas = createChartExportCanvas(key);

  if (!canvas) return;

  downloadDataUrl(
    canvas.toDataURL("image/png"),
    `innopoll-${key}-readiness.png`
  );
}

document.querySelectorAll(".export-chart").forEach((button) => {
  button.addEventListener("click", async () => {
    await exportChart(button.dataset.chart);
  });
});

// =========================================================
// EXPORT ALL CHARTS
// =========================================================

$("export-all-button").addEventListener("click", async () => {
  const keys = Object.keys(categorySettings);

  for (const key of keys) {
    await exportChart(key);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
});

// =========================================================
// PARTICIPANT RECORDS
// =========================================================

async function openParticipants(session) {
  currentSession = session;

  showPage("participants-page", "Participants");

  $("participants-session-subtitle").textContent =
    `${session.session_name} · ${formatDate(session.start_date)} – ${formatDate(session.end_date)}`;

  await loadParticipants();
}

$("participants-back-button").addEventListener("click", showDashboard);

$("view-participants-button").addEventListener("click", async () => {
  if (currentSession) {
    await openParticipants(currentSession);
  }
});

$("analytics-qr-button").addEventListener("click", () => {
  if (currentSession) {
    openQrPage(currentSession);
  }
});

async function loadParticipants() {
  if (!currentSession) return;

  const sessionId = currentSession.id;

  setMessage("participants-message", "Loading participants...");

  const { data, error } = await db.from("participants")
    .select("id, participant_code, started_at, completed_at")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: false });

  if (error) {
    console.error(error);
    setMessage("participants-message", "Unable to load participant records.");
    return;
  }

  if (!currentSession || currentSession.id !== sessionId) return;

  const participants = data || [];
  const participantIds = participants.map((participant) => participant.id);
  const answerCounts = {};

  if (participantIds.length) {
    const { data: answers, error: answerError } = await db.from("participant_answers")
      .select("participant_id")
      .in("participant_id", participantIds);

    if (answerError) {
      console.error(answerError);
      setMessage("participants-message", "Unable to load answer counts.");
      return;
    }

    (answers || []).forEach((answer) => {
      answerCounts[answer.participant_id] =
        (answerCounts[answer.participant_id] || 0) + 1;
    });
  }

  currentParticipants = participants;
  currentParticipantAnswerCounts = answerCounts;

  const completed = participants.filter((item) => item.completed_at).length;

  $("participant-total").textContent = participants.length;
  $("participant-completed").textContent = completed;
  $("participant-in-progress").textContent = participants.length - completed;

  renderParticipants(participants, answerCounts);
}

function renderParticipants(participants, answerCounts = {}) {
  const search = $("participant-search").value.trim().toLowerCase();
  const filter = $("participant-filter").value;

  const filtered = participants.filter((participant) => {
    const isCompleted = Boolean(participant.completed_at);

    const matchesSearch =
      (participant.participant_code || "").toLowerCase().includes(search);

    const matchesFilter = filter === "all" ||
      (filter === "completed" && isCompleted) ||
      (filter === "progress" && !isCompleted);

    return matchesSearch && matchesFilter;
  });

  if (!filtered.length) {
    $("participants-table-body").innerHTML =
      `<tr><td colspan="5" class="empty-table">No participant records found.</td></tr>`;

    setMessage("participants-message", "");
    return;
  }

  $("participants-table-body").innerHTML = filtered.map((participant) => {
    const completed = Boolean(participant.completed_at);

    return `
      <tr>
        <td><span class="participant-code">${escapeHTML(participant.participant_code || "—")}</span></td>
        <td>${escapeHTML(formatDateTime(participant.started_at))}</td>
        <td>${escapeHTML(formatDateTime(participant.completed_at))}</td>
        <td><span class="participant-status ${completed ? "completed" : ""}">${completed ? "Completed" : "In Progress"}</span></td>
        <td>${answerCounts[participant.id] || 0}</td>
      </tr>`;
  }).join("");

  setMessage(
    "participants-message",
    `${filtered.length} participant record(s) found.`
  );
}

$("refresh-participants-button").addEventListener("click", loadParticipants);

$("participant-search").addEventListener("input", () => {
  renderParticipants(currentParticipants, currentParticipantAnswerCounts);
});

$("participant-filter").addEventListener("change", () => {
  renderParticipants(currentParticipants, currentParticipantAnswerCounts);
});

// =========================================================
// SESSION CLOSE / REOPEN
// =========================================================

async function toggleSessionStatus(session) {
  const nextState = !session.is_active;

  const { data, error } = await db.from("sessions")
    .update({ is_active: nextState })
    .eq("id", session.id)
    .select()
    .single();

  if (error) {
    alert("Unable to update the session status.");
    console.error(error);
    return;
  }

  currentSession = data;

  await loadSessions();

  if ($("analytics-page") && !$("analytics-page").classList.contains("hidden")) {
    await openAnalytics(data);
  }
}

// =========================================================
// INITIALISE
// =========================================================

(async function initialise() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    showLogin();
    return;
  }

  if (data.session?.user) {
    showApp(data.session.user);
  } else {
    showLogin();
  }
})();
