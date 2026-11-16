// The look plan, in one place. Ember Line is a warm industrial yard at dusk: charcoal
// ground, rusted steel, amber lamps, one ember-orange accent. Every colour in the game
// and the page comes from these names; the lighting makes every shade the game needs.
export const PALETTE = {
  canvas: '#171310',
  surface: '#241c16',
  hairline: '#3a2d22',
  ink: '#f2e8d8',
  muted: '#a89a86',
  accent: '#ff7a1a',
  ember: '#ffc46b',
  rust: '#b4552d',
  danger: '#e5484d',
  safe: '#7fb069',
  ground: '#4a3e30',
};

export function shade(name) {
  return PALETTE[name];
}
