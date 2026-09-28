import "server-only";
import type { SearchParams } from "@/lib/types";
import { fetchLimit } from "@/lib/validation";
import type { RawPlace } from "@/lib/normalize";

/**
 * Gera dados FICTÍCIOS apenas para testar a interface quando o Apify não está configurado.
 * Todos os leads gerados aqui são marcados como "demo" e exibidos com aviso na tela.
 */

const PREFIXES: Record<string, string[]> = {
  restaurantes: ["Restaurante Sabor da Terra", "Cantina do Vale", "Restaurante Fogão Mineiro", "Bistrô Aurora", "Restaurante Tempero Caseiro"],
  pizzarias: ["Pizzaria Forno a Lenha", "Pizzaria Bella Massa", "Pizzaria Dom Giuseppe", "Pizzaria Sabor Nobre", "Pizzaria da Praça"],
  docerias: ["Doceria Doce Encanto", "Doces da Vovó", "Ateliê do Brigadeiro", "Doceria Açúcar & Afeto", "Confeitaria Flor de Mel"],
  "saloes de beleza": ["Studio Beleza Pura", "Salão Glamour", "Espaço Bella Donna", "Salão Charme & Estilo", "Studio Cabelo & Cia"],
  barbearias: ["Barbearia Old School", "Barbearia do Zé", "Barber Club Navalha", "Barbearia Clássica", "Barbearia Dom Bigode"],
  clinicas: ["Clínica Vida & Saúde", "Clínica Bem-Estar", "Clínica Integrada Viver", "Clínica São Lucas", "Clínica Equilíbrio"],
  dentistas: ["Odonto Sorriso", "Consultório Odontológico Sorria", "Clínica Dental Prime", "Odontologia Bem Sorrir", "Dentista Dra. Ana Paula"],
  academias: ["Academia Corpo em Forma", "Studio Fitness Pro", "Academia Força Total", "Academia Energia", "CrossBox Arena"],
  fotografos: ["Estúdio Luz & Arte", "Fotografia Olhar Único", "Clique Mágico Fotografia", "Estúdio Momentos", "Foto Retratos da Cidade"],
  decoradores: ["Decorações Encanto", "Ateliê Festa Linda", "Decor & Cia Eventos", "Arte em Balões", "Decorações Sonho Real"],
  buffets: ["Buffet Castelo Encantado", "Buffet Festa Feliz", "Buffet Sabor & Festa", "Espaço de Festas Primavera", "Buffet Estrela"],
  "lojas de roupas": ["Boutique Elegance", "Loja Moda & Estilo", "Closet da Maria", "Loja Jeans Point", "Boutique Charme"],
  imobiliarias: ["Imobiliária Casa Nova", "Imóveis Horizonte", "Imobiliária Chave de Ouro", "Lar Doce Lar Imóveis", "Imobiliária Central"],
  oficinas: ["Auto Center Motor Forte", "Oficina Mecânica do Tião", "Mecânica Rápida", "Oficina Pit Stop", "Funilaria e Pintura Brilho"],
  "empresas de eventos": ["Eventos Celebrar", "Produtora Grande Festa", "Cerimonial Encanto", "Eventos Momento Único", "Agência Festejar"],
  "empresas de construcao": ["Construtora Alicerce", "Construções Pedra Forte", "Engenharia Base Sólida", "Construtora Novo Lar", "Reformas & Cia"],
  "profissionais autonomos": ["Eletricista Carlos", "Encanador Rápido", "Pintor Marcos Silva", "Marido de Aluguel", "Jardineiro Verde Vida"],
};

const STREETS = ["Rua Voluntários da Franca", "Avenida Brasil", "Rua Marechal Deodoro", "Rua São Sebastião", "Avenida Paulista", "Rua XV de Novembro", "Rua Sete de Setembro", "Avenida Santos Dumont"];
const NEIGHBORHOODS = ["Centro", "Jardim América", "Vila Nova", "Jardim Paulista", "São José", "Santa Cruz"];

function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function slug(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function generateDemoPlaces(params: SearchParams, now = new Date()): RawPlace[] {
  const perNiche = Math.max(1, Math.ceil(fetchLimit(params) / params.niches.length));
  const places: RawPlace[] = [];

  for (const niche of params.niches) {
    const rand = seededRandom(`${fold(params.city)}|${params.state}|${fold(niche)}`);
    const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
    const names = PREFIXES[fold(niche)] ?? [`${niche} Exemplo`];

    for (let i = 0; i < perNiche; i++) {
      const baseName = names[i % names.length];
      const name = i < names.length ? baseName : `${baseName} ${Math.floor(i / names.length) + 1}`;
      const outsideCity = rand() < 0.08;
      const city = outsideCity ? "Cidade Vizinha" : params.city;
      const street = rand() < 0.9 ? `${pick(STREETS)}, ${Math.floor(rand() * 2000) + 10}` : null;
      const neighborhood = pick(NEIGHBORHOODS);
      const postalCode = rand() < 0.8 ? `14${String(Math.floor(rand() * 1000)).padStart(3, "0")}-000` : null;

      const phoneRoll = rand();
      // Números com prefixo 90000/3000-0 não pertencem a clientes reais: servem só para testar os links.
      const suffix = String(Math.floor(rand() * 10000)).padStart(4, "0");
      const phone = phoneRoll < 0.55 ? `(16) 90000-${suffix}` : phoneRoll < 0.85 ? `(16) 3000-${suffix}` : null;

      const siteRoll = rand();
      const website =
        params.onlyNoSite || siteRoll < 0.45 ? null : siteRoll < 0.6 ? `https://www.instagram.com/${slug(name)}.demo/` : `https://www.${slug(name)}.example`;

      const hasReviews = rand() < 0.9;
      places.push({
        title: name,
        categoryName: niche,
        searchString: niche,
        address: [street, neighborhood, `${city} - ${params.state}`, postalCode].filter(Boolean).join(", "),
        street,
        neighborhood,
        city,
        state: params.state,
        postalCode,
        countryCode: "BR",
        phone,
        phoneUnformatted: phone ? `+55${phone.replace(/\D/g, "")}` : null,
        website,
        totalScore: hasReviews ? Math.round((3.2 + rand() * 1.8) * 10) / 10 : null,
        reviewsCount: hasReviews ? Math.floor(rand() * 180) : 0,
        temporarilyClosed: rand() < 0.03,
        permanentlyClosed: false,
        placeId: `demo-${slug(params.city)}-${slug(niche)}-${i}`,
        scrapedAt: now.toISOString(),
      });
    }
  }
  return places;
}
