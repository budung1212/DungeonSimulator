// app.js
const $ = (sel) => document.querySelector(sel);

const SAVE_KEY = "dungeon_party_sim_save_v1";

const state = {
  data: { jobs: null, scenarios: null, traits: null, items: null, statuses: null, skills: null },
  party: [],              // members (max 4)
  pairAffinity: {},       // key "idA|idB" => number
  scenario: null,
  eventIndex: 0,
  inventory: [],          // { itemId, qty }
  gold: 0,
  activeModal: null,      // { type:"item"|"skill", id, casterIndex, enemyIndex? }
  combat: null,           // { monsters:[], inCombat:boolean }
  setupEditingIndex: null // number | null (캐릭터 설정 모달 편집용)
};

/**
 * Portrait asset resolver
 * - 여기에 jobId -> 이미지 경로를 마음대로 추가해두면,
 *   파티 슬롯/런 화면에서 자동으로 직업별 프로필이 뜹니다.
 * - 파일 예시:
 *   /assets/portraits/default.png
 *   /assets/portraits/shield_knight.png
 */
const PORTRAITS = {
  default: "./assets/portraits/default.png",
  shield_knight: "./assets/portraits/shield_knight.png",
  axe_thrower: "./assets/portraits/axe_thrower.png",
  greatsword_warrior: "./assets/portraits/greatsword_warrior.png",
  mace_paladin: "./assets/portraits/mace_paladin.png",

  pyromancer: "./assets/portraits/pyromancer.png",
  elementalist: "./assets/portraits/elementalist.png",
  thunder_mage: "./assets/portraits/thunder_mage.png",
  cleric: "./assets/portraits/cleric.png",

  hermit: "./assets/portraits/hermit.png",
  bard: "./assets/portraits/bard.png",
  dungeon_expert: "./assets/portraits/dungeon_expert.png"
};

function portraitFor(jobId) {
  return PORTRAITS[jobId] || PORTRAITS.default;
}

// ---------- Utils ----------
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function rndInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uuid() {
  return (crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`);
}
function logLine(text) {
  const el = $("#log");
  if (!el) return;
  const prev = el.innerHTML.trim();
  const line = `• ${esc(text)}`;
  el.innerHTML = prev ? `${prev}<br/>${line}` : line;
}

// ---------- Data helpers ----------
function findJob(catId, jobId) {
  const cat = state.data.jobs.categories.find(c => c.id === catId);
  return cat?.jobs?.find(j => j.id === jobId) ?? null;
}
function getSkillDef(id) { return state.data.skills?.definitions?.[id] ?? null; }
function getItemDef(id) { return state.data.items.definitions[id]; }
function getStatusDef(id) { return state.data.statuses.definitions[id]; }

// ---------- Traits dropdown (unique across 3) ----------
function getTraitPool() { return state.data.traits.traitPool ?? []; }

function buildTraitDropdowns() {
  const pool = getTraitPool();
  const sels = [$("#traitSel1"), $("#traitSel2"), $("#traitSel3")].filter(Boolean);
  if (sels.length !== 3) return;

  for (const sel of sels) {
    sel.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "선택";
    sel.appendChild(empty);

    for (const t of pool) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    }
  }

  function refresh() {
    const chosen = new Set(sels.map(s => s.value).filter(Boolean));

    for (const sel of sels) {
      const keep = sel.value;
      sel.innerHTML = "";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "선택";
      sel.appendChild(empty);

      for (const t of pool) {
        const selectedElsewhere = chosen.has(t) && keep !== t;
        if (selectedElsewhere) continue;
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (t === keep) opt.selected = true;
        sel.appendChild(opt);
      }
    }
  }

  sels.forEach(s => s.addEventListener("change", refresh));
  refresh();
}

function getSelectedTraits() {
  const arr = [$("#traitSel1")?.value, $("#traitSel2")?.value, $("#traitSel3")?.value]
    .map(x => (x || "").trim())
    .filter(Boolean);
  return [...new Set(arr)].slice(0, 3);
}

// ---------- Jobs UI ----------
function buildJobUI() {
  const jobs = state.data.jobs;
  const catSel = $("#categorySelect");
  const jobSel = $("#jobSelect");
  if (!catSel || !jobSel) return;

  catSel.innerHTML = "";
  for (const c of jobs.categories) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    catSel.appendChild(opt);
  }

  function refreshJobs() {
    const cat = jobs.categories.find(x => x.id === catSel.value);
    jobSel.innerHTML = "";
    for (const j of cat.jobs) {
      const opt = document.createElement("option");
      opt.value = j.id;
      opt.textContent = j.name;
      jobSel.appendChild(opt);
    }
  }

  catSel.onchange = refreshJobs;
  refreshJobs();
}

// ---------- Party / Setup Modal ----------
function openSetupModal(mode, index = null) {
  // mode: "new" | "edit"
  const modal = $("#setupModal");
  if (!modal) return;

  state.setupEditingIndex = (mode === "edit") ? index : null;

  // 초기값 세팅
  if (mode === "new") {
    resetMemberForm();
  } else if (mode === "edit") {
    loadMemberToForm(index);
  }

  modal.classList.remove("hidden");
}

function closeSetupModal() {
  const modal = $("#setupModal");
  if (!modal) return;
  modal.classList.add("hidden");
  state.setupEditingIndex = null;
}

function resetMemberForm() {
  if ($("#nameInput")) $("#nameInput").value = "";
  if ($("#categorySelect")) {
    // 첫 카테고리 선택으로 복귀
    const catSel = $("#categorySelect");
    if (catSel.options.length) catSel.selectedIndex = 0;
    catSel.dispatchEvent(new Event("change"));
  }
  if ($("#traitSel1")) $("#traitSel1").value = "";
  if ($("#traitSel2")) $("#traitSel2").value = "";
  if ($("#traitSel3")) $("#traitSel3").value = "";
  $("#traitSel1")?.dispatchEvent(new Event("change"));
}

function loadMemberToForm(index) {
  const m = state.party[index];
  if (!m) return;
  if ($("#nameInput")) $("#nameInput").value = m.name;
  if ($("#categorySelect")) {
    $("#categorySelect").value = m.categoryId;
    $("#categorySelect").dispatchEvent(new Event("change"));
  }
  if ($("#jobSelect")) $("#jobSelect").value = m.jobId;

  $("#traitSel1").value = m.traits[0] ?? "";
  $("#traitSel2").value = m.traits[1] ?? "";
  $("#traitSel3").value = m.traits[2] ?? "";
  $("#traitSel1").dispatchEvent(new Event("change"));
}

function createMemberFromForm(existingId = null) {
  const name = ($("#nameInput")?.value || "이름없는 모험가").trim();
  const categoryId = $("#categorySelect")?.value;
  const jobId = $("#jobSelect")?.value;
  const job = findJob(categoryId, jobId);
  if (!job) throw new Error("직업 정보를 찾을 수 없습니다.");

  const traits = getSelectedTraits();
  const skillPack = state.data.skills.jobSkillMap?.[jobId] ?? { active: [], passive: [] };

  const maxHp = job.base.hp ?? 10;
  const maxMp = job.base.mp ?? 5;

  return {
    id: existingId ?? uuid(),
    name,
    categoryId,
    jobId,
    jobName: job.name,
    stats: { ...job.base },   // hp/mp/atk/mag/def/luck
    hp: maxHp,
    mp: maxMp,
    maxHp,
    maxMp,
    traits,
    statuses: [],
    temp: {},                 // combat temp buffs
    skills: {
      active: [...(skillPack.active ?? [])],
      passive: [...(skillPack.passive ?? [])]
    }
  };
}

// ---------- Party / Affinity ----------
function pairKey(aId, bId) {
  return (aId < bId) ? `${aId}|${bId}` : `${bId}|${aId}`;
}
function getPairAffinity(aId, bId) {
  return state.pairAffinity[pairKey(aId, bId)] ?? 0;
}
function addPairAffinity(aId, bId, delta) {
  const k = pairKey(aId, bId);
  state.pairAffinity[k] = (state.pairAffinity[k] ?? 0) + delta;
}
function initPairAffinities() {
  state.pairAffinity = {};
  for (let i = 0; i < state.party.length; i++) {
    for (let j = i + 1; j < state.party.length; j++) {
      state.pairAffinity[pairKey(state.party[i].id, state.party[j].id)] = 0;
    }
  }
}
function avgAffinityFor(memberId) {
  const others = state.party.filter(m => m.id !== memberId);
  if (others.length === 0) return 0;
  const sum = others.reduce((a, m) => a + getPairAffinity(memberId, m.id), 0);
  return Math.round(sum / others.length);
}

/**
 * ✅ Setup 화면 파티 슬롯 렌더
 * - 항상 4칸
 * - 비어있으면 "+ 파티원 추가" 버튼
 * - 있으면 캐릭터 카드 + 삭제 버튼
 * - 카드 클릭하면 편집 모달 열림
 */
function renderPartySlots() {
  const wrap = $("#partyPreview");
  if (!wrap) return;

  wrap.innerHTML = "";

  const max = 4;
  const defs = state.data.skills?.definitions ?? {};

  for (let i = 0; i < max; i++) {
    const slot = document.createElement("div");
    slot.className = "partySlot";

    const m = state.party[i];

    // ✅ 1) 빈 슬롯: + 파티원 추가 버튼만
    if (!m) {
      slot.innerHTML = `
        <button class="slotAddBtn" type="button" data-add="${i}">
          <span style="font-size:18px;">＋</span> 파티원 추가
        </button>
      `;
      wrap.appendChild(slot);
      continue;
    }

    // ✅ 2) 파티원 있음: 카드 렌더
    const allSkillIds = [
      ...(m.skills?.active ?? []),
      ...(m.skills?.passive ?? [])
    ];

    // 너무 길어지니 2개만 노출 (원하면 숫자 조절 가능)
    const showSkillDefs = allSkillIds
      .map(id => defs[id])
      .filter(Boolean)
      .slice(0, 2);

    const skillLines = (showSkillDefs.length ? showSkillDefs : [])
      .map(s => `<div class="slotSkillLine"><b>${esc(s.name)}</b>: ${esc(s.description)}</div>`)
      .join("") || `<div class="slotSkillLine muted">스킬 없음</div>`;

    slot.innerHTML = `
      <div class="slotCard" data-edit="${i}">
        <div class="slotLeft">
          <!-- 3-1) 이미지 영역 고정 -->
          <div class="portraitWrap">
            <img class="portrait" src="${esc(portraitFor(m.jobId))}" alt="portrait" />
          </div>

          <!-- 3-2) 텍스트 영역(좌측 정렬) -->
          <div class="slotInfoText">
            <div class="slotNameLine">
              ${esc(m.name)} <span class="muted">(${esc(m.jobName)})</span>
            </div>
            <div class="slotMetaLine">
              성격 : ${esc((m.traits ?? []).join(", ") || "없음")}
            </div>
            <div class="slotStatLine">
              HP: ${m.hp}/${m.maxHp},&nbsp;&nbsp;MP: ${m.mp}/${m.maxMp}
            </div>
            ${skillLines}
          </div>
        </div>

        <!-- 3-3) 삭제 버튼: 우측 중앙 -->
        <button class="ghost slotDelBtn" type="button" data-del="${i}">삭제</button>
      </div>
    `;

    wrap.appendChild(slot);
  }

  // ✅ 빈 슬롯: 추가 버튼 → 캐릭터 설정 모달 열기(추가)
  wrap.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.add);
      // "지정 슬롯에 추가"를 원하면 idx를 저장해도 되고,
      // 지금 구조처럼 "배열 끝에 push"면 idx는 굳이 안써도 됩니다.
      openSetupModalForAdd(); 
    });
  });

  // ✅ 카드 클릭 → 편집 모달 열기
  wrap.querySelectorAll("[data-edit]").forEach(card => {
    card.addEventListener("click", (e) => {
      // 삭제 버튼 클릭이면 편집 열지 않기
      const delBtn = e.target?.closest?.("[data-del]");
      if (delBtn) return;
      const idx = Number(card.dataset.edit);
      openSetupModalForEdit(idx);
    });
  });

  // ✅ 삭제 버튼
  wrap.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.del);
      const removed = state.party[idx];
      state.party.splice(idx, 1);

      initPairAffinities();
      renderPartySlots();
      logLine(`파티원 제거: ${removed?.name ?? ""}`);
    });
  });
}



// ---------- Setup Confirm (add/edit) ----------
function confirmMemberFromModal() {
  const editing = state.setupEditingIndex;

  if (editing == null && state.party.length >= 4) {
    alert("파티는 최대 4명까지입니다.");
    return;
  }

  try {
    if (editing == null) {
      const member = createMemberFromForm(null);
      state.party.push(member);
      initPairAffinities();
      logLine(`파티원 추가: ${member.name}`);
    } else {
      const old = state.party[editing];
      const member = createMemberFromForm(old?.id ?? null);

      // 편집 시: hp/mp/status 유지(원하면 초기화 가능)
      if (old) {
        member.hp = old.hp;
        member.mp = old.mp;
        member.maxHp = old.maxHp;
        member.maxMp = old.maxMp;
        member.statuses = [...(old.statuses ?? [])];
        member.temp = { ...(old.temp ?? {}) };
      }

      state.party[editing] = member;
      initPairAffinities();
      logLine(`파티원 수정: ${old?.name ?? ""} → ${member.name}`);
    }

    renderPartySlots();
    closeSetupModal();
  } catch (e) {
    console.error(e);
    alert(e.message || "캐릭터 생성 중 오류");
  }
}

// ---------- Status handling ----------
function hasStatus(m, sid) { return (m.statuses ?? []).includes(sid); }
function addStatus(m, sid) {
  // 도끼 투사 패시브: 상태이상 무시
  if (hasPassive(m, "ignore_status")) return;
  if (!m.statuses.includes(sid)) m.statuses.push(sid);
}
function removeStatus(m, sid) {
  m.statuses = (m.statuses ?? []).filter(x => x !== sid);
}
function hasPassive(m, passiveId) {
  return (m.skills?.passive ?? []).includes(passiveId);
}

// ---------- Effects ----------
function applyToMember(m, effects) {
  for (const [k, v] of Object.entries(effects || {})) {
    if (k === "hp") m.hp = clamp(m.hp + v, 0, m.maxHp);
    else if (k === "mp") m.mp = clamp(m.mp + v, 0, m.maxMp);
    else if (k === "gold") state.gold += v;
    else {
      m[k] = (m[k] ?? 0) + v;
    }
  }
}

// ---------- Trait/Interaction checks ----------
function traitConflict(a, b) {
  const pairs = state.data.traits?.rules?.keywords?.conflicts ?? [];
  return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
function computeTraitAffinity(playerTraits, bias) {
  const rules = state.data.traits.rules.affinity;
  const preferred = bias?.preferred ?? [];
  const conflict = bias?.conflict ?? [];
  let delta = 0;

  for (const t of preferred) {
    delta += playerTraits.includes(t) ? rules.match : rules.partial;
  }
  for (const t of conflict) {
    if (playerTraits.includes(t)) delta += rules.conflict;
  }

  // 내부 상극 패널티
  for (let i = 0; i < playerTraits.length; i++) {
    for (let j = i + 1; j < playerTraits.length; j++) {
      if (traitConflict(playerTraits[i], playerTraits[j])) delta -= 2;
    }
  }
  return delta;
}

// 기존 코드에서 쓰던 함수들(호감도 계산) — 유지
function traitInteractionDelta(aTraits, bTraits) {
  const aff = state.data.traits?.rules?.affinity ?? { match: 8, partial: 2, conflict: -6 };
  const kw = state.data.traits?.rules?.keywords ?? {};
  const matchPairs = kw.match ?? [];
  const partialPairs = kw.partial ?? [];
  const conflictPairs = kw.conflicts ?? [];

  let delta = 0;
  const allPairs = [];
  for (const a of (aTraits ?? [])) for (const b of (bTraits ?? [])) allPairs.push([a, b]);

  const hasPair = (pairs, x, y) => pairs.some(([p, q]) => (p === x && q === y) || (p === y && q === x));

  for (const [x, y] of allPairs) {
    if (hasPair(matchPairs, x, y)) delta += aff.match;
    else if (hasPair(partialPairs, x, y)) delta += aff.partial;
    else if (hasPair(conflictPairs, x, y)) delta += aff.conflict;
  }
  return delta;
}
function eventBiasDelta(actorTraits, traitBias) {
  if (!traitBias) return 0;
  return computeTraitAffinity(actorTraits ?? [], traitBias);
}

// ---------- Passive bonus for checks ----------
function passiveCheckBonus(member, event, stat) {
  let bonus = 0;

  // dungeon_expert puzzle_master: +luck on checks for puzzle tags
  if (hasPassive(member, "puzzle_master")) {
    const cond = getSkillDef("puzzle_master")?.condition?.eventTagsAny ?? [];
    const ok = cond.some(t => (event.tags ?? []).includes(t));
    if (ok) {
      bonus += (member.stats.luck ?? 0);
    }
  }

  return bonus;
}

// ---------- Luck mechanic ----------
function chance(pct) { return Math.random() < (pct / 100); }

// ---------- Recommend actor ----------
function recommendActorIndex(event) {
  if (event.type === "combat") {
    let best = 0;
    let bestScore = -1e9;
    state.party.forEach((m, i) => {
      if (m.hp <= 0) return;
      const score =
        (m.stats.atk ?? 0) * 1.2 +
        (m.stats.mag ?? 0) * 1.2 +
        (m.stats.def ?? 0) * 0.4 +
        (m.stats.luck ?? 0) * 0.6;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return best;
  }

  const dcStat = event?.choices?.[0]?.check?.stat;
  let best = 0;
  let bestScore = -1e9;

  state.party.forEach((m, i) => {
    if (m.hp <= 0) return;
    const base = (dcStat ? (m.stats[dcStat] ?? 0) : 0);
    const bonus = passiveCheckBonus(m, event, dcStat);
    const trait = computeTraitAffinity(m.traits, event.traitBias);
    const score = base * 2 + bonus * 1.5 + (m.stats.luck ?? 0) * 0.5 + trait * 0.2;
    if (score > bestScore) { bestScore = score; best = i; }
  });

  return best;
}

// ---------- UI Render (RUN) ----------
function renderStatusBar() {
  const hpSum = state.party.reduce((a, m) => a + m.hp, 0);
  const hpMax = state.party.reduce((a, m) => a + m.maxHp, 0);
  const mpSum = state.party.reduce((a, m) => a + m.mp, 0);
  const mpMax = state.party.reduce((a, m) => a + m.maxMp, 0);

  $("#statusBar").innerHTML = `
    <div class="pill">파티 HP <b>${hpSum}</b> / ${hpMax}</div>
    <div class="pill">파티 MP <b>${mpSum}</b> / ${mpMax}</div>
    <div class="pill">GOLD <b>${state.gold}</b></div>
    <div class="pill">진행 <b>${state.eventIndex + 1}</b> / ${state.scenario.events.length}</div>
  `;
}

function renderPartyRunList() {
  const wrap = $("#partyRunList");
  wrap.innerHTML = "";

  state.party.forEach((m) => {
    const statusNames = (m.statuses ?? []).map(sid => getStatusDef(sid)?.name ?? sid);
    const avgAff = avgAffinityFor(m.id);

    const div = document.createElement("div");
    div.className = "partyRunItem";
    div.innerHTML = `
      <div class="rowBetween">
        <div style="display:flex; gap:10px; align-items:center;">
          <img class="portrait" src="${esc(portraitFor(m.jobId))}" alt="portrait" />
          <div>
            <div style="font-weight:800;">${esc(m.name)} <span class="muted small">/ ${esc(m.jobName)}</span></div>
            <div class="muted small">성격: ${esc(m.traits.join(", ") || "없음")}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          <span class="badge">HP <b>${m.hp}</b>/${m.maxHp}</span>
          <span class="badge">MP <b>${m.mp}</b>/${m.maxMp}</span>
          <span class="badge">평균 호감도 <b>${avgAff}</b></span>
        </div>
      </div>
      <div class="tags">
        <span class="tag">상태: ${esc(statusNames.join(", ") || "정상")}</span>
      </div>
    `;
    wrap.appendChild(div);
  });

  // actor select
  const actorSel = $("#actorSelect");
  actorSel.innerHTML = "";
  state.party.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${m.name} (${m.jobName})`;
    actorSel.appendChild(opt);
  });

  // portrait 보정
  wrap.querySelectorAll(".portrait").forEach(img => {
    img.style.width = "44px";
    img.style.height = "44px";
    img.style.borderRadius = "12px";
    img.style.objectFit = "cover";
    img.style.border = "1px solid rgba(203,191,169,.95)";
    img.style.background = "rgba(255,255,255,.35)";
  });
}

function renderAffinityPairs() {
  const wrap = $("#affinityPairs");
  wrap.innerHTML = "";
  if (state.party.length < 2) {
    wrap.innerHTML = `<div class="muted small">파티원이 2명 이상이어야 표시됩니다.</div>`;
    return;
  }

  for (let i = 0; i < state.party.length; i++) {
    for (let j = i + 1; j < state.party.length; j++) {
      const a = state.party[i], b = state.party[j];
      const val = getPairAffinity(a.id, b.id);
      const div = document.createElement("div");
      div.className = "affPair";
      div.innerHTML = `
        <div class="rowBetween">
          <div class="muted small">${esc(a.name)} ↔ ${esc(b.name)}</div>
          <div class="affVal ${val >= 0 ? "pos" : "neg"}">${val >= 0 ? "+" : ""}${val}</div>
        </div>
      `;
      wrap.appendChild(div);
    }
  }
}

function renderInventory() {
  const wrap = $("#inventoryList");
  wrap.innerHTML = "";
  if (state.inventory.length === 0) {
    wrap.innerHTML = `<div class="muted small">인벤토리가 비어 있습니다.</div>`;
    return;
  }
  for (const it of state.inventory) {
    const def = getItemDef(it.itemId);
    if (!def) continue;
    const btn = document.createElement("button");
    btn.className = "itemBtn";
    btn.innerHTML = `
      <div style="font-weight:800;">${esc(def.name)} <span class="muted small">x${it.qty}</span></div>
      <div class="meta">${esc(def.description)}</div>
    `;
    btn.onclick = () => openTargetModal("item", it.itemId, null);
    wrap.appendChild(btn);
  }
}

function renderSkills() {
  const wrap = $("#skillsList");
  wrap.innerHTML = "";

  const defs = state.data.skills?.definitions ?? {};

  state.party.forEach((m, mi) => {
    for (const sid of (m.skills.active ?? [])) {
      const s = defs[sid];
      if (!s || s.type !== "active") continue;

      const btn = document.createElement("button");
      btn.className = "skillBtn";
      const mpOk = m.mp > 0;
      btn.innerHTML = `
        <div style="font-weight:800;">${esc(s.name)} <span class="muted small">(${esc(m.name)} · MP ${m.mp}/${m.maxMp})</span></div>
        <div class="meta">${esc(s.description)}</div>
      `;
      btn.onclick = () => {
        if (!mpOk) {
          alert(`${m.name}의 MP가 0이라 액티브 스킬을 사용할 수 없습니다.`);
          return;
        }
        if (s.target === "enemy" || s.target === "all_enemies") {
          if (!state.combat?.inCombat) {
            alert("이 스킬은 전투 중에 사용할 수 있어요.");
            return;
          }
          openEnemyModal("skill", sid, mi);
        } else if (s.target === "all_allies") {
          useSkill(sid, mi, null);
        } else {
          openTargetModal("skill", sid, mi);
        }
      };
      wrap.appendChild(btn);
    }

    const passives = (m.skills.passive ?? []).map(id => defs[id]).filter(Boolean);
    if (passives.length) {
      const p = document.createElement("div");
      p.className = "muted small";
      p.style.marginTop = "6px";
      p.innerHTML = `<b>${esc(m.name)}</b> 패시브: ${esc(passives.map(x => x.name).join(", "))}`;
      wrap.appendChild(p);
    }
  });

  if (wrap.innerHTML.trim() === "") {
    wrap.innerHTML = `<div class="muted small">스킬이 없습니다.</div>`;
  }
}

function renderAll() {
  renderStatusBar();
  renderPartyRunList();
  renderAffinityPairs();
  renderInventory();
  renderSkills();
}

// ---------- Modal (target selection) ----------
function closeModal() {
  $("#modal")?.classList.add("hidden");
  state.activeModal = null;
}

function openTargetModal(type, id, casterIndex) {
  state.activeModal = { type, id, casterIndex };

  const modal = $("#modal");
  const body = $("#modalBody");
  const title = $("#modalTitle");
  const desc = $("#modalDesc");
  if (!modal || !body || !title || !desc) return;

  body.innerHTML = "";

  if (type === "item") {
    const def = getItemDef(id);
    title.textContent = `아이템 대상 선택: ${def?.name ?? id}`;
    desc.textContent = def?.description ?? "";
  } else {
    const def = getSkillDef(id);
    const caster = state.party[casterIndex];
    title.textContent = `스킬 대상 선택: ${def?.name ?? id}`;
    desc.textContent = caster ? `${caster.name} 사용 (MP 1 소모)` : (def?.description ?? "");
  }

  state.party.forEach((m, idx) => {
    const statusNames = (m.statuses ?? []).map(sid => getStatusDef(sid)?.name ?? sid);
    const btn = document.createElement("button");
    btn.className = "targetBtn";
    btn.innerHTML = `
      <div style="font-weight:800;">${esc(m.name)} <span class="muted small">/ ${esc(m.jobName)}</span></div>
      <div class="muted small">HP ${m.hp}/${m.maxHp} · MP ${m.mp}/${m.maxMp} · 상태: ${esc(statusNames.join(", ") || "정상")}</div>
    `;
    btn.onclick = () => {
      if (type === "item") useItem(id, idx);
      else useSkill(id, casterIndex, idx);
      closeModal();
    };
    body.appendChild(btn);
  });

  modal.classList.remove("hidden");
}

function openEnemyModal(type, id, casterIndex) {
  if (!state.combat?.inCombat) {
    alert("전투 중이 아닙니다.");
    return;
  }
  state.activeModal = { type, id, casterIndex };

  const modal = $("#modal");
  const body = $("#modalBody");
  const title = $("#modalTitle");
  const desc = $("#modalDesc");
  if (!modal || !body || !title || !desc) return;

  body.innerHTML = "";

  const def = getSkillDef(id);
  const caster = state.party[casterIndex];
  title.textContent = `대상(적) 선택: ${def?.name ?? id}`;
  desc.textContent = caster ? `${caster.name} 사용 (MP 1 소모)` : (def?.description ?? "");

  state.combat.monsters.forEach((mon, idx) => {
    const btn = document.createElement("button");
    btn.className = "targetBtn";
    btn.innerHTML = `
      <div style="font-weight:800;">${esc(mon.name)}</div>
      <div class="muted small">HP ${mon.hp}/${mon.maxHp} · ATK ${mon.atk} · MAG ${mon.mag} · DEF ${mon.def}</div>
    `;
    btn.onclick = () => {
      useSkill(id, casterIndex, null, idx);
      closeModal();
    };
    body.appendChild(btn);
  });

  modal.classList.remove("hidden");
}

// ---------- Inventory ----------
function addItem(itemId, qty) {
  const it = state.inventory.find(x => x.itemId === itemId);
  if (it) it.qty += qty;
  else state.inventory.push({ itemId, qty });
}

function useItem(itemId, targetIndex) {
  const inv = state.inventory.find(x => x.itemId === itemId);
  if (!inv || inv.qty <= 0) return;

  const item = getItemDef(itemId);
  const target = state.party[targetIndex];
  if (!item || !target) return;

  logLine(`아이템 사용: ${item.name} → ${target.name}`);

  // block if has status (HP potion addiction)
  if (item.extra?.blockIfHasStatus && hasStatus(target, item.extra.blockIfHasStatus)) {
    logLine(`${target.name}은(는) '${getStatusDef(item.extra.blockIfHasStatus)?.name ?? item.extra.blockIfHasStatus}' 상태로 포션 회복이 불가능하다.`);
  } else {
    applyToMember(target, item.effects ?? {});
    if (item.effects?.hp) logLine(`${target.name} HP +${item.effects.hp}`);
    if (item.effects?.mp) logLine(`${target.name} MP +${item.effects.mp}`);
  }

  // chance status
  if (item.extra?.applyStatus && (item.extra?.chance ?? 0) > 0) {
    if (Math.random() < item.extra.chance) {
      addStatus(target, item.extra.applyStatus);
      logLine(`${target.name}에게 상태이상 '${getStatusDef(item.extra.applyStatus)?.name ?? item.extra.applyStatus}'이 부여되었다!`);
    }
  }

  inv.qty -= 1;
  if (inv.qty <= 0) state.inventory = state.inventory.filter(x => x.itemId !== itemId);

  renderAll();
}

// ---------- Skills ----------
function spendMpOrFail(caster, mpCost) {
  if (caster.mp < mpCost) return false;
  caster.mp -= mpCost;
  return true;
}

function applyTemp(member, tempObj) {
  member.temp = member.temp ?? {};
  for (const [k, v] of Object.entries(tempObj || {})) {
    member.temp[k] = (member.temp[k] ?? 0) + v;
  }
}

function physicalDamage(attacker, defender, raw) {
  let dmg = raw;

  // luck crit
  if (chance(attacker.stats?.luck ?? 0)) {
    dmg = Math.floor(dmg * 2);
    logLine(`치명타! (${attacker.name})`);
  }

  // defender evade
  if (chance(defender.stats?.luck ?? defender.luck ?? 0)) {
    logLine(`회피! ${defender.name}이(가) 공격을 피했다.`);
    return 0;
  }

  // def blocks 0.5*def
  const reduced = Math.floor((defender.stats?.def ?? defender.def ?? 0) * 0.5);
  dmg = Math.max(0, dmg - reduced);

  // damageHalf temp
  if (defender.temp?.damageHalf) {
    dmg = Math.floor(dmg / 2);
    defender.temp.damageHalf = Math.max(0, defender.temp.damageHalf - 1);
    logLine(`${defender.name}의 보호로 피해가 절반이 되었다.`);
  }

  return dmg;
}

function magicDamage(attacker, defender, raw) {
  let dmg = raw;

  if (chance(attacker.stats?.luck ?? 0)) {
    dmg = Math.floor(dmg * 2);
    logLine(`치명타! (${attacker.name})`);
  }

  if (chance(defender.stats?.luck ?? defender.luck ?? 0)) {
    logLine(`회피! ${defender.name}이(가) 마법을 피했다.`);
    return 0;
  }

  const reduced = Math.floor((defender.stats?.def ?? defender.def ?? 0) * 0.5);
  dmg = Math.max(0, dmg - reduced);

  if (defender.temp?.damageHalf) {
    dmg = Math.floor(dmg / 2);
    defender.temp.damageHalf = Math.max(0, defender.temp.damageHalf - 1);
    logLine(`${defender.name}의 보호로 피해가 절반이 되었다.`);
  }

  return dmg;
}

function useSkill(skillId, casterIndex, targetIndex, enemyIndex = null) {
  const s = getSkillDef(skillId);
  const caster = state.party[casterIndex];
  if (!s || !caster) return;

  const mpCost = s.mpCost ?? 1;
  if (!spendMpOrFail(caster, mpCost)) {
    alert(`${caster.name}의 MP가 부족합니다.`);
    return;
  }

  const allAllies = state.party;
  const allEnemies = state.combat?.monsters ?? [];
  const targetAlly = (targetIndex != null) ? state.party[targetIndex] : null;
  const targetEnemy = (enemyIndex != null) ? allEnemies[enemyIndex] : null;

  logLine(`스킬 사용: ${caster.name} - ${s.name}`);

  if (s.removeStatus?.length && targetAlly) {
    for (const sid of s.removeStatus) {
      if (hasStatus(targetAlly, sid)) {
        removeStatus(targetAlly, sid);
        logLine(`${targetAlly.name}의 '${getStatusDef(sid)?.name ?? sid}'이 제거되었다.`);
      } else {
        logLine(`${targetAlly.name}에게 제거할 '${getStatusDef(sid)?.name ?? sid}'이 없다.`);
      }
    }
  }

  if (s.heal) {
    const v = s.heal.value ?? 0;
    if (s.target === "all_allies") {
      allAllies.forEach(a => { a.hp = clamp(a.hp + v, 0, a.maxHp); });
      logLine(`아군 전원 HP +${v}`);
    } else if (targetAlly) {
      targetAlly.hp = clamp(targetAlly.hp + v, 0, targetAlly.maxHp);
      logLine(`${targetAlly.name} HP +${v}`);
    }
  }

  if (s.damage) {
    if (!state.combat?.inCombat) {
      logLine("하지만 전투 중이 아니어서 공격 스킬은 효과가 없다.");
    } else {
      const stat = s.damage.stat;
      const mult = s.damage.mult ?? 1;
      const raw = Math.floor((caster.stats[stat] ?? 0) * mult);

      if (s.target === "all_enemies") {
        allEnemies.forEach(mon => {
          const dmg = (s.damage.kind === "magic")
            ? magicDamage(caster, mon, raw)
            : physicalDamage(caster, mon, raw);
          mon.hp = clamp(mon.hp - dmg, 0, mon.maxHp);
          logLine(`${mon.name} 피해 ${dmg}`);
        });
      } else if (targetEnemy) {
        const dmg = (s.damage.kind === "magic")
          ? magicDamage(caster, targetEnemy, raw)
          : physicalDamage(caster, targetEnemy, raw);
        targetEnemy.hp = clamp(targetEnemy.hp - dmg, 0, targetEnemy.maxHp);
        logLine(`${targetEnemy.name} 피해 ${dmg}`);
      }
    }
  }

  if (s.applyTemp) {
    if (targetAlly) applyTemp(targetAlly, s.applyTemp);
    else applyTemp(caster, s.applyTemp);
  }

  if (s.affinityAllPairs?.byCasterLuck) {
    const delta = caster.stats.luck ?? 0;
    for (let i = 0; i < state.party.length; i++) {
      for (let j = i + 1; j < state.party.length; j++) {
        addPairAffinity(state.party[i].id, state.party[j].id, delta);
      }
    }
    logLine(`화음이 울린다… 파티 호감도(모든 페어) +${delta}`);
  }

  renderAll();
  if (state.combat?.inCombat) renderCombatChoices();
}

// ---------- Combat ----------
function startCombatFromEvent(ev) {
  const monsters = (ev.combat?.monsters ?? []).map(m => ({
    ...m,
    maxHp: m.hp
  }));

  state.combat = {
    inCombat: true,
    monsters,
    reward: ev.combat?.reward ?? { gold: 0, items: [] }
  };

  logLine(`전투 시작: ${ev.title}`);
}

function tryStealthSkipCombat() {
  const candidates = state.party.filter(m => m.hp > 0 && hasPassive(m, "stealth"));
  if (candidates.length === 0) return { ok: false, reason: "은신술 보유자가 없다." };

  const best = candidates.reduce((a, b) => (a.stats.luck ?? 0) >= (b.stats.luck ?? 0) ? a : b);
  const pct = best.stats.luck ?? 0;
  const ok = chance(pct);
  return { ok, reason: ok ? `${best.name}의 은신술 성공! (확률 ${pct}%)` : `${best.name}의 은신술 실패… (확률 ${pct}%)` };
}

function livingParty() { return state.party.filter(m => m.hp > 0); }
function livingMonsters() { return (state.combat?.monsters ?? []).filter(m => m.hp > 0); }

function partyAutoAction() {
  const mons = livingMonsters();
  if (mons.length === 0) return;

  const allies = livingParty();

  const low = allies.find(a => a.hp > 0 && a.hp <= Math.floor(a.maxHp * 0.45));
  const healers = allies.filter(a => a.mp > 0 && (a.skills.active ?? []).some(sid => {
    const s = getSkillDef(sid);
    return s?.heal;
  }));

  if (low && healers.length) {
    const caster = healers.reduce((a, b) => (a.stats.mag ?? 0) >= (b.stats.mag ?? 0) ? a : b);
    const mi = state.party.findIndex(x => x.id === caster.id);
    const pref = ["divine_hand", "spirit_heal", "paladin_heal"];
    const sid = pref.find(x => caster.skills.active.includes(x)) ?? caster.skills.active[0];
    const s = getSkillDef(sid);

    if (s.target === "all_allies") useSkill(sid, mi, null);
    else useSkill(sid, mi, state.party.findIndex(x => x.id === low.id));
    return;
  }

  const storm = allies.find(a => a.mp > 0 && a.skills.active.includes("thunder_strike") && mons.length >= 2);
  if (storm) {
    useSkill("thunder_strike", state.party.findIndex(x => x.id === storm.id), null);
    return;
  }

  const attacker = allies.find(a => a.mp > 0 && (a.skills.active ?? []).some(sid => getSkillDef(sid)?.damage && getSkillDef(sid)?.target === "enemy"));
  if (attacker) {
    const mi = state.party.findIndex(x => x.id === attacker.id);
    const sid = attacker.skills.active.find(sid => getSkillDef(sid)?.damage && getSkillDef(sid)?.target === "enemy");
    const target = pick(mons);
    const ei = state.combat.monsters.findIndex(x => x.id === target.id);
    useSkill(sid, mi, null, ei);
    return;
  }

  allies.forEach(a => {
    if (livingMonsters().length === 0) return;
    const target = pick(livingMonsters());
    const raw = (a.stats.atk ?? 0);
    const dmg = physicalDamage(a, target, raw);
    target.hp = clamp(target.hp - dmg, 0, target.maxHp);
    logLine(`${a.name} 기본공격 → ${target.name} 피해 ${dmg}`);
  });
}

function monstersAutoAttack() {
  const mons = livingMonsters();
  const allies = livingParty();
  if (mons.length === 0 || allies.length === 0) return;

  mons.forEach(mon => {
    if (livingParty().length === 0) return;
    const target = pick(livingParty());

    const useMagic = (mon.mag ?? 0) > (mon.atk ?? 0) ? Math.random() < 0.7 : Math.random() < 0.3;
    if (useMagic) {
      const raw = mon.mag ?? 0;
      const dmg = magicDamage(mon, target, raw);
      target.hp = clamp(target.hp - dmg, 0, target.maxHp);
      logLine(`${mon.name} 마법공격 → ${target.name} 피해 ${dmg}`);
    } else {
      const raw = mon.atk ?? 0;
      const dmg = physicalDamage(mon, target, raw);
      target.hp = clamp(target.hp - dmg, 0, target.maxHp);
      logLine(`${mon.name} 물리공격 → ${target.name} 피해 ${dmg}`);
    }
  });
}

function combatRound() {
  if (!state.combat?.inCombat) return;
  if (livingParty().length === 0) {
    logLine("파티 전멸…");
    state.combat.inCombat = false;
    return;
  }
  if (livingMonsters().length === 0) {
    logLine("적을 모두 처치했다!");
    endCombatWin();
    return;
  }

  partyAutoAction();

  if (livingMonsters().length === 0) {
    logLine("적을 모두 처치했다!");
    endCombatWin();
    return;
  }

  monstersAutoAttack();

  if (livingParty().length === 0) {
    logLine("파티 전멸…");
    state.combat.inCombat = false;
    renderAll();
    renderCombatChoices();
    return;
  }

  renderAll();
  renderCombatChoices();
}

function endCombatWin() {
  const reward = state.combat.reward ?? { gold: 0, items: [] };
  state.gold += (reward.gold ?? 0);
  logLine(`전투 보상: GOLD +${reward.gold ?? 0}`);

  for (const it of (reward.items ?? [])) {
    addItem(it.itemId, it.qty);
    logLine(`획득: ${getItemDef(it.itemId)?.name ?? it.itemId} x${it.qty}`);
  }

  state.combat.inCombat = false;
  state.combat = null;

  renderAll();
  renderEventChoicesAfterCombat();
}

// ---------- Event flow ----------
function currentEvent() {
  return state.scenario.events[state.eventIndex];
}

function setEventUI(ev) {
  $("#eventTitle").textContent = ev.title;
  $("#eventText").textContent = ev.text ?? "";
  $("#eventTypeBadge").innerHTML = `<b>${esc(ev.type ?? "event")}</b>`;

  const rec = recommendActorIndex(ev);
  $("#actorSelect").value = String(rec);
  $("#recommendText").textContent = `추천 행동자: ${state.party[rec]?.name ?? ""}`;
}

function renderEvent() {
  const ev = currentEvent();
  setEventUI(ev);

  if (ev.type === "combat") {
    $("#choices").innerHTML = "";

    const skipBtn = document.createElement("button");
    skipBtn.className = "choiceBtn";
    skipBtn.textContent = "은신으로 전투 회피 시도(은둔자 패시브)";
    skipBtn.onclick = () => {
      const r = tryStealthSkipCombat();
      logLine(r.reason);
      if (r.ok) {
        logLine("전투를 피했다. 조용히 지나간다.");
        postEventAffinityTick();
        goNextEvent();
      } else {
        startCombatFromEvent(ev);
        renderCombatChoices();
      }
    };
    $("#choices").appendChild(skipBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "choiceBtn";
    startBtn.textContent = "전투 시작(자동 전투)";
    startBtn.onclick = () => {
      startCombatFromEvent(ev);
      renderCombatChoices();
    };
    $("#choices").appendChild(startBtn);

    return;
  }

  if (ev.type === "rest") {
    $("#choices").innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = `휴식하기 (파티 HP +${ev.rest?.hp ?? 0}, MP +${ev.rest?.mp ?? 0})`;
    btn.onclick = () => {
      const hp = ev.rest?.hp ?? 0;
      const mp = ev.rest?.mp ?? 0;
      state.party.forEach(m => {
        if (m.hp > 0) {
          m.hp = clamp(m.hp + hp, 0, m.maxHp);
          m.mp = clamp(m.mp + mp, 0, m.maxMp);
        }
      });
      logLine(`휴식 효과: 파티 HP +${hp}, MP +${mp}`);
      postEventAffinityTick();
      renderAll();
      goNextEvent();
    };
    $("#choices").appendChild(btn);
    return;
  }

  if (ev.type === "shop") {
    $("#choices").innerHTML = "";
    const offers = ev.shop?.offers ?? [];
    offers.forEach(off => {
      const def = getItemDef(off.itemId);
      const btn = document.createElement("button");
      btn.className = "choiceBtn";
      btn.textContent = `구매: ${def?.name ?? off.itemId} (${off.price}G)`;
      btn.onclick = () => {
        if (state.gold < off.price) {
          logLine("GOLD가 부족하다.");
          return;
        }
        state.gold -= off.price;
        addItem(off.itemId, 1);
        logLine(`구매 완료: ${def?.name ?? off.itemId} x1 (-${off.price}G)`);
        renderAll();
      };
      $("#choices").appendChild(btn);
    });

    const leave = document.createElement("button");
    leave.className = "choiceBtn";
    leave.textContent = "상인을 떠난다";
    leave.onclick = () => {
      postEventAffinityTick();
      goNextEvent();
    };
    $("#choices").appendChild(leave);
    return;
  }

  $("#choices").innerHTML = "";
  (ev.choices ?? []).forEach(ch => {
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = ch.label;
    btn.onclick = () => resolveChoice(ev, ch);
    $("#choices").appendChild(btn);
  });
}

function checkRoll(member, ev, stat) {
  const base = member.stats[stat] ?? 0;
  const bonus = passiveCheckBonus(member, ev, stat);
  const d6 = 1 + Math.floor(Math.random() * 6);
  return base + bonus + d6;
}

function resolveChoice(ev, ch) {
  const actorIndex = Number($("#actorSelect").value || "0");
  const actor = state.party[actorIndex];
  if (!actor) return;

  const stat = ch.check?.stat;
  const dc = ch.check?.dc ?? 10;
  const rolled = stat ? checkRoll(actor, ev, stat) : 999;
  const ok = rolled >= dc;
  const out = ok ? ch.success : ch.fail;

  logLine(`${ev.title} - 행동자: ${actor.name} - 선택: "${ch.label}"`);
  if (stat) logLine(`판정: ${stat.toUpperCase()} ${rolled} vs DC ${dc} → ${ok ? "성공" : "실패"}`);
  logLine(out.log);

  applyToMember(actor, out.effects ?? {});
  if (out.effects?.gold) logLine(`GOLD ${out.effects.gold >= 0 ? "+" : ""}${out.effects.gold}`);

  const biasDelta = eventBiasDelta(actor.traits, ev.traitBias);

  state.party.forEach(m => {
    if (m.id === actor.id) return;
    const pairDelta = biasDelta + traitInteractionDelta(actor.traits, m.traits);
    addPairAffinity(actor.id, m.id, pairDelta);
    logLine(`성격 상호작용: ${actor.name} ↔ ${m.name} 호감도 ${pairDelta >= 0 ? "+" : ""}${pairDelta}`);
  });

  postEventAffinityTick();
  renderAll();
  goNextEvent();
}

function renderCombatChoices() {
  $("#eventTypeBadge").innerHTML = `<b>combat</b>`;
  $("#choices").innerHTML = "";

  const mons = livingMonsters();
  const monText = mons.map(m => `${m.name}(${m.hp}/${m.maxHp})`).join(" · ") || "없음";
  const info = document.createElement("div");
  info.className = "muted small";
  info.textContent = `적 상태: ${monText}`;
  $("#choices").appendChild(info);

  const btn = document.createElement("button");
  btn.className = "choiceBtn";
  btn.textContent = "전투 1라운드 진행(자동)";
  btn.onclick = combatRound;
  $("#choices").appendChild(btn);

  const flee = document.createElement("button");
  flee.className = "choiceBtn";
  flee.textContent = "도주 시도(성공 확률: 파티 평균 luck%)";
  flee.onclick = () => {
    const avgLuck = Math.round(state.party.reduce((a, m) => a + (m.stats.luck ?? 0), 0) / Math.max(1, state.party.length));
    const ok = chance(avgLuck);
    if (ok) {
      logLine(`도주 성공! (확률 ${avgLuck}%)`);
      state.combat = null;
      postEventAffinityTick();
      goNextEvent();
    } else {
      logLine(`도주 실패… (확률 ${avgLuck}%)`);
      monstersAutoAttack();
      renderAll();
      renderCombatChoices();
    }
  };
  $("#choices").appendChild(flee);
}

function renderEventChoicesAfterCombat() {
  $("#choices").innerHTML = "";
  const btn = document.createElement("button");
  btn.className = "choiceBtn";
  btn.textContent = "전투 종료 → 다음 이벤트로";
  btn.onclick = () => {
    postEventAffinityTick();
    goNextEvent();
  };
  $("#choices").appendChild(btn);
}

function goNextEvent() {
  if (livingParty().length === 0) {
    $("#choices").innerHTML = "";
    logLine("파티 전멸… 던전에서 쓰러졌다.");
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = "다시 도전";
    btn.onclick = resetAll;
    $("#choices").appendChild(btn);
    return;
  }

  state.eventIndex += 1;
  if (state.eventIndex >= state.scenario.events.length) {
    finishScenario();
  } else {
    renderAll();
    renderEvent();
  }
}

function finishScenario() {
  $("#choices").innerHTML = "";
  logLine(`던전 클리어! 최종 GOLD ${state.gold}`);
  const btn = document.createElement("button");
  btn.className = "primary";
  btn.textContent = "다시 시작";
  btn.onclick = resetAll;
  $("#choices").appendChild(btn);
}

// ---------- Affinity Threshold Events ----------
function formatScript(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

function postEventAffinityTick() {
  const cfg = state.data.scenarios.affinityThresholdEvents;
  if (!cfg) return;

  for (let i = 0; i < state.party.length; i++) {
    for (let j = i + 1; j < state.party.length; j++) {
      const a = state.party[i], b = state.party[j];
      const val = getPairAffinity(a.id, b.id);

      if (val >= cfg.positive.min) {
        if (Math.random() < (cfg.positive.chancePerPair ?? 0)) {
          const hp = rndInt(1, 3);
          const mp = rndInt(1, 3);
          a.hp = clamp(a.hp + hp, 0, a.maxHp);
          b.hp = clamp(b.hp + hp, 0, b.maxHp);
          a.mp = clamp(a.mp + mp, 0, a.maxMp);
          b.mp = clamp(b.mp + mp, 0, b.maxMp);

          const tpl = pick(cfg.positive.scripts ?? ["{a}와(과) {b}가 서로를 북돋운다."]);
          logLine(formatScript(tpl, { a: a.name, b: b.name, hp, mp }));
        }
      } else if (val <= cfg.negative.max) {
        if (Math.random() < (cfg.negative.chancePerPair ?? 0)) {
          const hp = rndInt(1, 3);
          const mp = rndInt(1, 3);
          a.hp = clamp(a.hp - hp, 0, a.maxHp);
          b.hp = clamp(b.hp - hp, 0, b.maxHp);
          a.mp = clamp(a.mp - mp, 0, a.maxMp);
          b.mp = clamp(b.mp - mp, 0, b.maxMp);

          const tpl = pick(cfg.negative.scripts ?? ["{a}와(과) {b}의 사이가 험악해진다."]);
          logLine(formatScript(tpl, { a: a.name, b: b.name, hp, mp }));
        }
      }
    }
  }
}

// ---------- Save/Load ----------
function serialize() {
  return {
    party: state.party,
    pairAffinity: state.pairAffinity,
    scenario: state.scenario,
    eventIndex: state.eventIndex,
    inventory: state.inventory,
    gold: state.gold,
    logHTML: $("#log")?.innerHTML ?? ""
  };
}
function hydrate(obj) {
  state.party = obj.party ?? [];
  state.pairAffinity = obj.pairAffinity ?? {};
  state.scenario = obj.scenario ?? null;
  state.eventIndex = obj.eventIndex ?? 0;
  state.inventory = obj.inventory ?? [];
  state.gold = obj.gold ?? 0;

  if ($("#log")) $("#log").innerHTML = obj.logHTML ?? "";
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
    alert("세이브 완료!");
  } catch (e) {
    console.error(e);
    alert("세이브 실패(브라우저 저장소 문제)");
  }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      alert("세이브 데이터가 없습니다.");
      return;
    }
    const obj = JSON.parse(raw);
    hydrate(obj);

    closeSetupModal();

    if (state.scenario) {
      $("#setupCard").classList.add("hidden");
      $("#runCard").classList.remove("hidden");
      $("#scenarioTitle").textContent = state.scenario.title;
      $("#scenarioDesc").textContent = state.scenario.description;
      renderAll();
      renderEvent();
      alert("로드 완료!");
    } else {
      $("#setupCard").classList.remove("hidden");
      $("#runCard").classList.add("hidden");
      renderPartySlots();
      alert("로드 완료!(파티만)");
    }
  } catch (e) {
    console.error(e);
    alert("로드 실패(데이터 손상)");
  }
}
function wipeSave() {
  localStorage.removeItem(SAVE_KEY);
  alert("세이브 삭제 완료!");
}

// ---------- Start / Reset ----------
function startRun() {
  if (state.party.length === 0) {
    alert("파티원이 최소 1명 필요합니다.");
    return;
  }

  state.inventory = [
    { itemId: "hp_potion", qty: 2 },
    { itemId: "mp_potion", qty: 1 }
  ];
  state.gold = 30;

  state.scenario = pick(state.data.scenarios.scenarios);
  state.eventIndex = 0;
  state.combat = null;

  $("#setupCard").classList.add("hidden");
  $("#runCard").classList.remove("hidden");

  $("#scenarioTitle").textContent = state.scenario.title;
  $("#scenarioDesc").textContent = state.scenario.description;

  $("#log").innerHTML = "";
  logLine(`시나리오 시작: ${state.scenario.title}`);

  renderAll();
  renderEvent();
}

function resetAll() {
  state.scenario = null;
  state.eventIndex = 0;
  state.inventory = [];
  state.gold = 0;
  state.combat = null;

  closeSetupModal();

  $("#setupCard").classList.remove("hidden");
  $("#runCard").classList.add("hidden");
  if ($("#log")) $("#log").innerHTML = "";

  renderPartySlots();
}

// ---------- Init ----------
async function init() {
  state.data.jobs = await loadJSON("./data/jobs.json");
  state.data.scenarios = await loadJSON("./data/scenarios.json");
  state.data.traits = await loadJSON("./data/traits.json");
  state.data.items = await loadJSON("./data/items.json");
  state.data.statuses = await loadJSON("./data/statuses.json");
  state.data.skills = await loadJSON("./data/skills.json");

  buildJobUI();
  buildTraitDropdowns();

  // Setup screen
  renderPartySlots();

  // Party clear
  $("#clearPartyBtn").onclick = () => {
    state.party = [];
    initPairAffinities();
    renderPartySlots();
    closeSetupModal();
  };

  // Enter dungeon
  $("#startBtn").onclick = startRun;

  // Run reset
  $("#resetBtn").onclick = resetAll;

  // target modal close
  $("#modalClose").onclick = closeModal;
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  // setup modal close/cancel/confirm
  $("#setupCloseBtn").onclick = closeSetupModal;
  $("#setupCancelBtn").onclick = closeSetupModal;
  $("#addMemberBtn").onclick = confirmMemberFromModal;
  $("#setupModal").addEventListener("click", (e) => {
    if (e.target.id === "setupModal") closeSetupModal();
  });

  // save/load
  $("#saveBtn").onclick = saveGame;
  $("#loadBtn").onclick = loadGame;
  $("#wipeSaveBtn").onclick = wipeSave;

  // actor select change
  $("#actorSelect").addEventListener("change", () => {
    const idx = Number($("#actorSelect").value || "0");
    $("#recommendText").textContent = `선택 행동자: ${state.party[idx]?.name ?? ""}`;
  });
}

init().catch(err => {
  console.error(err);
  alert("초기화 실패: " + err.message);
});
