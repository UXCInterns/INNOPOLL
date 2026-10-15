
/* FILE: participant/participant.js */

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
const questionScreen = document.getElementById("question-screen");
const successScreen = document.getElementById("success-screen");

function showScreen(screen) {
  [welcomeScreen, questionScreen, successScreen].forEach((item) => {
    item.classList.add("hidden");
  });
  screen.classList.remove("hidden");
}

function getSessionIdFromUrl() {
  return new URLSearchParams(window.location.search).get("session");
}

function renderQuestion() {
  const item = questions[currentQuestion];

  document.getElementById("category-label").textContent =
    item.title.toUpperCase();
  document.getElementById("progress-label").textContent =
    `${currentQuestion + 1} of ${questions.length}`;
  document.getElementById("progress-fill").style.width =
    `${((currentQuestion + 1) / questions.length) * 100}%`;

  document.getElementById("question-title").textContent = item.title;
  document.getElementById("category-description").textContent =
    item.description;
  document.getElementById("question-text").textContent = item.question;

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
  document.getElementById("next-button").textContent =
    currentQuestion === questions.length - 1
      ? "Submit response"
      : "Next";
}

document.getElementById("join-button").addEventListener("click", async () => {
  const error = document.getElementById("welcome-error");
  error.textContent = "";

  sessionId = getSessionIdFromUrl();

  if (!sessionId) {
    error.textContent =
      "Please open the survey using the QR code or link provided by your facilitator.";
    return;
  }

  const { data, error: sessionError } = await supabaseClient
    .from("sessions")
    .select("id, is_active")
    .eq("id", sessionId)
    .eq("is_active", true)
    .maybeSingle();

  if (sessionError || !data) {
    error.textContent =
      "This survey session is unavailable or has been closed. Please check with your facilitator.";
    return;
  }

  currentQuestion = 0;
  showScreen(questionScreen);
  renderQuestion();
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
    renderQuestion();
    return;
  }

  const button = document.getElementById("next-button");
  button.disabled = true;
  button.textContent = "Submitting…";
  error.textContent = "";

  const { error: submitError } = await supabaseClient
    .from("responses")
    .insert({
      session_id: sessionId,
      culture_score: answers.culture,
      practices_score: answers.practices,
      leadership_score: answers.leadership
    });

  button.disabled = false;
  button.textContent = "Submit response";

  if (submitError) {
    error.textContent =
      "We couldn't submit your response. Please check your connection and try again.";
    return;
  }

  showScreen(successScreen);
});
