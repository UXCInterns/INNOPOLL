
/* FILE: participant-site/participant.js */

const { createClient } = window.supabase;
const config = window.INNOPOLL_CONFIG;

const supabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY
);

const questions = [
  {
    key: "culture",
    title: "Culture",
    description:
      "An Innovation Culture fosters an atmosphere where employees feel empowered to take risks, collaborate, and continuously seek out opportunities for improvement and innovation in products, processes, or services. This is essential to staying competitive in today's rapidly changing landscape.",
    question:
      "Does your company embrace discussions on experimentation to generate and test new ideas, concepts, business models, etc. to innovate?"
  },
  {
    key: "practices",
    title: "Practices",
    description:
      "Innovation Practices often involve fostering a culture of innovation, conducting research and development, leveraging on technology and tools and processes for collaboration to thrive in an ever changing environmental and economic uncertainty to achieve sustainable advancements for all users.",
    question:
      "How often does your company use business models, startup methodologies, design thinking or any other innovation tools and methods?"
  },
  {
    key: "leadership",
    title: "Leadership",
    description:
      "Innovation leadership inspires organisations to foster a creative culture. They do not only champion and support creative thinking but also provide strategic direction, allocate resources, and create an environment where experimentation and calculated risk-taking are encouraged.",
    question:
      "How often do leaders in your organisation encourage the need for innovation and provide the resources to support innovation efforts?"
  }
];

const scale = [
  { value: 5, label: "Strongly agree" },
  { value: 4, label: "Agree" },
  { value: 3, label: "Neither agree nor disagree" },
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
    item.title;

  document.getElementById("category-description-text").textContent =
    item.description;

  document.getElementById("description-next-button").textContent =
    "Continue to question";
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

  // Keep the definition closed when each question first appears.
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

  // A valid session is still required for a real submitted response.
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
    button.textContent = "Join Survey";
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

function renderPersonalResults() {
  const resultsContainer = document.getElementById("results-content");
  resultsContainer.replaceChildren();

  const scores = questions.map((item) => ({
    title: item.title,
    score: answers[item.key]
  }));

  const total = scores.reduce((sum, item) => sum + item.score, 0);
  const average = total / scores.length;

  document.getElementById("average-score").textContent =
    average.toFixed(1);

  scores.forEach((item) => {
    const resultCard = document.createElement("div");
    resultCard.className = "personal-result-item";

    const heading = document.createElement("div");
    heading.className = "personal-result-heading";

    const title = document.createElement("span");
    title.textContent = item.title;

    const score = document.createElement("strong");
    score.textContent = `${item.score} / 5`;

    heading.append(title, score);

    const track = document.createElement("div");
    track.className = "personal-result-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${item.title} score`);
    track.setAttribute("aria-valuemin", "1");
    track.setAttribute("aria-valuemax", "5");
    track.setAttribute("aria-valuenow", String(item.score));

    const fill = document.createElement("div");
    fill.className = "personal-result-fill";
    fill.style.width = `${(item.score / 5) * 100}%`;

    track.appendChild(fill);
    resultCard.append(heading, track);
    resultsContainer.appendChild(resultCard);
  });
}

document
  .getElementById("view-results-button")
  .addEventListener("click", () => {
    renderPersonalResults();
    showScreen(resultsScreen);
  });

document
  .getElementById("back-to-thank-you-button")
  .addEventListener("click", () => {
    showScreen(successScreen);
  });
