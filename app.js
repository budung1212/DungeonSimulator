// app.js
const $ = (sel) => document.querySelector(sel);

const state = {
  data: {
    jobs: null,
    scenarios: null,
    traits: null,
    items: null,
    statuses: null,
    skills: null
  },
  party: [],         // 최대 4
  scenario: null,
  eventIndex: 0,
  inventory: [],     // { itemId, qty }
  activeModal: null  // { type: "item"|"skill", id }
};

async function loadJSON(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function nowLogPrefix(){ return ""; }

function appendLog(text){
  const el = $("#log");
  const prev = el.innerHTML.trim();
  const line = `• ${escapeHTML(text)}`;
  el.innerHTML = prev ? `${prev}<br/>${line}` : line;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function findJob(catId, jobId){
  const cat = state.data.jobs.categories.find(c => c.id === catId);
  if(!cat) return null;
  return cat.jobs.find(j => j.id === jobId) ?? null;
}

function getTraitPool(){
  return state.data.traits.traitPool ?? [];
}

function buildJobUI(){
  const jobsData = state.data.jobs;
  const catSel = $("#categorySelect");
  const jobSel = $("#jobSelect");

  catSel.innerHTML = "";
  for(const c of jobsData.categories){
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    catSel.appendChild(opt);
  }

  function refreshJobs(){
    const catId = catSel.value;
    const cat = jobsData.categories.find(x => x.id === catId);
    jobSel.innerHTML = "";
    for(const j of cat.jobs){
      const opt = document.createElement("option");
      opt.value = j.id;
      opt.textContent = j.name;
      jobSel.appendChild(opt);
    }
  }

  catSel.onchange = refreshJobs;
  refreshJobs();
}

/** ========== Traits dropdown (중복 금지) ========== */

function buildTraitDropdowns(){
  const pool = getTraitPool();
  const sels = [$("#traitSel1"), $("#traitSel2"), $("#traitSel3")];

  // initial options
  for(const sel of sels){
    sel.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "선택";
    sel.appendChild(empty);

    for(const t of pool){
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    }
  }

  function refreshAllOptions(){
    const chosen = new Set(sels.map(s => s.value).filter(Boolean));

    for(const sel of sels){
      const keep = sel.value;
      // rebuild with exclusion of others
      sel.innerHTML = "";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "선택";
      sel.appendChild(empty);

      for(const t of pool){
        // 다른 칸에서 선택된 값은 제거, 단 자기 자신이 이미 선택한 값은 유지
        const selectedElsewhere = chosen.has(t) && keep !== t;
        if(selectedElsewhere) continue;
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if(t === keep) opt.selected = true;
        sel.appendChild(opt);
      }
    }
  }

  for(const sel of sels){
    sel.addEventListener("change", refreshAllOptions);
  }

  refreshAllOptions();
}

function getSelectedTraits(){
  const t = [$("#traitSel1").value, $("#traitSel2").value, $("#traitSel3").value]
    .map(x => (x||"").trim())
    .filter(Boolean);
  // 중복 방지(안전)
  return [...new Set(t)].slice(0,3);
}

/** ========== Party creation ========== */

function renderPartyPreview(){
  const wrap = $("#partyPreview");
  if(state.party.length === 0){
    wrap.innerHTML = `<div class="muted small">아직 파티원이 없습니다. 아래에서 추가하세요.</div>`;
    return;
  }

  wrap.innerHTML = "";
  state.party.forEach((m, idx) => {
    const div = document.createElement("div");
    div.className = "partyCard";
    div.innerHTML = `
      <div class="titleRow">
        <div>
          <div style="font-weight:800;">${escapeHTML(m.name)} <span class="muted small">/ ${escapeHTML(m.jobName)}</span></div>
          <div class="muted small">성격: ${escapeHTML(m.traits.join(", ") || "없음")}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="badge">HP <b>${m.hp}</b></span>
          <span class="badge">호감도 <b>${m.affinity}</b></span>
          <button class="ghost" data-edit="${idx}">수정</button>
          <button class="ghost" data-del="${idx}">삭제</button>
        </div>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.del);
      state.party.splice(i,1);
      renderPartyPreview();
    };
  });

  wrap.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.edit);
      loadMemberToForm(i);
    };
  });
}

function loadMemberToForm(index){
  const m = state.party[index];
  $("#nameInput").value = m.name;
  $("#categorySelect").value = m.categoryId;
  // refresh job list first
  $("#categorySelect").dispatchEvent(new Event("change"));
  $("#jobSelect").value = m.jobId;

  // traits
  $("#traitSel1").value = m.traits[0] ?? "";
  $("#traitSel2").value = m.traits[1] ?? "";
  $("#traitSel3").value = m.traits[2] ?? "";
  // trigger refresh
  $("#traitSel1").dispatchEvent(new Event("change"));

  // store edit index on button
  $("#addMemberBtn").dataset.editing = String(index);
  $("#addMemberBtn").textContent = "파티원 수정 저장";
}

function resetMemberForm(){
  $("#nameInput").value = "";
  $("#traitSel1").value = "";
  $("#traitSel2").value = "";
  $("#traitSel3").value = "";
  $("#traitSel1").dispatchEvent(new Event("change"));
  $("#addMemberBtn").dataset.editing = "";
  $("#addMemberBtn").textContent = "파티원 추가(최대 4)";
}

function createMemberFromForm(){
  const name = ($("#nameInput").value || "이름없는 모험가").trim();
  const categoryId = $("#categorySelect").value;
  const jobId = $("#jobSelect").value;
  const job = findJob(categoryId, jobId);

  if(!job) throw new Error("직업 정보를 찾을 수 없습니다.");

  const traits = getSelectedTraits();

  // skills: 직업 id 기반으로 초기 스킬 매핑
  const skillPack = state.data.skills.jobSkillMap?.[jobId] ?? { active: [], passive: [] };

  return {
    id: crypto.randomUUID(),
    name,
    categoryId,
    jobId,
    jobName: job.name,
    stats: { ...job.base },
    hp: job.base.hp ?? 10,
    maxHp: job.base.hp ?? 10,
    gold: 0,
    affinity: 0,
    traits,
    statuses: [],     // ["potion_addiction"] 등
    skills: {
      active: [...(skillPack.active ?? [])],
      passive: [...(skillPack.passive ?? [])]
    }
  };
}

function addOrUpdateMember(){
  if(state.party.length >= 4 && !$("#addMemberBtn").dataset.editing){
    alert("파티는 최대 4명까지입니다.");
    return;
  }

  const editing = $("#addMemberBtn").dataset.editing;
  const member = createMemberFromForm();

  if(editing !== ""){
    const idx = Number(editing);
    // 유지하고 싶은 값(예: 런 중이면 유지해야 하지만 setup 단계니까 그냥 교체)
    state.party[idx] = member;
  }else{
    state.party.push(member);
  }

  renderPartyPreview();
  resetMemberForm();
}

/** ========== Scenario engine (party) ========== */

function traitConflict(a, b){
  const pairs = state.data.traits?.rules?.keywords?.conflicts ?? [];
  return pairs.some(([x,y]) => (x===a && y===b) || (x===b && y===a));
}

function computeTraitAffinity(playerTraits, bias){
  const rules = state.data.traits.rules.affinity;
  const preferred = bias?.preferred ?? [];
  const conflict = bias?.conflict ?? [];
  let delta = 0;

  for(const t of preferred){
    if(playerTraits.includes(t)) delta += rules.match;
    else delta += rules.partial;
  }
  for(const t of conflict){
    if(playerTraits.includes(t)) delta += rules.conflict;
  }

  // 플레이어 내부 상극(약간 페널티)
  for(let i=0;i<playerTraits.length;i++){
    for(let j=i+1;j<playerTraits.length;j++){
      if(traitConflict(playerTraits[i], playerTraits[j])) delta -= 2;
    }
  }
  return delta;
}

// 패시브 스킬 보정: 이벤트 tags 조건 만족 시 roll에 보너스
function getPassiveRollBonus(member, stat, event){
  const defs = state.data.skills.definitions;
  let bonus = 0;

  for(const sid of (member.skills.passive ?? [])){
    const s = defs[sid];
    if(!s || s.type !== "passive") continue;

    // 조건: tags 포함
    const condTags = s.condition?.eventTagsAny ?? [];
    const ok = condTags.length === 0 || condTags.some(t => (event.tags ?? []).includes(t));
    if(!ok) continue;

    // stat bonus
    if(s.bonus?.[stat]) bonus += s.bonus[stat];
  }
  return bonus;
}

function rollStat(member, stat, event){
  const base = member.stats[stat] ?? 0;
  const d6 = 1 + Math.floor(Math.random()*6);
  const luckBonus = Math.floor((member.stats.luck ?? 0) / 2);

  const passiveBonus = getPassiveRollBonus(member, stat, event);

  return base + d6 + luckBonus + passiveBonus;
}

function applyEffectsToMember(member, effects){
  for(const [k, v] of Object.entries(effects || {})){
    if(k === "hp"){
      member.hp = clamp(member.hp + v, 0, member.maxHp);
    }else if(k === "affinity"){
      member.affinity += v;
    }else if(k === "gold"){
      // gold는 파티 공용으로 처리 (인벤/보상에 자연스러움)
      // 멤버에 gold를 넣지 않고, inventory/gold pool로 운영
      state.gold = (state.gold ?? 0) + v;
    }else{
      member[k] = (member[k] ?? 0) + v;
    }
  }
}

function addStatus(member, statusId){
  if(member.statuses.includes(statusId)) return;
  member.statuses.push(statusId);
}

function removeStatus(member, statusId){
  member.statuses = member.statuses.filter(x => x !== statusId);
}

function renderStatus(){
  const hpSum = state.party.reduce((a,m)=>a+m.hp, 0);
  const maxSum = state.party.reduce((a,m)=>a+m.maxHp, 0);
  const affSum = state.party.reduce((a,m)=>a+m.affinity, 0);
  const gold = state.gold ?? 0;

  $("#statusBar").innerHTML = `
    <div class="pill">파티 HP <b>${hpSum}</b> / ${maxSum}</div>
    <div class="pill">파티 GOLD <b>${gold}</b></div>
    <div class="pill">총 호감도 <b>${affSum}</b></div>
    <div class="pill">진행 <b>${state.eventIndex + 1}</b> / ${state.scenario.events.length}</div>
  `;
}

function renderPartyRunList(){
  const wrap = $("#partyRunList");
  wrap.innerHTML = "";

  state.party.forEach((m, i) => {
    const statuses = (m.statuses ?? []).map(sid => state.data.statuses.definitions[sid]?.name ?? sid);
    const div = document.createElement("div");
    div.className = "partyRunItem";
    div.innerHTML = `
      <div class="row">
        <div style="font-weight:800;">${escapeHTML(m.name)} <span class="muted small">/ ${escapeHTML(m.jobName)}</span></div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="badge">HP <b>${m.hp}</b>/${m.maxHp}</span>
          <span class="badge">호감도 <b>${m.affinity}</b></span>
        </div>
      </div>
      <div class="tags">
        <span class="tag">성격: ${escapeHTML(m.traits.join(", ") || "없음")}</span>
        <span class="tag">상태: ${escapeHTML(statuses.join(", ") || "정상")}</span>
      </div>
    `;
    wrap.appendChild(div);
  });

  // actor select
  const actorSel = $("#actorSelect");
  actorSel.innerHTML = "";
  state.party.forEach((m,i)=>{
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${m.name} (${m.jobName})`;
    actorSel.appendChild(opt);
  });
}

function renderInventory(){
  const wrap = $("#inventoryList");
  wrap.innerHTML = "";

  if(state.inventory.length === 0){
    wrap.innerHTML = `<div class="muted small">인벤토리가 비어 있습니다.</div>`;
    return;
  }

  for(const it of state.inventory){
    const def = state.data.items.definitions[it.itemId];
    if(!def) continue;

    const btn = document.createElement("button");
    btn.className = "itemBtn";
    btn.innerHTML = `
      <div style="font-weight:800;">${escapeHTML(def.name)} <span class="muted small">x${it.qty}</span></div>
      <div class="meta">${escapeHTML(def.description)}</div>
    `;
    btn.onclick = () => openTargetModal("item", it.itemId);
    wrap.appendChild(btn);
  }
}

function renderSkills(){
  const wrap = $("#skillsList");
  wrap.innerHTML = "";

  // 액티브 스킬만 버튼으로, 패시브는 설명으로 표시
  const defs = state.data.skills.definitions;

  // 파티 전체 액티브 스킬(중복은 표시해도 됨)
  const lines = [];
  state.party.forEach((m, mi) => {
    for(const sid of (m.skills.active ?? [])){
      const s = defs[sid];
      if(!s || s.type !== "active") continue;

      const btn = document.createElement("button");
      btn.className = "skillBtn";
      btn.innerHTML = `
        <div style="font-weight:800;">${escapeHTML(s.name)} <span class="muted small">(${escapeHTML(m.name)})</span></div>
        <div class="meta">${escapeHTML(s.description)}</div>
      `;
      btn.onclick = () => openTargetModal("skill", sid, mi);
      wrap.appendChild(btn);
    }

    const passive = (m.skills.passive ?? []).map(sid => defs[sid]).filter(Boolean);
    if(passive.length){
      const p = document.createElement("div");
      p.className = "muted small";
      p.style.marginTop = "6px";
      p.innerHTML = `<b>${escapeHTML(m.name)}</b> 패시브: ${escapeHTML(passive.map(x=>x.name).join(", "))}`;
      wrap.appendChild(p);
    }
  });

  if(wrap.innerHTML.trim() === ""){
    wrap.innerHTML = `<div class="muted small">스킬이 없습니다.</div>`;
  }
}

/** ===== Modal (target picking) ===== */

function openTargetModal(type, id, casterIndex = null){
  state.activeModal = { type, id, casterIndex };
  const modal = $("#modal");
  const body = $("#modalBody");
  const title = $("#modalTitle");
  const desc = $("#modalDesc");

  body.innerHTML = "";

  if(type === "item"){
    const def = state.data.items.definitions[id];
    title.textContent = `아이템 대상 선택: ${def?.name ?? id}`;
    desc.textContent = def?.description ?? "";
  }else{
    const def = state.data.skills.definitions[id];
    const caster = casterIndex != null ? state.party[casterIndex] : null;
    title.textContent = `스킬 대상 선택: ${def?.name ?? id}`;
    desc.textContent = caster ? `${caster.name} 사용` : (def?.description ?? "");
  }

  state.party.forEach((m, idx)=>{
    const btn = document.createElement("button");
    btn.className = "targetBtn";
    const statuses = (m.statuses ?? []).map(sid => state.data.statuses.definitions[sid]?.name ?? sid);
    btn.innerHTML = `
      <div style="font-weight:800;">${escapeHTML(m.name)} <span class="muted small">/ ${escapeHTML(m.jobName)}</span></div>
      <div class="muted small">HP ${m.hp}/${m.maxHp} · 상태: ${escapeHTML(statuses.join(", ") || "정상")}</div>
    `;
    btn.onclick = () => {
      if(type === "item") useItemOnTarget(id, idx);
      else useSkillOnTarget(id, casterIndex, idx);
      closeModal();
    };
    body.appendChild(btn);
  });

  modal.classList.remove("hidden");
}

function closeModal(){
  $("#modal").classList.add("hidden");
  state.activeModal = null;
}

/** ===== Items / Status effects ===== */

function hasStatus(member, statusId){
  return (member.statuses ?? []).includes(statusId);
}

function useItemOnTarget(itemId, targetIndex){
  const inv = state.inventory.find(x => x.itemId === itemId);
  if(!inv || inv.qty <= 0) return;

  const item = state.data.items.definitions[itemId];
  const target = state.party[targetIndex];
  if(!item || !target) return;

  appendLog(`${nowLogPrefix()}아이템 사용: ${item.name} → ${target.name}`);

  // Potion example: if target has potion_addiction, potion healing blocked
  if(itemId === "hp_potion"){
    if(hasStatus(target, "potion_addiction")){
      appendLog(`하지만 ${target.name}은(는) '포션중독' 상태로 포션 회복이 불가능하다.`);
    }else{
      target.hp = clamp(target.hp + 5, 0, target.maxHp);
      appendLog(`${target.name} HP +5`);
    }

    // 1% chance to apply potion_addiction
    const roll = Math.random();
    if(roll < 0.01){
      addStatus(target, "potion_addiction");
      appendLog(`${target.name}에게 상태이상 '포션중독'이 부여되었다!`);
    }
  }else{
    // generic item effects (optional extension)
    applyEffectsToMember(target, item.effects ?? {});
  }

  inv.qty -= 1;
  if(inv.qty <= 0){
    state.inventory = state.inventory.filter(x => x.itemId !== itemId);
  }

  renderAllRunUI();
}

/** ===== Skills ===== */

function useSkillOnTarget(skillId, casterIndex, targetIndex){
  const defs = state.data.skills.definitions;
  const s = defs[skillId];
  const caster = state.party[casterIndex];
  const target = state.party[targetIndex];
  if(!s || !caster || !target) return;

  appendLog(`${nowLogPrefix()}스킬 사용: ${caster.name} - ${s.name} → ${target.name}`);

  // basic examples
  if(skillId === "purify"){
    // remove potion_addiction
    if(hasStatus(target, "potion_addiction")){
      removeStatus(target, "potion_addiction");
      appendLog(`${target.name}의 '포션중독'이 정화되었다.`);
    }else{
      appendLog(`정화할 상태이상이 없다.`);
    }
  }else if(skillId === "heal"){
    // heal that is NOT potion-based -> works even with potion_addiction
    target.hp = clamp(target.hp + 4, 0, target.maxHp);
    appendLog(`${target.name} HP +4 (치유)`);
  }else if(skillId === "fireball"){
    // 시나리오 보정: 다음 1회 마법 판정에 +2 버프 (간단 구현: tempBuff)
    caster.temp = caster.temp ?? {};
    caster.temp.nextMagBonus = (caster.temp.nextMagBonus ?? 0) + 2;
    appendLog(`${caster.name}은(는) 다음 마법 판정에 +2 보너스를 얻었다.`);
  }else if(skillId === "guard"){
    // 다음 피해 -1 버프
    target.temp = target.temp ?? {};
    target.temp.damageReduce = (target.temp.damageReduce ?? 0) + 1;
    appendLog(`${target.name}은(는) 다음 피해 -1 보호를 얻었다.`);
  }else{
    // generic skill effect support
    if(s.effects){
      applyEffectsToMember(target, s.effects);
      appendLog(`효과가 적용되었다.`);
    }
  }

  renderAllRunUI();
}

function consumeTempOnRoll(member, stat){
  let bonus = 0;
  if(member.temp?.nextMagBonus && stat === "mag"){
    bonus += member.temp.nextMagBonus;
    member.temp.nextMagBonus = 0;
  }
  return bonus;
}

function consumeDamageReduce(member, dmg){
  const red = member.temp?.damageReduce ?? 0;
  if(red > 0 && dmg < 0){
    const reduced = Math.min(red, Math.abs(dmg));
    member.temp.damageReduce -= reduced;
    return dmg + reduced; // dmg is negative
  }
  return dmg;
}

/** ===== Event rendering & resolving ===== */

function renderEvent(){
  const ev = state.scenario.events[state.eventIndex];
  $("#eventTitle").textContent = ev.title;
  $("#eventText").textContent = ev.text;

  const wrap = $("#choices");
  wrap.innerHTML = "";
  for(const ch of ev.choices){
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = ch.label;
    btn.onclick = () => resolveChoice(ev, ch);
    wrap.appendChild(btn);
  }
}

function resolveChoice(ev, ch){
  const actorIndex = Number($("#actorSelect").value || "0");
  const actor = state.party[actorIndex];
  if(!actor) return;

  // 판정
  const stat = ch.check?.stat;
  const dc = ch.check?.dc ?? 10;
  const rolled = stat ? (rollStat(actor, stat, ev) + consumeTempOnRoll(actor, stat)) : 999;
  const ok = rolled >= dc;

  const outcome = ok ? ch.success : ch.fail;

  appendLog(`${ev.title} - 행동자: ${actor.name} - 선택: "${ch.label}"`);
  if(stat) appendLog(`판정: ${stat.toUpperCase()} ${rolled} vs DC ${dc} → ${ok ? "성공" : "실패"}`);

  appendLog(outcome.log);

  // 효과 적용 (피해 감소 버프 처리)
  const effects = { ...(outcome.effects ?? {}) };
  if(typeof effects.hp === "number" && effects.hp < 0){
    effects.hp = consumeDamageReduce(actor, effects.hp);
  }
  applyEffectsToMember(actor, effects);

  // 성격 상호작용은 "행동자 호감도"로 누적
  const traitDelta = computeTraitAffinity(actor.traits, ev.traitBias);
  actor.affinity += traitDelta;
  appendLog(`성격 상호작용: ${actor.name} 호감도 ${traitDelta >= 0 ? "+" : ""}${traitDelta}`);

  renderAllRunUI();

  // 사망 체크 (파티 전멸 기준은 단순: 전원 HP 0이면 종료)
  const alive = state.party.some(m => m.hp > 0);
  if(!alive){
    $("#choices").innerHTML = "";
    appendLog("파티 전멸… 던전에서 쓰러졌다.");
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = "다시 도전";
    btn.onclick = resetAll;
    $("#choices").appendChild(btn);
    return;
  }

  // 다음 이벤트/종료
  state.eventIndex += 1;
  if(state.eventIndex >= state.scenario.events.length){
    finishScenario();
  }else{
    renderEvent();
  }
}

function finishScenario(){
  $("#choices").innerHTML = "";
  const gold = state.gold ?? 0;
  const affSum = state.party.reduce((a,m)=>a+m.affinity,0);
  appendLog(`던전 클리어! 최종: GOLD ${gold}, 총 호감도 ${affSum}`);
  const btn = document.createElement("button");
  btn.className = "primary";
  btn.textContent = "다시 시작";
  btn.onclick = resetAll;
  $("#choices").appendChild(btn);
}

function renderAllRunUI(){
  renderStatus();
  renderPartyRunList();
  renderInventory();
  renderSkills();
}

/** ===== Start / Reset ===== */

function startRun(){
  if(state.party.length === 0){
    alert("파티원이 최소 1명 필요합니다.");
    return;
  }

  // 초기 인벤토리(샘플)
  state.inventory = [{ itemId: "hp_potion", qty: 2 }];
  state.gold = 0;

  const scenarios = state.data.scenarios.scenarios;
  state.scenario = pickRandom(scenarios);
  state.eventIndex = 0;

  $("#setupCard").classList.add("hidden");
  $("#runCard").classList.remove("hidden");

  $("#scenarioTitle").textContent = state.scenario.title;
  $("#scenarioDesc").textContent = state.scenario.description;
  $("#log").innerHTML = "";
  appendLog(`시나리오 시작: ${state.scenario.title}`);

  renderAllRunUI();
  renderEvent();
}

function resetAll(){
  state.scenario = null;
  state.eventIndex = 0;
  state.inventory = [];
  state.gold = 0;

  $("#setupCard").classList.remove("hidden");
  $("#runCard").classList.add("hidden");
  $("#log").innerHTML = "";
}

/** ===== Init ===== */

async function init(){
  state.data.jobs = await loadJSON("./data/jobs.json");
  state.data.scenarios = await loadJSON("./data/scenarios.json");
  state.data.traits = await loadJSON("./data/traits.json");
  state.data.items = await loadJSON("./data/items.json");
  state.data.statuses = await loadJSON("./data/statuses.json");
  state.data.skills = await loadJSON("./data/skills.json");

  buildJobUI();
  buildTraitDropdowns();
  renderPartyPreview();

  $("#addMemberBtn").onclick = addOrUpdateMember;
  $("#clearPartyBtn").onclick = () => {
    state.party = [];
    renderPartyPreview();
    resetMemberForm();
  };

  $("#startBtn").onclick = startRun;
  $("#resetBtn").onclick = resetAll;

  $("#modalClose").onclick = closeModal;
  $("#modal").addEventListener("click", (e)=>{
    if(e.target.id === "modal") closeModal();
  });
}

init().catch(err=>{
  console.error(err);
  alert("초기화 실패: " + err.message);
});
