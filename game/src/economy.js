// The economy: money earned by the round's result and by kills, spent in the buy menu
// between rounds. No DOM here; the HUD renders these numbers and the buy menu.
import { ARSENAL, GRENADE_PRICE } from './weapons.js';

export const ROUND_WIN = 3250;
export const ROUND_LOSS = 1900;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const START_MONEY = 800;
export const ARMOR_PRICE = 650;
export const ARMOR_POINTS = 50;

export function createEconomy() {
  const state = { money: START_MONEY, grenades: 0, armorBought: false };

  return {
    state,
    reset() {
      state.money = START_MONEY;
      state.grenades = 0;
      state.armorBought = false;
    },
    earn(amount) {
      state.money += amount;
    },
    canAfford(price) {
      return state.money >= price;
    },
    buyWeapon(id) {
      const price = ARSENAL[id].price;
      if (price === 0 || state.money < price) return false;
      state.money -= price;
      return true;
    },
    buyGrenade() {
      if (state.grenades >= 2 || state.money < GRENADE_PRICE) return false;
      state.money -= GRENADE_PRICE;
      state.grenades += 1;
      return true;
    },
    buyArmor() {
      if (state.armorBought || state.money < ARMOR_PRICE) return false;
      state.money -= ARMOR_PRICE;
      state.armorBought = true;
      return true;
    },
  };
}
