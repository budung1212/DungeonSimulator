export const SAVE_KEY = "dungeon_party_sim_save_v1";

export const state = {
  data: { jobs: null, scenarios: null, traits: null, items: null, statuses: null, skills: null },
  party: [],
  pairAffinity: {},
  scenario: null,
  eventIndex: 0,
  inventory: [],
  gold: 0,
  activeModal: null,
  combat: null,
  setupEditingIndex: null
};

export function resetRunState() {
  state.scenario = null;
  state.eventIndex = 0;
  state.inventory = [];
  state.gold = 0;
  state.combat = null;
  state.activeModal = null;
}

export function serialize(extra = {}) {
  return {
    party: state.party,
    pairAffinity: state.pairAffinity,
    scenario: state.scenario,
    eventIndex: state.eventIndex,
    inventory: state.inventory,
    gold: state.gold,
    ...extra
  };
}

export function hydrate(obj) {
  state.party = obj.party ?? [];
  state.pairAffinity = obj.pairAffinity ?? {};
  state.scenario = obj.scenario ?? null;
  state.eventIndex = obj.eventIndex ?? 0;
  state.inventory = obj.inventory ?? [];
  state.gold = obj.gold ?? 0;
}
