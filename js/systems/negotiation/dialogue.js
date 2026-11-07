/** Répliques des marchands et arguments (tactiques) du marchandage. */

export const ACCEPT_LINES = {
  buy: ['« Marché conclu, à {p} €. »', '« Allez, {p} € : vous êtes dur en affaires ! »', '« Va pour {p} €. Revenez me voir. »'],
  sell: ['« D\'accord pour {p} €. »', '« {p} € ? Topez là. »', '« Bon, je vous les prends à {p} €. »']
};
export const COUNTER_LINES = {
  buy: ['« Je peux descendre à {p} €. »', '« Disons {p} €, ça vous va ? »'],
  sell: ['« Je peux monter à {p} €. »', '« Disons {p} €, ça vous va ? »']
};
export const COUNTER2_LINES = {
  buy: ['« Bon… {p} €, mais je ne bougerai plus beaucoup. »', '« {p} €. Vous me faites perdre de l\'argent. »'],
  sell: ['« Allez, {p} €, je ne peux guère faire mieux. »', '« {p} €, et c\'est généreux. »']
};
export const LAST_LINES = {
  buy: ['« {p} €, c\'est mon dernier mot. »'],
  sell: ['« {p} € et on n\'en parle plus. »']
};
export const REFUSE_LINES = {
  buy: ['« Non, ça ne couvre pas mes frais. »', '« Trop bas, désolé. »'],
  sell: ['« Trop cher pour moi. »', '« Je ne peux pas payer ça. »']
};
export const INSULT_LINES = {
  buy: ['« Vous plaisantez ? » (confiance en baisse)', '« C\'est presque du vol ! » (confiance en baisse)'],
  sell: ['« À ce prix-là, allez voir ailleurs ! » (confiance en baisse)']
};

export const STYLE_OPENERS = {
  stubborn: ['Hmpf.', 'Bon.', 'Écoutez…'],
  generous: ['Allez,', 'Pour vous,', 'D\'accord,'],
  greedy: ['Ah, vous savez y faire…', 'Mmh…', 'Entre nous,'],
  impatient: ['Vite,', 'Bon, on ne va pas y passer la journée :', 'Ok,']
};
export const TACTIC_OK = {
  stubborn: '« Mouais… c\'est vrai. »', generous: '« Vous avez raison, faisons un effort. »',
  greedy: '« Bien vu… je peux peut-être bouger un peu. »', impatient: '« D\'accord, d\'accord. »'
};
export const TACTIC_KO = {
  stubborn: '« Ne me racontez pas d\'histoires. »', generous: '« Hum, ce n\'est pas très honnête… »',
  greedy: '« On ne me la fait pas. »', impatient: '« Vous me faites perdre mon temps. »'
};
export function pickStyled(table, styleId) { return table[styleId] || table.greedy; }

/** Arguments de marchandage : vrais = marge en plus, faux = méfiance. */
export const TACTICS = {
  competitor: { id: 'competitor', icon: '🏷️', label: 'Concurrent moins cher', kinds: ['buy'], risk: 'moyen', text: 'Vrai si un autre marchand vend le même objet moins cher (état comparable) : jusqu\'à +3 % de marge.' },
  bulk: { id: 'bulk', icon: '📦', label: 'Achat / vente en quantité', kinds: ['buy', 'sell'], risk: 'faible', text: 'Vrai à partir de 2 unités : +1 %.' },
  loyalty: { id: 'loyalty', icon: '🤝', label: 'Client fidèle', kinds: ['buy', 'sell'], risk: 'moyen', text: 'Vrai après 2 accords avec lui ou si sa confiance ≥ 30 : +1,5 %.' },
  defect: { id: 'defect', icon: '🔍', label: 'Signaler un défaut', kinds: ['buy'], risk: 'élevé', text: 'Vrai si l\'objet est abîmé (état < 60) : jusqu\'à +3 %. Faux → il se vexe (patience −2).' },
  urgent: { id: 'urgent', icon: '⏰', label: '« La ville en manque »', kinds: ['sell'], risk: 'moyen', text: 'Vrai si l\'objet est en pénurie ou tendu en ville : +2 %.' }
};

export function pickLine(table, npc, price, kind, styleId = null, round = 0) {
  const lines = table[kind] || table.buy;
  const idx = Math.abs(Math.floor(price * 100) + round) % lines.length;
  const openers = styleId ? STYLE_OPENERS[styleId] : null;
  const opener = openers ? `${openers[(Math.floor(price * 100) + round) % openers.length]} ` : '';
  return `${npc.name} : ${opener}${lines[idx].replace('{p}', Number(price).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}`;
}
