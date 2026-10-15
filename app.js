(() => {
  "use strict";

  const STORAGE_KEY = "uxc-innovation-readiness-v1";
  const SCALE = [
    { label: "Strongly disagree", value: 0 },
    { label: "Disagree", value: 25 },
    { label: "Neutral", value: 50 },
    { label: "Agree", value: 75 },
    { label: "Strongly agree", value: 100 }
  ];

  const QUESTIONS = [
    {
      id: "culture",
      category: "Culture",
      color: "#4768e8",
      question: "Does your company embrace discussions on experimentations to generate and test new ideas, concepts, business models, etc. to innovate?",
      description: "An Innovation Culture fosters an atmosphere where employees feel empowered to take risks, collaborate, and continuously seek out opportunities for improvement and innovation in products, processes, or services. This is essential to staying competitive in today's rapidly changing landscape."
    },
    {
      id: "practices",
      category: "Practices",
      color: "#13a58b",
      question: "How often does your company use business models, startup methodologies, design thinking or any other innovation tools and methods?",
      description: "Innovation Practices often involve fostering a culture of innovation, conducting research and development, leveraging on technology and tools and processes for collaboration to thrive in an ever changing environmental and economic uncertainty to achieve sustainable advancements for all users."
    },
    {
      id: "leadership",
      category: "Leadership",
      color: "#e39a3b",
      question: "How often do leaders in your organisation encourage the need for innovation and provide the resources to support innovation efforts?",
      description: "Innovation leadership inspires organisations to foster a creative culture. They not only champion and support creative thinking but also provide strategic direction, allocate resources, and create an environment where experimentation and calculated risk-taking are encouraged."
    }
  ];

  const app = document.getElementById("app");
  const viewSwitch = document.getElementById("view-switch");
  let toastTimer;

  function getView() {
    return new URLSearchParams(window.location.search).get("view") === "results" ? "results" : "survey";
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"responses":[]}');
      return { responses: Array.isArray(parsed.responses) ? parsed.responses : [] };
    } catch (_) {
      return { responses: [] };
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("uxc-poll-updated"));
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[ch]);
  }

  function categoryLabel(q) {
    return `<span class="category-label" style="--category-color:${q.color};color:${q.color}">${q.category}</span>`;
  }

  function renderSurvey() {
    viewSwitch.href = "?view=results";
    viewSwitch.textContent = "Facilitator results ↗";
    const questionsHtml = QUESTIONS.map((q, index) => `
      <section class="card question-card" aria-labelledby="question-${q.id}">
        <div class="question-top">
          <span class="question-number">0${index + 1}</span>
          <div>
            ${categoryLabel(q)}
            <h2 class="question-title" id="question-${q.id}">${escapeHtml(q.question)}</h2>
          </div>
        </div>
        <p class="question-description">${escapeHtml(q.description)}</p>
        <div class="options" role="radiogroup" aria-label="${escapeHtml(q.category)} response">
          ${SCALE.map((option, i) => `
            <div class="option">
              <input type="radio" id="${q.id}-${i}" name="${q.id}" value="${option.value}" required>
              <label for="${q.id}-${i}"><span class="radio-dot"></span><span>${option.label}</span></label>
            </div>`).join("")}
        </div>
      </section>`).join("");

    app.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow">Learning Journey · Participant survey</div>
          <h1>Innovation readiness</h1>
          <p class="lede">Share your perspective on how innovation is encouraged and practised in your organisation. There are three quick questions, and your response will contribute to the live group results.</p>
        </div>
        <span class="pill">3 questions · About 2 min</span>
      </div>
      <form id="poll-form" novalidate>
        <div class="survey-layout">
          <div>
            <div class="questions">${questionsHtml}</div>
            <div id="form-error" class="form-error" hidden>Please answer all three questions before submitting.</div>
            <div class="submit-row">
              <span class="helper-text">Please select one answer for each question.</span>
              <button class="btn btn-primary" type="submit">Submit responses <span aria-hidden="true">→</span></button>
            </div>
          </div>
          <aside class="card side-card">
            <div class="side-icon" aria-hidden="true">✳</div>
            <h3>Your perspective matters</h3>
            <p>This poll helps the workshop group reflect on the organisation's current innovation readiness across three dimensions.</p>
            <ul class="side-list">
              <li><span class="check">✓</span><span><strong>Culture</strong><br>Openness to experimentation</span></li>
              <li><span class="check">✓</span><span><strong>Practices</strong><br>Use of innovation methods</span></li>
              <li><span class="check">✓</span><span><strong>Leadership</strong><br>Encouragement and support</span></li>
            </ul>
            <div class="session-note"><span aria-hidden="true">ⓘ</span><p><strong>How results work</strong><br>Your selections are converted to a 0–100 score and averaged with other submitted responses in this prototype.</p></div>
          </aside>
        </div>
      </form>`;

    const form = document.getElementById("poll-form");
    form.addEventListener("submit", event => {
      event.preventDefault();
      const answers = {};
      let complete = true;
      QUESTIONS.forEach(q => {
        const selected = form.querySelector(`input[name="${q.id}"]:checked`);
        if (!selected) complete = false;
        else answers[q.id] = Number(selected.value);
      });
      const error = document.getElementById("form-error");
      if (!complete) {
        error.hidden = false;
        error.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      error.hidden = true;
      const state = readState();
      state.responses.push({ id: makeId(), answers, submittedAt: new Date().toISOString() });
      writeState(state);
      renderSubmitted();
    });
  }

  function makeId() {
    return "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function renderSubmitted() {
    viewSwitch.href = "?view=results";
    viewSwitch.textContent = "Facilitator results ↗";
    app.innerHTML = `
      <section class="card success-card">
        <div class="success-mark" aria-hidden="true">✓</div>
        <div class="eyebrow">Response recorded</div>
        <h1>Thank you for sharing.</h1>
        <p>Your answers have been added to the live results for this browser. You can return to the survey if you need to submit another participant's response on this device.</p>
        <div class="success-actions">
          <button class="btn btn-primary" id="another-response">Submit another response</button>
          <a class="btn btn-secondary" href="?view=results">Open results ↗</a>
        </div>
      </section>`;
    document.getElementById("another-response").addEventListener("click", renderSurvey);
  }

  function getStats() {
    const responses = readState().responses;
    return QUESTIONS.map(q => {
      const values = responses.map(r => r.answers && Number(r.answers[q.id])).filter(Number.isFinite);
      const average = values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
      const distribution = SCALE.map(option => ({
        ...option,
        count: responses.filter(r => r.answers && Number(r.answers[q.id]) === option.value).length
      }));
      return { ...q, count: values.length, average, distribution };
    });
  }

  function renderResults() {
    viewSwitch.href = "?view=survey";
    viewSwitch.textContent = "Open participant survey ↗";
    const stats = getStats();
    const total = readState().responses.length;
    const averageAll = stats.filter(s => s.average !== null);
    const overall = averageAll.length ? Math.round(averageAll.reduce((sum, s) => sum + s.average, 0) / averageAll.length) : null;

    app.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow">Facilitator view · Not shown on survey page</div>
          <h1>Live poll results</h1>
          <p class="lede">A presentation-ready snapshot of your group's innovation readiness. Copy each result card as an image and paste it straight into your slides.</p>
        </div>
        <div class="results-toolbar">
          <button class="btn btn-secondary" id="export-all">Export all charts ↓</button>
          <button class="btn btn-danger" id="reset-poll">Reset session</button>
        </div>
      </div>

      <div class="results-summary">
        <div class="card stat-card"><div class="stat-label">Total responses</div><div class="stat-value">${total}</div><div class="stat-note">Submitted in this browser</div></div>
        <div class="card stat-card"><div class="stat-label">Dimensions tracked</div><div class="stat-value">03</div><div class="stat-note">Culture · Practices · Leadership</div></div>
        <div class="card stat-card"><div class="stat-label">Overall readiness</div><div class="stat-value">${overall === null ? "—" : `${Math.round(overall)}%`}</div><div class="stat-note">Mean of the three category averages</div></div>
      </div>

      <div class="results-grid">
        ${stats.map(s => resultCard(s)).join("")}
      </div>

      <div class="results-lower">
        <section class="card panel">
          <div class="panel-heading">
            <div><h2>Response distribution</h2><p>Number of responses for each scale option, shown by category.</p></div>
          </div>
          <div class="distribution-list">
            ${stats.map(s => `
              <div>
                <div class="category-label" style="--category-color:${s.color};color:${s.color};margin-bottom:10px">${s.category}</div>
                ${s.distribution.map(d => `
                  <div class="distribution-row">
                    <span class="distribution-name">${d.label}</span>
                    <div class="distribution-track"><div class="distribution-fill" style="width:${total ? d.count / total * 100 : 0}%;background:${s.color}"></div></div>
                    <span class="distribution-value">${d.count}</span>
                  </div>`).join("")}
              </div>`).join("")}
          </div>
        </section>
        <aside class="card panel">
          <h2>Using these results</h2>
          <p class="lede" style="font-size:12px">Each card is designed as a standalone slide visual.</p>
          <ul class="side-list">
            <li><span class="check">01</span><span>Click <strong>Copy chart</strong> on a category card.</span></li>
            <li><span class="check">02</span><span>Paste directly into PowerPoint using <strong>Ctrl + V</strong>.</span></li>
            <li><span class="check">03</span><span>If clipboard access is blocked, use the PNG download fallback.</span></li>
          </ul>
          <div class="session-note"><span aria-hidden="true">ⓘ</span><p><strong>Prototype storage</strong><br>Responses are saved in this browser's local storage. They are not shared with other devices yet.</p></div>
          <div class="session-note"><span aria-hidden="true">⚠</span><p><strong>Scoring note</strong><br>Strongly disagree = 0, Disagree = 25, Neutral = 50, Agree = 75, Strongly agree = 100. Category results are the mean score.</p></div>
        </aside>
      </div>`;

    stats.forEach(s => {
      const btn = document.getElementById(`copy-${s.id}`);
      if (btn) btn.addEventListener("click", () => copyChart(s));
    });
    document.getElementById("export-all").addEventListener("click", () => exportAll(stats));
    document.getElementById("reset-poll").addEventListener("click", () => {
      const confirmed = window.confirm("Reset this poll session? All responses saved in this browser for this prototype will be deleted.");
      if (!confirmed) return;
      writeState({ responses: [] });
      renderResults();
      showToast("Poll session reset.");
    });
  }

  function resultCard(s) {
    const percent = s.average === null ? null : Math.round(s.average);
    return `
      <section class="card result-card" id="card-${s.id}">
        <div class="result-card-head">${categoryLabel(s)}<span class="pill">${s.count} ${s.count === 1 ? "response" : "responses"}</span></div>
        <div class="result-percent">${percent === null ? "—" : `${percent}%`}</div>
        <div class="result-caption">${percent === null ? "Waiting for the first response" : "Average innovation readiness score"}</div>
        <div class="gauge"><div class="gauge-fill" style="width:${percent || 0}%;--category-color:${s.color}"></div></div>
        <div class="gauge-labels"><span>0 · Low</span><span>100 · High</span></div>
        <div class="result-foot"><span>Slide-ready chart</span><button class="btn btn-secondary copy-btn" id="copy-${s.id}">Copy chart ↗</button></div>
      </section>`;
  }

  function makeChartSvg(s) {
    const percent = s.average === null ? null : Math.round(s.average);
    const width = 1000, height = 360;
    const title = escapeHtml(s.category);
    const score = percent === null ? "—" : `${percent}%`;
    const sub = s.count === 0 ? "No responses yet" : `${s.count} ${s.count === 1 ? "response" : "responses"} · Average readiness score`;
    const barWidth = 880;
    const fillWidth = percent === null ? 0 : barWidth * percent / 100;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" rx="28" fill="#ffffff"/>
      <rect x="0" y="0" width="14" height="${height}" rx="7" fill="${s.color}"/>
      <text x="64" y="66" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3" fill="${s.color}">${title.toUpperCase()}</text>
      <text x="64" y="165" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#17243b">${score}</text>
      <text x="66" y="205" font-family="Arial, sans-serif" font-size="22" fill="#687386">${escapeHtml(sub)}</text>
      <rect x="64" y="244" width="${barWidth}" height="18" rx="9" fill="#edf0f5"/>
      <rect x="64" y="244" width="${fillWidth}" height="18" rx="9" fill="${s.color}"/>
      <text x="64" y="305" font-family="Arial, sans-serif" font-size="16" fill="#8791a2">0 · LOW</text>
      <text x="${64 + barWidth}" y="305" text-anchor="end" font-family="Arial, sans-serif" font-size="16" fill="#8791a2">100 · HIGH</text>
      <text x="936" y="66" text-anchor="end" font-family="Arial, sans-serif" font-size="16" fill="#8791a2">UXC · INNOVATION READINESS</text>
    </svg>`;
  }

  async function svgToPngBlob(svg, scale = 1) {
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1000 * scale;
      canvas.height = 360 * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0, 1000, 360);
      return await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function copyChart(s) {
    const svg = makeChartSvg(s);
    try {
      const blob = await svgToPngBlob(svg, 2);
      if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToast(`${s.category} chart copied — paste it into your slides.`);
      } else {
        downloadBlob(blob, `uxc-${s.id}-result.png`);
        showToast("Clipboard image copy is unavailable here, so the PNG was downloaded instead.");
      }
    } catch (error) {
      try {
        const blob = await svgToPngBlob(svg, 2);
        downloadBlob(blob, `uxc-${s.id}-result.png`);
        showToast("Chart downloaded as PNG. You can insert it into your slides.");
      } catch (_) {
        showToast("Could not create the chart image. Please try again.");
      }
    }
  }

  async function exportAll(stats) {
    for (const s of stats) {
      const blob = await svgToPngBlob(makeChartSvg(s), 2);
      downloadBlob(blob, `uxc-${s.id}-result.png`);
      await new Promise(resolve => setTimeout(resolve, 180));
    }
    showToast("All three chart PNGs have been exported.");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function render() {
    if (getView() === "results") renderResults();
    else renderSurvey();
  }

  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY && getView() === "results") renderResults();
  });
  window.addEventListener("uxc-poll-updated", () => {
    if (getView() === "results") renderResults();
  });
  window.addEventListener("popstate", render);
  render();
})();