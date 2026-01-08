import { $, logLine, pick } from "./utils.js";
import { state, resetRunState } from "./state.js";
import { loadJSON } from "./data.js";
import { buildJobUI, buildTraitDropdowns, initPairAffinities } from "./party.js";
import { renderPartySlots } from "./ui/renderSetup.js";
import { renderAll } from "./ui/renderRun.js";
import { closeModal, bindSetupModalButtons } from "./ui/modals.js";
import { renderEvent } from "./systems/events.js";
import { saveGame, loadGame, wipeSave } from "./systems/save.js";

async function initData() {
  state.data.jobs = await loadJSON("./data/jobs.json");
  state.data.scenarios = await loadJSON("./data/scenarios.json");
  state.data.traits = await loadJSON("./data/traits.json");
  state.data.items = await loadJSON("./data/items.json");
  state.data.statuses = await loadJSON("./data/statuses.json");
  state.data.skills = await loadJSON("./data/skills.json");
}

function bindGlobalUI() {
  // setup
  $("#clearPartyBtn").onclick = () => {
    state.party = [];
    initPairAffinities();
    renderPartySlots();
  };

  // 모달(대상 선택)
  $("#modalClose").onclick = closeModal;
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  // setup modal confirm -> party rerender
  bindSetupModalButtons(() => renderPartySlots());

  // save/load
  $("#saveBtn").onclick = saveGame;
  $("#loadBtn").onclick = loadGame;
  $("#wipeSaveBtn").onclick = wipeSave;

  // run reset
  $("#resetBtn").onclick = () => resetAll();

  // actor select
  $("#actorSelect").addEventListener("change", () => {
    const idx = Number($("#actorSelect").value || "0");
    $("#recommendText").textContent = `선택 행동자: ${state.party[idx]?.name ?? ""}`;
  });
}

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
  resetRunState();
  $("#setupCard").classList.remove("hidden");
  $("#runCard").classList.add("hidden");
  if ($("#log")) $("#log").innerHTML = "";
  renderPartySlots();
}

async function init() {
  await initData();

  buildJobUI();
  buildTraitDropdowns();

  initPairAffinities();
  renderPartySlots();

  bindGlobalUI();

  $("#startBtn").onclick = startRun;
}

init().catch(err => {
  console.error(err);
  alert("초기화 실패: " + err.message);
});
