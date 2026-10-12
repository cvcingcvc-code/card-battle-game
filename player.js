class Player {
  constructor(name, cards) {
    this.name = name;
    this.cards = cards;
  }

  aliveCards() {
    return this.cards.filter((c) => c.isAlive());
  }

  isAlive() {
    return this.aliveCards().length > 0;
  }

  toString() {
    const cardsStr = this.cards
      .map((c) => `  ${c.isAlive() ? c.toString() : c.name + ' [阵亡]'}`)
      .join('\n');
    return `${this.name}:\n${cardsStr}`;
  }
}

module.exports = Player;
