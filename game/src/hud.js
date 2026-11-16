// The DOM HUD: crosshair, hit marker, health, ammo, money, the round timer and the
// score, the kill feed and the one overlay panel. It never touches the simulation;
// main.js pushes numbers in and reads callbacks out. The buy menu is rendered from
// the economy and the arsenal each time it opens, so it can never go stale.
export function createHud(handlers) {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const buyList = document.getElementById('buy-list');
  const buyMoney = document.getElementById('buy-money');
  const healthValue = document.getElementById('health-value');
  const armorValue = document.getElementById('armor-value');
  const armorRow = document.getElementById('armor-row');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const moneyValue = document.getElementById('money-value');
  const timerValue = document.getElementById('timer-value');
  const scoreValue = document.getElementById('score-value');
  const roundValue = document.getElementById('round-value');
  const killfeed = document.getElementById('killfeed');
  const bombBanner = document.getElementById('bomb-banner');
  const crosshair = document.getElementById('crosshair');
  const hitmarker = document.getElementById('hitmarker');
  const damage = document.getElementById('damage');
  const ammoBox = document.getElementById('ammo');

  let hitTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = -1;
  let lastScore = '';
  let lastBomb = '';

  function setText(element, value, last) {
    if (value === last) return last;
    element.textContent = value;
    return value;
  }

  function showOverlay() {
    overlay.hidden = false;
  }

  return {
    setHealth(health, armor) {
      if (health !== lastHealth) {
        lastHealth = health;
        healthValue.textContent = String(health);
      }
      if (armor !== lastArmor) {
        lastArmor = armor;
        armorValue.textContent = String(armor);
        armorRow.style.display = armor > 0 ? 'block' : 'none';
      }
    },
    setAmmo(mag, reserve, name) {
      if (mag !== lastMag || reserve !== lastReserve) {
        lastMag = mag;
        lastReserve = reserve;
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        ammoBox.classList.toggle('empty', mag === 0);
      }
      if (name) weaponName.textContent = name;
    },
    setMoney(value) {
      lastMoney = setText(moneyValue, `$${value}`, lastMoney);
    },
    setTimer(seconds) {
      const shown = Math.max(0, Math.ceil(seconds));
      if (shown !== lastTimer) {
        lastTimer = shown;
        const minutes = Math.floor(shown / 60);
        const rest = String(shown % 60).padStart(2, '0');
        timerValue.textContent = `${minutes}:${rest}`;
        timerValue.classList.toggle('urgent', shown <= 10);
      }
    },
    setScore(attackers, defenders, round) {
      const text = `${attackers} : ${defenders}`;
      if (text !== lastScore) {
        lastScore = text;
        scoreValue.textContent = text;
      }
      roundValue.textContent = `Round ${round}`;
    },
    setBomb(text) {
      if (text === lastBomb) return;
      lastBomb = text;
      bombBanner.textContent = text;
      bombBanner.hidden = text === '';
    },
    setCrosshair(spread) {
      const gap = 6 + Math.min(26, spread * 900);
      crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    damageFlash() {
      damage.classList.add('on');
      setTimeout(() => damage.classList.remove('on'), 180);
    },
    showStart() {
      buyList.innerHTML = '';
      buyMoney.hidden = true;
      title.textContent = 'Ember Line';
      copy.textContent = 'Plant the charge at the Furnace or the Silo, or drop all four defenders. First to 5 rounds takes the yard. Click to play.';
      play.textContent = 'Click to play';
      play.onclick = handlers.onPlay;
      showOverlay();
    },
    showPaused() {
      buyList.innerHTML = '';
      buyMoney.hidden = true;
      title.textContent = 'Ember Line';
      copy.textContent = 'Paused. Click to resume.';
      play.textContent = 'Click to resume';
      play.onclick = handlers.onPlay;
      showOverlay();
    },
    showBuy(data) {
      title.textContent = `Buy phase — Round ${data.round}`;
      copy.textContent = 'Spend your round money, then deploy. Press B to deploy.';
      buyMoney.hidden = false;
      buyMoney.textContent = `$${data.money}`;
      buyList.innerHTML = '';
      for (const item of data.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = item.owned || data.money < item.price;
        button.innerHTML = `<b></b><span></span><i></i>`;
        button.querySelector('b').textContent = item.name;
        button.querySelector('span').textContent = item.desc;
        button.querySelector('i').textContent = item.owned ? 'Owned' : `$${item.price}`;
        button.addEventListener('click', () => handlers.onBuy(item.id));
        buyList.appendChild(button);
      }
      play.textContent = 'Deploy';
      play.onclick = handlers.onDeploy;
      showOverlay();
    },
    showRoundEnd(data) {
      buyList.innerHTML = '';
      buyMoney.hidden = true;
      title.textContent = data.title;
      copy.textContent = data.copy;
      play.textContent = data.matchOver ? 'Play again' : 'Next round';
      play.onclick = handlers.onPlay;
      showOverlay();
    },
    showMatchEnd(data) {
      buyList.innerHTML = '';
      buyMoney.hidden = true;
      title.textContent = data.title;
      copy.textContent = data.copy;
      play.textContent = 'Play again';
      play.onclick = handlers.onPlay;
      showOverlay();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
  };
}
