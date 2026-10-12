class Card {
  constructor(name, attack, hp) {
    this.name = name;
    this.attack = attack;
    this.hp = hp;
    this.maxHp = hp;
  }

  isAlive() {
    return this.hp > 0;
  }

  takeDamage(damage) {
    this.hp = Math.max(0, this.hp - damage);
  }

  toString() {
    return `${this.name} [ATK:${this.attack} HP:${this.hp}/${this.maxHp}]`;
  }
}

module.exports = Card;
