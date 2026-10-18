'use strict';

const DESIGN_WIDTH = 375;
const COLORS = {
  background: '#0b1116', panel: '#151e25', panelDark: '#11191f', border: '#2e3a42',
  gold: '#c8a66a', goldLight: '#ead5ae', text: '#f1eee6', muted: '#a5b3bd',
  quiet: '#82939f', ally: '#8fc8b0', enemy: '#d98a79', ink: '#211a10',
};

function createRenderer({
  context, images = {}, width = 375, height = 812, safeTop = 0, safeBottom = 0,
  app = { name: '余烬对决', version: '1.0.0' },
} = {}) {
  if (!context) throw new Error('createRenderer 需要 Canvas 2D context。');
  const ctx = context;
  let viewport = { width: 375, height: 812, safeTop: 0, safeBottom: 0 };
  let regions = [];
  let contentHeight = 812;

  function ratio() { return viewport.width / DESIGN_WIDTH; }
  function touchHeight() { return Math.max(52, 44 / ratio()); }
  function topInset() { return (viewport.safeTop + 48) / ratio(); }
  function setSize(next = {}) {
    for (const key of ['width', 'height', 'safeTop', 'safeBottom']) {
      if (Number.isFinite(next[key]) && (key === 'width' || key === 'height' ? next[key] > 0 : next[key] >= 0)) {
        viewport[key] = next[key];
      }
    }
  }

  function font(size = 14, weight = 'normal', family = 'sans-serif') {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.textBaseline = 'top';
  }
  function measured(value) {
    const metrics = ctx.measureText(String(value));
    return metrics && Number.isFinite(metrics.width) ? metrics.width : String(value).length * 14;
  }
  function lines(value, maxWidth, size = 14, weight = 'normal', family = 'sans-serif') {
    font(size, weight, family);
    const result = [];
    for (const paragraph of String(value == null ? '' : value).split('\n')) {
      let line = '';
      for (const character of Array.from(paragraph)) {
        const candidate = line + character;
        if (line && measured(candidate) > maxWidth) {
          result.push(line.trimEnd());
          line = character.trimStart();
        } else line = candidate;
      }
      result.push(line);
    }
    return result;
  }
  function text(value, x, y, maxWidth, options = {}) {
    const { size = 14, lineHeight = size * 1.55, color = COLORS.text, weight = 'normal',
      align = 'left', family = 'sans-serif' } = options;
    const wrapped = lines(value, Math.max(1, maxWidth), size, weight, family);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    for (let index = 0; index < wrapped.length; index += 1) {
      const anchor = align === 'center' ? x + maxWidth / 2 : align === 'right' ? x + maxWidth : x;
      ctx.fillText(wrapped[index], anchor, y + index * lineHeight);
    }
    ctx.textAlign = 'left';
    return wrapped.length * lineHeight;
  }
  function textHeight(value, maxWidth, size = 14, lineHeight = size * 1.55, weight = 'normal') {
    return lines(value, maxWidth, size, weight).length * lineHeight;
  }
  function roundedPath(x, y, w, h, radius = 9) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function panel(x, y, w, h, fill = COLORS.panel, stroke = COLORS.border, radius = 9) {
    roundedPath(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function gradient(x, y, w, h, stops, horizontal = false) {
    if (typeof ctx.createLinearGradient !== 'function') {
      ctx.fillStyle = stops[stops.length - 1][1];
    } else {
      const fill = ctx.createLinearGradient(x, y, x + (horizontal ? w : 0), y + (horizontal ? 0 : h));
      for (const [position, color] of stops) fill.addColorStop(position, color);
      ctx.fillStyle = fill;
    }
    ctx.fillRect(x, y, w, h);
  }
  function diamond(x, y, color = COLORS.gold, size = 4) {
    ctx.beginPath();
    ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function divider(y, label) {
    ctx.fillStyle = COLORS.border;
    ctx.fillRect(64, y + 9, 85, 1); ctx.fillRect(226, y + 9, 85, 1);
    if (label) text(label, 154, y, 67, { size: 12, color: COLORS.gold, align: 'center' });
    else diamond(187.5, y + 9);
    return y + 30;
  }
  function art(source, x, y, w, h, radius = 8, dead = false) {
    ctx.save();
    roundedPath(x, y, w, h, radius); ctx.clip();
    ctx.fillStyle = '#223138'; ctx.fillRect(x, y, w, h);
    const image = images[String(source || '').replace(/^\/+/, '')];
    const imageWidth = image && (image.naturalWidth || image.width);
    const imageHeight = image && (image.naturalHeight || image.height);
    if (imageWidth > 0 && imageHeight > 0) {
      const fillScale = Math.max(w / imageWidth, h / imageHeight);
      const sourceW = w / fillScale;
      const sourceH = h / fillScale;
      try {
        ctx.drawImage(image, (imageWidth - sourceW) / 2, (imageHeight - sourceH) / 2,
          sourceW, sourceH, x, y, w, h);
      } catch (_) { /* An image that is still decoding keeps its placeholder. */ }
    } else {
      diamond(x + w / 2, y + h / 2, '#647165', Math.min(w, h) * 0.12);
    }
    if (dead) { ctx.fillStyle = 'rgba(11,17,22,0.7)'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
  }
  function region(action, x, y, w, h) { regions.push({ action, x, y, width: w, height: h }); }
  function button(label, action, x, y, w = 335, options = {}) {
    const enabled = options.enabled !== false;
    const primary = options.primary === true;
    const size = options.size || 16;
    const titleH = textHeight(label, w - 24, size, 23, 'bold');
    const h = Math.max(touchHeight(), options.height || 0, titleH + 24);
    panel(x, y, w, h, primary ? enabled ? COLORS.gold : '#6e624d' : COLORS.panel,
      primary ? '#dec28e' : enabled ? '#566159' : COLORS.border, 8);
    text(label, x + 12, y + (h - titleH) / 2, w - 24,
      { size, lineHeight: 23, color: primary ? COLORS.ink : enabled ? COLORS.goldLight : COLORS.quiet, weight: 'bold', align: 'center' });
    if (enabled && action) region(action, x, y, w, h);
    return y + h;
  }
  function sectionHeading(title, y, color = COLORS.gold, right = '') {
    diamond(24, y + 11, color, 3);
    text(title, 35, y, 190, { size: 17, weight: 'bold' });
    if (right) text(right, 225, y + 3, 130, { size: 12, color, align: 'right' });
    return y + 36;
  }
  function header(title, subtitle, action = { type: 'back' }, actionLabel = '返回') {
    const y = topInset() + 10;
    const headingWidth = action ? 234 : 335;
    const titleH = text(title, 20, y, headingWidth, { size: 26, lineHeight: 36, weight: 'bold', family: 'serif' });
    if (subtitle) text(subtitle, 21, y + titleH + 4, headingWidth, { size: 12, color: COLORS.gold });
    if (action) button(actionLabel, action, 270, y, 85, { size: 14 });
    return y + Math.max(titleH + 35, touchHeight()) + 18;
  }
  function footer(y) {
    y = divider(y + 18);
    return y + text('余烬未熄，战意不止', 20, y, 335, { size: 12, color: COLORS.quiet, align: 'center' }) + 20;
  }

  function drawHome(view) {
    const top = topInset();
    art('assets/hero.png', 0, top, 375, 275, 0);
    gradient(0, top, 375, 290, [[0, 'rgba(11,17,22,0.12)'], [0.48, 'rgba(11,17,22,0.12)'], [0.77, 'rgba(11,17,22,0.82)'], [1, COLORS.background]]);
    text('策略卡牌 · 单人对战', 20, top + 18, 335, { size: 13, color: COLORS.goldLight, align: 'center' });
    diamond(83, top + 28); diamond(292, top + 28);
    text(app.name || '余烬对决', 20, top + 166, 335, { size: 44, lineHeight: 58, color: COLORS.goldLight, weight: 'bold', align: 'center', family: 'serif' });
    text('六张卡牌，一场策略交锋', 20, top + 235, 335, { size: 16, color: COLORS.goldLight, align: 'center' });
    let y = top + 294;
    y += text('集结龙、精灵与石像鬼。\n在轮流攻防间，找到制胜的一击。', 20, y, 335,
      { size: 14, lineHeight: 23, color: COLORS.muted, align: 'center' });
    y = button('开始对战  ›', { type: 'start' }, 20, y + 22, 335, { primary: true, size: 18 });
    y += 12;
    y += text('三位同伴 · 轮流攻防 · 每步皆有取舍', 20, y, 335, { size: 12, color: COLORS.quiet, align: 'center' });
    y = sectionHeading('你的阵容', y + 32, COLORS.ally, '并肩而战');
    const cards = view.teamCards || [];
    const cardWidth = 105;
    let rowHeight = 166;
    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      const x = 20 + index * (cardWidth + 10);
      const heightForCard = 112 + textHeight(card.name, cardWidth - 12, 15, 22, 'bold')
        + textHeight(card.role || '', cardWidth - 12, 12, 19) + 14;
      rowHeight = Math.max(rowHeight, heightForCard);
      panel(x, y, cardWidth, heightForCard, COLORS.panel, '#354b43');
      art(card.art, x + 1, y + 1, cardWidth - 2, 105, 7);
      let copyY = y + 112;
      copyY += text(card.name, x + 6, copyY, cardWidth - 12, { size: 15, lineHeight: 22, weight: 'bold', align: 'center' });
      text(card.role || '', x + 6, copyY + 2, cardWidth - 12, { size: 12, lineHeight: 19, color: COLORS.ally, align: 'center' });
    }
    y += rowHeight + 14;
    y += text('龙焰压阵，箭矢破敌，坚岩守护。', 20, y, 335, { size: 13, color: COLORS.muted, align: 'center' });
    y += 24;
    const enemyNames = (view.enemyCards || []).map((card) => card.name).join(' · ') || '骑士 · 暗影刺客 · 巨魔';
    const enemyTitleH = textHeight(enemyNames, 303, 15, 24, 'bold');
    const enemyBody = '警惕刺客的高额伤害，也别让巨魔的震地击穿全队。先击败谁，由你决定。';
    const enemyH = 56 + enemyTitleH + textHeight(enemyBody, 303, 13, 22) + 16;
    panel(20, y, 335, enemyH, '#211d21', '#513b35');
    text('◆  暗影已至', 36, y + 16, 303, { size: 13, color: COLORS.enemy, weight: 'bold' });
    text(enemyNames, 36, y + 47, 303, { size: 15, lineHeight: 24, weight: 'bold' });
    text(enemyBody, 36, y + 51 + enemyTitleH, 303, { size: 13, lineHeight: 22, color: '#b8aaa4' });
    y += enemyH + 24;
    const nextY = button('玩法与技能', { type: 'rules' }, 20, y, 162.5, { size: 15 });
    button('关于余烬', { type: 'about' }, 192.5, y, 162.5, { size: 15 });
    return footer(nextY);
  }

  function cardLayout(card, w) {
    const nameY = 101;
    const roleY = nameY + textHeight(card.name, w - 16, 15, 22, 'bold') + 2;
    const attackY = roleY + textHeight(card.role || '', w - 16, 12, 18) + 5;
    const lifeY = attackY + 24;
    const lifeLabel = `生命 ${card.hp == null ? 0 : card.hp}/${card.maxHp == null ? 0 : card.maxHp}`;
    const healthY = lifeY + textHeight(lifeLabel, w - 16, 12, 18) + 3;
    const skillY = healthY + 13;
    const heightForCard = skillY + textHeight(card.skillLabel || card.tag || '普通攻击', w - 16, 12, 18) + 14;
    return { nameY, roleY, attackY, lifeY, lifeLabel, healthY, skillY, height: heightForCard };
  }
  function drawCard(card, x, y, w, h, playerIndex, cardIndex) {
    const layout = cardLayout(card, w);
    const accent = card.isSelected ? COLORS.gold : card.canTarget ? COLORS.enemy : playerIndex === 0 ? COLORS.ally : COLORS.enemy;
    panel(x, y, w, h, card.isDead ? '#11181e' : COLORS.panel, card.isSelected || card.canTarget ? accent : '#354149');
    if (card.isSelected || card.canTarget) {
      roundedPath(x + 2, y + 2, w - 4, h - 4, 7); ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
    }
    art(card.art, x + 1, y + 1, w - 2, 92, 7, card.isDead);
    const state = card.isDead ? '已倒下' : card.isSelected ? '已选中' : card.canTarget ? card.targetLabel || '可选目标' : '';
    if (state) {
      panel(x + 7, y + 8, w - 14, 23, card.isDead ? '#1b2329' : card.isSelected ? '#c8a66a' : '#512f2b', null, 4);
      text(state, x + 8, y + 11, w - 16, { size: 12, lineHeight: 17, color: card.isSelected ? COLORS.ink : card.isDead ? COLORS.muted : '#f7c4b5', weight: 'bold', align: 'center' });
    }
    text(card.name, x + 8, y + layout.nameY, w - 16, { size: 15, lineHeight: 22, weight: 'bold', color: card.isDead ? COLORS.quiet : COLORS.text });
    text(card.role || '', x + 8, y + layout.roleY, w - 16, { size: 12, lineHeight: 18, color: card.isDead ? COLORS.quiet : accent });
    text('攻击', x + 8, y + layout.attackY + 4, w - 16, { size: 12, lineHeight: 19, color: COLORS.muted });
    text(card.attack == null ? 0 : card.attack, x + 8, y + layout.attackY, w - 16, { size: 17, lineHeight: 23, color: card.isDead ? COLORS.quiet : COLORS.goldLight, weight: 'bold', align: 'right' });
    text(layout.lifeLabel, x + 8, y + layout.lifeY, w - 16, { size: 12, lineHeight: 18, color: COLORS.muted });
    const hpPercent = Number.isFinite(card.hpPercent) ? card.hpPercent : card.maxHp > 0 ? card.hp / card.maxHp * 100 : 0;
    const fill = Math.max(0, Math.min(1, hpPercent / 100));
    panel(x + 8, y + layout.healthY, w - 16, 5, '#29343a', null, 2);
    if (fill > 0) panel(x + 8, y + layout.healthY, (w - 16) * fill, 5, fill <= 0.25 ? COLORS.enemy : accent, null, 2);
    text(card.skillLabel || card.tag || '普通攻击', x + 8, y + layout.skillY, w - 16,
      { size: 12, lineHeight: 18, color: card.isDead ? COLORS.quiet : COLORS.goldLight });
    if (!card.isDead && (card.canSelect || card.canTarget)) region({ type: 'card', playerIndex, cardIndex }, x, y, w, h);
  }
  function drawTeam(team, y) {
    const friendly = team.playerIndex === 0;
    const cards = team.cards || [];
    const alive = team.aliveCount == null ? cards.filter((card) => !card.isDead && card.hp > 0).length : team.aliveCount;
    y = sectionHeading(friendly ? '翡翠远征' : '灰烬守军', y, friendly ? COLORS.ally : COLORS.enemy, `${alive} / ${cards.length} 存活`);
    const w = 105;
    const h = Math.max(238, ...cards.map((card) => cardLayout(card, w).height));
    cards.forEach((card, index) => drawCard(card, 20 + index * 115, y, w, h, team.playerIndex, index));
    return y + h;
  }
  function drawResult(result, y) {
    const tone = result.won ? COLORS.ally : COLORS.enemy;
    const resultTitle = result.title || (result.won ? '胜利属于你' : '此战未竟');
    const titleH = textHeight(resultTitle, 303, 27, 38, 'bold');
    const descriptionY = 86 + titleH;
    const subtitleH = textHeight(result.subtitle || '', 295, 14, 23);
    const statsY = descriptionY + subtitleH + 20;
    const boxH = statsY + 70;
    panel(20, y, 335, boxH, result.won ? '#14241f' : '#251c1d', result.won ? '#456552' : '#664238');
    diamond(187.5, y + 26, tone, 7);
    text(result.won ? '远征告捷' : '再整旗鼓', 36, y + 47, 303, { size: 13, color: tone, align: 'center' });
    text(resultTitle, 36, y + 76, 303, { size: 27, lineHeight: 38, weight: 'bold', align: 'center', family: 'serif' });
    text(result.subtitle || '', 40, y + descriptionY, 295, { size: 14, lineHeight: 23, color: COLORS.muted, align: 'center' });
    const stats = [[result.rounds, '行动回合'], [result.survivors, '存活队员'], [result.damageDealt, '造成伤害']];
    stats.forEach(([value, label], index) => {
      text(value == null ? 0 : value, 36 + index * 101, y + statsY, 101, { size: 23, lineHeight: 30, weight: 'bold', color: COLORS.goldLight, align: 'center' });
      text(label, 36 + index * 101, y + statsY + 34, 101, { size: 12, color: COLORS.muted, align: 'center' });
    });
    y += boxH + 12;
    y += text(`承受伤害 ${result.damageTaken || 0}  ·  使用技能 ${result.skillsUsed || 0} 次`, 20, y, 335, { size: 13, color: COLORS.muted, align: 'center' });
    y = button('再战一局', { type: 'reset' }, 20, y + 18, 335, { primary: true });
    y = button('返回营地', { type: 'home' }, 20, y + 12, 335);
    return y + 28;
  }
  function logColor(entry) {
    return entry && /victory|success|ally/.test(entry.tone || '') ? COLORS.ally
      : entry && /enemy|defeat|danger/.test(entry.tone || '') ? COLORS.enemy
        : entry && /skill/.test(entry.tone || '') ? COLORS.goldLight : COLORS.muted;
  }
  function logMessage(entry) { return typeof entry === 'string' ? entry : entry && entry.message || ''; }
  function drawLogsList(entries, y, showIndex = false) {
    if (!entries.length) return y + text('战斗即将开始，等待第一声交锋。', 36, y + 15, 303, { size: 14, lineHeight: 23, color: COLORS.muted }) + 30;
    for (let index = 0; index < entries.length; index += 1) {
      const message = logMessage(entries[index]);
      const x = showIndex ? 62 : 36;
      const w = showIndex ? 277 : 303;
      const lineH = textHeight(message, w, 13, 22);
      panel(20, y, 335, lineH + 26, COLORS.panelDark, COLORS.border, 6);
      if (showIndex) text(String(index + 1).padStart(2, '0'), 33, y + 13, 22, { size: 11, color: COLORS.quiet });
      text(message, x, y + 13, w, { size: 13, lineHeight: 22, color: logColor(entries[index]) });
      y += lineH + 36;
    }
    return y;
  }
  function drawBattle(view) {
    let y = header('古境战场', `第 ${view.roundNumber || 1} 回合 · 以谋略点燃余烬`, { type: 'home' }, '营地');
    if (view.result) y = drawResult(view.result, y);
    else {
      const status = view.statusText || '选择一张己方卡牌作为攻击者';
      const statusH = textHeight(status, 299, 15, 23);
      panel(20, y, 335, statusH + 55, COLORS.panel, '#52604b');
      diamond(37, y + 21, view.turnLabel === '对手回合' ? COLORS.enemy : COLORS.ally, 3);
      text(view.turnLabel || '你的回合', 49, y + 12, 280, { size: 12, color: COLORS.goldLight });
      text(status, 38, y + 37, 299, { size: 15, lineHeight: 23 });
      y += statusH + 77;
    }
    const players = view.players || [];
    players.forEach((team, index) => {
      y = drawTeam(team, y);
      if (index < players.length - 1) y = divider(y + 18, '交锋');
    });
    y += 22;
    if (!view.result) {
      const selected = view.selectedCardDetail;
      const title = selected ? `${selected.name} · ${selected.role || '战场单位'}` : '每一次出手，都有取舍。';
      const description = selected ? selected.description || '' : '选中己方卡牌查看能力，再选择敌方目标。击败所有敌人，即可赢得对决。';
      const hint = view.skillTargeting ? '正在瞄准：选择敌方目标释放技能，或取消技能选择。'
        : selected ? '点击敌方卡牌普通攻击，或把握时机释放主动技能。' : '';
      const titleH = textHeight(title, 303, 16, 24, 'bold');
      const descriptionH = textHeight(description, 303, 14, 23);
      const hintH = hint ? textHeight(hint, 303, 13, 22) + 10 : 0;
      panel(20, y, 335, 34 + titleH + descriptionH + hintH, COLORS.panel, selected ? '#716042' : COLORS.border);
      text(title, 36, y + 15, 303, { size: 16, lineHeight: 24, weight: 'bold', color: COLORS.goldLight });
      text(description, 36, y + 22 + titleH, 303, { size: 14, lineHeight: 23, color: COLORS.muted });
      if (hint) text(hint, 36, y + 32 + titleH + descriptionH, 303, { size: 13, lineHeight: 22, color: COLORS.ally });
      y += 52 + titleH + descriptionH + hintH;
      if (view.selectedSkill) {
        const skill = view.selectedSkill;
        const skillH = textHeight(skill.description || '', 303, 14, 23);
        panel(20, y, 335, 87 + skillH + touchHeight(), COLORS.panelDark, '#5a503d');
        text(skill.name || '主动技能', 36, y + 16, 303, { size: 17, weight: 'bold', color: COLORS.goldLight });
        text(skill.description || '', 36, y + 46, 303, { size: 14, lineHeight: 23, color: COLORS.muted });
        text('每局一次 · 占用本回合行动', 36, y + 52 + skillH, 303, { size: 12, color: COLORS.quiet });
        button(skill.buttonLabel || (skill.canUse ? '释放技能' : '技能不可用'), { type: 'skill' }, 36, y + 76 + skillH, 303,
          { primary: true, enabled: Boolean(skill.canUse), size: 15 });
        y += 107 + skillH + touchHeight();
      }
    }
    const entries = view.logs || [];
    y = sectionHeading('战斗纪事', y + 6, COLORS.gold, `${entries.length} 条记录`);
    y = drawLogsList(entries.slice(-3), y);
    y = button('查看全部记录', { type: 'logs' }, 20, y + 4, 335, { size: 15 });
    if (!view.result) {
      y += 18;
      const nextY = button('重新开始', { type: 'reset' }, 20, y, 162.5, { size: 15 });
      button('返回营地', { type: 'home' }, 192.5, y, 162.5, { size: 15 });
      y = nextY;
    }
    return footer(y);
  }

  function ruleBlock(number, title, description, y) {
    const titleH = textHeight(title, 267, 16, 25, 'bold');
    const bodyH = textHeight(description, 267, 14, 24);
    panel(20, y, 335, 34 + titleH + bodyH);
    text(number, 35, y + 17, 30, { size: 15, color: COLORS.gold });
    text(title, 72, y + 14, 267, { size: 16, lineHeight: 25, weight: 'bold' });
    text(description, 72, y + 21 + titleH, 267, { size: 14, lineHeight: 24, color: COLORS.muted });
    return y + 48 + titleH + bodyH;
  }
  function drawRules(view) {
    let y = header('玩法与技能', '看清局势，把握每一次行动');
    y = ruleBlock('01', '轮流行动，普通攻击', '每回合选择一张存活的己方卡牌，攻击一名敌人，造成等同攻击力的伤害。行动后，对手会自动反击。', y);
    y = ruleBlock('02', '每张卡牌的技能，每局一次', '普通攻击与技能都占用一次行动。有技能的卡牌每局可释放一次：单体技能需要指定目标，群体技能同时伤害所有存活敌人。', y);
    y = sectionHeading('战场技能', y + 6);
    const skills = view.skills || [];
    if (!skills.length) {
      y += text('技能效果可在对战中选中卡牌查看。释放前请留意目标、伤害与存活敌人数。', 20, y, 335, { size: 14, lineHeight: 24, color: COLORS.muted }) + 20;
    }
    for (const skill of skills) {
      const title = `${skill.name || '主动技能'}${skill.cardName ? ` · ${skill.cardName}` : ''}`;
      const titleH = textHeight(title, 303, 16, 25, 'bold');
      const bodyH = textHeight(skill.description || '', 303, 14, 24);
      panel(20, y, 335, titleH + bodyH + 36, COLORS.panelDark, '#5a503d');
      text(title, 36, y + 14, 303, { size: 16, lineHeight: 25, weight: 'bold', color: COLORS.goldLight });
      text(skill.description || '', 36, y + 22 + titleH, 303, { size: 14, lineHeight: 24, color: COLORS.muted });
      y += titleH + bodyH + 50;
    }
    y = ruleBlock('03', '击败全部敌人，赢得胜利', '生命降至零的卡牌会倒下，无法再行动。率先击败对方全部卡牌的一方获胜。战后可以再次挑战，所有生命与技能都会重置。', y + 4);
    y = button('明白了，返回', { type: 'back' }, 20, y + 6);
    return footer(y);
  }
  function drawAbout() {
    let y = header('关于余烬', '一场小而完整的策略交锋');
    art('assets/hero.png', 20, y, 335, 168);
    y += 188;
    y += text(app.name || '余烬对决', 20, y, 335, { size: 29, lineHeight: 41, weight: 'bold', color: COLORS.goldLight, family: 'serif', align: 'center' });
    y += text(`版本 ${app.version || '1.0.0'}`, 20, y + 8, 335, { size: 13, color: COLORS.quiet, align: 'center' }) + 34;
    y = sectionHeading('离线对决', y);
    y += text('三位同伴，三名敌人。没有随机抽牌，用有限的生命与每局一次的技能，寻找最合适的出手顺序。', 20, y, 335,
      { size: 14, lineHeight: 25, color: COLORS.muted }) + 28;
    y = sectionHeading('隐私与数据', y, COLORS.ally);
    const privacy = '游戏无需注册或登录，对局在本机进行。当前版本不接入联网对战、广告或支付，也不主动收集个人信息。\n\n退出游戏后，本局对战进度不会保留。你可以随时回到营地，开始一场新的对决。';
    const privacyH = textHeight(privacy, 303, 14, 25);
    panel(20, y, 335, privacyH + 32);
    text(privacy, 36, y + 16, 303, { size: 14, lineHeight: 25, color: COLORS.muted });
    y = button('返回营地', { type: 'back' }, 20, y + privacyH + 52);
    return footer(y);
  }
  function drawAllLogs(view) {
    const entries = view.logs || [];
    let y = header('战斗全记录', `共 ${entries.length} 条 · 按行动顺序记载`, { type: 'back' }, '返回');
    y = drawLogsList(entries, y, true);
    y = button('返回战场', { type: 'back' }, 20, y + 10);
    return footer(y);
  }

  function draw(view = {}, { scroll = 0 } = {}) {
    regions = [];
    const scale = ratio();
    const viewportHeight = viewport.height / scale;
    const offset = Math.max(0, Number(scroll) || 0);
    ctx.save();
    try {
      ctx.scale(scale, scale);
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, DESIGN_WIDTH, viewportHeight);
      ctx.beginPath();
      ctx.rect(0, topInset(), DESIGN_WIDTH, Math.max(0, viewportHeight - topInset()));
      ctx.clip();
      ctx.translate(0, -offset / scale);
      const end = view.screen === 'battle' ? drawBattle(view)
        : view.screen === 'rules' ? drawRules(view)
          : view.screen === 'about' ? drawAbout(view)
            : view.screen === 'logs' ? drawAllLogs(view) : drawHome(view);
      contentHeight = Math.max(viewportHeight, end + (viewport.safeBottom + 24) / scale);
    } finally { ctx.restore(); }
    return getContentHeight();
  }
  function hitTest(x, y, scroll = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > viewport.width
      || y < viewport.safeTop + 48 || y > viewport.height) return null;
    const scale = ratio();
    const logicalX = x / scale;
    const logicalY = (y + Math.max(0, Number(scroll) || 0)) / scale;
    for (let index = regions.length - 1; index >= 0; index -= 1) {
      const area = regions[index];
      if (logicalX >= area.x && logicalX <= area.x + area.width
        && logicalY >= area.y && logicalY <= area.y + area.height) return { ...area.action };
    }
    return null;
  }
  function getContentHeight() { return Math.ceil(Math.max(viewport.height, contentHeight * ratio())); }
  function getHitRegions() {
    const scale = ratio();
    return regions.map((area) => ({
      x: area.x * scale, y: area.y * scale, width: area.width * scale, height: area.height * scale,
      action: { ...area.action },
    }));
  }

  setSize({ width, height, safeTop, safeBottom });
  return { draw, setSize, hitTest, getContentHeight, getHitRegions };
}

module.exports = { createRenderer };
