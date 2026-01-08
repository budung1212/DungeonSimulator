import { state } from "../state.js";
import { $, esc } from "../utils.js";
import { portraitFor, getItemDef, getSkillDef, getStatusDef } from "../data.js";
import { avgAffinityFor, getPairAffinity } from "../party.js";
import { openTargetModal, openEnemyModal } from "./modals.js";
import { useSkill } from "../systems/combat.js";

export function renderStatusBar() {
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

export function renderPartyRunList() {
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

  const actorSel = $("#actorSelect");
  actorSel.innerHTML = "";
  state.party.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${m.name} (${m.jobName})`;
    actorSel.appendChild(opt);
  });
}

export function renderAffinityPairs() {
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

export function renderInventory() {
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

export function renderSkills() {
  const wrap = $("#skillsList");
  wrap.innerHTML = "";

  const defs = state.data.skills.definitions;

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
        if (!mpOk) { alert(`${m.name}의 MP가 0이라 사용할 수 없습니다.`); return; }

        if (s.target === "enemy" || s.target === "all_enemies") {
          if (!state.combat?.inCombat) { alert("이 스킬은 전투 중에만 사용 가능"); return; }
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

export function renderAll() {
  renderStatusBar();
  renderPartyRunList();
  renderAffinityPairs();
  renderInventory();
  renderSkills();
}
