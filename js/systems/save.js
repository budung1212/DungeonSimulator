import { $, logLine } from "../utils.js";
import { SAVE_KEY, serialize, hydrate, state } from "../state.js";
import { renderAll } from "../ui/renderRun.js";
import { renderPartySlots } from "../ui/renderSetup.js";
import { renderEvent } from "./events.js";
import { closeSetupModal } from "../ui/modals.js";

export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize({ logHTML: $("#log")?.innerHTML ?? "" })));
    alert("세이브 완료!");
  } catch (e) {
    console.error(e);
    alert("세이브 실패(브라우저 저장소 문제)");
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { alert("세이브 데이터가 없습니다."); return; }
    const obj = JSON.parse(raw);
    hydrate(obj);
    if ($("#log")) $("#log").innerHTML = obj.logHTML ?? "";

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

export function wipeSave() {
  localStorage.removeItem(SAVE_KEY);
  alert("세이브 삭제 완료!");
}
