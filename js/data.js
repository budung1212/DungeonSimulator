import { state } from "./state.js";

export async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

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

export function portraitFor(jobId) {
  return PORTRAITS[jobId] || PORTRAITS.default;
}

export function findJob(categoryId, jobId) {
  const cat = state.data.jobs.categories.find(c => c.id === categoryId);
  return cat?.jobs?.find(j => j.id === jobId) ?? null;
}

export function getSkillDef(id) { return state.data.skills.definitions[id]; }
export function getItemDef(id) { return state.data.items.definitions[id]; }
export function getStatusDef(id) { return state.data.statuses.definitions[id]; }
