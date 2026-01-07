// app.js
const $ = (sel) => document.querySelector(sel);

const state = {
  data: { jobs: null, scenarios: null, traits: null },
  player: null,
  scenario: null,
  eventIndex: 0
};

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeTrait(t) {
  return (t || "").trim();
}

function traitConflict(traitsData, a, b) {
  const pairs = traitsData?.rules?.keywords?.conflicts ?? [];
  return pairs.some(([x,y]) =>
    (x === a && y === b) || (x === b && y === a)
  );
}

function computeTraitAffinity(traitsData, playerTraits, bias) {
  const rules = traitsData.rules.affinity;
  const preferred = bias?.preferred ?? [];
  const conflict = bias?.conflict ?? [];

  let delta = 0;

  // match preferred
  for (const t of preferred) {
    if (playerTraits.includes(t)) delta += rules.match;
    else delta += rules.partial; // 살짝 보너스(원하면 0으로 바꿔도 됨)
  }

  // explicit conflicts (event-defined)
  for (const t of conflict) {
    if (playerTraits.includes(t)) delta += rules.conflict;
  }

  // trait vs trait internal conflicts (player traits 상극이면 약간 페널티)
  for (let i=0;i<playerTraits.length;i++) {
    for (let j=i+1;j<playerTraits.length;j++) {
      if (traitConflict(traitsData, playerTraits[i], playerTraits[j])) delta -= 2;
    }
  }

  return delta;
}

function rollStat(player, stat) {
  const base = player.stats[stat] ?? 0;
  const d6 = 1 + Math.floor(Math.random() * 6);
  // luck는 굴림에 영향이 크고, blessing이 있으면 약간 보너스
  const luckBonus = Math.floor((player.stats.luck ?? 0) / 2);
  const blessBonus = (player.blessing ?? 0) > 0 ? 1 : 0;
  return base + d6 + luckBonus + blessBonus;
}

function applyEffects(player, effects) {
  for (const [k, v] of Object.entries(effects || {})) {
    if (k === "hp") player.hp += v;
    else if (k === "gold") player.gold += v;
    else if (k === "affinity") player.affinity += v;
    else {
      // 확장 스탯/상태는 여기서 누적
      player[k] = (player[k] ?? 0) + v;
    }
  }
  // 최소값 보정
  player.hp = Math.max(0, player.hp);
}

function renderStatus() {
  const p = state.player;
  const traitText = p.traits.join(", ");
  $("#statusBar").innerHTML = `
    <div class="pill"><b>${p.name}</b> / ${p.jobName}</div>
    <div class="pill">HP <b>${p.hp}</b></div>
    <div class="pill">GOLD <b>${p.gold}</b></div>
    <div class="pill">호감도 <b>${p.affinity}</b></div>
    <div class="pill">성격 <b>${traitText}</b></div>
  `;
}

function appendLog(text) {
  const el = $("#log");
  const prev = el.innerHTML.trim();
  el.innerHTML = prev ? `${prev}<br/>• ${escapeHTML(text)}` : `• ${escapeHTML(text)}`;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function renderEvent() {
  const ev = state.scenario.events[state.eventIndex];
  $("#eventTitle").textContent = ev.title;
  $("#eventText").textContent = ev.text;

  const wrap = $("#choices");
  wrap.innerHTML = "";
  for (const ch of ev.choices) {
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = ch.label;
    btn.onclick = () => resolveChoice(ev, ch);
    wrap.appendChild(btn);
  }
}

function finishScenario() {
  $("#choices").innerHTML = "";
  appendLog(`던전 클리어! 최종 보상: GOLD ${state.player.gold}, 호감도 ${state.player.affinity}, HP ${state.player.hp}`);
  const btn = document.createElement("button");
  btn.className = "primary";
  btn.textContent = "다시 시작";
  btn.onclick = reset;
  $("#choices").appendChild(btn);
}

function resolveChoice(ev, ch) {
  const p = state.player;

  // 성격 기반 호감도 가중치
  const traitDelta = computeTraitAffinity(state.data.traits, p.traits, ev.traitBias);

  const stat = ch.check?.stat;
  const dc = ch.check?.dc ?? 10;
  const rolled = stat ? rollStat(p, stat) : 999;

  const ok = rolled >= dc;
  const outcome = ok ? ch.success : ch.fail;

  appendLog(`${ev.title} - 선택: "${ch.label}"`);
  if (stat) appendLog(`판정: ${stat.toUpperCase()} 굴림 ${rolled} vs DC ${dc} → ${ok ? "성공" : "실패"}`);

  // outcome 로그/효과
  appendLog(outcome.log);

  // 기본 효과 적용
  applyEffects(p, outcome.effects);

  // 성격 기반 호감도 추가 반영 (affinity만)
  p.affinity += traitDelta;
  appendLog(`성격 상호작용: 호감도 ${traitDelta >= 0 ? "+" : ""}${traitDelta}`);

  // 축복 소비(원하면 제거 가능)
  if ((p.blessing ?? 0) > 0 && stat) {
    p.blessing -= 1;
    appendLog("축복이 희미해졌다. (blessing -1)");
  }

  renderStatus();

  // 다음 이벤트 / 종료
  state.eventIndex += 1;

  // 사망 처리
  if (p.hp <= 0) {
    $("#choices").innerHTML = "";
    appendLog("HP가 0이 되었다. 던전에서 쓰러졌다…");
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = "다시 도전";
    btn.onclick = reset;
    $("#choices").appendChild(btn);
    return;
  }

  if (state.eventIndex >= state.scenario.events.length) finishScenario();
  else renderEvent();
}

function reset() {
  state.player = null;
  state.scenario = null;
  state.eventIndex = 0;

  $("#setupCard").classList.remove("hidden");
  $("#runCard").classList.add("hidden");
  $("#log").innerHTML = "";
}

function buildJobUI(jobsData) {
  const catSel = $("#categorySelect");
  const jobSel = $("#jobSelect");

  catSel.innerHTML = "";
  for (const c of jobsData.categories) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    catSel.appendChild(opt);
  }

  function refreshJobs() {
    const catId = catSel.value;
    const cat = jobsData.categories.find(x => x.id === catId);
    jobSel.innerHTML = "";
    for (const j of cat.jobs) {
      const opt = document.createElement("option");
      opt.value = j.id;
      opt.textContent = j.name;
      opt.dataset.base = JSON.stringify(j.base);
      jobSel.appendChild(opt);
    }
  }

  catSel.onchange = refreshJobs;
  refreshJobs();
}

function validateTraits(traitsData, traits) {
  const pool = new Set(traitsData.traitPool.map(normalizeTrait));
  // 풀에 없는 키워드는 허용하되 경고 로그(원하면 막아도 됨)
  const unique = [...new Set(traits.map(normalizeTrait).filter(Boolean))];
  return { unique, unknown: unique.filter(t => !pool.has(t)) };
}

function startRun() {
  const name = ($("#nameInput").value || "이름없는 모험가").trim();

  const catId = $("#categorySelect").value;
  const jobId = $("#jobSelect").value;

  const jobsData = state.data.jobs;
  const cat = jobsData.categories.find(c => c.id === catId);
  const job = cat.jobs.find(j => j.id === jobId);

  const rawTraits = [$("#trait1").value, $("#trait2").value, $("#trait3").value];
  const { unique, unknown } = validateTraits(state.data.traits, rawTraits);

  // 플레이어 생성
  state.player = {
    name,
    categoryId: catId,
    jobId,
    jobName: job.name,
    stats: { ...job.base },
    hp: (job.base.hp ?? 10),
    gold: 0,
    affinity: 0,
    traits: unique.slice(0, 3),
    blessing: 0
  };

  // 시나리오 랜덤 선택
  const scenarios = state.data.scenarios.scenarios;
  state.scenario = pickRandom(scenarios);
  state.eventIndex = 0;

  // UI 전환
  $("#setupCard").classList.add("hidden");
  $("#runCard").classList.remove("hidden");

  $("#scenarioTitle").textContent = state.scenario.title;
  $("#scenarioDesc").textContent = state.scenario.description;

  $("#log").innerHTML = "";
  appendLog(`시나리오 시작: ${state.scenario.title}`);
  if (unknown.length) appendLog(`주의: traitPool에 없는 키워드가 있어도 진행됨 → ${unknown.join(", ")}`);

  renderStatus();
  renderEvent();
}

async function init() {
  state.data.jobs = await loadJSON("./data/jobs.json");
  state.data.scenarios = await loadJSON("./data/scenarios.json");
  state.data.traits = await loadJSON("./data/traits.json");

  buildJobUI(state.data.jobs);

  $("#startBtn").onclick = startRun;
  $("#resetBtn").onclick = reset;
}

init().catch(err => {
  console.error(err);
  alert("데이터 로딩 실패: " + err.message);
});
