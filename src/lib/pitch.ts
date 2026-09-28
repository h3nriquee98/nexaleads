import { formatRating } from "./labels";
import { fold } from "./text";
import type { Lead } from "./types";

/**
 * Gera mensagens de abordagem personalizadas a partir dos dados do lead.
 * Usa apenas informações que vieram da fonte (nome, nicho, cidade, nota, avaliações e status do site).
 * A mensagem nunca é enviada automaticamente: o usuário revisa, edita e envia manualmente.
 */

export const PITCH_VARIANTS = 3;

export interface PitchOptions {
  /** Nome de quem está enviando (opcional). */
  senderName?: string;
  /** Qual versão da mensagem gerar (0, 1, 2…). */
  variant?: number;
  /** Usado para escolher "Bom dia/Boa tarde/Boa noite". */
  now?: Date;
}

type PitchLead = Pick<Lead, "name" | "niche" | "category" | "city" | "searchLocation" | "rating" | "reviewsCount" | "siteStatus" | "siteNote">;

/** Benefício de ter um site, adaptado ao nicho. */
const NICHE_BENEFITS: { match: string[]; benefit: string }[] = [
  // Vem primeiro para "estética automotiva" não cair em beleza.
  { match: ["lava-rapido", "lava rapido", "lava jato", "lavagem automotiva", "estetica automotiva"], benefit: "receber agendamentos online e mostrar seus serviços e preços" },
  { match: ["pizzar", "restaurant", "lanchon", "hamburg", "bares", "cafe", "padar", "comida", "delivery", "marmit", "acai", "sorvet"], benefit: "mostrar o cardápio online e receber mais pedidos" },
  { match: ["docer", "confeit", "bolo", "doce"], benefit: "mostrar o cardápio de doces e receber mais encomendas" },
  { match: ["salao", "saloes", "beleza", "barbear", "estetic", "manicure", "cabelei", "sobrancel"], benefit: "receber agendamentos online e mostrar seus serviços e preços" },
  { match: ["clinic", "dentist", "odonto", "medic", "fisio", "psicolog", "nutri", "veterin"], benefit: "facilitar o agendamento de consultas e transmitir mais confiança aos pacientes" },
  { match: ["academ", "crossfit", "pilates", "fitness"], benefit: "divulgar planos e horários e captar novas matrículas" },
  { match: ["fotograf", "video", "tatuag", "tattoo"], benefit: "apresentar um portfólio profissional e fechar mais trabalhos" },
  { match: ["decora", "buffet", "evento", "festa", "cerimon"], benefit: "mostrar seu portfólio e receber pedidos de orçamento todos os dias" },
  { match: ["pet shop", "petshop", "banho e tosa"], benefit: "receber agendamentos de banho e tosa e mostrar seus produtos" },
  { match: ["floric", "flores"], benefit: "mostrar seus arranjos e receber mais encomendas" },
  { match: ["roupa", "loja", "moda", "boutique", "calcad", "acessor", "otica"], benefit: "ter uma vitrine online com seus produtos e vender também pela internet" },
  { match: ["imobili", "imove", "corretor"], benefit: "divulgar seus imóveis e receber contatos de interessados" },
  { match: ["oficina", "mecanic", "funilar", "auto center", "autopec", "pneu"], benefit: "receber pedidos de orçamento e mostrar seus serviços" },
  { match: ["constru", "reforma", "engenharia", "arquitet", "empreit", "marcenar", "vidrac", "serralher"], benefit: "mostrar suas obras concluídas e receber pedidos de orçamento" },
  { match: ["advog", "contab", "juridic", "consultori"], benefit: "transmitir credibilidade e receber contatos de novos clientes" },
  { match: ["escola", "idioma", "curso"], benefit: "divulgar seus cursos e captar novos alunos" },
  { match: ["lavander"], benefit: "receber pedidos e mostrar seus serviços e preços" },
  { match: ["autonom", "eletricista", "encanador", "pintor", "jardin", "diarista", "freelanc"], benefit: "ser encontrado por quem procura seus serviços e receber mais pedidos" },
];

const DEFAULT_BENEFIT = "apresentar seus serviços e receber mais contatos de novos clientes";

export function nicheBenefit(lead: Pick<Lead, "niche" | "category">): string {
  const haystack = fold(`${lead.niche} ${lead.category ?? ""}`);
  return NICHE_BENEFITS.find((n) => n.match.some((m) => haystack.includes(m)))?.benefit ?? DEFAULT_BENEFIT;
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function cityOf(lead: PitchLead): string | null {
  return lead.city ?? (lead.searchLocation.split(",")[0]?.trim() || null);
}

/** Frase sobre as avaliações, somente quando a fonte trouxe nota e avaliações suficientes. */
function ratingPhrase(lead: PitchLead): string {
  if (lead.rating === null || !lead.reviewsCount || lead.reviewsCount < 5) return "";
  if (lead.rating >= 4.5) return ` e vi que vocês têm ótimas avaliações (nota ${formatRating(lead.rating)} com ${lead.reviewsCount} avaliações)`;
  if (lead.rating >= 4) return ` e vi que vocês são bem avaliados pelos clientes (nota ${formatRating(lead.rating)})`;
  return "";
}

function socialNetwork(lead: PitchLead): string | null {
  const m = /^Apenas (.+)$/.exec(lead.siteNote ?? "");
  return m ? m[1] : null;
}

function intro(sender: string): string {
  return sender ? `Aqui é ${sender}, da Nexa Agency.` : "Aqui é da Nexa Agency, agência de criação de sites.";
}

/** Frase principal sobre a ausência de site (sem afirmar nada que a fonte não indicou). */
function noSiteSentence(lead: PitchLead): string {
  const social = socialNetwork(lead);
  if (social) return `percebemos que vocês divulgam pelo ${social}, mas ainda não têm um site próprio`;
  if (lead.siteStatus === "nao_identificado") return "não encontramos um site de vocês no Google";
  return "percebemos que vocês ainda não têm um site";
}

export function generatePitch(lead: PitchLead, options: PitchOptions = {}): string {
  const sender = (options.senderName ?? "").replace(/\s+/g, " ").trim();
  const variant = ((options.variant ?? 0) % PITCH_VARIANTS + PITCH_VARIANTS) % PITCH_VARIANTS;
  const hello = greeting(options.now);
  const company = lead.name;
  const city = cityOf(lead);
  const niche = lead.niche.toLowerCase();
  const benefit = nicheBenefit(lead);
  const rating = ratingPhrase(lead);

  if (lead.siteStatus === "possui_site") {
    const versions = [
      `${hello}! Tudo bem? ${intro(sender)}\n\nEncontrei o perfil de ${company} no Google Maps${rating}. Vi que vocês já têm um site, e trabalhamos justamente ajudando empresas a transformar o site em uma ferramenta de vendas: mais rápido, bonito no celular e com contato direto pelo WhatsApp.\n\nPosso te mostrar uma demonstração sem compromisso com algumas melhorias para o site de vocês?`,
      `Olá, ${company}! ${hello}. ${intro(sender)}\n\nFizemos uma análise rápida da presença de vocês na internet e vimos oportunidades de melhorar o site para ${benefit}.\n\nTopa ver uma demonstração gratuita e sem compromisso?`,
      `${hello}! ${intro(sender)}\n\nAjudamos ${niche}${city ? ` de ${city}` : ""} a vender mais pela internet. Um site moderno pode ajudar ${company} a:\n• aparecer melhor nas buscas do Google\n• ${benefit}\n• passar mais confiança para novos clientes\n\nQuer que eu te mostre uma demonstração sem compromisso?`,
    ];
    return versions[variant];
  }

  const noSite = noSiteSentence(lead);
  const versions = [
    `${hello}! Tudo bem? ${intro(sender)}\n\nEncontrei o perfil de ${company} no Google Maps${rating}, e ${noSite}.\n\nHoje a maioria dos clientes pesquisa na internet antes de comprar, e um site profissional pode ajudar vocês a ${benefit}, gerando mais vendas.\n\nPosso te mostrar uma demonstração sem compromisso de como ficaria o site de vocês?`,
    `Olá, ${company}! ${hello}. ${intro(sender)}\n\nVi o perfil de vocês no Google e ${noSite}. Com um site próprio, quem procura por ${niche}${city ? ` em ${city}` : ""} encontra vocês com mais facilidade, e isso vira mais clientes e mais vendas.\n\nQuer ver uma demonstração gratuita e sem compromisso?`,
    `${hello}! ${intro(sender)}\n\nEstava pesquisando ${niche}${city ? ` em ${city}` : ""} e ${noSite}. Um site pode ajudar ${company} a:\n• aparecer nas buscas do Google\n• ${benefit}\n• passar mais confiança e gerar mais vendas\n\nMontamos uma demonstração sem compromisso para vocês verem como ficaria. Posso te enviar?`,
  ];
  return versions[variant];
}

/** Link do WhatsApp com a mensagem já preenchida (o envio continua manual). */
export function whatsappLinkWithText(link: string | null, text: string): string | null {
  if (!link) return null;
  return `${link}?text=${encodeURIComponent(text)}`;
}
