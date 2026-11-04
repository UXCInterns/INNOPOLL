
/* ============================================================
   FILE: participant-site/participant.js
   INNOPOLL - Dynamic Participant Survey
   ============================================================ */

const { createClient } = window.supabase;
const config = window.INNOPOLL_CONFIG;

const supabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY
);

/* ============================================================
   CONFIGURATION
   ============================================================ */

const scale = [
  { value: 5, label: "Strongly Agree" },
  { value: 4, label: "Agree" },
  { value: 3, label: "Neutral" },
  { value: 2, label: "Disagree" },
  { value: 1, label: "Strongly Disagree" }
];

let currentQuestion = 0;
let sessionId = null;
let browserToken = null;
let participantId = null;
let participantCode = null;
let isCompleted = false;

let questions = [];
const answers = {};

/* ============================================================
   HTML ELEMENTS
   ============================================================ */

const welcomeScreen = document.getElementById("welcome-screen");

const descriptionScreen = document.getElementById(
  "category-description-screen"
);

const questionScreen = document.getElementById("question-screen");

const successScreen = document.getElementById("success-screen");

const resultsScreen = document.getElementById("results-screen");

const allScreens = [
  welcomeScreen,
  descriptionScreen,
  questionScreen,
  successScreen,
  resultsScreen
];

/* ============================================================
   SCREEN MANAGEMENT
   ============================================================ */

function showScreen(screen) {
  allScreens.forEach((item) => item.classList.add("hidden"));

  screen.classList.remove("hidden");

  const isResultsPage = screen === resultsScreen;

  document.body.classList.toggle("results-active", isResultsPage);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ============================================================
   SESSION AND BROWSER TOKEN
   ============================================================ */

function getSessionIdFromUrl() {
  return new URLSearchParams(window.location.search).get("session");
}

function generateBrowserToken() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  if (window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(16);

    window.crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20)
    ].join("-");
  }

  throw new Error(
    "Your browser does not support secure participant identification."
  );
}

function getBrowserToken(id) {
  const storageKey = `innopoll_browser_token_${id}`;

  let token = localStorage.getItem(storageKey);

  if (!token) {
    token = generateBrowserToken();
    localStorage.setItem(storageKey, token);
  }

  return token;
}

/* ============================================================
   LOAD QUESTIONS FROM SUPABASE
   ============================================================ */

async function loadQuestions() {
  const { data, error } = await supabaseClient
    .from("session_questions")
    .select(
      "id, category, title, question_text, definition, statements, sort_order"
    )
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Unable to load questions:", error);
    throw new Error("Unable to load the survey questions.");
  }

  if (!data || data.length === 0) {
    throw new Error(
      "This survey does not have any questions yet. Please contact your facilitator."
    );
  }

  questions = data;
}

/* ============================================================
   START OR RESUME PARTICIPANT
   ============================================================ */

async function startOrResumeParticipant() {
  const { data, error } = await supabaseClient.rpc(
    "start_or_resume_participant",
    {
      p_session_id: sessionId,
      p_browser_token: browserToken
    }
  );

  if (error) {
    console.error("Unable to start or resume participant:", error);

    throw new Error(
      error.message ||
      "Unable to join this survey. Please try again."
    );
  }

  const participant = Array.isArray(data) ? data[0] : data;

  if (!participant || !participant.participant_id) {
    throw new Error("Unable to retrieve your participant record.");
  }

  participantId = participant.participant_id;
  participantCode = participant.participant_code;

  isCompleted = Boolean(participant.completed_at);
}

/* ============================================================
   RESTORE SAVED ANSWERS
   ============================================================ */

async function loadSavedAnswers() {
  const { data, error } = await supabaseClient.rpc(
    "get_participant_answers",
    {
      p_participant_id: participantId,
      p_browser_token: browserToken
    }
  );

  if (error) {
    console.error("Unable to retrieve saved answers:", error);

    throw new Error(
      "Unable to restore your previous answers. Please try again."
    );
  }

  Object.keys(answers).forEach((key) => {
    delete answers[key];
  });

  (data || []).forEach((answer) => {
    answers[answer.question_id] = Number(answer.score);
  });

  // Resume at the first unanswered question.
  const firstUnanswered = questions.findIndex(
    (question) => answers[question.id] === undefined
  );

  if (firstUnanswered === -1) {
    currentQuestion = Math.max(0, questions.length - 1);
  } else {
    currentQuestion = firstUnanswered;
  }
}

/* ============================================================
   CATEGORY INTRODUCTION
   ============================================================ */

function renderCategoryDescription() {
  const item = questions[currentQuestion];

  document.getElementById("category-description-title").textContent =
    "INNOPOLL";

  document.getElementById("category-description-text").textContent =
    item.definition || item.question_text || "";
}

/* ============================================================
   QUESTION STATEMENTS
   ============================================================ */

function renderStatements(item) {
  const questionText = document.getElementById("question-text");

  const previousStatements = document.getElementById(
    "question-statements"
  );

  if (previousStatements) {
    previousStatements.remove();
  }

  const statements = Array.isArray(item.statements)
    ? item.statements
    : [];

  if (statements.length === 0) {
    return;
  }

  const container = document.createElement("div");
  container.id = "question-statements";
  container.className = "question-statements";

  const heading = document.createElement("p");
  heading.textContent = "Consider the following:";
  heading.className = "statements-heading";

  const list = document.createElement("ul");

  statements.forEach((statement) => {
    let text = "";

    if (typeof statement === "string") {
      text = statement;
    } else if (statement && typeof statement === "object") {
      text = statement.text || statement.statement || "";
    }

    if (!text) {
      return;
    }

    const listItem = document.createElement("li");
    listItem.textContent = text;
    list.appendChild(listItem);
  });

  if (list.children.length === 0) {
    return;
  }

  container.append(heading, list);

  questionText.insertAdjacentElement("afterend", container);
}

/* ============================================================
   RENDER QUESTION
   ============================================================ */

function renderQuestion() {
  const item = questions[currentQuestion];

  document.getElementById("progress-label").textContent =
    `${currentQuestion + 1} of ${questions.length}`;

  document.getElementById("progress-fill").style.width =
    `${((currentQuestion + 1) / questions.length) * 100}%`;

  document.getElementById("question-text").textContent =
    item.question_text;

  document.getElementById("question-definition").textContent =
    item.definition || "No additional definition provided.";

  document.querySelector(".definition-dropdown").open = false;

  renderStatements(item);

  const optionsContainer = document.getElementById("answer-options");

  optionsContainer.replaceChildren();

  scale.forEach((option) => {
    const label = document.createElement("label");
    label.className = "answer-option";

    const input = document.createElement("input");

    input.type = "radio";
    input.name = "answer";
    input.value = String(option.value);
    input.required = true;
    input.checked = answers[item.id] === option.value;

    const text = document.createElement("span");
    text.textContent = option.label;

    label.append(input, text);

    optionsContainer.appendChild(label);
  });

  document.getElementById("answer-error").textContent = "";

  const nextButton = document.getElementById("next-button");

  const isLastQuestion = currentQuestion === questions.length - 1;

  nextButton.textContent = isLastQuestion ? "Submit" : "Next";
}

/* ============================================================
   SAVE ANSWER
   ============================================================ */

async function saveAnswer(questionId, score) {
  const { error } = await supabaseClient.rpc(
    "save_participant_answer",
    {
      p_participant_id: participantId,
      p_browser_token: browserToken,
      p_question_id: questionId,
      p_score: score
    }
  );

  if (error) {
    console.error("Unable to save answer:", error);

    throw new Error(
      error.message ||
      "Unable to save your answer. Please try again."
    );
  }

  answers[questionId] = score;
}

/* ============================================================
   COMPLETE SURVEY
   ============================================================ */

async function completeSurvey() {
  const { data, error } = await supabaseClient.rpc(
    "complete_participant",
    {
      p_participant_id: participantId,
      p_browser_token: browserToken
    }
  );

  if (error) {
    console.error("Unable to complete survey:", error);

    throw new Error(
      error.message ||
      "Unable to submit your survey. Please try again."
    );
  }

  isCompleted = true;

  return data;
}

/* ============================================================
   JOIN SURVEY
   ============================================================ */

document.getElementById("join-button").addEventListener(
  "click",
  async () => {
    const error = document.getElementById("welcome-error");
    const button = document.getElementById("join-button");

    error.textContent = "";

    sessionId = getSessionIdFromUrl();

    if (!sessionId) {
      error.textContent =
        "Please open the survey using the QR code or link provided by your facilitator.";

      return;
    }

    button.disabled = true;
    button.textContent = "Checking survey...";

    try {
      browserToken = getBrowserToken(sessionId);

      await startOrResumeParticipant();

      await loadQuestions();

      await loadSavedAnswers();

      if (isCompleted) {
        document.querySelector(".success-message").textContent =
          "You have already completed this survey.";

        showScreen(successScreen);
        return;
      }

      document.querySelector(".success-message").textContent =
        "Response submitted successfully";

      renderCategoryDescription();

      showScreen(descriptionScreen);
    } catch (err) {
      console.error("Unable to join survey:", err);

      error.textContent =
        err.message || "Something went wrong. Please try again.";
    } finally {
      button.disabled = false;
      button.textContent = "Start Survey";
    }
  }
);

/* ============================================================
   CONTINUE TO QUESTION
   ============================================================ */

document
  .getElementById("description-next-button")
  .addEventListener("click", () => {
    renderQuestion();
    showScreen(questionScreen);
  });

/* ============================================================
   ANSWER AND SUBMIT
   ============================================================ */

document
  .getElementById("answer-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const selected = document.querySelector(
      'input[name="answer"]:checked'
    );

    const error = document.getElementById("answer-error");
    const button = document.getElementById("next-button");

    if (!selected) {
      error.textContent = "Please select an answer to continue.";
      return;
    }

    const question = questions[currentQuestion];
    const score = Number(selected.value);

    button.disabled = true;
    button.textContent = "Saving...";
    error.textContent = "";

    try {
      // Save each answer immediately.
      await saveAnswer(question.id, score);

      if (currentQuestion < questions.length - 1) {
        currentQuestion += 1;

        renderCategoryDescription();
        showScreen(descriptionScreen);

        return;
      }

      // Complete the survey after the final answer is saved.
      button.textContent = "Submitting...";

      await completeSurvey();

      document.querySelector(".success-message").textContent =
        "Response submitted successfully";

      showScreen(successScreen);
    } catch (err) {
      console.error("Survey submission failed:", err);

      error.textContent =
        err.message || "Something went wrong. Please try again.";
    } finally {
      button.disabled = false;

      button.textContent =
        currentQuestion === questions.length - 1
          ? "Submit"
          : "Next";
    }
  });

/* ============================================================
   RESULTS: SCORE CALCULATIONS
   ============================================================ */

function scoreToPercentage(score) {
  return ((Number(score) - 1) / 4) * 100;
}

/* ============================================================
   RESULTS: CHART
   ============================================================ */

function createResultChart(personalScore) {
  const size = 160;
  const center = size / 2;
  const radius = 55;
  const circumference = 2 * Math.PI * radius;

  const percentage = scoreToPercentage(personalScore);

  const svgNamespace = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(svgNamespace, "svg");

  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "result-chart");
  svg.setAttribute("role", "img");

  svg.setAttribute(
    "aria-label",
    `Your score ${Math.round(percentage)} percent.`
  );

  function makeCircle(className, value) {
    const circle = document.createElementNS(svgNamespace, "circle");

    circle.setAttribute("cx", center);
    circle.setAttribute("cy", center);
    circle.setAttribute("r", radius);
    circle.setAttribute("class", className);
    circle.setAttribute("stroke-dasharray", circumference);

    circle.setAttribute(
      "stroke-dashoffset",
      circumference * (1 - value / 100)
    );

    return circle;
  }

  svg.appendChild(makeCircle("chart-track personal-track", 100));

  svg.appendChild(makeCircle("chart-value personal-value", percentage));

  const wrapper = document.createElement("div");
  wrapper.className = "result-chart-wrapper";

  const centreText = document.createElement("div");
  centreText.className = "chart-centre-text";

  const percentageText = document.createElement("span");
  percentageText.className = "chart-percentage";
  percentageText.textContent = `${Math.round(percentage)}%`;

  const scoreLabel = document.createElement("span");
  scoreLabel.className = "chart-score-label";
  scoreLabel.textContent = "Your Score";

  centreText.append(percentageText, scoreLabel);

  wrapper.append(svg, centreText);

  return wrapper;
}

/* ============================================================
   RESULTS: LEGEND
   ============================================================ */

function createLegendRow(label, percentage, dotClass) {
  const row = document.createElement("div");
  row.className = "result-legend-row";

  const labelGroup = document.createElement("div");
  labelGroup.className = "result-legend-label";

  const dot = document.createElement("span");
  dot.className = `legend-dot ${dotClass}`;

  const labelText = document.createElement("span");
  labelText.textContent = label;

  labelGroup.append(dot, labelText);

  const value = document.createElement("strong");
  value.className = "result-legend-value";

  value.textContent =
    percentage === null || percentage === undefined
      ? "-"
      : `${Math.round(percentage)}%`;

  row.append(labelGroup, value);

  return row;
}

/* ============================================================
   DISPLAY PERSONAL RESULTS
   ============================================================ */

async function renderPersonalResults() {
  const resultsContainer = document.getElementById("results-content");

  const viewResultsButton = document.getElementById(
    "view-results-button"
  );

  resultsContainer.replaceChildren();

  viewResultsButton.disabled = true;
  viewResultsButton.textContent = "Loading results...";

  try {
    // Refresh answers from Supabase before displaying results.
    await loadSavedAnswers();

    questions.forEach((item) => {
      const personalScore = answers[item.id];

      const card = document.createElement("article");
      card.className = "category-result-card";

      const heading = document.createElement("h2");
      heading.className = "category-result-title";

      heading.textContent = (
        item.title || item.category || "Question"
      ).toUpperCase();

      card.appendChild(heading);

      if (personalScore === undefined) {
        const missing = document.createElement("p");
        missing.textContent = "No saved answer is available.";
        card.appendChild(missing);

        resultsContainer.appendChild(card);
        return;
      }

      const personalPercentage = scoreToPercentage(personalScore);

      const chart = createResultChart(personalScore);

      const legend = document.createElement("div");
      legend.className = "result-legend";

      legend.append(
        createLegendRow(
          "Your Result",
          personalPercentage,
          "your-result-dot"
        ),
        createLegendRow(
          "Session Average",
          null,
          "session-average-dot"
        )
      );

      card.append(chart, legend);

      resultsContainer.appendChild(card);
    });
  } catch (err) {
    console.error("Unable to render results:", err);

    const errorMessage = document.createElement("p");
    errorMessage.className = "results-error";

    errorMessage.textContent =
      "Your response was submitted, but your results could not be loaded. Please try again later.";

    resultsContainer.appendChild(errorMessage);
  } finally {
    viewResultsButton.disabled = false;
    viewResultsButton.textContent = "View Results";
  }
}

/* ============================================================
   VIEW RESULTS BUTTON
   ============================================================ */

document
  .getElementById("view-results-button")
  .addEventListener("click", async () => {
    showScreen(resultsScreen);

    await renderPersonalResults();
  });

/* ============================================================
   END OF PARTICIPANT.JS
   ============================================================ */
