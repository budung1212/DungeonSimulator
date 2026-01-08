import { state } from "../state.js";
import { $, esc, logLine } from "../utils.js";
import { portraitFor } from "../data.js";
import { removeMemberAt } from "../party.js";
import { openSetupModal } from "./modals.js";

export function renderPartySlots() {
  const wrap = $("#partyPreview");
  if (!wrap) return;

  wrap.innerHTML = "";
  const max = 4;
  const defs = state.data.skills?.definitions ?? {};

  for (let i = 0; i < max; i++) {
    const slot = document.createElement("div");
    slot.className = "partySlot";

    const m = state.party[i];

    if (!m) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slotAddBtn";
      btn.textContent = "+ 파티원 추가";
      btn.onclick = () => openSetupModal("new");
      slot.appendChild(btn);
      wrap.appendChild(slot);
      continue;
    }

    const allSkillIds = [
      ...(m.skills?.active ?? []),
      ...(m.skills?.passive ?? [])
    ];
    const showSkillIds = allSkillIds.slice(0, 2);
    const skillLines = showSkillIds
      .map(id => defs[id])
      .filter(Boolean)
      .map(s => `<div class="slotSkillLine"><b>${esc(s.name)}</b>: ${esc(s.description)}</div>`)
      .join("");

    slot.innerHTML = `
      <div class="slotCard" data-edit="${i}">
        <div class="slotLeft">
          <div class="portraitWrap">
            <img class="portrait" src="${esc(portraitFor(m.jobId))}" alt="portrait"/>
          </div>

          <div class="slotInfoText">
            <div class="slotNameLine">${esc(m.name)} <span class="muted">(${esc(m.jobName)})</span></div>
            <div class="slotMetaLine">성격 : ${esc((m.traits || []).join(", ") || "없음")}</div>
            <div class="slotStatLine">HP: ${m.hp}/${m.maxHp}, &nbsp; MP: ${m.mp}/${m.maxMp}</div>
            ${skillLines || `<div class="slotSkillLine muted">직업 스킬: 없음</div>`}
          </div>
        </div>

        <button class="ghost slotDelBtn" data-del="${i}" type="button">삭제</button>
      </div>
    `;

    slot.querySelector(`[data-edit="${i}"]`)?.addEventListener("click", (e) => {
      if (e.target.closest(".slotDelBtn")) return;
      openSetupModal("edit", i);
    });

    slot.querySelector(`[data-del="${i}"]`)?.addEventListener("click", (e) => {
      e.stopPropagation();
      const removedName = state.party[i]?.name ?? "";
      removeMemberAt(i);
      renderPartySlots();
      logLine(`파티원 제거: ${removedName}`);
    });

    wrap.appendChild(slot);
  }
}
