
/* ClickerGameTS v2.2 Experimental — Sea Update
   Build 2290
   Legacy saves preserved.
   Farm retired; historical farm data retained.
   Volcano and Sea systems supported.
*/
"use strict";

(() => {
  const $ = id => document.getElementById(id);

  const SAVE_VERSION = 22;
  const BUILD_NUMBER = 2290;
  const PRESTIGE_REQUIREMENT = 5000;
  const COMBO_TIMEOUT = 1500;
  const SAVE_DEBOUNCE_MS = 500;
  const CRIT_CHANCE = 0.15;
  const CRIT_MULTIPLIER = 5;

  const LEGACY_KEYS = [
    "game_clicks", "click_power", "auto_clickers",
    "quantum_chips", "cost_super", "cost_auto", "cost_chip",
    "prestige_count", "prestige_mult", "total_clicks",
    "manual_clicks", "critical_hits", "best_combo",
    "game_user", "app_theme", "save_version",
    "cgt133_total_upgrades", "cgt133_unlocked_milestones"
  ];

  const FARM_KEY = "cgt20_farm";
  const VOLCANO_KEY = "cgt21_volcano";
  const SEA_KEY = "cgt22_sea";

  const SEEDS = {
    carrot: { name: "Carrot", emoji: "🥕", cost: 120, grow: 20, reward: 250 },
    wheat: { name: "Wheat", emoji: "🌾", cost: 350, grow: 35, reward: 700 },
    strawberry: { name: "Strawberry", emoji: "🍓", cost: 900, grow: 50, reward: 1900 },
    pumpkin: { name: "Pumpkin", emoji: "🎃", cost: 2200, grow: 75, reward: 5000 }
  };

  const DEFAULTS = {
    clicks: 0,
    clickPower: 1,
    autoClickers: 0,
    quantumChips: 0,
    superCost: 25,
    autoCost: 100,
    chipCost: 500,
    prestigeCount: 0,
    prestigeMult: 1,
    totalClicks: 0,
    manualClicks: 0,
    criticalHits: 0,
    bestCombo: 0,
    username: "Clicker",
    theme: "light",
    totalUpgrades: 0,
    unlockedMilestones: [],
    combo: 0,
    comboMultiplier: 1,

    // Historical Farm data is retained for save compatibility.
    farm: {
      plots: [null, null, null, null],
      extraPlots: 0,
      waterLevel: 0,
      cropsHarvested: 0,
      farmEarned: 0,
      seedsPlanted: 0
    },

    volcano: {
      heat: 0,
      eruptions: 0,
      coreLevel: 0,
      chamberLevel: 0,
      ignitionLevel: 0,
      milestones: []
    },

    sea: {
      pressure: 0,
      dives: 0,
      sonarLevel: 0,
      subLevel: 0,
      discoveries: []
    }
  };

  let state = structuredClone(DEFAULTS);

  let comboTimer = null;
  let saveTimer = null;
  let lastClickAt = 0;
  let lastTick = Date.now();
  let changelogLoaded = false;

  /* -------------------------
     STORAGE
  ------------------------- */

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (_) {
      setSaveStatus("Save unavailable — browser storage may be blocked/full.");
      return false;
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function safeJSON(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function numberStored(key, fallback, min = 0) {
    const raw = safeGet(key);
    const value = Number(raw);

    return raw !== null && Number.isFinite(value) && value >= min
      ? value
      : fallback;
  }

  function setSaveStatus(message) {
    const a = $("save-status");
    const b = $("settings-save-status");

    if (a) a.textContent = message;
    if (b) b.textContent = message;
  }

  function fmt(number) {
    if (!Number.isFinite(number)) return "0";

    if (number < 1000) {
      return Math.floor(number).toLocaleString();
    }

    const units = ["K", "M", "B", "T", "Qa", "Qi"];
    let i = -1;

    while (number >= 1000 && i < units.length - 1) {
      number /= 1000;
      i++;
    }

    return number.toFixed(number >= 100 ? 0 : number >= 10 ? 1 : 2) + units[i];
  }

  function exact(number) {
    return Math.floor(number).toLocaleString();
  }

  function toast(message) {
    const region = $("toast-region");
    if (!region) return;

    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;

    region.appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }

  function load() {
    state.clicks = numberStored("game_clicks", 0);
    state.clickPower = numberStored("click_power", 1, 1);
    state.autoClickers = numberStored("auto_clickers", 0);
    state.quantumChips = numberStored("quantum_chips", 0);

    state.superCost = numberStored("cost_super", 25, 1);
    state.autoCost = numberStored("cost_auto", 100, 1);
    state.chipCost = numberStored("cost_chip", 500, 1);

    state.prestigeCount = numberStored("prestige_count", 0);
    state.prestigeMult = numberStored("prestige_mult", 1, 1);

    state.totalClicks = numberStored("total_clicks", state.clicks);
    state.manualClicks = numberStored("manual_clicks", 0);
    state.criticalHits = numberStored("critical_hits", 0);
    state.bestCombo = numberStored("best_combo", 0);

    state.username = (safeGet("game_user") || "Clicker").slice(0, 24);
    state.theme = safeGet("app_theme") === "dark" ? "dark" : "light";

    state.totalUpgrades = numberStored("cgt133_total_upgrades", 0);

    const unlocked = safeJSON(safeGet("cgt133_unlocked_milestones"));
    state.unlockedMilestones = Array.isArray(unlocked) ? unlocked : [];

    const farm = safeJSON(safeGet(FARM_KEY));

    if (farm && typeof farm === "object") {
      state.farm = {
        ...state.farm,
        ...farm,
        plots: Array.isArray(farm.plots) ? farm.plots : state.farm.plots
      };
    }

    const volcano = safeJSON(safeGet(VOLCANO_KEY));

    if (volcano && typeof volcano === "object") {
      state.volcano = {
        ...state.volcano,
        ...volcano,
        milestones: Array.isArray(volcano.milestones)
          ? volcano.milestones
          : []
      };
    }

    const sea = safeJSON(safeGet(SEA_KEY));

    if (sea && typeof sea === "object") {
      state.sea = {
        ...state.sea,
        ...sea,
        discoveries: Array.isArray(sea.discoveries)
          ? sea.discoveries
          : []
      };
    }

    state.volcano.heat = Math.max(
      0,
      Math.min(100, Number(state.volcano.heat) || 0)
    );

    state.sea.pressure = Math.max(
      0,
      Math.min(100, Number(state.sea.pressure) || 0)
    );

    for (const key of [
      "eruptions", "coreLevel", "chamberLevel", "ignitionLevel"
    ]) {
      state.volcano[key] = Math.max(
        0,
        Math.floor(Number(state.volcano[key]) || 0)
      );
    }

    for (const key of ["dives", "sonarLevel", "subLevel"]) {
      state.sea[key] = Math.max(
        0,
        Math.floor(Number(state.sea[key]) || 0)
      );
    }

    document.documentElement.dataset.theme = state.theme;

    if ($("username-input")) {
      $("username-input").value = state.username;
    }

    if ($("welcome-banner")) {
      $("welcome-banner").textContent = `Welcome back, ${state.username}.`;
    }

    safeSet("save_version", SAVE_VERSION);
  }

  function persistNow() {
    const pairs = {
      game_clicks: state.clicks,
      click_power: state.clickPower,
      auto_clickers: state.autoClickers,
      quantum_chips: state.quantumChips,

      cost_super: state.superCost,
      cost_auto: state.autoCost,
      cost_chip: state.chipCost,

      prestige_count: state.prestigeCount,
      prestige_mult: state.prestigeMult,

      total_clicks: state.totalClicks,
      manual_clicks: state.manualClicks,
      critical_hits: state.criticalHits,
      best_combo: state.bestCombo,

      game_user: state.username,
      app_theme: state.theme,
      save_version: SAVE_VERSION,

      cgt133_total_upgrades: state.totalUpgrades,
      cgt133_unlocked_milestones: JSON.stringify(state.unlockedMilestones),

      [FARM_KEY]: safeGet(FARM_KEY) || JSON.stringify(state.farm),
      [VOLCANO_KEY]: JSON.stringify(state.volcano),
      [SEA_KEY]: JSON.stringify(state.sea)
    };

    let ok = true;

    for (const [key, value] of Object.entries(pairs)) {
      if (!safeSet(key, value)) ok = false;
    }

    if (ok) setSaveStatus("All progress saved");
  }

  function saveSoon() {
    setSaveStatus("Saving…");

    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, SAVE_DEBOUNCE_MS);
  }

  /* -------------------------
     CLICKER ENGINE
  ------------------------- */

  function passiveRate() {
    return (
      state.autoClickers + state.quantumChips * 5
    ) * state.prestigeMult;
  }

  function addClicks(amount, manual = false) {
    if (!Number.isFinite(amount) || amount <= 0) return;

    state.clicks += amount;
    state.totalClicks += amount;

    if (manual) state.manualClicks += amount;

    renderStats();
    saveSoon();
  }

  function doClick() {
    const now = Date.now();

    if (now - lastClickAt <= COMBO_TIMEOUT) {
      state.combo++;
      state.comboMultiplier = Math.min(2, 1 + state.combo * 0.025);
    } else {
      state.combo = 1;
      state.comboMultiplier = 1;
    }

    lastClickAt = now;
    state.bestCombo = Math.max(state.bestCombo, state.combo);

    clearTimeout(comboTimer);

    comboTimer = setTimeout(() => {
      state.combo = 0;
      state.comboMultiplier = 1;
      renderStats();
    }, COMBO_TIMEOUT);

    const critical = Math.random() < CRIT_CHANCE;

    const gain =
      state.clickPower *
      state.prestigeMult *
      state.comboMultiplier *
      (critical ? CRIT_MULTIPLIER : 1);

    if (critical) {
      state.criticalHits++;
      toast(`Critical hit! +${fmt(gain)} clicks`);
    }

    addClicks(gain, true);
    addSeaPressure(1);

    if ($("combo-display")) {
      $("combo-display").textContent =
        `Combo ×${state.comboMultiplier.toFixed(2)}`;
    }

    if ($("combo-bonus-text")) {
      $("combo-bonus-text").textContent = critical
        ? "CRITICAL HIT!"
        : `${state.combo} clicks in combo`;
    }

    if ($("combo-progress")) {
      $("combo-progress").style.width =
        `${Math.min(100, state.combo / 40 * 100)}%`;
    }

    $("my-btn")?.animate?.(
      [
        { transform: "scale(1)" },
        { transform: "scale(.98)" },
        { transform: "scale(1)" }
      ],
      { duration: 100 }
    );

    checkMilestones();
  }

  function buy(kind) {
    const costKey = {
      super: "superCost",
      auto: "autoCost",
      chip: "chipCost"
    }[kind];

    if (!costKey) return;

    const cost = state[costKey];

    if (state.clicks < cost) {
      toast(`You need ${fmt(cost - state.clicks)} more clicks.`);
      return;
    }

    state.clicks -= cost;
    state.totalUpgrades++;

    if (kind === "super") {
      state.clickPower++;
      state.superCost = Math.ceil(state.superCost * 1.65);
    }

    if (kind === "auto") {
      state.autoClickers++;
      state.autoCost = Math.ceil(state.autoCost * 1.75);
    }

    if (kind === "chip") {
      state.quantumChips++;
      state.chipCost = Math.ceil(state.chipCost * 2.1);
    }

    toast("Upgrade purchased!");

    renderAll();
    checkMilestones();
    saveSoon();
  }

  function prestige() {
    if (state.clicks < PRESTIGE_REQUIREMENT) {
      toast(
        `You need ${fmt(PRESTIGE_REQUIREMENT - state.clicks)} more clicks to prestige.`
      );
      return;
    }

    if (!confirm(
      "Prestige resets your current clicks and shop progress, but keeps lifetime stats, Sea progress, Volcano progress, and prestige bonuses. Continue?"
    )) return;

    state.prestigeCount++;
    state.prestigeMult = 1 + state.prestigeCount * 0.25;

    state.clicks = 0;
    state.clickPower = 1;
    state.autoClickers = 0;
    state.quantumChips = 0;

    state.superCost = 25;
    state.autoCost = 100;
    state.chipCost = 500;

    state.totalUpgrades = 0;

    toast(
      `Prestige ${state.prestigeCount} complete! Multiplier ×${state.prestigeMult.toFixed(2)}`
    );

    renderAll();
    checkMilestones();
    saveSoon();
  }

  /* -------------------------
     MILESTONES
  ------------------------- */

  const MILESTONES = [
    {
      id: "click100",
      name: "First hundred",
      desc: "Earn 100 current clicks.",
      test: () => state.clicks >= 100,
      reward: 100
    },
    {
      id: "click10k",
      name: "Click millionaire",
      desc: "Reach 10,000 lifetime clicks.",
      test: () => state.totalClicks >= 10000,
      reward: 500
    },
    {
      id: "upgrades10",
      name: "Mechanic",
      desc: "Buy 10 upgrades.",
      test: () => state.totalUpgrades >= 10,
      reward: 500
    },
    {
      id: "prestige1",
      name: "New tide",
      desc: "Prestige for the first time.",
      test: () => state.prestigeCount >= 1,
      reward: 1000
    },
    {
      id: "prestige10",
      name: "Tsunami",
      desc: "Reach 10 prestiges.",
      test: () => state.prestigeCount >= 10,
      reward: 5000
    },
    {
      id: "sea1",
      name: "Ocean Calling",
      desc: "Complete your first sea exploration.",
      test: () => state.sea.dives >= 1,
      reward: 500
    },
    {
      id: "sea10",
      name: "Ocean Veteran",
      desc: "Complete 10 sea explorations.",
      test: () => state.sea.dives >= 10,
      reward: 2000
    },
    {
      id: "volcano1",
      name: "Volcanic Activity",
      desc: "Trigger your first eruption.",
      test: () => state.volcano.eruptions >= 1,
      reward: 500
    }
  ];

  function checkMilestones() {
    for (const milestone of MILESTONES) {
      if (
        milestone.test() &&
        !state.unlockedMilestones.includes(milestone.id)
      ) {
        state.unlockedMilestones.push(milestone.id);

        state.clicks += milestone.reward;
        state.totalClicks += milestone.reward;

        toast(
          `Milestone unlocked: ${milestone.name} (+${fmt(milestone.reward)} clicks)`
        );
      }
    }

    renderMilestones();
  }

  function renderMilestones() {
    const box = $("milestone-list");
    if (!box) return;

    box.replaceChildren();

    for (const milestone of MILESTONES) {
      const unlocked = state.unlockedMilestones.includes(milestone.id);

      const div = document.createElement("div");
      div.className = "milestone-item" + (unlocked ? " unlocked" : "");

      const title = document.createElement("strong");
      title.textContent = (unlocked ? "✅ " : "🔒 ") + milestone.name;

      const p = document.createElement("p");
      p.textContent = unlocked
        ? `${milestone.desc} Reward claimed.`
        : `${milestone.desc} Reward: ${fmt(milestone.reward)} clicks.`;

      div.append(title, p);
      box.append(div);
    }

    if ($("achievement-badge")) {
      $("achievement-badge").textContent =
        `${state.unlockedMilestones.length} unlocked`;
    }

    if ($("achievement-list")) {
      $("achievement-list").textContent =
        state.unlockedMilestones.join(", ");
    }
  }

  /* -------------------------
     SEA ENGINE — v2.2
  ------------------------- */

  const SEA_UPGRADES = {
    sonar: {
      name: "Advanced Sonar",
      base: 1000,
      key: "sonarLevel",
      description: "Build exploration pressure faster."
    },

    submarine: {
      name: "Deep Sea Submarine",
      base: 2500,
      key: "subLevel",
      description: "Increase exploration rewards."
    }
  };

  const SEA_MILESTONES = [
    { dives: 1, name: "First Dive", reward: 500 },
    { dives: 5, name: "Ocean Explorer", reward: 2500 },
    { dives: 10, name: "Deep Sea Adventurer", reward: 7500 },
    { dives: 25, name: "Master of the Ocean", reward: 20000 },
    { dives: 50, name: "Legend of the Deep", reward: 50000 }
  ];

  function seaReward() {
    return Math.floor(
      (500 + state.sea.dives * 150) *
      Math.pow(1.5, state.sea.subLevel) *
      state.prestigeMult
    );
  }

  function addSeaPressure(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;

    state.sea.pressure = Math.min(
      100,
      state.sea.pressure +
      amount * (1 + state.sea.sonarLevel * 0.25)
    );

    if (state.sea.pressure >= 100) {
      exploreSea();
    }

    renderSea();
  }

  function exploreSea() {
    state.sea.pressure = 0;
    state.sea.dives++;

    const reward = seaReward();

    addClicks(reward, false);

    toast(`Sea exploration complete! +${fmt(reward)} clicks.`);

    for (const milestone of SEA_MILESTONES) {
      if (
        state.sea.dives >= milestone.dives &&
        !state.sea.discoveries.includes(milestone.dives)
      ) {
        state.sea.discoveries.push(milestone.dives);

        addClicks(milestone.reward, false);

        toast(
          `${milestone.name}! +${fmt(milestone.reward)} clicks.`
        );
      }
    }

    checkMilestones();
    renderSea();
    saveSoon();
  }

  function manualDive() {
    addSeaPressure(25);
    toast("Exploration pressure increased!");
  }

  function buySeaUpgrade(kind) {
    const upgrade = SEA_UPGRADES[kind];
    if (!upgrade) return;

    const level = state.sea[upgrade.key];
    const cost = Math.floor(upgrade.base * Math.pow(1.8, level));

    if (state.clicks < cost) {
      toast(`You need ${fmt(cost - state.clicks)} more clicks.`);
      return;
    }

    state.clicks -= cost;
    state.sea[upgrade.key]++;
    state.totalUpgrades++;

    toast(`${upgrade.name} upgraded to level ${level + 1}.`);

    renderAll();
    checkMilestones();
    saveSoon();
  }

  function renderSea() {
    const pressure = $("sea-pressure");
    if (!pressure) return;

    const fill = $("sea-pressure-fill");
    const percent = $("sea-pressure-percent");

    if (fill) fill.style.width = `${state.sea.pressure}%`;
    if (percent) percent.textContent = `${Math.floor(state.sea.pressure)}%`;

    pressure.setAttribute(
      "aria-valuenow",
      String(Math.floor(state.sea.pressure))
    );

    if ($("sea-dives")) {
      $("sea-dives").textContent = fmt(state.sea.dives);
    }

    if ($("sea-reward")) {
      $("sea-reward").textContent = fmt(seaReward());
    }

    if ($("sea-sonar-level")) {
      $("sea-sonar-level").textContent = state.sea.sonarLevel;
    }

    if ($("sea-sub-level")) {
      $("sea-sub-level").textContent = state.sea.subLevel;
    }

    for (const [kind, upgrade] of Object.entries(SEA_UPGRADES)) {
      const level = state.sea[upgrade.key];
      const cost = Math.floor(upgrade.base * Math.pow(1.8, level));

      const costElement = $(`sea-${kind}-cost`);
      const button = $(`buy-sea-${kind}`);

      if (costElement) costElement.textContent = fmt(cost);
      if (button) button.disabled = state.clicks < cost;
    }

    const list = $("sea-milestones");
    if (!list) return;

    list.replaceChildren();

    for (const milestone of SEA_MILESTONES) {
      const unlocked = state.sea.discoveries.includes(milestone.dives);

      const card = document.createElement("div");
      card.className = "milestone-item" + (unlocked ? " unlocked" : "");

      const title = document.createElement("strong");
      title.textContent =
        `${unlocked ? "✓" : "🔒"} ${milestone.name}`;

      const detail = document.createElement("p");
      detail.textContent =
        `${milestone.dives} dives · ${fmt(milestone.reward)} clicks`;

      card.append(title, detail);
      list.append(card);
    }
  }

  /* -------------------------
     VOLCANO ENGINE — v2.1
  ------------------------- */

  const VOLCANO_MILESTONES = [
    { count: 1, name: "First Eruption", reward: 500 },
    { count: 5, name: "Lava Flow", reward: 1500 },
    { count: 10, name: "Volcanic Activity", reward: 4000 },
    { count: 25, name: "Mountain of Fire", reward: 12000 },
    { count: 50, name: "Volcano Master", reward: 30000 }
  ];

  function heatRate() {
    return (
      1 +
      state.volcano.coreLevel * 0.75 +
      state.volcano.ignitionLevel * 0.5
    );
  }

  function explosionReward() {
    return Math.floor(
      (500 + state.volcano.eruptions * 175) *
      Math.pow(1.08, state.volcano.chamberLevel) *
      state.prestigeMult
    );
  }

  function addHeat(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;

    state.volcano.heat = Math.min(
      100,
      state.volcano.heat + amount * heatRate()
    );

    if (state.volcano.heat >= 100) {
      erupt();
    }
  }

  function erupt() {
    state.volcano.heat = 0;
    state.volcano.eruptions++;

    const reward = explosionReward();

    addClicks(reward, false);

    toast(`Volcano erupted! +${fmt(reward)} clicks.`);

    for (const milestone of VOLCANO_MILESTONES) {
      if (
        state.volcano.eruptions >= milestone.count &&
        !state.volcano.milestones.includes(milestone.count)
      ) {
        state.volcano.milestones.push(milestone.count);
        addClicks(milestone.reward, false);

        toast(
          `${milestone.name} milestone! +${fmt(milestone.reward)} clicks.`
        );
      }
    }

    checkMilestones();
    renderVolcano();
    saveSoon();
  }

  function buyFireUpgrade(kind) {
    const config = {
      core: {
        key: "coreLevel",
        base: 750,
        label: "Magma Core"
      },
      chamber: {
        key: "chamberLevel",
        base: 1200,
        label: "Pressure Chamber"
      },
      ignition: {
        key: "ignitionLevel",
        base: 2000,
        label: "Rapid Ignition"
      }
    }[kind];

    if (!config) return;

    const level = state.volcano[config.key];
    const cost = Math.floor(config.base * Math.pow(1.8, level));

    if (state.clicks < cost) {
      toast(`You need ${fmt(cost - state.clicks)} more clicks.`);
      return;
    }

    state.clicks -= cost;
    state.volcano[config.key]++;
    state.totalUpgrades++;

    toast(`${config.label} upgraded to level ${level + 1}.`);

    renderAll();
    checkMilestones();
    saveSoon();
  }

  function renderVolcano() {
    const heat = $("volcano-heat");
    if (!heat) return;

    const fill = $("volcano-heat-fill");
    const percent = $("volcano-heat-percent");

    if (fill) fill.style.width = `${state.volcano.heat}%`;
    if (percent) percent.textContent = `${Math.floor(state.volcano.heat)}%`;

    heat.setAttribute(
      "aria-valuenow",
      String(Math.floor(state.volcano.heat))
    );

    if ($("volcano-eruptions")) {
      $("volcano-eruptions").textContent = fmt(state.volcano.eruptions);
    }

    if ($("volcano-reward")) {
      $("volcano-reward").textContent = fmt(explosionReward());
    }

    if ($("volcano-heat-rate")) {
      $("volcano-heat-rate").textContent = heatRate().toFixed(2);
    }

    const upgrades = [
      ["core", "Magma Core", "More heat from every action.", "coreLevel", 750],
      ["chamber", "Pressure Chamber", "Increase eruption rewards.", "chamberLevel", 1200],
      ["ignition", "Rapid Ignition", "Build heat faster over time.", "ignitionLevel", 2000]
    ];

    const list = $("fire-upgrades");

    if (list) {
      list.replaceChildren();

      for (const [id, name, desc, key, base] of upgrades) {
        const level = state.volcano[key];
        const cost = Math.floor(base * Math.pow(1.8, level));

        const row = document.createElement("div");
        row.className = "upgrade-card";

        const icon = document.createElement("span");
        icon.className = "upgrade-icon";
        icon.textContent =
          id === "core" ? "🌋" : id === "chamber" ? "🧱" : "⚡";

        const copy = document.createElement("div");
        copy.className = "upgrade-copy";

        const heading = document.createElement("h3");
        heading.textContent = `${name} · Lv. ${level}`;

        const detail = document.createElement("p");
        detail.textContent = desc;

        const price = document.createElement("small");
        price.textContent = `Cost: ${fmt(cost)} clicks`;

        copy.append(heading, detail, price);

        const button = document.createElement("button");
        button.className = "buy-button";
        button.textContent = "Upgrade";
        button.disabled = state.clicks < cost;

        button.addEventListener("click", () => buyFireUpgrade(id));

        row.append(icon, copy, button);
        list.append(row);
      }
    }

    const milestones = $("volcano-milestones");
    if (!milestones) return;

    milestones.replaceChildren();

    for (const item of VOLCANO_MILESTONES) {
      const unlocked = state.volcano.milestones.includes(item.count);

      const card = document.createElement("div");
      card.className = "milestone-item" + (unlocked ? " unlocked" : "");

      const title = document.createElement("strong");
      title.textContent = `${unlocked ? "✓" : "🔒"} ${item.name}`;

      const detail = document.createElement("p");
      detail.textContent =
        `${item.count} eruptions · ${fmt(item.reward)} clicks`;

      card.append(title, detail);
      milestones.append(card);
    }
  }

  /* -------------------------
     DYNAMIC v2.2 UI
  ------------------------- */

  function ensureGameUI() {
    document.title = "ClickerGameTS v2.2 Experimental — Sea Update";

    const description =
      document.querySelector('meta[name="description"]');

    if (description) {
      description.content =
        "ClickerGameTS v2.2 Experimental — Sea Update";
    }

    const version = document.querySelector(".sidebar-version");

    if (version) {
      version.textContent = "v2.2 EXPERIMENTAL · SEA UPDATE";
    }

    const title = $("page-title");

    if (title) {
      title.innerHTML =
        'ClickerGameTS <span>v2.2 Experimental</span>';
    }

    const hero = document.querySelector("#page-dashboard .hero-banner");

    if (hero) {
      const heading = hero.querySelector("h2");
      const paragraph = hero.querySelector("p");

      if (heading) heading.textContent = "Welcome to the Sea Update.";
      if (paragraph) {
        paragraph.textContent =
          "Explore the ocean, discover hidden locations, and earn clicks.";
      }
    }

    const footer = document.querySelector(".app-footer");

    if (footer && footer.firstElementChild) {
      footer.firstElementChild.textContent =
        "ClickerGameTS™ v2.2 Experimental · Sea Update";
    }

    // Replace the old Farm navigation item with Sea.
    const navList = document.querySelector(".menu-links");
    const farmLink = document.querySelector(
      '.nav-link[data-page="farm"]'
    );

    if (farmLink) {
      farmLink.href = "#sea";
      farmLink.dataset.page = "sea";
      farmLink.textContent = "🌊 Sea";
    }

    // Remove the old Farm page from active navigation and display.
    $("page-farm")?.remove();

    // Create the Sea page.
    if (!$("page-sea")) {
      const seaPage = document.createElement("section");

      seaPage.id = "page-sea";
      seaPage.className = "page";
      seaPage.dataset.title = "Sea";
      seaPage.dataset.subtitle =
        "Explore the ocean and uncover underwater discoveries.";

      seaPage.innerHTML = `
        <div class="hero-banner">
          <div>
            <span class="pill">🌊 SEA ENGINE · BUILD 2290</span>
            <h2>Explore the deep blue.</h2>
            <p>Build exploration pressure, dive into the ocean, and earn rewards.</p>
          </div>
          <div class="hero-emoji" aria-hidden="true">🐬</div>
        </div>

        <div class="dashboard-card">
          <div class="section-title">
            <h2>🌊 Ocean Exploration</h2>
            <strong id="sea-pressure-percent">0%</strong>
          </div>

          <div
            id="sea-pressure"
            class="volcano-track"
            role="progressbar"
            aria-label="Sea exploration pressure"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
          >
            <span id="sea-pressure-fill"></span>
          </div>

          <p class="muted">
            Click to build exploration pressure. At 100%, your next dive is completed automatically.
          </p>

          <div class="volcano-stats">
            <div>
              <small>Completed dives</small>
              <strong id="sea-dives">0</strong>
            </div>
            <div>
              <small>Next dive reward</small>
              <strong id="sea-reward">500</strong>
            </div>
            <div>
              <small>Exploration bonus</small>
              <strong>+25% per sonar level</strong>
            </div>
          </div>

          <button id="sea-dive-button" class="primary-button">
            🌊 EXPLORE SEA
          </button>
        </div>

        <div class="dashboard-card">
          <div class="section-title">
            <h2>🔧 Exploration Equipment</h2>
            <span class="pill">PURCHASE WITH CLICKS</span>
          </div>

          <article class="upgrade-card">
            <div class="upgrade-icon">📡</div>
            <div class="upgrade-copy">
              <h3>Advanced Sonar</h3>
              <p>Build exploration pressure faster.</p>
              <small>
                Level: <b id="sea-sonar-level">0</b> ·
                Cost: <b id="sea-sonar-cost">1,000</b>
              </small>
            </div>
            <button id="buy-sea-sonar" class="buy-button">Upgrade</button>
          </article>

          <article class="upgrade-card">
            <div class="upgrade-icon">🚤</div>
            <div class="upgrade-copy">
              <h3>Deep Sea Submarine</h3>
              <p>Increase rewards from every exploration.</p>
              <small>
                Level: <b id="sea-sub-level">0</b> ·
                Cost: <b id="sea-submarine-cost">2,500</b>
              </small>
            </div>
            <button id="buy-sea-submarine" class="buy-button">Upgrade</button>
          </article>
        </div>

        <div class="dashboard-card">
          <div class="section-title">
            <h2>🏆 Ocean Discoveries</h2>
          </div>
          <div id="sea-milestones" class="milestone-grid"></div>
        </div>
      `;

      const main = document.querySelector(".main-content");
      const analytics = $("page-analytics");

      if (main && analytics) {
        main.insertBefore(seaPage, analytics);
      } else if (main) {
        main.append(seaPage);
      }
    }

    // Create the Fire Shop navigation entry.
    if (
      navList &&
      !document.querySelector('.nav-link[data-page="fire"]')
    ) {
      const item = document.createElement("li");
      const link = document.createElement("a");

      link.className = "nav-link";
      link.href = "#fire";
      link.dataset.page = "fire";
      link.textContent = "🌋 Fire Shop";

      item.append(link);

      const seaItem = farmLink?.closest("li");

      if (seaItem && seaItem.parentElement === navList) {
        navList.insertBefore(item, seaItem.nextSibling);
      } else {
        navList.append(item);
      }
    }

    // Create the Fire Shop page.
    if (!$("page-fire")) {
      const firePage = document.createElement("section");

      firePage.id = "page-fire";
      firePage.className = "page";
      firePage.dataset.title = "Fire Shop";
      firePage.dataset.subtitle =
        "Build heat, trigger eruptions, and upgrade your volcano.";

      firePage.innerHTML = `
        <div class="hero-banner">
          <div>
            <span class="pill">VOLCANO ENGINE · v2.1</span>
            <h2>The Volcano is active.</h2>
            <p>Build heat, trigger eruptions, and turn every blast into clicks.</p>
          </div>
          <div class="hero-emoji" aria-hidden="true">🌋</div>
        </div>

        <div class="dashboard-card">
          <div class="section-title">
            <h2>🌡️ Volcano Heat</h2>
            <strong id="volcano-heat-percent">0%</strong>
          </div>

          <div
            id="volcano-heat"
            class="volcano-track"
            role="progressbar"
            aria-label="Volcano heat"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
          >
            <span id="volcano-heat-fill"></span>
          </div>

          <p class="muted">
            Heat rises over time. At 100%, the volcano erupts automatically.
          </p>

          <div class="volcano-stats">
            <div>
              <small>Total eruptions</small>
              <strong id="volcano-eruptions">0</strong>
            </div>
            <div>
              <small>Next eruption reward</small>
              <strong id="volcano-reward">500</strong>
            </div>
            <div>
              <small>Heat multiplier</small>
              <strong>×<span id="volcano-heat-rate">1.00</span></strong>
            </div>
          </div>
        </div>

        <div class="dashboard-card">
          <div class="section-title">
            <h2>🔥 Fire Shop</h2>
            <span class="pill">PURCHASE WITH CLICKS</span>
          </div>
          <div id="fire-upgrades"></div>
        </div>

        <div class="dashboard-card">
          <div class="section-title">
            <h2>🏆 Volcano Milestones</h2>
          </div>
          <div id="volcano-milestones" class="milestone-grid"></div>
        </div>
      `;

      const main = document.querySelector(".main-content");

      if (main) main.append(firePage);
    }
  }

  /* -------------------------
     ANALYTICS AND RENDERING
  ------------------------- */

  function renderStats() {
    if ($("counter-display")) {
      $("counter-display").textContent = fmt(state.clicks);
    }

    if ($("power-display")) {
      $("power-display").textContent =
        fmt(state.clickPower * state.prestigeMult);
    }

    if ($("super-cost-text")) {
      $("super-cost-text").textContent = fmt(state.superCost);
    }

    if ($("auto-cost-text")) {
      $("auto-cost-text").textContent = fmt(state.autoCost);
    }

    if ($("chip-cost-text")) {
      $("chip-cost-text").textContent = fmt(state.chipCost);
    }

    if ($("super-owned")) {
      $("super-owned").textContent = fmt(state.clickPower - 1);
    }

    if ($("auto-owned")) {
      $("auto-owned").textContent = fmt(state.autoClickers);
    }

    if ($("chip-owned")) {
      $("chip-owned").textContent = fmt(state.quantumChips);
    }

    if ($("buy-super-click")) {
      $("buy-super-click").disabled =
        state.clicks < state.superCost;
    }

    if ($("buy-auto-click")) {
      $("buy-auto-click").disabled =
        state.clicks < state.autoCost;
    }

    if ($("buy-quantum-chip")) {
      $("buy-quantum-chip").disabled =
        state.clicks < state.chipCost;
    }

    if ($("total-clicks-stat")) {
      $("total-clicks-stat").textContent = fmt(state.totalClicks);
    }

    if ($("best-combo-stat")) {
      $("best-combo-stat").textContent = fmt(state.bestCombo);
    }

    if ($("crit-stat")) {
      $("crit-stat").textContent = fmt(state.criticalHits);
    }

    if ($("multiplier-stat")) {
      $("multiplier-stat").textContent =
        `×${state.prestigeMult.toFixed(2)}`;
    }

    if ($("prestige-info")) {
      $("prestige-info").textContent =
        state.clicks >= PRESTIGE_REQUIREMENT
          ? `Ready! Prestige ${state.prestigeCount + 1} grants ×${(state.prestigeMult + 0.25).toFixed(2)} multiplier.`
          : `Earn ${fmt(PRESTIGE_REQUIREMENT)} clicks to prestige. Current multiplier ×${state.prestigeMult.toFixed(2)}.`;
    }

    if ($("prestige-btn")) {
      $("prestige-btn").disabled =
        state.clicks < PRESTIGE_REQUIREMENT;
    }

    if ($("passive-rate")) {
      $("passive-rate").textContent = fmt(passiveRate());
    }

    if ($("analytics-harvested")) {
      $("analytics-harvested").textContent =
        fmt(state.farm.cropsHarvested);
    }

    if ($("analytics-farm-earned")) {
      $("analytics-farm-earned").textContent =
        fmt(state.farm.farmEarned);
    }

    if ($("production-overview")) {
      $("production-overview").textContent =
        `You have earned ${fmt(state.totalClicks)} lifetime clicks, purchased ${fmt(state.totalUpgrades)} upgrades, completed ${fmt(state.sea.dives)} sea explorations, triggered ${fmt(state.volcano.eruptions)} eruptions, and prestiged ${state.prestigeCount} times.`;
    }

    if ($("welcome-banner")) {
      $("welcome-banner").textContent =
        `Welcome back, ${state.username || "clicker"}.`;
    }

    renderSea();
    renderVolcano();
  }

  function renderAll() {
    renderStats();
    renderMilestones();

    if ($("theme-toggle-btn")) {
      $("theme-toggle-btn").textContent =
        state.theme === "dark"
          ? "Switch to light theme"
          : "Switch to dark theme";
    }
  }

  /* -------------------------
     NAVIGATION
  ------------------------- */

  async function loadChangelog() {
    const container = $("changelog-content");

    if (!container || changelogLoaded) return;

    container.innerHTML =
      '<p class="muted">Loading version history...</p>';

    try {
      const response = await fetch("./changelog.html");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      container.innerHTML = await response.text();
      changelogLoaded = true;
    } catch (error) {
      container.textContent =
        `Failed to load changelog: ${error.message}`;
    }
  }

  function switchPage(name) {
    const validPages = [
      "dashboard",
      "sea",
      "fire",
      "analytics",
      "settings",
      "changelog"
    ];

    const valid = validPages.includes(name) ? name : "dashboard";

    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle(
        "active-page",
        page.id === `page-${valid}`
      );
    });

    document.querySelectorAll(".nav-link[data-page]").forEach(link => {
      link.classList.toggle(
        "active-link",
        link.dataset.page === valid
      );
    });

    const page = $(`page-${valid}`);

    if ($("page-title")) {
      $("page-title").innerHTML =
        `ClickerGameTS <span>v2.2 Experimental</span>`;
    }

    if ($("page-subtitle") && page) {
      $("page-subtitle").textContent =
        page.dataset.subtitle || "";
    }

    if (location.hash !== `#${valid}`) {
      history.replaceState(null, "", `#${valid}`);
    }

    if (valid === "sea") renderSea();
    if (valid === "fire") renderVolcano();
    if (valid === "changelog") loadChangelog();
  }

  /* -------------------------
     SETTINGS AND SAVE FILES
  ------------------------- */

  function resetGame() {
    if (!confirm(
      "Reset all ClickerGameTS v2.2 progress, including Sea and Volcano progress? Export a save first if you want a backup."
    )) return;

    for (const key of [
      ...LEGACY_KEYS,
      FARM_KEY,
      VOLCANO_KEY,
      SEA_KEY
    ]) {
      safeRemove(key);
    }

    state = structuredClone(DEFAULTS);

    document.documentElement.dataset.theme = "light";

    if ($("username-input")) {
      $("username-input").value = "Clicker";
    }

    lastClickAt = 0;

    clearTimeout(comboTimer);

    renderAll();
    persistNow();

    toast("Game reset.");
    switchPage("dashboard");
  }

  function exportSave() {
    persistNow();

    const payload = {
      format: "ClickerGameTS-save",
      version: SAVE_VERSION,
      build: BUILD_NUMBER,
      exportedAt: new Date().toISOString(),
      data: {}
    };

    for (const key of [
      ...LEGACY_KEYS,
      FARM_KEY,
      VOLCANO_KEY,
      SEA_KEY
    ]) {
      payload.data[key] = safeGet(key);
    }

    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download =
      `clickergamets-v2.2-save-${new Date().toISOString().slice(0, 10)}.json`;

    anchor.click();
    URL.revokeObjectURL(url);

    toast("Save exported.");
  }

  async function importSave(file) {
    if (!file) return;

    try {
      const obj = JSON.parse(await file.text());

      if (
        obj.format !== "ClickerGameTS-save" ||
        !obj.data ||
        typeof obj.data !== "object"
      ) {
        throw new Error("This is not a ClickerGameTS save file.");
      }

      if (!confirm(
        "Importing replaces your current local progress. Continue?"
      )) return;

      for (const key of [
        ...LEGACY_KEYS,
        FARM_KEY,
        VOLCANO_KEY,
        SEA_KEY
      ]) {
        if (
          Object.prototype.hasOwnProperty.call(obj.data, key) &&
          obj.data[key] !== null
        ) {
          safeSet(key, obj.data[key]);
        } else {
          safeRemove(key);
        }
      }

      state = structuredClone(DEFAULTS);

      load();
      renderAll();
      persistNow();

      toast("Save imported successfully.");
    } catch (error) {
      toast(error.message || "Could not import that save file.");
    } finally {
      if ($("import-save-file")) {
        $("import-save-file").value = "";
      }
    }
  }

  /* -------------------------
     EVENT LISTENERS
  ------------------------- */

  function initializeEvents() {
    $("my-btn")?.addEventListener("click", doClick);

    $("buy-super-click")?.addEventListener(
      "click",
      () => buy("super")
    );

    $("buy-auto-click")?.addEventListener(
      "click",
      () => buy("auto")
    );

    $("buy-quantum-chip")?.addEventListener(
      "click",
      () => buy("chip")
    );

    $("prestige-btn")?.addEventListener("click", prestige);
    $("reset-btn")?.addEventListener("click", resetGame);

    $("username-input")?.addEventListener("change", event => {
      state.username =
        event.target.value.trim().slice(0, 24) || "Clicker";

      event.target.value = state.username;

      renderStats();
      saveSoon();
    });

    $("theme-toggle-btn")?.addEventListener("click", () => {
      state.theme =
        state.theme === "dark" ? "light" : "dark";

      document.documentElement.dataset.theme = state.theme;

      renderAll();
      saveSoon();
    });

    $("export-save")?.addEventListener("click", exportSave);

    $("import-save-file")?.addEventListener(
      "change",
      event => importSave(event.target.files?.[0])
    );

    $("sea-dive-button")?.addEventListener("click", manualDive);

    $("buy-sea-sonar")?.addEventListener(
      "click",
      () => buySeaUpgrade("sonar")
    );

    $("buy-sea-submarine")?.addEventListener(
      "click",
      () => buySeaUpgrade("submarine")
    );

    document.querySelectorAll(".nav-link[data-page]").forEach(link => {
      link.addEventListener("click", event => {
        event.preventDefault();
        switchPage(link.dataset.page);
      });
    });

    window.addEventListener("hashchange", () => {
      switchPage(location.hash.slice(1));
    });

    window.addEventListener("storage", event => {
      if (
        [
          ...LEGACY_KEYS,
          FARM_KEY,
          VOLCANO_KEY,
          SEA_KEY
        ].includes(event.key)
      ) {
        state = structuredClone(DEFAULTS);
        load();
        renderAll();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearTimeout(saveTimer);
        persistNow();
      }
    });

    window.addEventListener("pagehide", () => {
      clearTimeout(saveTimer);
      persistNow();
    });
  }

  /* -------------------------
     STARTUP
  ------------------------- */

  ensureGameUI();

  load();
  initializeEvents();

  renderAll();

  switchPage(location.hash.slice(1));

  // Volcano heat progression.
  setInterval(() => {
    addHeat(0.1 * (0.5 + state.volcano.ignitionLevel * 0.35));
    renderVolcano();
  }, 100);

  // Passive production and periodic saving.
  setInterval(() => {
    const now = Date.now();

    const delta = Math.min(
      2,
      Math.max(0, (now - lastTick) / 1000)
    );

    lastTick = now;

    const rate = passiveRate();

    if (rate > 0 && delta > 0) {
      state.clicks += rate * delta;
      state.totalClicks += rate * delta;
    }

    renderStats();
    checkMilestones();

    if (rate > 0 || state.volcano.heat > 0) {
      saveSoon();
    }
  }, 1000);

  safeSet("save_version", SAVE_VERSION);

  console.log(
    `ClickerGameTS v2.2 Experimental — Sea Update | Build ${BUILD_NUMBER}`
  );

})();
