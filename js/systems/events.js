import { state } from "../state.js";
import { $, clamp, pick, rndInt, chance, logLine } from "../utils.js";
import { getItemDef, getStatusDef } from "../data.js";
import { applyToMember, addStatus, hasStatus, addPairAffinity, passiveCheckBonus } from "../party.js";
import { startCombatFromEvent, combatRound, livingParty } from "./combat.js";
import { renderAll } from "../ui/renderRun.js";

export function currentEvent() {
  return state.scenario.events[state.eventIndex];
}

/* 이벤트 추천 행동자 */
export function recommendActorIndex(event) {
  if (event.type === "combat") {
    let best = 0;
    let bestScore = -1e9;
    state.party.forEach((m, i) => {
      if (m.hp <= 0) return;
      const score =
        (m.stats.atk ?? 0) * 1.2 +
        (m.stats.mag ?? 0) * 1.2 +
        (m.stats.def ?? 0) * 0.4 +
        (m.stats.luck ?? 0) * 0.6;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return best;
  }

  const dcStat = event?.choices?.[0]?.check?.stat;
  let best = 0;
  let bestScore = -1e9;

  state.party.forEach((m, i) => {
    if (m.hp <= 0) return;
    const base = (dcStat ? (m.stats[dcStat] ?? 0) : 0);
    const bonus = passiveCheckBonus(m, event, dcStat);
    const score = base * 2 + bonus * 1.5 + (m.stats.luck ?? 0) * 0.5;
    if (score > bestScore) { bestScore = score; best = i; }
  });

  return best;
}

function setEventUI(ev) {
  $("#eventTitle").textContent = ev.title;
  $("#eventText").textContent = ev.text ?? "";
  $("#eventTypeBadge").innerHTML = `<b>${ev.type ?? "event"}</b>`;

  const rec = recommendActorIndex(ev);
  $("#actorSelect").value = String(rec);
  $("#recommendText").textContent = `추천 행동자: ${state.party[rec]?.name ?? ""}`;
}

/* 전투 회피(은신) */
export function tryStealthSkipCombat() {
  const candidates = state.party.filter(m => m.hp > 0 && (m.skills?.passive ?? []).includes("stealth"));
  if (candidates.length === 0) return { ok: false, reason: "은신술 보유자가 없다." };
  const best = candidates.reduce((a, b) => (a.stats.luck ?? 0) >= (b.stats.luck ?? 0) ? a : b);
  const pct = best.stats.luck ?? 0;
  const ok = chance(pct);
  return { ok, reason: ok ? `${best.name}의 은신술 성공! (확률 ${pct}%)` : `${best.name}의 은신술 실패… (확률 ${pct}%)` };
}

/* 선택 해결 */
function checkRoll(member, ev, stat) {
  const base = member.stats[stat] ?? 0;
  const bonus = passiveCheckBonus(member, ev, stat);
  const d6 = 1 + Math.floor(Math.random() * 6);
  return base + bonus + d6;
}

function resolveChoice(ev, ch) {
  const actorIndex = Number($("#actorSelect").value || "0");
  const actor = state.party[actorIndex];
  if (!actor) return;

  const stat = ch.check?.stat;
  const dc = ch.check?.dc ?? 10;
  const rolled = stat ? checkRoll(actor, ev, stat) : 999;
  const ok = rolled >= dc;
  const out = ok ? ch.success : ch.fail;

  logLine(`${ev.title} - 행동자: ${actor.name} - 선택: "${ch.label}"`);
  if (stat) logLine(`판정: ${stat.toUpperCase()} ${rolled} vs DC ${dc} → ${ok ? "성공" : "실패"}`);
  logLine(out.log);

  applyToMember(actor, out.effects ?? {});
  if (out.effects?.gold) logLine(`GOLD ${out.effects.gold >= 0 ? "+" : ""}${out.effects.gold}`);

  // 단순 호감도: 이벤트마다 행동자가 나머지와 +1(원하면 다시 trait 시스템 넣어줄 수 있음)
  state.party.forEach(m => {
    if (m.id === actor.id) return;
    addPairAffinity(actor.id, m.id, ok ? 1 : -1);
  });

  postEventAffinityTick();
  renderAll();
  goNextEvent();
}

/* 임계치 이벤트 */
function formatScript(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

function postEventAffinityTick() {
  const cfg = state.data.scenarios.affinityThresholdEvents;
  if (!cfg) return;

  for (let i = 0; i < state.party.length; i++) {
    for (let j = i + 1; j < state.party.length; j++) {
      const a = state.party[i], b = state.party[j];
      const key = (a.id < b.id) ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      const val = state.pairAffinity[key] ?? 0;

      if (val >= cfg.positive.min) {
        if (Math.random() < (cfg.positive.chancePerPair ?? 0)) {
          const hp = rndInt(1, 3);
          const mp = rndInt(1, 3);
          a.hp = clamp(a.hp + hp, 0, a.maxHp);
          b.hp = clamp(b.hp + hp, 0, b.maxHp);
          a.mp = clamp(a.mp + mp, 0, a.maxMp);
          b.mp = clamp(b.mp + mp, 0, b.maxMp);

          const tpl = pick(cfg.positive.scripts ?? ["{a}와(과) {b}가 서로를 북돋운다."]);
          logLine(formatScript(tpl, { a: a.name, b: b.name, hp, mp }));
        }
      } else if (val <= cfg.negative.max) {
        if (Math.random() < (cfg.negative.chancePerPair ?? 0)) {
          const hp = rndInt(1, 3);
          const mp = rndInt(1, 3);
          a.hp = clamp(a.hp - hp, 0, a.maxHp);
          b.hp = clamp(b.hp - hp, 0, b.maxHp);
          a.mp = clamp(a.mp - mp, 0, a.maxMp);
          b.mp = clamp(b.mp - mp, 0, b.maxMp);

          const tpl = pick(cfg.negative.scripts ?? ["{a}와(과) {b}의 사이가 험악해진다."]);
          logLine(formatScript(tpl, { a: a.name, b: b.name, hp, mp }));
        }
      }
    }
  }
}

export function renderCombatChoices() {
  $("#eventTypeBadge").innerHTML = `<b>combat</b>`;
  $("#choices").innerHTML = "";

  const mons = (state.combat?.monsters ?? []).filter(m => m.hp > 0);
  const monText = mons.map(m => `${m.name}(${m.hp}/${m.maxHp})`).join(" · ") || "없음";
  const info = document.createElement("div");
  info.className = "muted small";
  info.textContent = `적 상태: ${monText}`;
  $("#choices").appendChild(info);

  const btn = document.createElement("button");
  btn.className = "choiceBtn";
  btn.textContent = "전투 1라운드 진행(자동)";
  btn.onclick = combatRound;
  $("#choices").appendChild(btn);

  const flee = document.createElement("button");
  flee.className = "choiceBtn";
  flee.textContent = "도주 시도(성공 확률: 파티 평균 luck%)";
  flee.onclick = () => {
    const avgLuck = Math.round(state.party.reduce((a, m) => a + (m.stats.luck ?? 0), 0) / Math.max(1, state.party.length));
    const ok = chance(avgLuck);
    if (ok) {
      logLine(`도주 성공! (확률 ${avgLuck}%)`);
      state.combat = null;
      postEventAffinityTick();
      goNextEvent();
    } else {
      logLine(`도주 실패… (확률 ${avgLuck}%)`);
      // 실패하면 적이 한 번 더 때림은 combat.js 쪽에서 자연스럽게 처리하고 싶으면 확장 가능
      renderAll();
      renderCombatChoices();
    }
  };
  $("#choices").appendChild(flee);
}

export function renderEventChoicesAfterCombat() {
  $("#choices").innerHTML = "";
  const btn = document.createElement("button");
  btn.className = "choiceBtn";
  btn.textContent = "전투 종료 → 다음 이벤트로";
  btn.onclick = () => {
    postEventAffinityTick();
    goNextEvent();
  };
  $("#choices").appendChild(btn);
}

export function renderEvent() {
  const ev = currentEvent();
  setEventUI(ev);

  if (ev.type === "combat") {
    $("#choices").innerHTML = "";

    const skipBtn = document.createElement("button");
    skipBtn.className = "choiceBtn";
    skipBtn.textContent = "은신으로 전투 회피 시도(은둔자 패시브)";
    skipBtn.onclick = () => {
      const r = tryStealthSkipCombat();
      logLine(r.reason);
      if (r.ok) {
        logLine("전투를 피했다. 조용히 지나간다.");
        postEventAffinityTick();
        goNextEvent();
      } else {
        startCombatFromEvent(ev);
        renderCombatChoices();
      }
    };
    $("#choices").appendChild(skipBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "choiceBtn";
    startBtn.textContent = "전투 시작(자동 전투)";
    startBtn.onclick = () => {
      startCombatFromEvent(ev);
      renderCombatChoices();
    };
    $("#choices").appendChild(startBtn);

    return;
  }

  if (ev.type === "rest") {
    $("#choices").innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = `휴식하기 (파티 HP +${ev.rest?.hp ?? 0}, MP +${ev.rest?.mp ?? 0})`;
    btn.onclick = () => {
      const hp = ev.rest?.hp ?? 0;
      const mp = ev.rest?.mp ?? 0;
      state.party.forEach(m => {
        if (m.hp > 0) {
          m.hp = clamp(m.hp + hp, 0, m.maxHp);
          m.mp = clamp(m.mp + mp, 0, m.maxMp);
        }
      });
      logLine(`휴식 효과: 파티 HP +${hp}, MP +${mp}`);
      postEventAffinityTick();
      renderAll();
      goNextEvent();
    };
    $("#choices").appendChild(btn);
    return;
  }

  if (ev.type === "shop") {
    $("#choices").innerHTML = "";
    const offers = ev.shop?.offers ?? [];
    offers.forEach(off => {
      const def = getItemDef(off.itemId);
      const btn = document.createElement("button");
      btn.className = "choiceBtn";
      btn.textContent = `구매: ${def?.name ?? off.itemId} (${off.price}G)`;
      btn.onclick = () => {
        if (state.gold < off.price) { logLine("GOLD가 부족하다."); return; }
        state.gold -= off.price;
        addItem(off.itemId, 1);
        logLine(`구매 완료: ${def?.name ?? off.itemId} x1 (-${off.price}G)`);
        renderAll();
      };
      $("#choices").appendChild(btn);
    });

    const leave = document.createElement("button");
    leave.className = "choiceBtn";
    leave.textContent = "상인을 떠난다";
    leave.onclick = () => {
      postEventAffinityTick();
      goNextEvent();
    };
    $("#choices").appendChild(leave);
    return;
  }

  $("#choices").innerHTML = "";
  (ev.choices ?? []).forEach(ch => {
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = ch.label;
    btn.onclick = () => resolveChoice(ev, ch);
    $("#choices").appendChild(btn);
  });
}

export function goNextEvent() {
  if (livingParty().length === 0) {
    $("#choices").innerHTML = "";
    logLine("파티 전멸… 던전에서 쓰러졌다.");
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = "다시 도전";
    btn.onclick = () => window.location.reload();
    $("#choices").appendChild(btn);
    return;
  }

  state.eventIndex += 1;
  if (state.eventIndex >= state.scenario.events.length) {
    finishScenario();
  } else {
    renderAll();
    renderEvent();
  }
}

function finishScenario() {
  $("#choices").innerHTML = "";
  logLine(`던전 클리어! 최종 GOLD ${state.gold}`);
  const btn = document.createElement("button");
  btn.className = "primary";
  btn.textContent = "다시 시작";
  btn.onclick = () => window.location.reload();
  $("#choices").appendChild(btn);
}

/* inventory helpers + item use */
export function addItem(itemId, qty) {
  const it = state.inventory.find(x => x.itemId === itemId);
  if (it) it.qty += qty;
  else state.inventory.push({ itemId, qty });
}

export function useItem(itemId, targetIndex) {
  const inv = state.inventory.find(x => x.itemId === itemId);
  if (!inv || inv.qty <= 0) return;

  const item = getItemDef(itemId);
  const target = state.party[targetIndex];
  if (!item || !target) return;

  logLine(`아이템 사용: ${item.name} → ${target.name}`);

  if (item.extra?.blockIfHasStatus && hasStatus(target, item.extra.blockIfHasStatus)) {
    logLine(`${target.name}은(는) '${getStatusDef(item.extra.blockIfHasStatus)?.name ?? item.extra.blockIfHasStatus}' 상태로 포션 회복이 불가능하다.`);
  } else {
    applyToMember(target, item.effects ?? {});
    if (item.effects?.hp) logLine(`${target.name} HP +${item.effects.hp}`);
    if (item.effects?.mp) logLine(`${target.name} MP +${item.effects.mp}`);
  }

  if (item.extra?.applyStatus && (item.extra?.chance ?? 0) > 0) {
    if (Math.random() < item.extra.chance) {
      addStatus(target, item.extra.applyStatus);
      logLine(`${target.name}에게 상태이상 '${getStatusDef(item.extra.applyStatus)?.name ?? item.extra.applyStatus}'이 부여되었다!`);
    }
  }

  inv.qty -= 1;
  if (inv.qty <= 0) state.inventory = state.inventory.filter(x => x.itemId !== itemId);

  renderAll();
}
