// app.js
const $ = (sel) => document.querySelector(sel);

const SAVE_KEY = "dungeon_party_sim_save_v1";

const state = {
  data: { jobs:null, scenarios:null, traits:null, items:null, statuses:null, skills:null },
  party: [],              // members
  pairAffinity: {},       // key "idA|idB" => number
  scenario: null,
  eventIndex: 0,
  inventory: [],          // { itemId, qty }
  gold: 0,
  activeModal: null,      // { type:"item"|"skill", id, casterIndex, enemyIndex? }
  combat: null,           // { monsters:[], inCombat:boolean }

  // A 방식: trait 관계 룰을 맵으로 캐시
  traitRuleMap: null      // { "A|B": "match"|"partial"|"conflict" }
};

// ---------- Utils ----------
async function loadJSON(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}
function esc(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function rndInt(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function uuid(){
  return (crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`);
}
function logLine(text){
  const el = $("#log");
  const prev = el.innerHTML.trim();
  const line = `• ${esc(text)}`;
  el.innerHTML = prev ? `${prev}<br/>${line}` : line;
}

// ---------- Data helpers ----------
function findJob(catId, jobId){
  const cat = state.data.jobs.categories.find(c => c.id === catId);
  return cat?.jobs?.find(j => j.id === jobId) ?? null;
}
function getSkillDef(id){ return state.data.skills.definitions[id]; }
function getItemDef(id){ return state.data.items.definitions[id]; }
function getStatusDef(id){ return state.data.statuses.definitions[id]; }

// ---------- Traits dropdown (unique across 3) ----------
function getTraitPool(){ return state.data.traits.traitPool ?? []; }

function buildTraitDropdowns(){
  const pool = getTraitPool();
  const sels = [$("#traitSel1"), $("#traitSel2"), $("#traitSel3")];

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

  function refresh(){
    const chosen = new Set(sels.map(s => s.value).filter(Boolean));

    for(const sel of sels){
      const keep = sel.value;
      sel.innerHTML = "";
      const empty = document.c
