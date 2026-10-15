
/* FILE: facilitator/facilitator.js */

const { createClient } = window.supabase;
const config = window.INNOPOLL_CONFIG;

const db = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY
);

const loginPanel = document.getElementById("login-panel");
const dashboardPanel = document.getElementById("dashboard-panel");
const signOutButton = document.getElementById("sign-out-button");
const sessionsList = document.getElementById("sessions-list");
const sessionDetail = document.getElementById("session-detail");

let currentSession = null;
let currentResponses = [];
let realtimeChannel = null;
let charts = {};

const categoryInfo = {
  culture: {
    field: "culture_score",
    canvas: "culture-chart",
    score: "culture-score",
    label: "Culture"
  },
  practices: {
    field: "practices_score",
    canvas: "practices-chart",
    score: "practices-score",
    label: "Practices"
  },
  leadership: {
    field: "leadership_score",
    canvas: "leadership-chart",
    score: "leadership-score",
    label: "Leadership"
  }
};

// Convert the mean response from a 1–5 scale to 0–100.
// 1 = 0, 2 = 25, 3 = 50, 4 = 75, 5 = 100.
function toPercentage(mean) {
  return Math.round(((mean - 1) / 4) * 100);
}

function setMessage(id, message) {
  document.getElementById(id).textContent = message || "";
}

function showLogin() {
  loginPanel.classList.remove("hidden");
  dashboardPanel.classList.add("hidden");
  signOutButton.classList.add("hidden");
  document.getElementById("signed-in-label").textContent = "";
}

function showDashboard(user) {
  loginPanel.classList.add("hidden");
  dashboardPanel.classList.remove("hidden");
  signOutButton.classList.remove("hidden");
  document.getElementById("signed-in-label").textContent = user.email || "";
  loadSessions();
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("login-error", "");

  const button = document.getElementById("login-button");
  button.disabled = true;
  button.textContent = "Signing in…";

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  button.disabled = false;
  button.textContent = "Sign in";

  if (error) {
    setMessage("login-error", "Sign-in failed. Check your email and password.");
    return;
  }

  showDashboard(data.user);
});

signOutButton.addEventListener("click", async () => {
  await stopRealtime();
  await db.auth.signOut();
  currentSession = null;
  currentResponses = [];
  sessionDetail.classList.add("hidden");
  showLogin();
});

db.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    showDashboard(session.user);
  } else {
    showLogin();
  }
});

async function getUser() {
  const { data } = await db.auth.getUser();
  return data.user;
}

async function loadSessions() {
  const user = await getUser();

  if (!user) {
    showLogin();
    return;
  }

  setMessage("sessions-message", "Loading sessions…");
  sessionsList.replaceChildren();

  const { data, error } = await db
    .from("sessions")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    setMessage("sessions-message", "Unable to load sessions. Please refresh.");
    return;
  }

  if (!data.length) {
    setMessage("sessions-message", "You haven't created any sessions yet.");
    return;
  }

  setMessage("sessions-message", "");

  data.forEach((session) => {
    const card = document.createElement("article");
    card.className = "session-list-card";

    const info = document.createElement("div");
    info.className = "session-list-info";

    const title = document.createElement("h3");
    title.textContent = session.session_name;

    const organisation = document.createElement("p");
    organisation.className = "muted small-text";
    organisation.textContent = session.organisation_name;

    const status = document.createElement("span");
    status.className = session.is_active ? "status-pill active" : "status-pill";
    status.textContent = session.is_active ? "Active" : "Closed";

    info.append(title, organisation, status);

    const openButton = document.createElement("button");
    openButton.className = "secondary-button";
    openButton.textContent = "View results";
    openButton.addEventListener("click", () => openSession(session));

    card.append(info, openButton);
    sessionsList.appendChild(card);
  });
}

document.getElementById("refresh-button").addEventListener("click", loadSessions);

document.getElementById("create-session-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("create-error", "");

  const user = await getUser();

  if (!user) {
    showLogin();
    return;
  }

  const button = document.getElementById("create-button");
  button.disabled = true;
  button.textContent = "Creating…";

  const organisationName =
    document.getElementById("organisation-name").value.trim();
  const sessionName =
    document.getElementById("session-name").value.trim();

  const { data, error } = await db
    .from("sessions")
    .insert({
      organisation_name: organisationName,
      session_name: sessionName,
      created_by: user.id
    })
    .select()
    .single();

  button.disabled = false;
  button.textContent = "Create session";

  if (error) {
    setMessage("create-error", "Could not create the session. Please try again.");
    return;
  }

  document.getElementById("create-session-form").reset();
  await loadSessions();
  await openSession(data);
});

function buildParticipantUrl(sessionId) {
  const base = (config.PARTICIPANT_SITE_URL || "").trim();

  if (base) {
    const url = new URL(base);
    url.searchParams.set("session", sessionId);
    return url.toString();
  }

  // Useful when testing both pages locally in one folder structure.
  const localUrl = new URL("../participant/participant.html", window.location.href);
  localUrl.searchParams.set("session", sessionId);
  return localUrl.toString();
}

async function stopRealtime() {
  if (realtimeChannel) {
    await db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

async function openSession(session) {
  await stopRealtime();

  currentSession = session;
  currentResponses = [];

  sessionDetail.classList.remove("hidden");
  document.getElementById("detail-session-title").textContent =
    session.session_name;
  document.getElementById("detail-session-subtitle").textContent =
    session.organisation_name;

  const participantUrl = buildParticipantUrl(session.id);
  document.getElementById("participant-url").textContent = participantUrl;

  const qrElement = document.getElementById("qr-code");
  qrElement.replaceChildren();

  new QRCode(qrElement, {
    text: participantUrl,
    width: 200,
    height: 200,
    correctLevel: QRCode.CorrectLevel.H
  });

  document.getElementById("toggle-session-button").textContent =
    session.is_active ? "Close session" : "Reopen session";
  document.getElementById("toggle-session-button").disabled = false;

  await loadResponses();

  // Realtime requires the responses table to be included in the
  // Supabase Realtime publication and SELECT policies to permit access.
  realtimeChannel = db
    .channel(`responses-for-${session.id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "responses",
        filter: `session_id=eq.${session.id}`
      },
      () => loadResponses()
    )
    .subscribe();

  sessionDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("close-detail-button").addEventListener("click", async () => {
  await stopRealtime();
  sessionDetail.classList.add("hidden");
  currentSession = null;
  await loadSessions();
});

async function loadResponses() {
  if (!currentSession) return;

  const sessionId = currentSession.id;

  const { data, error } = await db
    .from("responses")
    .select("culture_score, practices_score, leadership_score, submitted_at")
    .eq("session_id", sessionId)
    .order("submitted_at", { ascending: true });

  if (error) {
    setMessage("results-message", "Unable to load results. Check your access policies.");
    return;
  }

  // Ignore a late response if the facilitator has switched sessions.
  if (!currentSession || currentSession.id !== sessionId) return;

  currentResponses = data || [];
  document.getElementById("response-count").textContent =
    String(currentResponses.length);

  renderCharts();
  setMessage(
    "results-message",
    currentResponses.length
      ? "Results reflect the average score of submitted responses."
      : "No responses yet. Results will appear after participants submit the survey."
  );
}

function renderCharts() {
  Object.entries(categoryInfo).forEach(([key, info]) => {
    const values = currentResponses
      .map((response) => Number(response[info.field]))
      .filter((value) => Number.isFinite(value));

    const mean = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

    const score = mean === null ? null : toPercentage(mean);
    const scoreLabel = score === null ? "— / 100" : `${score} / 100`;

    document.getElementById(info.score).textContent = scoreLabel;

    const canvas = document.getElementById(info.canvas);
    const existing = charts[key];

    if (existing) existing.destroy();

    charts[key] = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Score", "Remaining"],
        datasets: [{
          data: [score ?? 0, 100 - (score ?? 0)],
          backgroundColor: ["#334155", "#e9edf2"],
          borderWidth: 0,
          hoverOffset: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "76%",
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  });
}

document.getElementById("copy-link-button").addEventListener("click", async () => {
  const url = document.getElementById("participant-url").textContent;

  try {
    await navigator.clipboard.writeText(url);
    setMessage("results-message", "Survey link copied.");
  } catch {
    setMessage("results-message", "Copy was blocked by the browser. Select and copy the link above.");
  }
});

document.getElementById("download-qr-button").addEventListener("click", () => {
  const qrElement = document.getElementById("qr-code");
  const image = qrElement.querySelector("img");
  const canvas = qrElement.querySelector("canvas");
  const url = image?.src || canvas?.toDataURL("image/png");

  if (!url) {
    setMessage("results-message", "The QR code is not ready yet.");
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

async function exportChart(key) {
  const chart = charts[key];

  if (!chart) return;

  const link = document.createElement("a");
  link.href = chart.toBase64Image("image/png", 1);
  link.download = `innopoll-${key}-chart.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

document.querySelectorAll(".export-chart").forEach((button) => {
  button.addEventListener("click", () => {
    exportChart(button.dataset.chart);
  });
});

document.getElementById("export-all-button").addEventListener("click", async () => {
  for (const key of Object.keys(categoryInfo)) {
    await exportChart(key);
    // Small pause helps browsers handle multiple file downloads.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
});

document.getElementById("toggle-session-button").addEventListener("click", async () => {
  if (!currentSession) return;

  const button = document.getElementById("toggle-session-button");
  const nextState = !currentSession.is_active;

  button.disabled = true;

  const { data, error } = await db
    .from("sessions")
    .update({ is_active: nextState })
    .eq("id", currentSession.id)
    .select()
    .single();

  button.disabled = false;

  if (error) {
    setMessage("results-message", "Could not update the session status.");
    return;
  }

  currentSession = data;
  document.getElementById("toggle-session-button").textContent =
    data.is_active ? "Close session" : "Reopen session";

  setMessage(
    "results-message",
    data.is_active
      ? "Session reopened. Participants can submit responses again."
      : "Session closed. New responses will no longer be accepted."
  );

  await loadSessions();
});

(async function initialise() {
  const { data } = await db.auth.getSession();

  if (data.session?.user) {
    showDashboard(data.session.user);
  } else {
    showLogin();
  }
})();
