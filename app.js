(function () {
  const bank = (window.QUESTION_BANK && window.QUESTION_BANK.questions) || [];
  const $ = (id) => document.getElementById(id);

  let roundLength = 10;
  let deck = [];
  let index = 0;
  let answers = [];   // { q, guessedReal, correct }
  let answered = false;

  // ---- setup ----
  $("bank-info").textContent = bank.length
    ? `${bank.length} headlines in the bank`
    : "No headlines found. Run fetch_headlines.py first.";
  $("start-btn").disabled = !bank.length;
  if (window.QUESTION_BANK) $("generated").textContent = `Updated ${window.QUESTION_BANK.generated}.`;

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      roundLength = chip.dataset.len === "all" ? Infinity : Number(chip.dataset.len);
    });
  });

  $("start-btn").addEventListener("click", () => startRound(buildDeck(bank, roundLength)));
  $("again-btn").addEventListener("click", () => startRound(buildDeck(bank, roundLength)));
  $("missed-btn").addEventListener("click", () => {
    startRound(shuffle(answers.filter((a) => !a.correct).map((a) => a.q)));
  });
  $("next-btn").addEventListener("click", next);
  document.querySelectorAll(".answer").forEach((btn) => {
    btn.addEventListener("click", () => answer(btn.dataset.real === "true"));
  });

  document.addEventListener("keydown", (e) => {
    if ($("quiz").hidden) return;
    if (!answered && e.key === "1") answer(true);
    else if (!answered && e.key === "2") answer(false);
    else if (answered && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); next(); }
  });

  // ---- helpers ----
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Roughly half real, half Onion, so neither answer is a safe default.
  function buildDeck(all, n) {
    if (!isFinite(n) || n >= all.length) return shuffle(all);
    const real = shuffle(all.filter((q) => q.real));
    const fake = shuffle(all.filter((q) => !q.real));
    const half = Math.round(n / 2) + (Math.random() < 0.5 ? -1 : 1) * Math.floor(Math.random() * 2);
    const pickReal = Math.min(real.length, Math.max(0, half));
    const pickFake = Math.min(fake.length, n - pickReal);
    const picked = real.slice(0, pickReal).concat(fake.slice(0, pickFake));
    // Top up from whichever pile has leftovers if the other ran short.
    const leftovers = real.slice(pickReal).concat(fake.slice(pickFake));
    return shuffle(picked.concat(leftovers.slice(0, n - picked.length)));
  }

  function show(screen) {
    ["start", "quiz", "results"].forEach((s) => ($(s).hidden = s !== screen));
    window.scrollTo(0, 0);
  }

  function updateProgress() {
    const pct = deck.length ? (index / deck.length) * 100 : 0;
    $("progress-fill").style.width = pct + "%";
    $("progress-label").textContent = $("quiz").hidden ? "" : `${Math.min(index + 1, deck.length)} / ${deck.length}`;
  }

  // ---- round flow ----
  function startRound(newDeck) {
    if (!newDeck.length) return;
    deck = newDeck;
    index = 0;
    answers = [];
    show("quiz");
    render();
  }

  function render() {
    const q = deck[index];
    answered = false;
    $("q-title").textContent = q.title;

    const wrap = $("image-wrap");
    const img = $("q-image");
    wrap.classList.toggle("empty", !q.image);
    img.onerror = () => wrap.classList.add("empty");
    img.src = q.image || "";

    document.querySelectorAll(".answer").forEach((b) => {
      b.disabled = false;
      b.classList.remove("correct", "wrong", "dim");
    });
    $("feedback").hidden = true;
    $("next-btn").hidden = true;
    updateProgress();

    // Warm the next image so it doesn't pop in late.
    const upcoming = deck[index + 1];
    if (upcoming && upcoming.image) {
      const pre = new Image();
      pre.referrerPolicy = "no-referrer";
      pre.src = upcoming.image;
    }
  }

  function answer(guessedReal) {
    if (answered) return;
    answered = true;
    const q = deck[index];
    const correct = guessedReal === q.real;
    answers.push({ q, guessedReal, correct });

    document.querySelectorAll(".answer").forEach((b) => {
      const isReal = b.dataset.real === "true";
      b.disabled = true;
      if (isReal === q.real) b.classList.add("correct");
      else if (isReal === guessedReal) b.classList.add("wrong");
      else b.classList.add("dim");
    });

    const fb = $("feedback");
    fb.className = "feedback " + (correct ? "good" : "bad");
    const verdict = q.real ? `Real: ran in ${q.source}` : "Satire from The Onion";
    $("feedback-text").innerHTML = "";
    $("feedback-text").append((correct ? "Correct! " : "Not quite. ") + verdict);
    if (q.original_title && q.original_title !== q.title) {
      const orig = document.createElement("span");
      orig.className = "orig";
      orig.textContent = `Original: "${q.original_title}"`;
      $("feedback-text").append(orig);
    }
    $("feedback-link").href = q.url;
    fb.hidden = false;

    $("next-btn").textContent = index + 1 < deck.length ? "Continue" : "See results";
    $("next-btn").hidden = false;
    $("next-btn").focus({ preventScroll: true });
  }

  function next() {
    index++;
    if (index < deck.length) render();
    else results();
  }

  function results() {
    show("results");
    updateProgress();
    $("progress-fill").style.width = "100%";
    const score = answers.filter((a) => a.correct).length;
    const pct = Math.round((score / answers.length) * 100);
    $("score-pct").textContent = pct + "%";
    document.querySelector(".score-ring").style.setProperty("--pct", pct);
    $("score-heading").textContent =
      pct >= 90 ? "Sharp eye!" : pct >= 70 ? "Nicely done" : pct >= 50 ? "Reality is hard" : "The world is the Onion now";
    $("score-sub").textContent = `You got ${score} of ${answers.length} right.`;
    $("missed-btn").hidden = score === answers.length;

    const list = $("review");
    list.innerHTML = "";
    answers.forEach(({ q, guessedReal, correct }) => {
      const li = document.createElement("li");
      if (!correct) li.className = "missed";
      if (q.image) {
        const img = document.createElement("img");
        img.referrerPolicy = "no-referrer";
        img.alt = "";
        img.src = q.image;
        img.onerror = () => img.remove();
        li.append(img);
      }
      const body = document.createElement("div");
      const title = document.createElement("a");
      title.className = "r-title";
      title.href = q.url;
      title.target = "_blank";
      title.rel = "noopener";
      title.textContent = q.title;
      const meta = document.createElement("div");
      meta.className = "r-meta";
      meta.textContent = `${q.real ? "Real (" + q.source + ")" : "The Onion"}, you said ${guessedReal ? "Real" : "Onion"}`;
      body.append(title, meta);
      li.append(body);
      list.append(li);
    });
  }
})();
