# Web-GAB Mastery Studio (`web-gab-trainer`)

Production preparation & full-volume mock examination suite for SHL Japan's **Web-GAB** and **C-GAB** aptitude assessments (adopted by top trading houses, investment banks, and strategy consultancies).

---

## 1. Concept & Objective
- **Objective**: Enable candidates to master every question archetype of SHL Web-GAB/C-GAB and experience realistic full-length mock examinations with exact question counts and countdown timers.
- **Exact Exam Specifications Implemented**:
  - **Web-GAB Verbal (言語理解・論理的読解)**: **25 minutes / 52 questions** (13 passages × 4 questions, True `A` / False `B` / Cannot Say `C`).
  - **Web-GAB Numerical (計数理解・図表の読み取り)**: **35 minutes / 29 questions** (multi-column business tables, 5-choice calculations `A`–`E`).
  - **C-GAB Test Center Mode**: **Verbal 15 min / 32 questions** + **Numerical 15 min / 29 questions**.
  - **SHL OPQ Personality Simulator**: 4-option forced-choice (Ipsative: 1 MOST / 1 LEAST per quartet) with real-time competency scoring.

---

## 2. Architecture & Tech Stack
- **Production URL (Render)**: `https://web-gab-mastery-studio.onrender.com` (`srv-dc22eg2vcj2c73a1oo0g`)
- **GitHub Repository**: `https://github.com/zak-yn/web-gab-mastery-studio`
- **Runtime**: Zero-dependency Node.js HTTP server (`server.js`, port `5185` / `process.env.PORT`) + mobile-first PWA (`manifest.webmanifest`, `sw.js`).
- **Persistence**: Client-side `localStorage` (`web_gab_mastery_state_v1`) + **Upstash Redis Cloud Sync** (`/api/state`) so progress syncs seamlessly between smartphone and PC.

---

## 3. Directory Structure
```text
web-gab-trainer/
├── AGENTS.md                   # Single Source of Truth specification
├── server.js                   # Static HTTP server on port 5185
└── public/
    ├── index.html              # 5-view SPA shell + floating calculator & scratchpad
    ├── styles.css              # Anti-AI Japanese Editorial Dark UI stylesheet
    ├── app.js                  # State store, mock exam engine, timer, calculator
    └── data/
        ├── verbal-data.js      # 16 academic/business passages × 4 questions (64 Qs)
        ├── numerical-data.js   # 10 multi-metric data tables (35 Qs)
        └── strategy-data.js    # Verbal 4 rules, Numerical 5 formulas, OPQ blocks
```

---

## 4. API & State Specifications
- `window.GAB_VERBAL_DATA`: Array of 16 passage objects (`id`, `category`, `title`, `difficulty`, `passage`, `questions[{ id, statement, answer, trapType, explanation }]`).
- `window.GAB_NUMERICAL_DATA`: Array of 10 table objects (`id`, `category`, `title`, `unit`, `note`, `headers`, `rows`, `questions[{ id, pattern, question, options, answerIndex, formula, explanation }]`).
- `window.GAB_STRATEGY_DATA` & `window.GAB_PERSONALITY_DATA`: Strategy rules and OPQ forced-choice blocks.

---

## 5. UI & Anti-AI Editorial Guidelines
- Follows `japanese-editorial-ui` standards: deep ink slate surfaces (`#0d1117`, `#161b22`), single NewsPicks emerald accent (`#00ba7c`), crisp 1px borders, `JetBrains Mono` tabular numerals, and zero emoji clutter.

---

## 6. Verification Steps
1. Run syntax check: `node -c server.js` and `node -c public/app.js`.
2. Start server: `node server.js` (`http://localhost:5185`).
3. Verify in browser: confirm 64 verbal questions, 35 numerical questions, full 81-question (52+29) mock exam countdown, floating calculator macros, and 0 console errors.

---

## 7. Changelog
- **2026-11-23**: Initial release of Web-GAB Mastery Studio with 64 verbal questions, 35 numerical questions, 4 mock exam courses (Full 81Q, Verbal 52Q, Numerical 29Q, C-GAB 61Q), built-in calculator/scratchpad, and OPQ simulator.
