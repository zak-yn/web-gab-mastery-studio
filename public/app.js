(function () {
  const STORAGE_KEY = "web_gab_mastery_state_v1";

  const defaultState = {
    verbalAnswers: {},   // { "V01_Q1": "A" }
    numericalAnswers: {},// { "N01_Q1": 3 }
    mockHistory: [],     // [{ date, modeLabel, verbalScore, verbalTotal, numScore, numTotal, deviation, elapsedSec }]
    opqSelections: {}    // { "P01": { most: "A", least: "C" } }
  };

  let appState = loadState();
  let currentView = "dashboard";

  // Drill selection states
  let activeVerbalPassageId = window.GAB_VERBAL_DATA[0].id;
  let activeNumericalTableId = window.GAB_NUMERICAL_DATA[0].id;

  // Mock Exam Runtime State
  let mockSession = null;
  let mockTimerInterval = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultState));
      return Object.assign(JSON.parse(JSON.stringify(defaultState)), JSON.parse(raw));
    } catch (e) {
      return JSON.parse(JSON.stringify(defaultState));
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
      fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appState)
      }).catch(() => {});
    } catch (e) {
      // ignore storage quota errors
    }
  }

  async function syncFromCloudState() {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && data.state) {
        appState.verbalAnswers = Object.assign({}, data.state.verbalAnswers || {}, appState.verbalAnswers);
        appState.numericalAnswers = Object.assign({}, data.state.numericalAnswers || {}, appState.numericalAnswers);
        appState.opqSelections = Object.assign({}, data.state.opqSelections || {}, appState.opqSelections);
        if (Array.isArray(data.state.mockHistory) && appState.mockHistory.length === 0) {
          appState.mockHistory = data.state.mockHistory;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        renderDashboard();
      }
    } catch (e) {
      // offline fallback
    }
  }

  // Compute accuracy and SHL estimated deviation score
  function computeMetrics() {
    let vAnswered = 0;
    let vCorrect = 0;
    let vTotal = 0;

    window.GAB_VERBAL_DATA.forEach((p) => {
      p.questions.forEach((q) => {
        vTotal++;
        const userAns = appState.verbalAnswers[q.id];
        if (userAns !== undefined) {
          vAnswered++;
          if (userAns === q.answer) vCorrect++;
        }
      });
    });

    let nAnswered = 0;
    let nCorrect = 0;
    let nTotal = 0;

    window.GAB_NUMERICAL_DATA.forEach((t) => {
      t.questions.forEach((q) => {
        nTotal++;
        const userAns = appState.numericalAnswers[q.id];
        if (userAns !== undefined) {
          nAnswered++;
          if (Number(userAns) === q.answerIndex) nCorrect++;
        }
      });
    });

    const vRate = vAnswered > 0 ? (vCorrect / vAnswered) * 100 : 0;
    const nRate = nAnswered > 0 ? (nCorrect / nAnswered) * 100 : 0;

    // Combine drill accuracy and best mock exam accuracy for deviation estimation
    let baseRate = 55; // baseline 55% = deviation 50
    if (vAnswered + nAnswered > 0) {
      const combinedRate = ((vCorrect + nCorrect) / (vAnswered + nAnswered)) * 100;
      baseRate = combinedRate;
    }
    if (appState.mockHistory.length > 0) {
      const latestMock = appState.mockHistory[0];
      const mockRate = ((latestMock.verbalScore + latestMock.numScore) / (latestMock.verbalTotal + latestMock.numTotal)) * 100;
      baseRate = vAnswered + nAnswered > 0 ? (baseRate * 0.4 + mockRate * 0.6) : mockRate;
    }

    // SHL GAB typical distribution: mean ~58%, SD ~14%
    let deviation = 50.0;
    if (vAnswered + nAnswered > 0 || appState.mockHistory.length > 0) {
      deviation = 50 + ((baseRate - 58) / 14) * 10;
      deviation = Math.max(35.0, Math.min(76.0, deviation));
    }

    return {
      vAnswered, vCorrect, vTotal, vRate,
      nAnswered, nCorrect, nTotal, nRate,
      deviation: Number(deviation.toFixed(1))
    };
  }

  // View Switcher
  function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll(".nav-tab, .m-nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewName);
    });
    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.classList.toggle("active", sec.id === `view-${viewName}`);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (viewName === "dashboard") renderDashboard();
    if (viewName === "verbal") renderVerbalDrill();
    if (viewName === "numerical") renderNumericalDrill();
    if (viewName === "strategy") renderStrategyAndOPQ();
  }

  // ==========================================
  // 1. DASHBOARD RENDERING
  // ==========================================
  function renderDashboard() {
    const m = computeMetrics();
    document.getElementById("stat-overall-deviation").textContent = m.deviation.toFixed(1);

    const diffToSogo = (62.0 - m.deviation).toFixed(1);
    const verdictEl = document.getElementById("stat-border-verdict");
    if (m.deviation >= 65) {
      verdictEl.textContent = "五大商社・戦略コンサル安全圏（上位7%水準）";
      verdictEl.style.color = "var(--accent-primary)";
    } else if (m.deviation >= 62) {
      verdictEl.textContent = "総合商社・外資IB合格ボーダー突破（上位12%水準）";
      verdictEl.style.color = "var(--accent-primary)";
    } else {
      verdictEl.textContent = `総合商社ボーダー（偏差値62.0）まであと +${diffToSogo}`;
      verdictEl.style.color = "var(--text-secondary)";
    }

    document.getElementById("stat-verbal-accuracy").textContent = `${m.vRate.toFixed(1)}%`;
    document.getElementById("stat-verbal-progress").textContent = `解答済み: ${m.vAnswered} / ${m.vTotal} 問（正解 ${m.vCorrect} 問）`;

    document.getElementById("stat-numerical-accuracy").textContent = `${m.nRate.toFixed(1)}%`;
    document.getElementById("stat-numerical-progress").textContent = `解答済み: ${m.nAnswered} / ${m.nTotal} 問（正解 ${m.nCorrect} 問）`;

    document.getElementById("stat-mock-count").textContent = `${appState.mockHistory.length} 回`;
    if (appState.mockHistory.length > 0) {
      const best = appState.mockHistory.reduce((acc, cur) => (cur.deviation > acc.deviation ? cur : acc), appState.mockHistory[0]);
      document.getElementById("stat-mock-best").textContent = `最高偏差値: ${best.deviation.toFixed(1)} (${best.modeLabel})`;
    } else {
      document.getElementById("stat-mock-best").textContent = "最高スコア: 未受検（模試タブから開始）";
    }

    // Industry Borderlines
    const borders = [
      { name: "五大総合商社・戦略コンサル（三菱商事 / 三井物産 / NRI 等）", targetDev: 63.0, targetPct: "正答率 78%〜82%" },
      { name: "メガバンク・大手証券IB部門・総合デベロッパー", targetDev: 59.0, targetPct: "正答率 72%〜76%" },
      { name: "グローバルメーカー・専門商社・大手損保/生保", targetDev: 55.0, targetPct: "正答率 65%〜70%" },
      { name: "一般総合職 標準通過ライン（SHL全国受検者平均）", targetDev: 50.0, targetPct: "正答率 58%前後" }
    ];

    const bContainer = document.getElementById("borderline-container");
    bContainer.innerHTML = borders.map((b) => {
      const passed = m.deviation >= b.targetDev;
      const fillWidth = Math.min(100, Math.round((m.deviation / 72) * 100));
      return `
        <div class="borderline-item">
          <div class="borderline-top">
            <span><strong>${b.name}</strong></span>
            <span class="mono" style="color:${passed ? 'var(--accent-primary)' : 'var(--text-secondary)'}">
              目標偏差値 ${b.targetDev.toFixed(1)} (${b.targetPct}) ${passed ? '✓ 到達' : ''}
            </span>
          </div>
          <div class="borderline-track">
            <div class="borderline-fill" style="width:${fillWidth}%; background-color:${passed ? 'var(--accent-primary)' : 'var(--amber-warn)'}"></div>
          </div>
        </div>
      `;
    }).join("");

    // Mock History List
    const hContainer = document.getElementById("mock-history-list");
    if (appState.mockHistory.length === 0) {
      hContainer.innerHTML = `
        <div style="padding: 18px; background: var(--bg-base); border: 1px dashed var(--border-strong); border-radius: 6px; color: var(--text-secondary); font-size: 13px;">
          まだ本番模擬テストの受検履歴がありません。「本番模擬テスト（52問/29問）」タブから、実際の制限時間（言語25分・計数35分）で受検すると、ここに偏差値推移と時間配分ログが記録されます。
        </div>
      `;
    } else {
      hContainer.innerHTML = appState.mockHistory.slice(0, 5).map((item) => {
        const totalScore = item.verbalScore + item.numScore;
        const totalMax = item.verbalTotal + item.numTotal;
        const pct = ((totalScore / totalMax) * 100).toFixed(1);
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:var(--bg-base); border:1px solid var(--border-hairline); border-radius:6px; margin-bottom:8px;">
            <div>
              <div style="font-weight:700; font-size:13px;">${item.modeLabel} <span class="mono" style="color:var(--text-muted); font-size:11px;">(${item.date})</span></div>
              <div style="font-size:12px; color:var(--text-secondary);">
                得点: <strong class="mono">${totalScore}/${totalMax} (${pct}%)</strong> ｜ 所要時間: <span class="mono">${formatSeconds(item.elapsedSec)}</span>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px; color:var(--text-muted);">推定偏差値</div>
              <div class="mono" style="font-size:18px; font-weight:800; color:var(--accent-primary);">${item.deviation.toFixed(1)}</div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // ==========================================
  // 2. VERBAL COMPREHENSIVE DRILL
  // ==========================================
  function initVerbalFilters() {
    const catSelect = document.getElementById("verbal-category-filter");
    const categories = Array.from(new Set(window.GAB_VERBAL_DATA.map((p) => p.category)));
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    });
    catSelect.addEventListener("change", renderVerbalDrill);
    document.getElementById("verbal-status-filter").addEventListener("change", renderVerbalDrill);
  }

  function renderVerbalDrill() {
    const catFilter = document.getElementById("verbal-category-filter").value;
    const statusFilter = document.getElementById("verbal-status-filter").value;

    const filteredPassages = window.GAB_VERBAL_DATA.filter((p) => {
      if (catFilter !== "ALL" && p.category !== catFilter) return false;
      if (statusFilter === "UNANSWERED") {
        return p.questions.some((q) => appState.verbalAnswers[q.id] === undefined);
      }
      if (statusFilter === "WRONG") {
        return p.questions.some((q) => appState.verbalAnswers[q.id] !== undefined && appState.verbalAnswers[q.id] !== q.answer);
      }
      return true;
    });

    const listEl = document.getElementById("verbal-passage-list");
    if (filteredPassages.length === 0) {
      listEl.innerHTML = `<div style="padding:14px; color:var(--text-muted); font-size:12px;">条件に一致する長文がありません。</div>`;
      document.getElementById("verbal-drill-workspace").innerHTML = `<div style="padding:20px; color:var(--text-secondary);">フィルター条件を変更してください。</div>`;
      return;
    }

    if (!filteredPassages.some((p) => p.id === activeVerbalPassageId)) {
      activeVerbalPassageId = filteredPassages[0].id;
    }

    listEl.innerHTML = filteredPassages.map((p) => {
      const answeredCount = p.questions.filter((q) => appState.verbalAnswers[q.id] !== undefined).length;
      const correctCount = p.questions.filter((q) => appState.verbalAnswers[q.id] === q.answer).length;
      const isActive = p.id === activeVerbalPassageId;
      return `
        <button class="passage-nav-item ${isActive ? 'active' : ''}" data-passage-id="${p.id}">
          <div class="p-nav-top">
            <span class="mono">${p.id} ｜ ${p.category}</span>
            <span class="mono" style="color:${answeredCount === 4 ? 'var(--accent-primary)' : 'var(--text-muted)'}">${correctCount}/${p.questions.length}正解</span>
          </div>
          <div class="p-nav-title">${p.title}</div>
        </button>
      `;
    }).join("");

    listEl.querySelectorAll(".passage-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeVerbalPassageId = btn.dataset.passageId;
        renderVerbalDrill();
      });
    });

    const passage = window.GAB_VERBAL_DATA.find((p) => p.id === activeVerbalPassageId);
    const workspace = document.getElementById("verbal-drill-workspace");

    const questionsHtml = passage.questions.map((q, idx) => {
      const userAns = appState.verbalAnswers[q.id];
      const isAnswered = userAns !== undefined;

      const choices = [
        { code: "A", label: "A：本文の記述から論理的に正しい" },
        { code: "B", label: "B：本文の記述から論理的に誤っている（矛盾する）" },
        { code: "C", label: "C：本文の記述だけでは正しいとも誤っているとも判断できない" }
      ];

      const choicesHtml = choices.map((c) => {
        let cls = "choice-btn";
        if (isAnswered) {
          if (c.code === q.answer) cls += " correct";
          else if (c.code === userAns && userAns !== q.answer) cls += " wrong";
        }
        return `
          <button class="${cls}" data-qid="${q.id}" data-code="${c.code}">
            <span class="choice-key">${c.code}</span>
            <span>${c.label}</span>
          </button>
        `;
      }).join("");

      const explanationHtml = isAnswered ? `
        <div class="explanation-box">
          <div style="font-weight:700; color:${userAns === q.answer ? 'var(--accent-primary)' : '#fda4af'}; margin-bottom:4px;">
            ${userAns === q.answer ? '✓ 正解' : `✕ 不正解（あなたの選択: ${userAns}）`} ｜ 正答: <span class="mono">${q.answer}</span> ｜ 出題トラップ類型: ${q.trapType}
          </div>
          <div>${q.explanation}</div>
        </div>
      ` : "";

      return `
        <div class="drill-question-card">
          <div class="drill-q-header">
            <span class="q-number-label">設問 ${idx + 1} (${q.id})</span>
            <span class="trap-badge">${isAnswered ? q.trapType : 'A / B / C 論理判定'}</span>
          </div>
          <p class="q-statement-text" style="margin-bottom:12px;">${q.statement}</p>
          <div class="choices-stack">${choicesHtml}</div>
          ${explanationHtml}
        </div>
      `;
    }).join("");

    workspace.innerHTML = `
      <div class="stimulus-header">
        <span class="stimulus-cat">${passage.id} ｜ ${passage.category} ｜ 難易度: ${passage.difficulty}（目標解答時間: 4問で1分55秒）</span>
        <h3 class="stimulus-title">${passage.title}</h3>
      </div>
      <div class="stimulus-passage-text">${passage.passage}</div>
      <div>${questionsHtml}</div>
    `;

    workspace.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qid = btn.dataset.qid;
        const code = btn.dataset.code;
        appState.verbalAnswers[qid] = code;
        saveState();
        renderVerbalDrill();
      });
    });
  }

  // ==========================================
  // 3. NUMERICAL COMPREHENSIVE DRILL
  // ==========================================
  function initNumericalFilters() {
    const patSelect = document.getElementById("numerical-pattern-filter");
    window.GAB_NUMERICAL_DATA.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.id}: ${t.category}`;
      patSelect.appendChild(opt);
    });
    patSelect.addEventListener("change", () => {
      if (patSelect.value !== "ALL") {
        activeNumericalTableId = patSelect.value;
      }
      renderNumericalDrill();
    });
  }

  function buildDataTableHtml(tableObj) {
    const ths = tableObj.headers.map((h) => `<th>${h}</th>`).join("");
    const trs = tableObj.rows.map((r) => {
      return `<tr>${r.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }).join("");

    return `
      <div class="gab-data-table-wrap">
        <div class="table-meta-bar">
          <span><strong>${tableObj.title}</strong></span>
          <span class="mono">${tableObj.unit}</span>
        </div>
        <table class="gab-data-table">
          <thead><tr>${ths}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
        <div class="table-footnote">${tableObj.note}</div>
      </div>
    `;
  }

  function renderNumericalDrill() {
    const patFilter = document.getElementById("numerical-pattern-filter").value;
    const tables = patFilter === "ALL"
      ? window.GAB_NUMERICAL_DATA
      : window.GAB_NUMERICAL_DATA.filter((t) => t.id === patFilter);

    const listEl = document.getElementById("numerical-table-list");
    listEl.innerHTML = tables.map((t) => {
      const correctCount = t.questions.filter((q) => appState.numericalAnswers[q.id] === q.answerIndex).length;
      const isActive = t.id === activeNumericalTableId;
      return `
        <button class="passage-nav-item ${isActive ? 'active' : ''}" data-table-id="${t.id}">
          <div class="p-nav-top">
            <span class="mono">${t.id} ｜ ${t.category}</span>
            <span class="mono" style="color:${correctCount === t.questions.length ? 'var(--accent-primary)' : 'var(--text-muted)'}">${correctCount}/${t.questions.length}正解</span>
          </div>
          <div class="p-nav-title">${t.title}</div>
        </button>
      `;
    }).join("");

    listEl.querySelectorAll(".passage-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeNumericalTableId = btn.dataset.tableId;
        renderNumericalDrill();
      });
    });

    const tableObj = window.GAB_NUMERICAL_DATA.find((t) => t.id === activeNumericalTableId) || tables[0];
    const workspace = document.getElementById("numerical-drill-workspace");

    const questionsHtml = tableObj.questions.map((q, idx) => {
      const userAns = appState.numericalAnswers[q.id];
      const isAnswered = userAns !== undefined;

      const choicesHtml = q.options.map((optText, oIdx) => {
        let cls = "choice-btn";
        if (isAnswered) {
          if (oIdx === q.answerIndex) cls += " correct";
          else if (oIdx === Number(userAns) && Number(userAns) !== q.answerIndex) cls += " wrong";
        }
        const keyChar = String.fromCharCode(65 + oIdx);
        return `
          <button class="${cls}" data-qid="${q.id}" data-oidx="${oIdx}">
            <span class="choice-key">${keyChar}</span>
            <span class="mono">${optText}</span>
          </button>
        `;
      }).join("");

      const explanationHtml = isAnswered ? `
        <div class="explanation-box">
          <div style="font-weight:700; color:${Number(userAns) === q.answerIndex ? 'var(--accent-primary)' : '#fda4af'}; margin-bottom:6px;">
            ${Number(userAns) === q.answerIndex ? '✓ 正解' : '✕ 不正解'} ｜ 正答: <span class="mono">${q.options[q.answerIndex]}</span> ｜ パターン: ${q.pattern}
          </div>
          <div class="formula-banner">秒殺計算式: ${q.formula}</div>
          <div>${q.explanation}</div>
        </div>
      ` : "";

      return `
        <div class="drill-question-card">
          <div class="drill-q-header">
            <span class="q-number-label">設問 ${idx + 1} (${q.id})</span>
            <span class="trap-badge">${q.pattern}</span>
          </div>
          <p class="q-statement-text" style="margin-bottom:12px;">${q.question}</p>
          <div class="choices-stack">${choicesHtml}</div>
          ${explanationHtml}
        </div>
      `;
    }).join("");

    workspace.innerHTML = `
      <div class="stimulus-header">
        <span class="stimulus-cat">${tableObj.id} ｜ ${tableObj.category}（目標解答時間: 1問 72秒以内）</span>
        <h3 class="stimulus-title">${tableObj.title}</h3>
      </div>
      ${buildDataTableHtml(tableObj)}
      <div>${questionsHtml}</div>
    `;

    workspace.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qid = btn.dataset.qid;
        const oidx = Number(btn.dataset.oidx);
        appState.numericalAnswers[qid] = oidx;
        saveState();
        renderNumericalDrill();
      });
    });
  }

  // ==========================================
  // 4. REALISTIC MOCK EXAM ENGINE (52Q / 29Q)
  // ==========================================
  function buildMockQuestions(mode) {
    // Shuffle helper with deterministic option if needed, here standard Fisher-Yates
    function shuffle(arr) {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    }

    // Build Verbal items (13 passages * 4 questions = 52 questions for Web-GAB; 8 passages * 4 = 32 for C-GAB)
    function getVerbalItems(passageCount) {
      const selectedPassages = shuffle(window.GAB_VERBAL_DATA).slice(0, passageCount);
      const items = [];
      selectedPassages.forEach((p, pIdx) => {
        p.questions.forEach((q, qIdx) => {
          items.push({
            type: "verbal",
            sectionLabel: "言語理解テスト",
            passageIndex: pIdx + 1,
            passageTotal: passageCount,
            subQuestionIndex: qIdx + 1,
            stimulusCategory: p.category,
            stimulusTitle: p.title,
            passageText: p.passage,
            qid: q.id,
            statement: q.statement,
            options: [
              { key: "A", text: "A：論理的に正しい" },
              { key: "B", text: "B：論理的に誤っている" },
              { key: "C", text: "C：本文からは判断できない" }
            ],
            correctAnswer: q.answer,
            trapType: q.trapType,
            explanation: q.explanation
          });
        });
      });
      return items;
    }

    // Build Numerical items (exactly 29 questions for both Web-GAB and C-GAB)
    function getNumericalItems(targetCount) {
      const allNumItems = [];
      window.GAB_NUMERICAL_DATA.forEach((t, tIdx) => {
        t.questions.forEach((q, qIdx) => {
          allNumItems.push({
            type: "numerical",
            sectionLabel: "計数理解テスト",
            tableId: t.id,
            stimulusCategory: t.category,
            stimulusTitle: t.title,
            tableObj: t,
            qid: q.id,
            statement: q.question,
            options: q.options.map((opt, oIdx) => ({
              key: String.fromCharCode(65 + oIdx),
              text: opt,
              index: oIdx
            })),
            correctAnswer: q.answerIndex,
            trapType: q.pattern,
            formula: q.formula,
            explanation: q.explanation
          });
        });
      });
      return allNumItems.slice(0, targetCount);
    }

    if (mode === "verbal") {
      return {
        mode: "verbal",
        modeLabel: "Web-GAB 言語理解 本番試験 (25分/52問)",
        phases: [
          { name: "言語理解テスト", durationSec: 25 * 60, items: getVerbalItems(13) }
        ]
      };
    } else if (mode === "numerical") {
      return {
        mode: "numerical",
        modeLabel: "Web-GAB 計数理解 本番試験 (35分/29問)",
        phases: [
          { name: "計数理解テスト", durationSec: 35 * 60, items: getNumericalItems(29) }
        ]
      };
    } else if (mode === "cgab") {
      return {
        mode: "cgab",
        modeLabel: "C-GAB テストセンター模試 (言語15分32問＋計数15分29問)",
        phases: [
          { name: "C-GAB 言語理解 (15分/32問)", durationSec: 15 * 60, items: getVerbalItems(8) },
          { name: "C-GAB 計数理解 (15分/29問)", durationSec: 15 * 60, items: getNumericalItems(29) }
        ]
      };
    } else {
      // Full Web-GAB (25m 52Q Verbal + 35m 29Q Numerical)
      return {
        mode: "full",
        modeLabel: "Web-GAB 本番フル模擬試験 (60分/81問)",
        phases: [
          { name: "第1部：言語理解テスト (25分/52問)", durationSec: 25 * 60, items: getVerbalItems(13) },
          { name: "第2部：計数理解テスト (35分/29問)", durationSec: 35 * 60, items: getNumericalItems(29) }
        ]
      };
    }
  }

  function startMockExam(mode) {
    if (mockTimerInterval) clearInterval(mockTimerInterval);

    const config = buildMockQuestions(mode);
    mockSession = {
      mode: config.mode,
      modeLabel: config.modeLabel,
      phases: config.phases,
      currentPhaseIndex: 0,
      currentQuestionIndex: 0,
      remainingSec: config.phases[0].durationSec,
      totalElapsedSec: 0,
      answers: {} // key: phaseIdx_qIdx -> value
    };

    document.getElementById("mock-lobby").classList.add("hidden");
    document.getElementById("mock-result").classList.add("hidden");
    document.getElementById("mock-arena").classList.remove("hidden");

    renderActiveMockQuestion();

    mockTimerInterval = setInterval(() => {
      if (!mockSession) return;
      mockSession.remainingSec--;
      mockSession.totalElapsedSec++;
      updateMockTimerUI();

      if (mockSession.remainingSec <= 0) {
        advancePhaseOrFinishMock();
      }
    }, 1000);
  }

  function updateMockTimerUI() {
    if (!mockSession) return;
    const timerEl = document.getElementById("exam-timer-display");
    timerEl.textContent = formatSeconds(mockSession.remainingSec);

    timerEl.classList.remove("warning", "danger");
    if (mockSession.remainingSec <= 60) {
      timerEl.classList.add("danger");
    } else if (mockSession.remainingSec <= 300) {
      timerEl.classList.add("warning");
    }

    // Pace evaluation
    const phase = mockSession.phases[mockSession.currentPhaseIndex];
    const idealSecPerQ = phase.durationSec / phase.items.length;
    const elapsedInPhase = phase.durationSec - mockSession.remainingSec;
    const expectedQIndex = Math.floor(elapsedInPhase / idealSecPerQ);
    const diffQ = mockSession.currentQuestionIndex - expectedQIndex;

    const paceEl = document.getElementById("exam-pace-indicator");
    if (diffQ >= 2) {
      paceEl.textContent = `ペース良好: 標準より +${diffQ}問 先行中`;
      paceEl.style.color = "var(--accent-primary)";
    } else if (diffQ <= -2) {
      paceEl.textContent = `ペース注意: 標準より ${Math.abs(diffQ)}問 遅れ（1問${Math.round(idealSecPerQ)}秒目安）`;
      paceEl.style.color = "var(--amber-warn)";
    } else {
      paceEl.textContent = `標準ペース維持（1問あたり目安 ${Math.round(idealSecPerQ)}秒）`;
      paceEl.style.color = "var(--text-secondary)";
    }
  }

  function renderActiveMockQuestion() {
    if (!mockSession) return;
    const phase = mockSession.phases[mockSession.currentPhaseIndex];
    const item = phase.items[mockSession.currentQuestionIndex];
    const totalInPhase = phase.items.length;
    const qNum = mockSession.currentQuestionIndex + 1;

    document.getElementById("exam-section-badge").textContent = phase.name;
    document.getElementById("exam-question-counter").textContent = `問題 ${qNum} / ${totalInPhase}`;

    if (item.type === "verbal") {
      document.getElementById("exam-passage-indicator").textContent = `長文 ${item.passageIndex} / ${item.passageTotal}（設問 ${item.subQuestionIndex}/4）`;
      document.getElementById("exam-instruction-text").innerHTML =
        `左の文章だけから考えて、下の設問文が論理的に正しい場合は <strong>A</strong>、誤っている場合は <strong>B</strong>、本文からは判断できない場合は <strong>C</strong> を選びなさい。`;
    } else {
      document.getElementById("exam-passage-indicator").textContent = `図表 ${item.tableId}（計数理解）`;
      document.getElementById("exam-instruction-text").innerHTML =
        `左の統計・業績データ図表および注記（※）を読み取り、設問に対する最も適切な数値を <strong>A〜E</strong> から1つ選びなさい。`;
    }

    const pct = Math.round((qNum / totalInPhase) * 100);
    document.getElementById("exam-progress-bar").style.width = `${pct}%`;

    // Stimulus Pane
    document.getElementById("exam-stimulus-category").textContent = item.stimulusCategory;
    document.getElementById("exam-stimulus-title").textContent = item.stimulusTitle;

    const stimBody = document.getElementById("exam-stimulus-body");
    if (item.type === "verbal") {
      stimBody.innerHTML = `<div class="stimulus-passage-text">${item.passageText}</div>`;
    } else {
      stimBody.innerHTML = buildDataTableHtml(item.tableObj);
    }

    // Question Pane
    document.getElementById("exam-q-label").textContent = `問題 ${qNum} （ID: ${item.qid}）`;
    document.getElementById("exam-q-statement").textContent = item.statement;

    const ansKey = `${mockSession.currentPhaseIndex}_${mockSession.currentQuestionIndex}`;
    const currentAns = mockSession.answers[ansKey];

    const choicesContainer = document.getElementById("exam-choices-container");
    choicesContainer.innerHTML = item.options.map((opt) => {
      const val = item.type === "verbal" ? opt.key : opt.index;
      const isSelected = currentAns !== undefined && String(currentAns) === String(val);
      return `
        <button class="choice-btn ${isSelected ? 'selected' : ''}" data-val="${val}">
          <span class="choice-key">${opt.key}</span>
          <span>${opt.text}</span>
        </button>
      `;
    }).join("");

    choicesContainer.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rawVal = btn.dataset.val;
        const parsedVal = item.type === "verbal" ? rawVal : Number(rawVal);
        mockSession.answers[ansKey] = parsedVal;
        // Also record into global mastery bank
        if (item.type === "verbal") {
          appState.verbalAnswers[item.qid] = parsedVal;
        } else {
          appState.numericalAnswers[item.qid] = parsedVal;
        }
        saveState();
        renderActiveMockQuestion();
      });
    });

    // Prev / Next buttons
    const prevBtn = document.getElementById("btn-exam-prev");
    prevBtn.disabled = mockSession.currentQuestionIndex === 0;
    prevBtn.style.opacity = mockSession.currentQuestionIndex === 0 ? "0.4" : "1";

    const nextBtn = document.getElementById("btn-exam-next");
    if (qNum === totalInPhase) {
      const hasNextPhase = mockSession.currentPhaseIndex < mockSession.phases.length - 1;
      nextBtn.textContent = hasNextPhase ? "次の科目（計数理解）へ進む →" : "全問解答完了・採点する →";
    } else {
      nextBtn.textContent = "次の問題へ →";
    }

    // Palette Grid
    const paletteGrid = document.getElementById("exam-palette-grid");
    paletteGrid.innerHTML = phase.items.map((_, idx) => {
      const k = `${mockSession.currentPhaseIndex}_${idx}`;
      const isAns = mockSession.answers[k] !== undefined;
      const isCur = idx === mockSession.currentQuestionIndex;
      return `<button class="palette-dot ${isAns ? 'answered' : ''} ${isCur ? 'current' : ''}" data-qidx="${idx}">${idx + 1}</button>`;
    }).join("");

    paletteGrid.querySelectorAll(".palette-dot").forEach((dot) => {
      dot.addEventListener("click", () => {
        mockSession.currentQuestionIndex = Number(dot.dataset.qidx);
        renderActiveMockQuestion();
      });
    });

    updateMockTimerUI();
  }

  function advancePhaseOrFinishMock() {
    if (!mockSession) return;
    if (mockSession.currentPhaseIndex < mockSession.phases.length - 1) {
      mockSession.currentPhaseIndex++;
      mockSession.currentQuestionIndex = 0;
      mockSession.remainingSec = mockSession.phases[mockSession.currentPhaseIndex].durationSec;
      renderActiveMockQuestion();
    } else {
      finishMockExam();
    }
  }

  function finishMockExam() {
    if (mockTimerInterval) {
      clearInterval(mockTimerInterval);
      mockTimerInterval = null;
    }
    if (!mockSession) return;

    let verbalScore = 0;
    let verbalTotal = 0;
    let numScore = 0;
    let numTotal = 0;
    const reviewItems = [];

    mockSession.phases.forEach((phase, pIdx) => {
      phase.items.forEach((item, qIdx) => {
        const userAns = mockSession.answers[`${pIdx}_${qIdx}`];
        const isCorrect = userAns !== undefined && String(userAns) === String(item.correctAnswer);
        if (item.type === "verbal") {
          verbalTotal++;
          if (isCorrect) verbalScore++;
        } else {
          numTotal++;
          if (isCorrect) numScore++;
        }
        reviewItems.push({
          qNumber: reviewItems.length + 1,
          item,
          userAns,
          isCorrect
        });
      });
    });

    const totalScore = verbalScore + numScore;
    const totalQuestions = verbalTotal + numTotal;
    const totalPct = (totalScore / totalQuestions) * 100;
    let deviation = 50 + ((totalPct - 58) / 14) * 10;
    deviation = Number(Math.max(35.0, Math.min(76.0, deviation)).toFixed(1));

    const record = {
      date: new Date().toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
      modeLabel: mockSession.modeLabel,
      verbalScore,
      verbalTotal,
      numScore,
      numTotal,
      deviation,
      elapsedSec: mockSession.totalElapsedSec
    };

    appState.mockHistory.unshift(record);
    saveState();

    document.getElementById("mock-arena").classList.add("hidden");
    const resultEl = document.getElementById("mock-result");
    resultEl.classList.remove("hidden");

    const passVerdict = deviation >= 62
      ? "総合商社・戦略コンサル・外資IB 通過安全圏（A判定）"
      : deviation >= 57
      ? "メガバンク・大手メーカー・専門商社 通過圏内（B判定）"
      : "基礎演習強化推奨（C判定：時間配分とC判定基準の見直しが必要）";

    const reviewHtml = reviewItems.map((r) => {
      const userDisplay = r.userAns === undefined
        ? "未解答"
        : r.item.type === "verbal"
        ? r.userAns
        : `${String.fromCharCode(65 + Number(r.userAns))} (${r.item.options[Number(r.userAns)].text})`;

      const correctDisplay = r.item.type === "verbal"
        ? r.item.correctAnswer
        : `${String.fromCharCode(65 + Number(r.item.correctAnswer))} (${r.item.options[Number(r.item.correctAnswer)].text})`;

      return `
        <div class="drill-question-card" style="border-left: 3px solid ${r.isCorrect ? 'var(--accent-primary)' : 'var(--danger-crimson)'};">
          <div class="drill-q-header">
            <span class="mono" style="font-weight:700; color:${r.isCorrect ? 'var(--accent-primary)' : '#fda4af'}">
              第${r.qNumber}問 [${r.item.qid}] ${r.isCorrect ? '✓ 正解' : '✕ 不正解'}
            </span>
            <span class="trap-badge">${r.item.stimulusCategory} ｜ ${r.item.trapType}</span>
          </div>
          <div style="font-size:13.5px; font-weight:600; margin-bottom:8px;">${r.item.statement}</div>
          <div style="font-size:12.5px; color:var(--text-secondary); margin-bottom:8px;">
            あなたの解答: <strong class="mono">${userDisplay}</strong> ／ 正解: <strong class="mono" style="color:var(--accent-primary)">${correctDisplay}</strong>
          </div>
          ${r.item.formula ? `<div class="formula-banner">計算式: ${r.item.formula}</div>` : ""}
          <div style="font-size:12.5px; color:var(--text-secondary);">${r.item.explanation}</div>
        </div>
      `;
    }).join("");

    resultEl.innerHTML = `
      <div class="panel-card" style="margin-bottom:20px;">
        <div class="section-eyebrow">OFFICIAL SCORE REPORT</div>
        <h2 style="font-size:22px; font-weight:800; margin-bottom:14px;">${record.modeLabel} 採点結果レポート</h2>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">総合推定偏差値</div>
            <div class="kpi-value mono" style="color:var(--accent-primary)">${deviation.toFixed(1)}</div>
            <div class="kpi-meta">${passVerdict}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">総合得点 / 正答率</div>
            <div class="kpi-value mono">${totalScore} / ${totalQuestions}</div>
            <div class="kpi-meta">正答率: ${totalPct.toFixed(1)}%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">科目別内訳</div>
            <div class="kpi-value mono" style="font-size:18px;">
              言語 ${verbalScore}/${verbalTotal} ｜ 計数 ${numScore}/${numTotal}
            </div>
            <div class="kpi-meta">本番ボーダー目安: 言語78% / 計数80%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">総所要時間</div>
            <div class="kpi-value mono">${formatSeconds(record.elapsedSec)}</div>
            <div class="kpi-meta">1問平均: ${(record.elapsedSec / totalQuestions).toFixed(1)} 秒</div>
          </div>
        </div>
        <div style="display:flex; gap:12px;">
          <button id="btn-back-to-mock-lobby" class="btn-primary">模擬テストコース選択へ戻る</button>
          <button id="btn-result-to-dashboard" class="btn-secondary">ダッシュボードで偏差値推移を見る</button>
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-header">
          <h3>全問詳細フィードバック＆秒殺解法レビュー（全${totalQuestions}問）</h3>
          <span class="badge-tag">復習用完全解説</span>
        </div>
        <div>${reviewHtml}</div>
      </div>
    `;

    document.getElementById("btn-back-to-mock-lobby").addEventListener("click", () => {
      resultEl.classList.add("hidden");
      document.getElementById("mock-lobby").classList.remove("hidden");
    });

    document.getElementById("btn-result-to-dashboard").addEventListener("click", () => {
      switchView("dashboard");
    });

    mockSession = null;
  }

  // ==========================================
  // 5. STRATEGY BIBLE & OPQ PERSONALITY
  // ==========================================
  function renderStrategyAndOPQ() {
    const vList = document.getElementById("strategy-verbal-list");
    vList.innerHTML = window.GAB_STRATEGY_DATA.verbalRules.map((r) => `
      <div class="rule-card">
        <div class="rule-card-top">
          <span class="rule-code">${r.code}</span>
          <span class="trap-badge">${r.tag}</span>
        </div>
        <div class="rule-title">${r.title}</div>
        <p class="rule-desc">${r.description}</p>
        <div class="explanation-box" style="margin-top:8px;">
          <div style="font-size:12px; color:var(--text-primary); margin-bottom:4px;"><strong>実例：</strong>${r.example.passageSnippet}</div>
          <div style="font-size:12px; color:var(--text-secondary); white-space:pre-line; margin-bottom:4px;">${r.example.questionSnippet}</div>
          <div style="font-size:12px; color:var(--accent-primary); font-weight:700;">→ ${r.example.verdict}</div>
        </div>
      </div>
    `).join("");

    const nList = document.getElementById("strategy-numerical-list");
    nList.innerHTML = window.GAB_STRATEGY_DATA.numericalRules.map((r) => `
      <div class="rule-card">
        <div class="rule-card-top">
          <span class="rule-code">${r.code}</span>
          <span class="trap-badge">${r.tag}</span>
        </div>
        <div class="rule-title">${r.title}</div>
        <p class="rule-desc">${r.description}</p>
        <div class="formula-banner" style="white-space:pre-line; margin-bottom:0;">${r.formula}</div>
      </div>
    `).join("");

    renderOPQSimulator();
  }

  function renderOPQSimulator() {
    const box = document.getElementById("personality-simulator-box");
    const blocksHtml = window.GAB_PERSONALITY_DATA.map((q, idx) => {
      const sel = appState.opqSelections[q.id] || { most: null, least: null };
      const rowsHtml = q.blocks.map((b) => {
        const isMost = sel.most === b.code;
        const isLeast = sel.least === b.code;
        return `
          <div class="opq-row">
            <div><strong class="mono" style="color:var(--accent-primary); margin-right:6px;">${b.code}.</strong>${b.text}</div>
            <button class="btn-opq-pick ${isMost ? 'active-most' : ''}" data-pid="${q.id}" data-code="${b.code}" data-role="most">最も近い</button>
            <button class="btn-opq-pick ${isLeast ? 'active-least' : ''}" data-pid="${q.id}" data-code="${b.code}" data-role="least">最も遠い</button>
          </div>
        `;
      }).join("");

      return `
        <div class="opq-block-card">
          <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">
            <span>ブロック ${idx + 1} / ${window.GAB_PERSONALITY_DATA.length}（測定次元: ${q.dimension}）</span>
            <span class="mono">${sel.most && sel.least ? '✓ 選択完了' : 'MOST / LEAST を各1つ選択'}</span>
          </div>
          ${rowsHtml}
        </div>
      `;
    }).join("");

    // Calculate OPQ Trait Profile
    const traits = {
      leadership: { label: "主導性・意思決定（商社・フロント職適性）", score: 50 },
      analytical: { label: "論理分析・緻密性（金融・コンサル・企画適性）", score: 50 },
      drive: { label: "目標達成・完遂意欲（営業・事業開発適性）", score: 50 },
      resilience: { label: "ストレス耐性・感情統制（ハードネゴシエーション適性）", score: 50 },
      teamwork: { label: "協調性・合意形成（プロジェクト推進適性）", score: 50 },
      innovation: { label: "変革志向・新規創造（DX・新規事業適性）", score: 50 }
    };

    let completedBlocks = 0;
    window.GAB_PERSONALITY_DATA.forEach((q) => {
      const sel = appState.opqSelections[q.id];
      if (sel && sel.most && sel.least) {
        completedBlocks++;
        q.blocks.forEach((b) => {
          if (b.code === sel.most && traits[b.trait]) traits[b.trait].score += 12;
          if (b.code === sel.least && traits[b.trait]) traits[b.trait].score -= 10;
        });
      }
    });

    const profileHtml = Object.keys(traits).map((k) => {
      const t = traits[k];
      const clamped = Math.max(20, Math.min(95, t.score));
      return `
        <div style="margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
            <span>${t.label}</span>
            <span class="mono" style="font-weight:700; color:var(--accent-primary)">スコア ${clamped}</span>
          </div>
          <div class="borderline-track">
            <div class="borderline-fill" style="width:${clamped}%"></div>
          </div>
        </div>
      `;
    }).join("");

    box.innerHTML = `
      <div style="margin-bottom:16px; padding:14px; background:var(--bg-elevated); border:1px solid var(--border-strong); border-radius:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <h4 style="font-size:13.5px; font-weight:700;">リアルタイム行動特性プロファイル診断（回答済: ${completedBlocks}/${window.GAB_PERSONALITY_DATA.length}）</h4>
          <span class="badge-tag">SHLコンピテンシー換算</span>
        </div>
        ${profileHtml}
      </div>
      <div>${blocksHtml}</div>
    `;

    box.querySelectorAll(".btn-opq-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pid = btn.dataset.pid;
        const code = btn.dataset.code;
        const role = btn.dataset.role;
        const cur = appState.opqSelections[pid] || { most: null, least: null };

        if (role === "most") {
          cur.most = code;
          if (cur.least === code) cur.least = null;
        } else {
          cur.least = code;
          if (cur.most === code) cur.most = null;
        }
        appState.opqSelections[pid] = cur;
        saveState();
        renderOPQSimulator();
      });
    });
  }

  // ==========================================
  // 6. BUILT-IN HIGH-SPEED CALCULATOR
  // ==========================================
  let calcBuffer = "0";

  function initCalculator() {
    const drawer = document.getElementById("calculator-drawer");
    const screen = document.getElementById("calc-input");
    const exprEl = document.getElementById("calc-expression");

    document.getElementById("btn-toggle-calculator").addEventListener("click", () => {
      drawer.classList.toggle("hidden");
    });

    document.getElementById("btn-close-calculator").addEventListener("click", () => {
      drawer.classList.add("hidden");
    });

    function updateScreen() {
      screen.value = calcBuffer;
    }

    function evaluateBuffer() {
      try {
        const sanitized = calcBuffer.replace(/[^0-9+\-*/.()]/g, "");
        if (!sanitized) return;
        const result = Function(`"use strict"; return (${sanitized})`)();
        if (typeof result === "number" && isFinite(result)) {
          exprEl.textContent = `${sanitized} =`;
          calcBuffer = Number(result.toFixed(4)).toString();
          updateScreen();
        }
      } catch (e) {
        exprEl.textContent = "計算式エラー";
      }
    }

    document.querySelectorAll(".calc-key").forEach((keyBtn) => {
      keyBtn.addEventListener("click", () => {
        const k = keyBtn.dataset.key;
        if (k === "C") {
          calcBuffer = "0";
          exprEl.textContent = "";
        } else if (k === "BACK") {
          calcBuffer = calcBuffer.length > 1 ? calcBuffer.slice(0, -1) : "0";
        } else if (k === "=") {
          evaluateBuffer();
          return;
        } else {
          if (calcBuffer === "0" && ![".", "+", "-", "*", "/"].includes(k)) {
            calcBuffer = k;
          } else {
            calcBuffer += k;
          }
        }
        updateScreen();
      });
    });

    document.querySelectorAll(".btn-calc-macro").forEach((mBtn) => {
      mBtn.addEventListener("click", () => {
        calcBuffer = `(${calcBuffer})${mBtn.dataset.macro}`;
        evaluateBuffer();
      });
    });

    document.getElementById("btn-clear-scratchpad").addEventListener("click", () => {
      document.getElementById("calc-scratchpad").value = "";
    });
  }

  function formatSeconds(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  // ==========================================
  // 7. EVENT BINDINGS & KEYBOARD SHORTCUTS
  // ==========================================
  function bindEvents() {
    document.querySelectorAll(".nav-tab, .m-nav-item").forEach((tab) => {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

    // Mobile Mock Exam Pane Switcher
    document.querySelectorAll(".mobile-pane-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mobile-pane-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.pane;
        const stimPane = document.querySelector(".exam-stimulus-pane");
        const qPane = document.querySelector(".exam-question-pane");
        if (!stimPane || !qPane) return;
        if (mode === "stimulus") {
          stimPane.style.display = "block";
          qPane.style.display = "none";
        } else if (mode === "question") {
          stimPane.style.display = "none";
          qPane.style.display = "flex";
        } else {
          stimPane.style.display = "block";
          qPane.style.display = "flex";
        }
      });
    });

    document.getElementById("btn-hero-start-mock").addEventListener("click", () => switchView("mock"));
    document.getElementById("btn-hero-verbal-drill").addEventListener("click", () => switchView("verbal"));
    document.getElementById("btn-hero-numerical-drill").addEventListener("click", () => switchView("numerical"));

    document.getElementById("btn-start-mock-full").addEventListener("click", () => startMockExam("full"));
    document.getElementById("btn-start-mock-verbal").addEventListener("click", () => startMockExam("verbal"));
    document.getElementById("btn-start-mock-numerical").addEventListener("click", () => startMockExam("numerical"));
    document.getElementById("btn-start-mock-cgab").addEventListener("click", () => startMockExam("cgab"));

    document.getElementById("btn-exam-prev").addEventListener("click", () => {
      if (mockSession && mockSession.currentQuestionIndex > 0) {
        mockSession.currentQuestionIndex--;
        renderActiveMockQuestion();
      }
    });

    document.getElementById("btn-exam-next").addEventListener("click", () => {
      if (!mockSession) return;
      const phase = mockSession.phases[mockSession.currentPhaseIndex];
      if (mockSession.currentQuestionIndex < phase.items.length - 1) {
        mockSession.currentQuestionIndex++;
        renderActiveMockQuestion();
      } else {
        advancePhaseOrFinishMock();
      }
    });

    document.getElementById("btn-exam-submit-early").addEventListener("click", () => {
      if (mockSession) finishMockExam();
    });

    document.getElementById("btn-reset-progress").addEventListener("click", () => {
      appState = JSON.parse(JSON.stringify(defaultState));
      saveState();
      renderDashboard();
      if (currentView === "verbal") renderVerbalDrill();
      if (currentView === "numerical") renderNumericalDrill();
      if (currentView === "strategy") renderStrategyAndOPQ();
    });

    // Keyboard shortcuts during Mock Exam
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (!mockSession || currentView !== "mock") return;

      const phase = mockSession.phases[mockSession.currentPhaseIndex];
      const item = phase.items[mockSession.currentQuestionIndex];
      const ansKey = `${mockSession.currentPhaseIndex}_${mockSession.currentQuestionIndex}`;

      const keyUpper = e.key.toUpperCase();
      if (item.type === "verbal") {
        if (["A", "1"].includes(keyUpper)) {
          mockSession.answers[ansKey] = "A";
          renderActiveMockQuestion();
        } else if (["B", "2"].includes(keyUpper)) {
          mockSession.answers[ansKey] = "B";
          renderActiveMockQuestion();
        } else if (["C", "3"].includes(keyUpper)) {
          mockSession.answers[ansKey] = "C";
          renderActiveMockQuestion();
        }
      } else {
        const mapIdx = { "A": 0, "1": 0, "B": 1, "2": 1, "C": 2, "3": 2, "D": 3, "4": 3, "E": 4, "5": 4 };
        if (mapIdx[keyUpper] !== undefined && mapIdx[keyUpper] < item.options.length) {
          mockSession.answers[ansKey] = mapIdx[keyUpper];
          renderActiveMockQuestion();
        }
      }

      if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        document.getElementById("btn-exam-next").click();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        document.getElementById("btn-exam-prev").click();
      }
    });
  }

  // Initialize application
  initVerbalFilters();
  initNumericalFilters();
  initCalculator();
  bindEvents();
  renderDashboard();
  syncFromCloudState();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
})();
