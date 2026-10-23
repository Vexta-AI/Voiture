/**
 * MOTEUR DU CRM (pur, sans réseau : client, serveur et tests).
 *
 * Un "deal" = un véhicule suivi dans un pipeline (achat, mandat) ou un acheteur (revente).
 * Le moteur :
 *   - lit la réponse collée du vendeur/de l'acheteur (accord, contre-offre, question, refus, vendu)
 *   - calcule la chaleur du lead (0-100) : seuls les leads CHAUDS demandent ton attention
 *   - propose la prochaine action et le message prêt à copier (réponse, contre-offre, relance)
 *   - suit l'argent réel : prix d'achat, frais, prix de vente, marge encaissée
 */

import { DOCUMENTS, FOLLOW_UP, HEAT, PIPELINES, RESALE } from '../config/crm.js';
import { COSTS, MANDATE, REGISTRATION } from '../config/rules.js';
import { adUrl } from './links.js';
import { clamp, normalize } from './text.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const round50 = (n, dir = 'down') => (dir === 'up' ? Math.ceil(n / 50) * 50 : Math.floor(n / 50) * 50);

/**
 * @typedef {'achat'|'mandat'|'revente'} DealKind
 * @typedef {{ id: string, at: string, type: 'out'|'in'|'note'|'call'|'stage', text: string, intent?: string, amount?: number, stage?: string }} DealEvent
 * @typedef {Object} Deal
 * @property {string} id
 * @property {DealKind} kind
 * @property {string} stage
 * @property {'radar'|'manuel'} source
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {{ listingId: string, type: 'auto'|'moto', title: string, year: number, mileage: number, location?: string|null, url?: string|null, zone?: string|null, distanceKm?: number|null, areaType?: string|null, photo?: string|null, masterclass?: boolean, reasons?: string[], strengths?: string[], owners?: number|null }} vehicle
 * @property {{ name?: string, phone?: string, channel?: string }} contact
 * @property {Record<string, number|null|undefined>} numbers
 * @property {{ subject: string, body: string } | null} firstMessage
 * @property {Record<string, boolean>} docs
 * @property {string|null} [rdvAt]
 * @property {string|null} [lostReason]
 * @property {string|null} [vehicleDealId]  revente : deal du véhicule vendu
 * @property {DealEvent[]} events
 */

export const dealId = (kind, listingId) => `${kind}-${String(listingId).replace(/[^a-zA-Z0-9-]/g, '_')}`;

export function stageOf(deal) {
  return PIPELINES[deal.kind].stages.find((s) => s.id === deal.stage) ?? PIPELINES[deal.kind].stages[0];
}

/** Partie en face : "vendeur" (achat, mandat) ou "acheteur" (revente). */
export const partyOf = (deal) => PIPELINES[deal.kind].party;

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

/**
 * Deal achat ou mandat depuis une annonce scorée (radar ou ajout manuel).
 * @param {{ kind: 'achat'|'mandat', listing: import('./scoring.js').Listing, analysis: ReturnType<import('./scoring.js').scoreListing>, message?: { subject: string, body: string } | null, offerPrice?: number, source?: 'radar'|'manuel', now?: Date }} params
 * @returns {Deal}
 */
export function createDeal({ kind, listing, analysis, message = null, offerPrice, source = 'manuel', now = new Date() }) {
  const f = analysis.finance;
  const at = now.toISOString();
  const numbers =
    kind === 'mandat'
      ? {
          askingPrice: listing.price,
          marketPrice: listing.marketPrice,
          ownerNet: analysis.mandate?.ownerNet ?? listing.price,
          salePrice: analysis.mandate?.salePrice ?? listing.marketPrice,
          commission: analysis.mandate?.commission ?? 0,
          upsellMargin: analysis.mandate?.upsellMargin ?? 0,
          score: analysis.score,
        }
      : {
          askingPrice: listing.price,
          marketPrice: listing.marketPrice,
          offerPrice: offerPrice ?? f.targetPrice,
          maxBuyPrice: f.maxBuyPriceForPepite,
          walkAwayPrice: f.walkAwayPrice,
          realNetMargin: f.realNetMargin,
          marketLow: listing.marketStats?.low ?? null,
          marketHigh: listing.marketStats?.high ?? null,
          daysOnMarket: listing.marketStats?.daysOnMarket ?? null,
          argusPrice: listing.argusPrice ?? null,
          localPrice: analysis.local?.price ?? null,
          localMargin: analysis.local?.margin ?? null,
          registrationCost: f.registrationCost,
          transportCost: f.transportCost,
          reconditioning: COSTS.RECONDITIONING_BASE,
          score: analysis.score,
        };
  return {
    id: dealId(kind, listing.id),
    kind,
    stage: 'a_contacter',
    source,
    createdAt: at,
    updatedAt: at,
    vehicle: {
      listingId: listing.id,
      type: listing.type,
      title: listing.title,
      year: listing.year,
      mileage: listing.mileage,
      location: listing.location ?? null,
      url: adUrl(listing),
      photo: listing.photos?.[0] ?? null,
      masterclass: Boolean(analysis.masterclass),
      reasons: analysis.priceReasons?.reasons ?? [],
      strengths: analysis.quality?.hits.map((q) => q.label) ?? [],
      owners: analysis.quality?.owners ?? null,
      zone: analysis.zone ?? null,
      distanceKm: analysis.distanceKm ?? null,
      areaType: analysis.areaType ?? null,
    },
    contact: {},
    numbers,
    firstMessage: message,
    docs: {},
    rdvAt: null,
    lostReason: null,
    vehicleDealId: null,
    events: [],
  };
}

/**
 * Acheteur intéressé par un véhicule en vente (stock achat ou mandat).
 * @param {{ vehicleDeal: Deal, contact?: Deal['contact'], now?: Date, suffix?: string }} params
 * @returns {Deal}
 */
export function createBuyerDeal({ vehicleDeal, contact = {}, now = new Date(), suffix }) {
  const at = now.toISOString();
  const listed = listedPriceOf(vehicleDeal);
  return {
    id: `revente-${vehicleDeal.id}-${suffix ?? now.getTime().toString(36)}`,
    kind: 'revente',
    stage: 'nouveau',
    source: 'manuel',
    createdAt: at,
    updatedAt: at,
    vehicle: { ...vehicleDeal.vehicle },
    contact,
    numbers: { listedPrice: listed, floorPrice: floorPriceOf(vehicleDeal) },
    firstMessage: null,
    docs: {},
    rdvAt: null,
    lostReason: null,
    vehicleDealId: vehicleDeal.id,
    events: [],
  };
}

// ---------------------------------------------------------------------------
// Lecture des réponses
// ---------------------------------------------------------------------------

/**
 * Montants cités dans un message ("6 500 €", "6500", "6,5k", "6.500 euros").
 * Les années, kilométrages et numéros de téléphone sont ignorés ; seuls les montants plausibles
 * autour du prix de référence (40 % à 160 %) sont gardés.
 * @param {string} text
 * @param {number} [reference]
 */
export function extractAmounts(text, reference) {
  const raw = String(text ?? '').toLowerCase();
  /** @type {number[]} */
  const found = [];
  const re = /(\d+(?:[.,]\d+)?)\s*k(?:€|e)?(?![a-z])|(\d{1,3}(?:[ .  ]\d{3})+|\d{3,6})(?![\d])(\s*(?:€|euros?|eur\b|e\b))?(\s*km)?/g;
  let m;
  while ((m = re.exec(raw))) {
    if (m[1]) {
      found.push(Math.round(Number(m[1].replace(',', '.')) * 1000));
      continue;
    }
    if (m[4]) continue; // kilométrage
    const value = Number(m[2].replace(/[ .  ]/g, ''));
    const currency = Boolean(m[3]);
    if (!currency && value >= 1980 && value <= 2035) continue; // une année
    found.push(value);
  }
  if (!reference) return found;
  return found.filter((v) => v >= reference * 0.4 && v <= reference * 1.6);
}

const SOLD = /(deja|bien|a ete|est|suis) (vendue?s?)\b|plus (disponible|dispo)\b|n'?est plus (a vendre|disponible|dispo)|vendue? (hier|ce matin|aujourd'?hui)/;
const REFUSE = /pas (negociable|de nego|d'?accord|interesse|vendeur)|prix (ferme|non negociable|fixe)|non merci|ne (baisse|descend)(rai)? pas|inutile|pas en dessous|ne suis pas pret|ca ne m'?interesse pas|\bnon\b[ ,.!]*$/;
const ACCEPT = /\b(ok|okay|d'?accord|ca marche|ca me va|ca roule|deal|entendu|parfait|j'?accepte|accepte|banco|top|go)\b|quand (pouvez|voulez|souhaitez)[- ]vous|vous pouvez (passer|venir)|venez|passez|(dispo|disponible)s? (demain|ce|cette|samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi|le|la|en)|rendez[- ]vous|\brdv\b|(je|on) (peut|peux) (se voir|faire l'?essai)|essayer|visiter/;
const QUESTION = /\?|pourquoi|combien|est-ce que|vous etes (pro|professionnel|garage|marchand)|(toujours|encore) (dispo|disponible)/;
/** Vraies questions, à traiter avant l'accord ("comment ça marche ?" n'est pas un "ça marche"). */
const OPEN_QUESTION = /comment|pourquoi|est-ce que|vous etes (un |une )?(pro|professionnel|garage|marchand|societe)|c'?est quoi|qu'?est-ce/;

/**
 * Intention d'un message reçu.
 * @param {string} text
 * @param {{ reference?: number }} [context] prix de référence pour reconnaître un montant
 * @returns {{ intent: 'vendu'|'refus'|'contre_offre'|'accord'|'question'|'neutre', amount: number|null }}
 */
export function analyzeReply(text, context = {}) {
  const t = normalize(text);
  if (SOLD.test(t)) return { intent: 'vendu', amount: null };
  const amounts = extractAmounts(text, context.reference);
  const amount = amounts.length ? amounts[amounts.length - 1] : null;
  if (REFUSE.test(t) && amount === null) return { intent: 'refus', amount: null };
  if (amount !== null) return { intent: 'contre_offre', amount };
  if (OPEN_QUESTION.test(t)) return { intent: 'question', amount: null };
  if (ACCEPT.test(t)) return { intent: 'accord', amount: null };
  if (QUESTION.test(t)) return { intent: 'question', amount: null };
  return { intent: 'neutre', amount: null };
}

/** Prix de référence pour lire un montant dans un message. */
function referencePrice(deal) {
  const n = deal.numbers;
  return n.listedPrice ?? n.askingPrice ?? n.marketPrice ?? undefined;
}

/**
 * Une contre-offre est-elle dans tes prix ?
 * @returns {'ok'|'jouable'|'haute'}
 */
export function classifyOffer(deal, amount) {
  const n = deal.numbers;
  if (deal.kind === 'revente') {
    const floor = n.floorPrice ?? 0;
    if (amount >= floor) return 'ok';
    return amount >= floor * 0.97 ? 'jouable' : 'haute';
  }
  if (deal.kind === 'mandat') {
    // Le vendeur demande un prix net : il faut garder la plus-value minimale.
    if (amount <= (n.ownerNet ?? 0)) return 'ok';
    return amount <= (n.salePrice ?? 0) - MANDATE.commission.minSpread / 2 ? 'jouable' : 'haute';
  }
  if (amount <= (n.maxBuyPrice ?? 0)) return 'ok';
  return amount <= (n.walkAwayPrice ?? 0) ? 'jouable' : 'haute';
}

function intentKey(deal, event) {
  if (!event.intent) return 'neutre';
  if (event.intent !== 'contre_offre') return event.intent;
  return `contre_offre_${classifyOffer(deal, event.amount ?? 0)}`;
}

// ---------------------------------------------------------------------------
// Chaleur & prochaine action
// ---------------------------------------------------------------------------

const lastOf = (events, types) => [...events].reverse().find((e) => types.includes(e.type));

/**
 * Chaleur du lead : 🔥 chaud (à traiter maintenant), tiède, froid ; "stock" / "clos" hors leads.
 * @param {Deal} deal
 * @param {Date} [now]
 */
export function leadHeat(deal, now = new Date()) {
  const stage = stageOf(deal);
  if (stage.phase === 'closed') return { score: 0, level: /** @type {const} */ ('clos'), reasons: [] };
  if (stage.phase === 'stock') return { score: 0, level: /** @type {const} */ ('stock'), reasons: [] };

  const reasons = [];
  let score = HEAT.byStage[deal.stage] ?? 20;
  const lastIn = lastOf(deal.events, ['in']);
  const lastMsg = lastOf(deal.events, ['in', 'out']);
  if (lastIn) {
    const key = intentKey(deal, lastIn);
    score += HEAT.byIntent[key] ?? 0;
    if (key === 'accord') reasons.push(partyOf(deal) === 'acheteur' ? 'veut venir / acheter' : "d'accord sur le principe");
    if (key === 'contre_offre_ok') reasons.push(`propose ${eur(lastIn.amount ?? 0)} : dans tes prix`);
    if (key === 'contre_offre_jouable') reasons.push(`propose ${eur(lastIn.amount ?? 0)} : jouable`);
    if (key === 'contre_offre_haute') reasons.push(`propose ${eur(lastIn.amount ?? 0)} : hors prix`);
    if (key === 'question') reasons.push('pose une question');
    if (key === 'refus') reasons.push('refuse pour l’instant');
    const age = now.getTime() - new Date(lastIn.at).getTime();
    if (age < DAY_MS) score += HEAT.recency.day;
    else if (age < 3 * DAY_MS) score += HEAT.recency.threeDays;
    else if (age > 7 * DAY_MS) score += HEAT.recency.stale;
  }
  if (lastMsg?.type === 'in') {
    score += HEAT.awaitingYou;
    reasons.push('attend ta réponse');
  }
  if (deal.rdvAt) {
    const until = new Date(deal.rdvAt).getTime() - now.getTime();
    if (until > -DAY_MS && until < 2 * DAY_MS) {
      score += 10;
      reasons.push('visite imminente');
    }
  }
  score = Math.round(clamp(score, 0, 100));
  const level = score >= HEAT.hot ? 'chaud' : score >= HEAT.warm ? 'tiede' : 'froid';
  return { score, level: /** @type {'chaud'|'tiede'|'froid'} */ (level), reasons };
}

/** Prix affiché à la revente : celui saisi, sinon la cote arrondie "commerciale" (8 990 €). */
export function listedPriceOf(deal) {
  const n = deal.numbers;
  if (n.listedPrice) return n.listedPrice;
  // Revente : prix des annonces de ta zone s'il est connu, sinon la cote nationale.
  const base = deal.kind === 'mandat' ? n.salePrice : n.localPrice ?? n.marketPrice;
  return base ? Math.max(0, Math.floor(base / 100) * 100 - 10) : 0;
}

/** Prix plancher à la revente : celui saisi, sinon le prix affiché moins 5 %. */
export function floorPriceOf(deal) {
  const n = deal.numbers;
  if (n.floorPrice) return n.floorPrice;
  return round50(listedPriceOf(deal) * (1 - RESALE.maxDiscountRate), 'up');
}

/** Dernière offre faite au vendeur (ou prix net garanti en mandat). */
const currentOffer = (deal) => (deal.kind === 'mandat' ? deal.numbers.ownerNet : deal.numbers.offerPrice) ?? 0;

/**
 * Réponse prête à copier à un message reçu.
 * @param {Deal} deal
 * @param {DealEvent} inbound
 * @returns {{ text: string, offer?: number }}
 */
export function suggestReply(deal, inbound) {
  const n = deal.numbers;
  const offer = currentOffer(deal);
  const amount = inbound.amount ?? 0;
  const verdict = inbound.intent === 'contre_offre' ? classifyOffer(deal, amount) : null;
  const papers = 'carte grise, contrôle technique de moins de 6 mois, carnet d’entretien et certificat de non-gage';

  if (deal.kind === 'revente') {
    const listed = n.listedPrice ?? listedPriceOf(deal);
    const floor = n.floorPrice ?? floorPriceOf(deal);
    if (verdict === 'ok') {
      return {
        text: `Bonjour, c’est d’accord pour ${eur(amount)}. Passez faire l’essai : si tout vous convient, paiement par virement instantané et je vous remets tous les papiers (certificat de cession, carte grise barrée, CT de moins de 6 mois, non-gage). Quel créneau vous arrange ?`,
        offer: amount,
      };
    }
    if (verdict === 'jouable') {
      const counter = Math.max(floor, round50((listed + amount) / 2, 'up'));
      return { text: `Bonjour, je peux faire un geste à ${eur(counter)}, c’est mon dernier prix : le véhicule est préparé, révisé et tous les papiers sont en règle. On cale un essai ?`, offer: counter };
    }
    if (verdict === 'haute') {
      return { text: `Bonjour, merci pour votre proposition, mais ${eur(amount)} c’est trop bas : le véhicule est préparé et révisé. Mon dernier prix est ${eur(floor)}. Si ça vous va, vous pouvez venir l’essayer quand vous voulez.`, offer: floor };
    }
    if (inbound.intent === 'accord') {
      return { text: 'Avec plaisir ! Le véhicule est visible sur rendez-vous près de Bordeaux. Quel créneau vous arrange pour un essai ? Pensez à votre permis et à une pièce d’identité. Paiement par virement instantané à la remise des clés.' };
    }
    if (inbound.intent === 'refus') return { text: 'Pas de souci, merci de votre retour et bonne recherche !' };
    return { text: `Bonjour, oui il est toujours disponible ! [ta réponse ici] Vous voulez venir l’essayer ? Il est visible près de Bordeaux, sur rendez-vous.` };
  }

  if (deal.kind === 'mandat') {
    const sale = n.salePrice ?? 0;
    if (verdict === 'ok') {
      return { text: `Ça me va : ${eur(amount)} net pour vous, garanti par écrit dans le mandat. Je vous propose un rendez-vous de 30 minutes pour voir le véhicule et signer. Quel créneau vous arrange ?`, offer: amount };
    }
    if (verdict === 'jouable') {
      const counter = round50((offer + amount) / 2);
      return { text: `Je comprends. Je peux vous garantir ${eur(counter)} net, par écrit : c’est le maximum pour la vendre rapidement au prix du marché (autour de ${eur(sale)}). Vous n’avancez rien et je m’occupe de tout. On se voit pour signer ?`, offer: counter };
    }
    if (verdict === 'haute') {
      return { text: `À ${eur(amount)} net, il ne reste aucune marge pour la vendre au prix du marché (autour de ${eur(sale)}), donc elle risquerait de rester en ligne comme aujourd’hui. Je peux vous garantir ${eur(offer)} net par écrit. Je reste disponible si vous changez d’avis.` };
    }
    if (inbound.intent === 'accord') {
      return { text: 'Super ! Je vous propose un rendez-vous de 30 minutes pour voir le véhicule et signer le mandat : prix net garanti par écrit, exclusivité 30 jours, aucun frais avant la vente. Quel créneau vous arrange ?' };
    }
    if (inbound.intent === 'refus') {
      return { text: 'Je comprends tout à fait. Si dans quelques semaines vous voulez vous décharger de la vente (zéro curieux, zéro avance de frais), je reste disponible.' };
    }
    return { text: `Bien sûr ! [ta réponse ici] Pour résumer : vous touchez ${eur(offer)} net garantis par écrit, je m’occupe des annonces, des appels, des essais et de la paperasse, et je ne suis payé que sur la plus-value au-dessus de votre prix net. On en parle 5 minutes ?` };
  }

  // Achat-revente
  if (verdict === 'ok') {
    return { text: `D’accord pour ${eur(amount)}. Je peux passer dès demain : essai, vérification des papiers (${papers}) et paiement immédiat par virement instantané. Quel créneau vous arrange ?`, offer: amount };
  }
  if (verdict === 'jouable') {
    // On coupe la poire en deux, sans jamais dépasser le prix PÉPITE quand il est encore atteignable, ni le prix plafond.
    const ceiling = (n.maxBuyPrice ?? 0) >= offer ? (n.maxBuyPrice ?? 0) : (n.walkAwayPrice ?? 0);
    const counter = Math.max(offer, Math.min(round50((offer + amount) / 2), round50(ceiling)));
    return { text: `Je comprends. Je peux monter à ${eur(counter)}, c’est mon maximum avec les frais à prévoir (préparation, carte grise, garantie). Paiement immédiat par virement instantané et je me déplace cette semaine. Ça vous va ?`, offer: counter };
  }
  if (verdict === 'haute') {
    return { text: `Merci pour votre retour. À ${eur(amount)}, je ne peux malheureusement pas suivre : la cote du marché ne le permet pas avec les frais à prévoir. Mon offre de ${eur(offer)}, payée immédiatement par virement instantané, tient toujours si vous changez d’avis.` };
  }
  if (inbound.intent === 'accord') {
    return { text: `Merci ! Je peux passer voir le véhicule cette semaine. Quel créneau vous arrange ? Je règle ${eur(offer)} par virement instantané sur place, après essai et vérification des papiers (${papers}).`, offer };
  }
  if (inbound.intent === 'refus') {
    return { text: `Je comprends tout à fait. Mon offre de ${eur(offer)} reste valable cette semaine : paiement immédiat, sans curieux ni rendez-vous manqués. N’hésitez pas à revenir vers moi.` };
  }
  return { text: `Bonjour, bien sûr ! [ta réponse ici] Je suis acheteur sérieux sur la région, je paie par virement instantané et je me déplace sous 48 h. Mon offre de ${eur(offer)} tient toujours : on cale une visite ?` };
}

/** Relance n°1 ou n°2 après un silence. */
export function followUpMessage(deal, n) {
  const title = deal.vehicle.title;
  const offer = currentOffer(deal);
  if (deal.kind === 'revente') {
    return n === 1
      ? `Bonjour, le ${title} est toujours disponible si vous souhaitez venir l’essayer. Je peux vous proposer un créneau cette semaine.`
      : `Bonjour, dernière relance de ma part pour le ${title} : j’ai d’autres demandes, dites-moi si vous êtes toujours intéressé(e).`;
  }
  if (deal.kind === 'mandat') {
    return n === 1
      ? `Bonjour, je reviens vers vous pour votre ${title}. Ma proposition tient toujours : ${eur(offer)} net garantis par écrit, je gère tout (annonces, curieux, essais, papiers), sans aucune avance. Un appel de 5 minutes ?`
      : `Bonjour, dernière relance de ma part : si votre ${title} n’est pas encore vendu, je peux m’en occuper dès cette semaine. Bonne journée !`;
  }
  return n === 1
    ? `Bonjour, je me permets de revenir vers vous pour votre ${title}. Mon offre de ${eur(offer)}, payée immédiatement par virement instantané, tient toujours. Est-il toujours disponible ?`
    : `Bonjour, dernière relance de ma part : si le véhicule n’est pas encore vendu, je peux passer cette semaine et régler ${eur(offer)} sur place par virement instantané. Bonne journée !`;
}

/** Texte d'annonce de revente prêt à publier. */
export function resaleAd(deal) {
  const v = deal.vehicle;
  const price = listedPriceOf(deal);
  const text = [
    `${v.title} – ${v.year} – ${Number(v.mileage).toLocaleString('fr-FR')} km`,
    '',
    'Véhicule préparé et vérifié : nettoyage complet intérieur/extérieur, contrôle mécanique.',
    'Papiers en règle : contrôle technique de moins de 6 mois, carte grise, certificat de non-gage, historique d’entretien.',
    'Paiement sécurisé par virement instantané. Visible près de Bordeaux, sur rendez-vous.',
    '',
    `Prix : ${eur(price)}`,
  ].join('\n');
  return { text, price };
}

/**
 * Prochaine action : quoi faire, quand, et le message prêt à copier.
 * priority : plus c'est haut, plus c'est en tête de "À traiter".
 * @param {Deal} deal
 * @param {Date} [now]
 * @returns {{ kind: 'repondre'|'contacter'|'relancer'|'visite'|'cloturer'|'carte_grise'|'preparer'|'publier'|'attendre'|'aucune', label: string, dueAt: string|null, overdue: boolean, priority: number, message?: string, offer?: number, checklist?: string }}
 */
export function nextAction(deal, now = new Date()) {
  const stage = stageOf(deal);
  const nowMs = now.getTime();
  const at = (ms) => new Date(ms).toISOString();
  const toParty = partyOf(deal) === 'acheteur' ? "à l'acheteur" : 'au vendeur';
  if (stage.phase === 'closed') return { kind: 'aucune', label: stage.won ? 'Vendu 🎉' : 'Classé', dueAt: null, overdue: false, priority: 0 };

  if (stage.phase === 'lead') {
    const lastMsg = lastOf(deal.events, ['in', 'out']);
    const heat = leadHeat(deal, now);
    if (lastMsg?.type === 'in') {
      if (lastMsg.intent === 'vendu') {
        return { kind: 'cloturer', label: `${partyOf(deal) === 'vendeur' ? 'Déjà vendu' : 'Plus intéressé'} : classer en perdu`, dueAt: lastMsg.at, overdue: false, priority: 20 };
      }
      const reply = suggestReply(deal, lastMsg);
      return { kind: 'repondre', label: `Répondre ${toParty}`, dueAt: lastMsg.at, overdue: nowMs - new Date(lastMsg.at).getTime() > 4 * HOUR_MS, priority: 100 + heat.score, message: reply.text, offer: reply.offer };
    }
    if (!lastMsg) {
      const message = deal.firstMessage?.body ?? (deal.kind === 'revente' ? undefined : followUpMessage(deal, 1));
      return { kind: 'contacter', label: deal.kind === 'revente' ? "Contacter l'acheteur" : 'Envoyer le premier message', dueAt: deal.createdAt, overdue: false, priority: 50 + Number(deal.numbers.score ?? 0) / 2, message };
    }
    if (deal.stage === 'rdv') {
      if (deal.rdvAt) {
        const rdv = new Date(deal.rdvAt).getTime();
        return {
          kind: 'visite',
          label: `${deal.kind === 'mandat' ? 'RDV signature' : deal.kind === 'revente' ? 'Essai' : 'Visite'} le ${new Date(deal.rdvAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} : préparer les papiers`,
          dueAt: at(rdv - FOLLOW_UP.rdvReminderHours * HOUR_MS),
          overdue: nowMs > rdv,
          priority: nowMs > rdv - FOLLOW_UP.rdvReminderHours * HOUR_MS ? 90 : 30,
          checklist: deal.kind,
        };
      }
      return { kind: 'visite', label: 'Caler la date de la visite', dueAt: lastMsg.at, overdue: false, priority: 85, message: 'Bonjour, quel créneau vous arrangerait cette semaine pour se voir ?', checklist: deal.kind };
    }
    // Silence après ton message : relances puis clôture.
    const lastInIndex = deal.events.map((e) => e.type).lastIndexOf('in');
    const sinceIn = deal.events.slice(lastInIndex + 1);
    const outs = sinceIn.filter((e) => e.type === 'out').length || 1;
    const silentDays = (nowMs - new Date(lastMsg.at).getTime()) / DAY_MS;
    const firstOut = sinceIn.find((e) => e.type === 'out') ?? lastMsg;
    const totalSilence = (nowMs - new Date(firstOut.at).getTime()) / DAY_MS;
    if (outs > FOLLOW_UP.delaysDays.length && totalSilence >= FOLLOW_UP.closeAfterDays) {
      return { kind: 'cloturer', label: 'Plus de réponse : classer en perdu', dueAt: at(new Date(firstOut.at).getTime() + FOLLOW_UP.closeAfterDays * DAY_MS), overdue: false, priority: 10 };
    }
    const delay = FOLLOW_UP.delaysDays[outs - 1];
    if (delay !== undefined) {
      const due = new Date(lastMsg.at).getTime() + delay * DAY_MS;
      if (silentDays >= delay) {
        return { kind: 'relancer', label: `Relance n°${outs} (${Math.floor(silentDays)} j sans réponse)`, dueAt: at(due), overdue: silentDays >= delay + 1, priority: 60 + heat.score / 2, message: followUpMessage(deal, outs) };
      }
      return { kind: 'attendre', label: `En attente de réponse · relance le ${new Date(due).toLocaleDateString('fr-FR')}`, dueAt: at(due), overdue: false, priority: 0 };
    }
    const closeAt = new Date(firstOut.at).getTime() + FOLLOW_UP.closeAfterDays * DAY_MS;
    return { kind: 'attendre', label: 'En attente de réponse (relances faites)', dueAt: at(closeAt), overdue: false, priority: 0 };
  }

  // Phase stock
  if (deal.kind === 'achat' && deal.stage === 'achete') {
    const bought = new Date((lastOf(deal.events, ['stage']) ?? { at: deal.updatedAt }).at).getTime();
    if (!deal.docs.immat) {
      const pro = REGISTRATION.status === 'pro';
      return {
        kind: 'carte_grise',
        label: pro ? "Déclaration d'achat (Cerfa 13751) + W garage" : `Carte grise à ton nom avant le ${new Date(bought + FOLLOW_UP.registrationDeadlineDays * DAY_MS).toLocaleDateString('fr-FR')}`,
        dueAt: at(bought + FOLLOW_UP.registrationDeadlineDays * DAY_MS),
        overdue: nowMs > bought + FOLLOW_UP.registrationDeadlineDays * DAY_MS,
        priority: 70,
        checklist: 'achat',
      };
    }
    return { kind: 'preparer', label: 'Passer en préparation : detailing, petite méca, photos', dueAt: null, overdue: false, priority: 40 };
  }
  if (deal.stage === 'preparation') return { kind: 'preparer', label: 'Préparation : detailing, petite méca, photos, puis mettre en vente', dueAt: null, overdue: false, priority: 35 };
  if (deal.stage === 'signe' || (deal.stage === 'en_vente' && !deal.numbers.listedPrice)) {
    const ad = resaleAd(deal);
    return { kind: 'publier', label: `Publier l'annonce de revente (${eur(ad.price)})`, dueAt: null, overdue: false, priority: 45, message: ad.text, offer: ad.price };
  }
  return { kind: 'attendre', label: `En vente à ${eur(listedPriceOf(deal))} : en attente d'acheteurs`, dueAt: null, overdue: false, priority: 0 };
}

/** L'action demande-t-elle quelque chose de toi maintenant ? */
export const isActionable = (action) => action.kind !== 'attendre' && action.kind !== 'aucune';

// ---------------------------------------------------------------------------
// Actions (réducteur immuable)
// ---------------------------------------------------------------------------

const EDITABLE = new Set(['argusPrice', 'offerPrice', 'maxBuyPrice', 'walkAwayPrice', 'ownerNet', 'salePrice', 'purchasePrice', 'listedPrice', 'floorPrice', 'soldPrice', 'extraCosts', 'registrationCost', 'transportCost', 'reconditioning']);

/**
 * @typedef {{ type: 'outbound', text: string, offer?: number }
 *   | { type: 'inbound', text: string }
 *   | { type: 'note', text: string }
 *   | { type: 'call', text?: string }
 *   | { type: 'stage', stage: string, amount?: number, lostReason?: string }
 *   | { type: 'update', contact?: Deal['contact'], numbers?: Record<string, number|null>, rdvAt?: string|null }
 *   | { type: 'doc', id: string, done: boolean }} DealAction
 */

/**
 * Applique une action et renvoie un nouveau deal (ou une erreur lisible).
 * @param {Deal} deal
 * @param {DealAction} action
 * @param {Date} [now]
 * @returns {{ ok: true, deal: Deal } | { ok: false, error: string }}
 */
export function applyAction(deal, action, now = new Date()) {
  const at = now.toISOString();
  const next = { ...deal, numbers: { ...deal.numbers }, contact: { ...deal.contact }, docs: { ...deal.docs }, events: [...deal.events], updatedAt: at };
  const push = (event) => next.events.push({ id: `e${deal.events.length + 1}-${now.getTime().toString(36)}`, at, ...event });
  const stages = PIPELINES[deal.kind].stages;
  const text = typeof action.text === 'string' ? action.text.trim().slice(0, 5000) : '';

  switch (action.type) {
    case 'outbound': {
      if (!text) return { ok: false, error: 'message vide' };
      const offer = Number(action.offer);
      push({ type: 'out', text, ...(offer > 0 ? { amount: offer } : {}) });
      if (offer > 0 && deal.kind === 'achat') next.numbers.offerPrice = offer;
      if (offer > 0 && deal.kind === 'mandat') next.numbers.ownerNet = offer;
      if (deal.stage === 'a_contacter') next.stage = 'contacte';
      if (deal.stage === 'nouveau') next.stage = 'discussion';
      break;
    }
    case 'inbound': {
      if (!text) return { ok: false, error: 'message vide' };
      const { intent, amount } = analyzeReply(text, { reference: referencePrice(deal) });
      push({ type: 'in', text, intent, ...(amount !== null ? { amount } : {}) });
      if (['a_contacter', 'contacte', 'nouveau'].includes(deal.stage)) next.stage = 'discussion';
      break;
    }
    case 'note':
      if (!text) return { ok: false, error: 'note vide' };
      push({ type: 'note', text });
      break;
    case 'call':
      push({ type: 'call', text: text || 'Appel' });
      break;
    case 'stage': {
      const target = stages.find((s) => s.id === action.stage);
      if (!target) return { ok: false, error: `étape inconnue : ${action.stage}` };
      const amount = Number(action.amount);
      next.stage = target.id;
      if (target.id === 'perdu') next.lostReason = action.lostReason ?? next.lostReason ?? 'Autre';
      if (amount > 0) {
        if (target.id === 'achete') next.numbers.purchasePrice = amount;
        if (target.id === 'signe') next.numbers.ownerNet = amount;
        if (target.id === 'en_vente') next.numbers.listedPrice = amount;
        if (target.id === 'vendu') next.numbers.soldPrice = amount;
      }
      push({ type: 'stage', stage: target.id, text: `→ ${target.label}${amount > 0 ? ` (${eur(amount)})` : ''}${target.id === 'perdu' ? ` : ${next.lostReason}` : ''}`, ...(amount > 0 ? { amount } : {}) });
      break;
    }
    case 'update': {
      if (action.contact) {
        for (const key of ['name', 'phone', 'channel']) {
          const v = action.contact[key];
          if (typeof v === 'string') next.contact[key] = v.trim().slice(0, 200);
        }
      }
      if (action.numbers) {
        for (const [key, v] of Object.entries(action.numbers)) {
          if (!EDITABLE.has(key)) continue;
          next.numbers[key] = v === null || v === undefined || v === '' ? null : Number(v);
        }
      }
      if ('rdvAt' in action) {
        const d = action.rdvAt ? new Date(action.rdvAt) : null;
        next.rdvAt = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
        if (next.rdvAt && stageOf(deal).phase === 'lead') next.stage = 'rdv';
      }
      break;
    }
    case 'doc': {
      const known = DOCUMENTS[deal.kind].some((d) => d.id === action.id);
      if (!known) return { ok: false, error: `document inconnu : ${action.id}` };
      next.docs[action.id] = Boolean(action.done);
      break;
    }
    default:
      return { ok: false, error: 'action inconnue' };
  }
  return { ok: true, deal: next };
}

// ---------------------------------------------------------------------------
// Argent & statistiques
// ---------------------------------------------------------------------------

/**
 * Marge attendue et marge encaissée d'un deal (achat ou mandat).
 * Achat : vente − achat − remise en état − carte grise − rapatriement − frais réels saisis.
 */
export function dealEconomics(deal) {
  const n = deal.numbers;
  if (deal.kind === 'mandat') {
    const net = n.ownerNet ?? 0;
    const expected = (n.listedPrice ?? n.salePrice ?? 0) - net + (n.upsellMargin ?? 0);
    const realized = n.soldPrice ? n.soldPrice - net + (n.upsellMargin ?? 0) : null;
    return { expected, realized, invested: 0 };
  }
  if (deal.kind === 'revente') return { expected: 0, realized: null, invested: 0 };
  const costs = (n.reconditioning ?? COSTS.RECONDITIONING_BASE) + (n.registrationCost ?? 0) + (n.transportCost ?? 0) + (n.extraCosts ?? 0);
  const buy = n.purchasePrice ?? n.offerPrice ?? n.askingPrice ?? 0;
  const sell = n.soldPrice ?? n.listedPrice ?? n.marketPrice ?? 0;
  const expected = sell - buy - costs - (n.soldPrice ? 0 : COSTS.RISK_CAPITAL);
  return { expected, realized: n.soldPrice && n.purchasePrice ? n.soldPrice - n.purchasePrice - costs : null, invested: n.purchasePrice ? n.purchasePrice + costs : 0 };
}

/**
 * Tableau de bord du CRM.
 * @param {Deal[]} deals
 * @param {Date} [now]
 */
export function crmStats(deals, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const stats = { hot: 0, toReply: 0, followUps: 0, toContact: 0, visits: 0, leads: 0, stock: 0, invested: 0, pipeline: 0, realizedMonth: 0, realizedTotal: 0, won: 0, lost: 0 };
  for (const deal of deals) {
    const stage = stageOf(deal);
    const action = nextAction(deal, now);
    const heat = leadHeat(deal, now);
    if (heat.level === 'chaud') stats.hot += 1;
    if (action.kind === 'repondre') stats.toReply += 1;
    if (action.kind === 'relancer') stats.followUps += 1;
    if (action.kind === 'contacter') stats.toContact += 1;
    if (action.kind === 'visite') stats.visits += 1;
    if (stage.phase === 'lead') stats.leads += 1;
    if (deal.kind === 'revente') continue;
    const money = dealEconomics(deal);
    if (stage.phase === 'stock') {
      stats.stock += 1;
      stats.invested += money.invested;
    }
    if (stage.phase !== 'closed') stats.pipeline += Math.max(0, money.expected);
    if (stage.won) {
      stats.won += 1;
      stats.realizedTotal += money.realized ?? 0;
      const soldAt = lastOf(deal.events, ['stage']);
      if (soldAt && new Date(soldAt.at).getTime() >= monthStart) stats.realizedMonth += money.realized ?? 0;
    }
    if (deal.stage === 'perdu') stats.lost += 1;
  }
  return stats;
}

/**
 * Deals à traiter, du plus urgent au moins urgent (leads chauds en tête).
 * @param {Deal[]} deals
 * @param {Date} [now]
 */
export function actionQueue(deals, now = new Date()) {
  return deals
    .map((deal) => ({ deal, action: nextAction(deal, now), heat: leadHeat(deal, now) }))
    .filter((x) => isActionable(x.action))
    .sort((a, b) => b.action.priority - a.action.priority);
}

/**
 * Résumé quotidien Telegram (HTML) ; null s'il n'y a rien à faire.
 * @param {Deal[]} deals
 * @param {{ now?: Date, appUrl?: string }} [options]
 */
export function dailyDigest(deals, options = {}) {
  const now = options.now ?? new Date();
  const queue = actionQueue(deals, now);
  if (queue.length === 0) return null;
  const s = crmStats(deals, now);
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = [
    '📋 <b>CRM : ta journée</b>',
    `🔥 ${s.hot} lead(s) chaud(s) · 💬 ${s.toReply} réponse(s) · 🔁 ${s.followUps} relance(s) · 📍 ${s.visits} visite(s) · ✉️ ${s.toContact} à contacter`,
    '',
    ...queue.slice(0, 8).map(({ deal, action, heat }) => `${heat.level === 'chaud' ? '🔥' : '•'} ${esc(deal.vehicle.title)} : ${esc(action.label)}`),
  ];
  if (s.pipeline > 0) lines.push('', `Pipeline : ${eur(s.pipeline)} de marge attendue · ${s.stock} véhicule(s) en stock`);
  if (options.appUrl) lines.push(`<a href="${esc(options.appUrl)}/crm">Ouvrir le CRM</a>`);
  return lines.join('\n');
}
