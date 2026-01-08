import { state } from "./state.js";
import { $, uuid, clamp, logLine } from "./utils.js";
import { findJob, getSkillDef } from "./data.js";

export function pairKey(aId, bId) {
  return (aId < bId) ? `${aId}|${bId}` : `${bId}|${aId}`;
}
export function getPairAffinity(aId, bId) {
  return state.pairAffinity[pairKey(aId, bId)] ?? 0;
}
export function addPairAffinity(aId, bId, delta) {
  const k = pairKey(aId, bId);
  state.pairAffinity[k] = (state.pairAffinity[k] ?? 0) + delta;
}
export function initPairAffinities() {
  state.pairAffinity = {};
  for (let i = 0; i < state.party.length; i++) {
    for (let j = i + 1; j < state.party.length; j++) {
      state.pairAffinity[pairKey(state.party[i].id, state.party[j].id)] = 0;
    }
  }
}
export function avgAffinityFor(memberId) {
  const others = state.party.filter(m => m.id !== memberId);
  if (others.length === 0) return 0;
  const sum = others.reduce((a, m) => a + getPairAffinity(memberId, m.id), 0);
  return Math.round(sum / others.length);
}

/* Traits dropdown helpers */
export function getTraitPool() { return state.data.traits.traitPool ?? []; }

export function buildTraitDropdowns() {
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

export function getSelectedTraits() {
  const arr = [$("#traitSel1")?.value, $("#traitSel2")?.value, $("#traitSel3")?.value]
    .map(x => (x || "").trim())
    .filter(Boolean);
  return [...new Set(arr)].slice(0, 3);
}

/* Jobs UI */
export function buildJobUI() {
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

/* Character form load/save */
export function resetMemberForm() {
  if ($("#nameInput")) $("#nameInput").value = "";
  if ($("#categorySelect")) {
    const catSel = $("#categorySelect");
    if (catSel.options.length) catSel.selectedIndex = 0;
    catSel.dispatchEvent(new Event("change"));
  }
  if ($("#traitSel1")) $("#traitSel1").value = "";
  if ($("#traitSel2")) $("#traitSel2").value = "";
  if ($("#traitSel3")) $("#traitSel3").value = "";
  $("#traitSel1")?.dispatchEvent(new Event("change"));
}

export function loadMemberToForm(index) {
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

export function createMemberFromForm(existingId = null) {
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
    stats: { ...job.base },
    hp: maxHp,
    mp: maxMp,
    maxHp,
    maxMp,
    traits,
    statuses: [],
    temp: {},
    skills: {
      active: [...(skillPack.active ?? [])],
      passive: [...(skillPack.passive ?? [])]
    }
  };
}

/* Add/Edit/Remove member (UI에서 호출) */
export function removeMemberAt(index) {
  const removed = state.party[index];
  state.party.splice(index, 1);
  initPairAffinities();
  logLine(`파티원 제거: ${removed?.name ?? ""}`);
}

export function confirmMemberFromModal() {
  const editing = state.setupEditingIndex;

  if (editing == null && state.party.length >= 4) {
    alert("파티는 최대 4명까지입니다.");
    return { ok: false };
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
    return { ok: true };
  } catch (e) {
    console.error(e);
    alert(e.message || "캐릭터 생성 중 오류");
    return { ok: false };
  }
}

/* passive/status helpers (시스템에서 쓰기도 함) */
export function hasPassive(m, passiveId) {
  return (m.skills?.passive ?? []).includes(passiveId);
}

export function hasStatus(m, sid) { return (m.statuses ?? []).includes(sid); }
export function addStatus(m, sid) {
  if (hasPassive(m, "ignore_status")) return;
  if (!m.statuses.includes(sid)) m.statuses.push(sid);
}
export function removeStatus(m, sid) {
  m.statuses = (m.statuses ?? []).filter(x => x !== sid);
}

/* effect apply */
export function applyToMember(m, effects) {
  for (const [k, v] of Object.entries(effects || {})) {
    if (k === "hp") m.hp = clamp(m.hp + v, 0, m.maxHp);
    else if (k === "mp") m.mp = clamp(m.mp + v, 0, m.maxMp);
    else if (k === "gold") state.gold += v;
    else m[k] = (m[k] ?? 0) + v;
  }
}

/* check bonus example */
export function passiveCheckBonus(member, event, stat) {
  let bonus = 0;

  if (hasPassive(member, "puzzle_master")) {
    const cond = getSkillDef("puzzle_master")?.condition?.eventTagsAny ?? [];
    const ok = cond.some(t => (event.tags ?? []).includes(t));
    if (ok) bonus += (member.stats.luck ?? 0);
  }

  return bonus;
}
