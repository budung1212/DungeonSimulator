import { state } from "../state.js";
import { $, logLine } from "../utils.js";
import { getItemDef, getSkillDef, getStatusDef } from "../data.js";
import { confirmMemberFromModal, resetMemberForm, loadMemberToForm } from "../party.js";
import { useItem } from "../systems/events.js";
import { useSkill } from "../systems/combat.js";

export function closeModal() {
  $("#modal")?.classList.add("hidden");
  state.activeModal = null;
}

export function openTargetModal(type, id, casterIndex) {
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
      <div style="font-weight:800;">${m.name} <span class="muted small">/ ${m.jobName}</span></div>
      <div class="muted small">HP ${m.hp}/${m.maxHp} · MP ${m.mp}/${m.maxMp} · 상태: ${statusNames.join(", ") || "정상"}</div>
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

export function openEnemyModal(type, id, casterIndex) {
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
      <div style="font-weight:800;">${mon.name}</div>
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

/* 캐릭터 설정 모달 */
export function openSetupModal(mode, index = null) {
  const modal = $("#setupModal");
  if (!modal) return;

  state.setupEditingIndex = (mode === "edit") ? index : null;

  if (mode === "new") resetMemberForm();
  else if (mode === "edit") loadMemberToForm(index);

  modal.classList.remove("hidden");
}

export function closeSetupModal() {
  const modal = $("#setupModal");
  if (!modal) return;
  modal.classList.add("hidden");
  state.setupEditingIndex = null;
}

export function bindSetupModalButtons(onConfirmDone) {
  $("#setupCloseBtn").onclick = closeSetupModal;
  $("#setupCancelBtn").onclick = closeSetupModal;

  $("#addMemberBtn").onclick = () => {
    const r = confirmMemberFromModal();
    if (r.ok) {
      closeSetupModal();
      onConfirmDone?.();
    }
  };

  $("#setupModal").addEventListener("click", (e) => {
    if (e.target.id === "setupModal") closeSetupModal();
  });
}
