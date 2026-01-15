const playButton = document.getElementById("play-button");
const loadingScreen = document.getElementById("loading-screen");
const battleScreen = document.getElementById("battle-screen");
const dialogueBox = document.getElementById("dialogue");
const mainActions = document.getElementById("main-actions");
const fightActions = document.getElementById("fight-actions");
const bagActions = document.getElementById("bag-actions");
const endActions = document.getElementById("end-actions");
const restartButton = document.getElementById("restart-button");

const playerHpText = document.getElementById("player-hp");
const playerMaxText = document.getElementById("player-max");
const playerHpBar = document.getElementById("player-hp-bar");
const playerStatus = document.getElementById("player-status");
const enemyHpText = document.getElementById("enemy-hp");
const enemyMaxText = document.getElementById("enemy-max");
const enemyHpBar = document.getElementById("enemy-hp-bar");
const enemyStatus = document.getElementById("enemy-status");

const state = {
  busy: false,
  player: {
    name: "Justino Il’ Banino",
    maxHp: 80,
    hp: 80,
    baseAtk: 20,
    baseDef: 15,
    atk: 20,
    def: 15,
    items: {
      superPotion: 1,
      potion: 1,
    },
  },
  enemy: {
    name: "Brandogno Il’ Rugonononono",
    maxHp: 50,
    hp: 50,
    baseAtk: 15,
    baseDef: 10,
    atk: 15,
    def: 10,
    items: {
      superPotion: 1,
      potion: 1,
    },
  },
};

const moves = {
  chop: {
    name: "Chop It Off",
    type: "debuff",
    targetStat: "atk",
  },
  blast: {
    name: "Banana Blast",
    type: "damage",
    baseDamage: 25,
  },
  rug: {
    name: "Rug",
    type: "damage",
    baseDamage: 15,
  },
  beef: {
    name: "Beef with people who actually do stuff for the community",
    type: "debuff",
    targetStat: "def",
  },
};

const itemData = {
  superPotion: { label: "Super Potion", heal: 50 },
  potion: { label: "Potion", heal: 10 },
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const typeText = async (text) => {
  dialogueBox.textContent = "";
  for (let i = 0; i < text.length; i += 1) {
    dialogueBox.textContent += text[i];
    await wait(20);
  }
};

const showMessages = async (lines) => {
  for (const line of lines) {
    await typeText(line);
    await wait(500);
  }
};

const setScreen = (screen) => {
  loadingScreen.classList.remove("active");
  battleScreen.classList.remove("active");
  screen.classList.add("active");
};

const getStatusText = (fighter) => {
  const status = [];
  if (fighter.atk < fighter.baseAtk) {
    status.push("ATK ↓");
  }
  if (fighter.def < fighter.baseDef) {
    status.push("DEF ↓");
  }
  return status.join(" ");
};

const updateHpUI = (fighter, hpText, maxText, bar) => {
  hpText.textContent = fighter.hp;
  maxText.textContent = fighter.maxHp;
  const percent = Math.max(0, (fighter.hp / fighter.maxHp) * 100);
  bar.style.width = `${percent}%`;
};

const updateUI = () => {
  updateHpUI(state.player, playerHpText, playerMaxText, playerHpBar);
  updateHpUI(state.enemy, enemyHpText, enemyMaxText, enemyHpBar);
  playerStatus.textContent = getStatusText(state.player);
  enemyStatus.textContent = getStatusText(state.enemy);

  const superPotionButton = bagActions.querySelector('[data-item="superPotion"]');
  const potionButton = bagActions.querySelector('[data-item="potion"]');
  superPotionButton.textContent = `Super Potion (${state.player.items.superPotion}) +50`;
  potionButton.textContent = `Potion (${state.player.items.potion}) +10`;
  superPotionButton.disabled =
    state.player.items.superPotion === 0 || state.busy;
  potionButton.disabled = state.player.items.potion === 0 || state.busy;

  document.querySelectorAll(".action-button").forEach((button) => {
    if (button.dataset.item) {
      return;
    }
    button.disabled = state.busy;
  });
};

const resetStats = (fighter) => {
  fighter.hp = fighter.maxHp;
  fighter.atk = fighter.baseAtk;
  fighter.def = fighter.baseDef;
  fighter.items.superPotion = 1;
  fighter.items.potion = 1;
};

const clampStat = (fighter, statKey) => {
  const base = statKey === "atk" ? fighter.baseAtk : fighter.baseDef;
  fighter[statKey] = Math.max(base * 0.2, fighter[statKey]);
};

const applyDebuff = (fighter, statKey) => {
  fighter[statKey] *= 0.8;
  clampStat(fighter, statKey);
};

const calculateDamage = (move, attacker, defender) => {
  const rawDamage = move.baseDamage * (attacker.atk / defender.def);
  return Math.max(1, Math.round(rawDamage));
};

const applyDamage = (defender, damage) => {
  defender.hp = Math.max(0, defender.hp - damage);
};

const checkEnd = async () => {
  if (state.enemy.hp === 0) {
    await showMessages(["Brandogno Il’ Rugonononono fainted!", "You win! 🎉"]);
    endBattle();
    return true;
  }
  if (state.player.hp === 0) {
    await showMessages(["Justino Il’ Banino fainted!", "You were defeated..."]);
    endBattle();
    return true;
  }
  return false;
};

const endBattle = () => {
  state.busy = true;
  mainActions.classList.add("hidden");
  fightActions.classList.add("hidden");
  bagActions.classList.add("hidden");
  endActions.classList.remove("hidden");
  updateUI();
};

const setMenu = (menu) => {
  mainActions.classList.add("hidden");
  fightActions.classList.add("hidden");
  bagActions.classList.add("hidden");
  if (menu === "main") {
    mainActions.classList.remove("hidden");
  }
  if (menu === "fight") {
    fightActions.classList.remove("hidden");
  }
  if (menu === "bag") {
    bagActions.classList.remove("hidden");
  }
};

const healTarget = (fighter, amount) => {
  const before = fighter.hp;
  fighter.hp = Math.min(fighter.maxHp, fighter.hp + amount);
  return fighter.hp - before;
};

const handlePlayerMove = async (moveKey) => {
  state.busy = true;
  updateUI();
  const move = moves[moveKey];

  if (move.type === "damage") {
    const damage = calculateDamage(move, state.player, state.enemy);
    applyDamage(state.enemy, damage);
    await showMessages([
      `${state.player.name} used ${move.name}!`,
      `It dealt ${damage} damage!`,
    ]);
  } else {
    applyDebuff(state.enemy, move.targetStat);
    await showMessages([
      `${state.player.name} used ${move.name}!`,
      `${state.enemy.name}'s ${move.targetStat.toUpperCase()} fell!`,
    ]);
  }

  updateUI();
  const ended = await checkEnd();
  if (!ended) {
    await enemyTurn();
  }
  state.busy = false;
  setMenu("main");
  updateUI();
};

const handlePlayerItem = async (itemKey) => {
  if (state.player.items[itemKey] === 0) {
    return;
  }
  state.busy = true;
  updateUI();

  state.player.items[itemKey] -= 1;
  const healed = healTarget(state.player, itemData[itemKey].heal);
  await showMessages([
    `${state.player.name} used ${itemData[itemKey].label}!`,
    `${state.player.name} recovered ${healed} HP!`,
  ]);

  updateUI();
  const ended = await checkEnd();
  if (!ended) {
    await enemyTurn();
  }
  state.busy = false;
  setMenu("main");
  updateUI();
};

const enemyTurn = async () => {
  await wait(400);
  const enemy = state.enemy;
  const player = state.player;

  if (enemy.hp <= 20 && enemy.items.superPotion > 0) {
    enemy.items.superPotion -= 1;
    const healed = healTarget(enemy, itemData.superPotion.heal);
    await showMessages([
      `${enemy.name} used ${itemData.superPotion.label}!`,
      `${enemy.name} recovered ${healed} HP!`,
    ]);
    updateUI();
    await checkEnd();
    return;
  }

  if (enemy.hp <= 10 && enemy.items.potion > 0) {
    enemy.items.potion -= 1;
    const healed = healTarget(enemy, itemData.potion.heal);
    await showMessages([
      `${enemy.name} used ${itemData.potion.label}!`,
      `${enemy.name} recovered ${healed} HP!`,
    ]);
    updateUI();
    await checkEnd();
    return;
  }

  const shouldDebuff =
    player.def > player.baseDef * 0.5 && Math.random() < 0.3;

  if (shouldDebuff) {
    applyDebuff(player, "def");
    await showMessages([
      `${enemy.name} used ${moves.beef.name}!`,
      `${player.name}'s DEF fell!`,
    ]);
  } else {
    const damage = calculateDamage(moves.rug, enemy, player);
    applyDamage(player, damage);
    await showMessages([
      `${enemy.name} used ${moves.rug.name}!`,
      `It dealt ${damage} damage!`,
    ]);
  }

  updateUI();
  await checkEnd();
};

const resetBattle = async () => {
  resetStats(state.player);
  resetStats(state.enemy);
  state.busy = false;
  setMenu("main");
  endActions.classList.add("hidden");
  updateUI();
  await showMessages(["A wild battle begins!"]);
};

playButton.addEventListener("click", async () => {
  setScreen(battleScreen);
  await resetBattle();
});

restartButton.addEventListener("click", () => {
  setScreen(loadingScreen);
});

mainActions.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  if (!action || state.busy) {
    return;
  }
  if (action === "fight") {
    setMenu("fight");
  }
  if (action === "bag") {
    setMenu("bag");
  }
});

fightActions.addEventListener("click", (event) => {
  const moveKey = event.target.dataset.move;
  const action = event.target.dataset.action;
  if (state.busy) {
    return;
  }
  if (action === "back") {
    setMenu("main");
    return;
  }
  if (moveKey) {
    handlePlayerMove(moveKey);
  }
});

bagActions.addEventListener("click", (event) => {
  const itemKey = event.target.dataset.item;
  const action = event.target.dataset.action;
  if (state.busy) {
    return;
  }
  if (action === "back") {
    setMenu("main");
    return;
  }
  if (itemKey) {
    handlePlayerItem(itemKey);
  }
});

updateUI();
