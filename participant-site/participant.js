/* FILE: participant.js */

const { createClient } = window.supabase;
const config = window.INNOPOLL_CONFIG;

const supabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY
);

const questions = [
  {
    key: "culture",
    title: "Innovation Culture",
    description:
      "An Innovation Culture fosters an atmosphere where employees feel empowered to take risks, collaborate, and continuously seek out opportunities for improvement and innovation in products, processes, or services. This is essential to staying competitive in today's rapidly changing landscape.",
    question:
      "Does your company embrace discussions on experimentation to generate and test new ideas, concepts, business models, etc. to innovate?"
  },
  {
    key: "practices",
    title: "Innovation Practices",
    description:
      "Innovation Practices often involve fostering a culture of innovation, conducting research and development, leveraging on technology and tools and processes for collaboration to thrive in an ever changing environmental and economic uncertainty to achieve sustainable advancements for all users.",
    question:
      "How often does your company use business models, startup methodologies, design thinking or any other innovation tools and methods?"
  },
  {
    key: "leadership",
    title: "Innovation Leadership",
    description:
      "Innovation leadership inspires organisations to foster a creative culture. They do not only champion and support creative thinking but also provide strategic direction, allocate resources, and create an environment where experimentation and calculated risk-taking are encouraged.",
    question:
      "How often do leaders in your organisation encourage the need for innovation and provide the resources to support innovation efforts?"
  }
];

const scale = [
  { value: 5, label: "Strongly Agree" },
  { value: 4, label: "Agree" },
  { value: 3, label: "Neutral" },
  { value: 2, label: "Disagree" },
  { value: 1, label: "Strongly Disagree" }
];

let currentQuestion = 0;
let sessionId = null;

const answers = {};

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

function getSessionIdFromUrl() {
  return new URLSearchParams(window.location.search).get("session");
}

function renderCategoryDescription() {
  const item = questions[currentQuestion];

  document.getElementById("category-description-title").textContent =
    item.title.toUpperCase();

  document.getElementById("category-description-text").textContent =
    item.description;
}

function renderQuestion() {
  const item = questions[currentQuestion];

  document.getElementById("progress-label").textContent =
    `${currentQuestion + 1} of ${questions.length}`;

  document.getElementById("progress-fill").style.width =
    `${((currentQuestion + 1) / questions.length) * 100}%`;

  document.getElementById("question-text").textContent = item.question;

  document.getElementById("question-definition").textContent =
    item.description;

  document.querySelector(".definition-dropdown").open = false;

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
    input.checked = answers[item.key] === option.value;

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

document.getElementById("join-button").addEventListener("click", async () => {
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
    const { data, error: sessionError } = await supabaseClient
      .from("sessions")
      .select("id, is_active")
      .eq("id", sessionId)
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError) {
      console.error("Session lookup failed:", sessionError);
      error.textContent =
        "We couldn't check this survey session. Please try again.";
      return;
    }

    if (!data) {
      error.textContent =
        "This survey session is unavailable or has been closed. Please check with your facilitator.";
      return;
    }

    currentQuestion = 0;

    Object.keys(answers).forEach((key) => {
      delete answers[key];
    });

    renderCategoryDescription();
    showScreen(descriptionScreen);
  } catch (err) {
    console.error("Unable to join survey:", err);
    error.textContent =
      "Something went wrong while opening the survey. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = "Start Survey";
  }
});

document
  .getElementById("description-next-button")
  .addEventListener("click", () => {
    renderQuestion();
    showScreen(questionScreen);
  });

document
  .getElementById("answer-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const selected = document.querySelector(
      'input[name="answer"]:checked'
    );

    const error = document.getElementById("answer-error");

    if (!selected) {
      error.textContent = "Please select an answer to continue.";
      return;
    }

    const question = questions[currentQuestion];
    answers[question.key] = Number(selected.value);

    if (currentQuestion < questions.length - 1) {
      currentQuestion += 1;
      renderCategoryDescription();
      showScreen(descriptionScreen);
      return;
    }

    const button = document.getElementById("next-button");

    button.disabled = true;
    button.textContent = "Submitting...";
    error.textContent = "";

    try {
      const { error: submitError } = await supabaseClient
        .from("responses")
        .insert({
          session_id: sessionId,
          culture_score: answers.culture,
          practices_score: answers.practices,
          leadership_score: answers.leadership
        });

      if (submitError) {
        console.error("Response submission failed:", submitError);
        error.textContent =
          "We couldn't submit your response. Please check your connection and try again.";
        return;
      }

      showScreen(successScreen);
    } catch (err) {
      console.error("Unexpected submission error:", err);
      error.textContent =
        "Something went wrong while submitting. Please try again.";
    } finally {
      button.disabled = false;
      button.textContent = "Submit";
    }
  });

/* Convert the 1–5 scale into a percentage from 0–100. */
function scoreToPercentage(score) {
  return ((Number(score) - 1) / 4) * 100;
}

function averageOf(values) {
  const validValues = values
    .map(Number)
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value >= 1 &&
        value <= 5
    );

  if (validValues.length === 0) {
    return null;
  }

  return (
    validValues.reduce((sum, value) => sum + value, 0) /
    validValues.length
  );
}

async function getSessionAverages() {
  const { data, error } = await supabaseClient
    .from("responses")
    .select("culture_score, practices_score, leadership_score")
    .eq("session_id", sessionId);

  if (error) {
    console.error("Unable to retrieve session averages:", error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  return {
    culture: averageOf(data.map((row) => row.culture_score)),
    practices: averageOf(data.map((row) => row.practices_score)),
    leadership: averageOf(data.map((row) => row.leadership_score))
  };
}

/* Create a two-ring chart: personal score inside, session average outside. */
function createResultChart(personalScore, sessionAverage) {
  const size = 160;
  const center = size / 2;

  const outerRadius = 65;
  const innerRadius = 49;

  const outerCircumference = 2 * Math.PI * outerRadius;
  const innerCircumference = 2 * Math.PI * innerRadius;

  const personalPercentage = scoreToPercentage(personalScore);

  const averagePercentage =
    sessionAverage === null || sessionAverage === undefined
      ? null
      : scoreToPercentage(sessionAverage);

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");

  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "result-chart");
  svg.setAttribute("role", "img");

  const averageLabel =
    averagePercentage === null
      ? "Session average unavailable"
      : `Session average ${Math.round(averagePercentage)} percent`;

  svg.setAttribute(
    "aria-label",
    `Your score ${Math.round(personalPercentage)} percent. ${averageLabel}.`
  );

  function makeCircle(radius, className, circumference, percentage) {
    const circle = document.createElementNS(svgNamespace, "circle");

    circle.setAttribute("cx", center);
    circle.setAttribute("cy", center);
    circle.setAttribute("r", radius);
    circle.setAttribute("class", className);
    circle.setAttribute("stroke-dasharray", circumference);

    const safePercentage =
      percentage === null
        ? 0
        : Math.max(0, Math.min(100, percentage));

    circle.setAttribute(
      "stroke-dashoffset",
      circumference * (1 - safePercentage / 100)
    );

    return circle;
  }

  /* Outer ring: session average */
  svg.appendChild(
    makeCircle(
      outerRadius,
      "chart-track average-track",
      outerCircumference,
      100
    )
  );

  if (averagePercentage !== null) {
    svg.appendChild(
      makeCircle(
        outerRadius,
        "chart-value average-value",
        outerCircumference,
        averagePercentage
      )
    );
  }

  /* Inner ring: personal score */
  svg.appendChild(
    makeCircle(
      innerRadius,
      "chart-track personal-track",
      innerCircumference,
      100
    )
  );

  svg.appendChild(
    makeCircle(
      innerRadius,
      "chart-value personal-value",
      innerCircumference,
      personalPercentage
    )
  );

  const chartWrapper = document.createElement("div");
  chartWrapper.className = "result-chart-wrapper";

  const centreText = document.createElement("div");
  centreText.className = "chart-centre-text";

  const percentageText = document.createElement("span");
  percentageText.className = "chart-percentage";
  percentageText.textContent = `${Math.round(personalPercentage)}%`;

  const scoreLabel = document.createElement("span");
  scoreLabel.className = "chart-score-label";
  scoreLabel.textContent = "Your Score";

  centreText.append(percentageText, scoreLabel);
  chartWrapper.append(svg, centreText);

  return chartWrapper;
}

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

async function renderPersonalResults() {
  const resultsContainer = document.getElementById("results-content");
  const viewResultsButton = document.getElementById("view-results-button");

  resultsContainer.replaceChildren();

  viewResultsButton.disabled = true;
  viewResultsButton.textContent = "Loading results...";

  try {
    const sessionAverages = await getSessionAverages();

    questions.forEach((item) => {
      const personalScore = answers[item.key];

      const personalPercentage = scoreToPercentage(personalScore);

      const sessionAverageScore = sessionAverages
        ? sessionAverages[item.key]
        : null;

      const averagePercentage =
        sessionAverageScore === null ||
        sessionAverageScore === undefined
          ? null
          : scoreToPercentage(sessionAverageScore);

      const card = document.createElement("article");
      card.className = "category-result-card";

      const heading = document.createElement("h2");
      heading.className = "category-result-title";
      heading.textContent = item.title.toUpperCase();

      const chart = createResultChart(
        personalScore,
        sessionAverageScore
      );

      const legend = document.createElement("div");
      legend.className = "result-legend";

      legend.append(
        createLegendRow(
          "Your Result",
          personalPercentage,
          "your-result-dot"
        ),
        createLegendRow(
          "Session Avg",
          averagePercentage,
          "session-average-dot"
        )
      );

      card.append(heading, chart, legend);
      resultsContainer.appendChild(card);
    });
  } catch (err) {
    console.error("Unable to render poll results:", err);

    const errorMessage = document.createElement("p");
    errorMessage.className = "results-error";
    errorMessage.textContent =
      "Your response was submitted, but the poll results could not be loaded. Please try again later.";

    resultsContainer.appendChild(errorMessage);
  } finally {
    viewResultsButton.disabled = false;
    viewResultsButton.textContent = "View Results";
  }
}

document
  .getElementById("view-results-button")
  .addEventListener("click", async () => {
    showScreen(resultsScreen);
    await renderPersonalResults();
  });