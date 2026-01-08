import { state } from "../state.js";
import { clamp, pick, logLine, chance } from "../utils.js";
import { getSkillDef, getItemDef } from "../data.js";
import { addPairAffinity } from "../party.js";
import { renderAll } from "../ui/renderRun.js";
import { renderCombatChoices, renderEventChoicesAfterCombat } from "./events.js";

function spendMpOrFail(caster, mpCost) {
  if (caster.mp < mpCost) return false;
  caster.mp -= mpCost;
  return true;
}
function applyTemp(member, tempObj) {
  member.temp = member.temp ?? {};
  for (const [k, v] of Object.entries(tempObj || {})) {
    member.temp[k] = (member.temp[k] ?? 0) + v;
  }
}

function physicalDamage(attacker, defender, raw) {
  let dmg = raw;

  if (chance(attacker.stats?.luck ?? 0)) {
    dmg = Math.floor(dmg * 2);
    logLine(`치명타! (${attacker.name})`);
  }
  if (chance(defender.stats?.luck ?? defender.luck ?? 0)) {
    logLine(`회피! ${defender.name}이(가) 공격을 피했다.`);
    return 0;
  }

  const reduced = Math.floor((defender.stats?.def ?? defender.def ?? 0) * 0.5);
  dmg = Math.max(0, dmg - reduced);

  if (defender.temp?.damageHalf) {
    dmg = Math.floor(dmg / 2);
    defender.temp.damageHalf = Math.max(0, defender.temp.damageHalf - 1);
    logLine(`${defender.name}의 보호로 피해가 절반이 되었다.`);
  }
  return dmg;
}

function magicDamage(attacker, defender, raw) {
  let dmg = raw;

  if (chance(attacker.stats?.luck ?? 0)) {
    dmg = Math.floor(dmg * 2);
    logLine(`치명타! (${attacker.name})`);
  }
  if (chance(defender.stats?.luck ?? defender.luck ?? 0)) {
    logLine(`회피! ${defender.name}이(가) 마법을 피했다.`);
    return 0;
  }

  const reduced = Math.floor((defender.stats?.def ?? defender.def ?? 0) * 0.5);
  dmg = Math.max(0, dmg - reduced);

  if (defender.temp?.damageHalf) {
    dmg = Math.floor(dmg / 2);
    defender.temp.damageHalf = Math.max(0, defender.temp.damageHalf - 1);
    logLine(`${defender.name}의 보호로 피해가 절반이 되었다.`);
  }
  return dmg;
}

export function startCombatFromEvent(ev) {
  const monsters = (ev.combat?.monsters ?? []).map(m => ({ ...m, maxHp: m.hp }));
  state.combat = { inCombat: true, monsters, reward: ev.combat?.reward ?? { gold: 0, items: [] } };
  logLine(`전투 시작: ${ev.title}`);
}

export function livingParty() { return state.party.filter(m => m.hp > 0); }
export function livingMonsters() { return (state.combat?.monsters ?? []).filter(m => m.hp > 0); }

export function useSkill(skillId, casterIndex, targetIndex, enemyIndex = null) {
  const s = getSkillDef(skillId);
  const caster = state.party[casterIndex];
  if (!s || !caster) return;

  const mpCost = s.mpCost ?? 1;
  if (!spendMpOrFail(caster, mpCost)) {
    alert(`${caster.name}의 MP가 부족합니다.`);
    return;
  }

  const allAllies = state.party;
  const allEnemies = state.combat?.monsters ?? [];
  const targetAlly = (targetIndex != null) ? state.party[targetIndex] : null;
  const targetEnemy = (enemyIndex != null) ? allEnemies[enemyIndex] : null;

  logLine(`스킬 사용: ${caster.name} - ${s.name}`);

  if (s.removeStatus?.length && targetAlly) {
    for (const sid of s.removeStatus) {
      if ((targetAlly.statuses ?? []).includes(sid)) {
        targetAlly.statuses = targetAlly.statuses.filter(x => x !== sid);
        logLine(`${targetAlly.name}의 상태 '${sid}' 제거`);
      } else {
        logLine(`${targetAlly.name}에게 제거할 '${sid}' 없음`);
      }
    }
  }

  if (s.heal) {
    const v = s.heal.value ?? 0;
    if (s.target === "all_allies") {
      allAllies.forEach(a => { a.hp = clamp(a.hp + v, 0, a.maxHp); });
      logLine(`아군 전원 HP +${v}`);
    } else if (targetAlly) {
      targetAlly.hp = clamp(targetAlly.hp + v, 0, targetAlly.maxHp);
      logLine(`${targetAlly.name} HP +${v}`);
    }
  }

  if (s.damage) {
    if (!state.combat?.inCombat) {
      logLine("전투 중이 아니어서 공격 스킬은 효과가 없다.");
    } else {
      const stat = s.damage.stat;
      const mult = s.damage.mult ?? 1;
      const raw = Math.floor((caster.stats[stat] ?? 0) * mult);

      if (s.target === "all_enemies") {
        allEnemies.forEach(mon => {
          const dmg = (s.damage.kind === "magic")
            ? magicDamage(caster, mon, raw)
            : physicalDamage(caster, mon, raw);
          mon.hp = clamp(mon.hp - dmg, 0, mon.maxHp);
          logLine(`${mon.name} 피해 ${dmg}`);
        });
      } else if (targetEnemy) {
        const dmg = (s.damage.kind === "magic")
          ? magicDamage(caster, targetEnemy, raw)
          : physicalDamage(caster, targetEnemy, raw);
        targetEnemy.hp = clamp(targetEnemy.hp - dmg, 0, targetEnemy.maxHp);
        logLine(`${targetEnemy.name} 피해 ${dmg}`);
      }
    }
  }

  if (s.applyTemp) {
    if (targetAlly) applyTemp(targetAlly, s.applyTemp);
    else applyTemp(caster, s.applyTemp);
  }

  if (s.affinityAllPairs?.byCasterLuck) {
    const delta = caster.stats.luck ?? 0;
    for (let i = 0; i < state.party.length; i++) {
      for (let j = i + 1; j < state.party.length; j++) {
        addPairAffinity(state.party[i].id, state.party[j].id, delta);
      }
    }
    logLine(`화음이 울린다… 파티 호감도(모든 페어) +${delta}`);
  }

  renderAll();
  if (state.combat?.inCombat) renderCombatChoices();
}

function partyAutoAction() {
  const mons = livingMonsters();
  if (mons.length === 0) return;

  const allies = livingParty();

  const low = allies.find(a => a.hp > 0 && a.hp <= Math.floor(a.maxHp * 0.45));
  const healers = allies.filter(a => a.mp > 0 && (a.skills.active ?? []).some(sid => getSkillDef(sid)?.heal));

  if (low && healers.length) {
    const caster = healers.reduce((a, b) => (a.stats.mag ?? 0) >= (b.stats.mag ?? 0) ? a : b);
    const mi = state.party.findIndex(x => x.id === caster.id);
    const pref = ["divine_hand", "spirit_heal", "paladin_heal"];
    const sid = pref.find(x => caster.skills.active.includes(x)) ?? caster.skills.active[0];
    const s = getSkillDef(sid);

    if (s.target === "all_allies") useSkill(sid, mi, null);
    else useSkill(sid, mi, state.party.findIndex(x => x.id === low.id));
    return;
  }

  const storm = allies.find(a => a.mp > 0 && a.skills.active.includes("thunder_strike") && mons.length >= 2);
  if (storm) {
    useSkill("thunder_strike", state.party.findIndex(x => x.id === storm.id), null);
    return;
  }

  const attacker = allies.find(a => a.mp > 0 && (a.skills.active ?? []).some(sid => {
    const s = getSkillDef(sid);
    return s?.damage && s?.target === "enemy";
  }));

  if (attacker) {
    const mi = state.party.findIndex(x => x.id === attacker.id);
    const sid = attacker.skills.active.find(sid => getSkillDef(sid)?.damage && getSkillDef(sid)?.target === "enemy");
    const target = pick(mons);
    const ei = state.combat.monsters.findIndex(x => x.id === target.id);
    useSkill(sid, mi, null, ei);
    return;
  }

  allies.forEach(a => {
    if (livingMonsters().length === 0) return;
    const target = pick(livingMonsters());
    const raw = (a.stats.atk ?? 0);
    const dmg = physicalDamage(a, target, raw);
    target.hp = clamp(target.hp - dmg, 0, target.maxHp);
    logLine(`${a.name} 기본공격 → ${target.name} 피해 ${dmg}`);
  });
}

function monstersAutoAttack() {
  const mons = livingMonsters();
  const allies = livingParty();
  if (mons.length === 0 || allies.length === 0) return;

  mons.forEach(mon => {
    if (livingParty().length === 0) return;
    const target = pick(livingParty());

    const useMagic = (mon.mag ?? 0) > (mon.atk ?? 0) ? Math.random() < 0.7 : Math.random() < 0.3;
    if (useMagic) {
      const raw = mon.mag ?? 0;
      const dmg = magicDamage(mon, target, raw);
      target.hp = clamp(target.hp - dmg, 0, target.maxHp);
      logLine(`${mon.name} 마법공격 → ${target.name} 피해 ${dmg}`);
    } else {
      const raw = mon.atk ?? 0;
      const dmg = physicalDamage(mon, target, raw);
      target.hp = clamp(target.hp - dmg, 0, target.maxHp);
      logLine(`${mon.name} 물리공격 → ${target.name} 피해 ${dmg}`);
    }
  });
}

export function combatRound() {
  if (!state.combat?.inCombat) return;

  if (livingParty().length === 0) {
    logLine("파티 전멸…");
    state.combat.inCombat = false;
    return;
  }
  if (livingMonsters().length === 0) {
    logLine("적을 모두 처치했다!");
    endCombatWin();
    return;
  }

  partyAutoAction();

  if (livingMonsters().length === 0) {
    logLine("적을 모두 처치했다!");
    endCombatWin();
    return;
  }

  monstersAutoAttack();

  if (livingParty().length === 0) {
    logLine("파티 전멸…");
    state.combat.inCombat = false;
    renderAll();
    renderCombatChoices();
    return;
  }

  renderAll();
  renderCombatChoices();
}

function endCombatWin() {
  const reward = state.combat.reward ?? { gold: 0, items: [] };
  state.gold += (reward.gold ?? 0);
  logLine(`전투 보상: GOLD +${reward.gold ?? 0}`);

  for (const it of (reward.items ?? [])) {
    // 아이템 지급은 events.js의 addItem이 아니라 여기서 간단히 처리
    const inv = state.inventory.find(x => x.itemId === it.itemId);
    if (inv) inv.qty += it.qty;
    else state.inventory.push({ itemId: it.itemId, qty: it.qty });

    logLine(`획득: ${(getItemDef(it.itemId)?.name ?? it.itemId)} x${it.qty}`);
  }

  state.combat.inCombat = false;
  state.combat = null;

  renderAll();
  renderEventChoicesAfterCombat();
}
