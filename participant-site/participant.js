
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
  { value: 5, label: "Strongly agree" },
  { value: 4, label: "Agree" },
  { value: 3, label: "Neutral" },
  { value: 2, label: "Disagree" },
  { value: 1, label: "Strongly disagree" }
];

let currentQuestion = 0;
const answers = {};
let sessionId = null;

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
  window.scrollTo({ top: 0, behavior: "smooth" });
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

  nextButton.textContent = isLastQuestion
    ? "Submit response"
    : "Next";

  nextButton.classList.toggle("submit-button", isLastQuestion);
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
    Object.keys(answers).forEach((key) => delete answers[key]);

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

document.getElementById("answer-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const selected = document.querySelector('input[name="answer"]:checked');
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
    button.textContent = "Submit response";
  }
});

/* Convert the 1–5 response scale to a 0–100 percentage.
   Strongly disagree (1) = 0%; strongly agree (5) = 100%. */
function scoreToPercentage(score) {
  return ((Number(score) - 1) / 4) * 100;
}

function averageOf(values) {
  const validValues = values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);

  if (!validValues.length) {
    return null;
  }

  return validValues.reduce((sum, value) => sum + value, 0) /
    validValues.length;
}

function createDonut(percentage, className, label) {
  const size = 132;
  const center = size / 2;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const safePercentage = Math.max(0, Math.min(100, percentage));

  const wrapper = document.createElement("div");
  wrapper.className = `donut ${className}`;
  wrapper.setAttribute("role", "img");
  wrapper.setAttribute(
    "aria-label",
    `${label}: ${Math.round(safePercentage)} percent`
  );

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");

  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "donut-svg");
  svg.setAttribute("aria-hidden", "true");

  const backgroundCircle = document.createElementNS(
    svgNamespace,
    "circle"
  );

  backgroundCircle.setAttribute("cx", center);
  backgroundCircle.setAttribute("cy", center);
  backgroundCircle.setAttribute("r", radius);
  backgroundCircle.setAttribute("class", "donut-track");

  const valueCircle = document.createElementNS(svgNamespace, "circle");

  valueCircle.setAttribute("cx", center);
  valueCircle.setAttribute("cy", center);
  valueCircle.setAttribute("r", radius);
  valueCircle.setAttribute("class", "donut-value");
  valueCircle.setAttribute("stroke-dasharray", String(circumference));
  valueCircle.setAttribute(
    "stroke-dashoffset",
    String(circumference * (1 - safePercentage / 100))
  );

  svg.append(backgroundCircle, valueCircle);

  const percentageText = document.createElement("span");
  percentageText.className = "donut-percentage";
  percentageText.textContent = `${Math.round(safePercentage)}%`;

  const caption = document.createElement("span");
  caption.className = "donut-caption";
  caption.textContent = label;

  wrapper.append(svg, percentageText, caption);

  return wrapper;
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

      const categoryCard = document.createElement("article");
      categoryCard.className = "category-result-card";

      const heading = document.createElement("h2");
      heading.className = "category-result-title";
      heading.textContent = item.title;

      const chartArea = document.createElement("div");
      chartArea.className = "donut-pair";

      const personalDonut = createDonut(
        personalPercentage,
        "your-result-donut",
        "Your score"
      );

      chartArea.appendChild(personalDonut);

      if (sessionAverageScore !== null && sessionAverageScore !== undefined) {
        const averagePercentage = scoreToPercentage(sessionAverageScore);

        chartArea.appendChild(
          createDonut(
            averagePercentage,
            "session-average-donut",
            "Session average"
          )
        );
      } else {
        const unavailable = document.createElement("p");
        unavailable.className = "session-average-unavailable";
        unavailable.textContent = "Session average unavailable";
        chartArea.appendChild(unavailable);
      }

      categoryCard.append(heading, chartArea);
      resultsContainer.appendChild(categoryCard);
    });
  } catch (err) {
    console.error("Unable to render poll results:", err);

    const errorMessage = document.createElement("p");
    errorMessage.className = "error-message";
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
