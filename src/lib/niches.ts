/** Nichos sugeridos, agrupados por categoria para facilitar a escolha. */
export const NICHE_GROUPS = [
  {
    label: "Alimentação",
    niches: ["Restaurantes", "Pizzarias", "Hamburguerias", "Lanchonetes", "Docerias", "Padarias", "Açaiterias", "Sorveterias", "Cafeterias", "Marmitarias"],
  },
  {
    label: "Beleza e bem-estar",
    niches: ["Salões de beleza", "Barbearias", "Clínicas de estética", "Manicures e nail designers", "Estúdios de tatuagem", "Academias", "Studios de pilates"],
  },
  {
    label: "Saúde",
    niches: ["Clínicas", "Dentistas", "Fisioterapeutas", "Psicólogos", "Nutricionistas", "Clínicas veterinárias"],
  },
  {
    label: "Eventos e festas",
    niches: ["Empresas de eventos", "Buffets", "Decoradores", "Fotógrafos"],
  },
  {
    label: "Comércio",
    niches: ["Lojas de roupas", "Óticas", "Floriculturas", "Pet shops", "Lojas de móveis"],
  },
  {
    label: "Casa e construção",
    niches: ["Empresas de construção", "Imobiliárias", "Arquitetos", "Marcenarias", "Vidraçarias", "Serralherias"],
  },
  {
    label: "Automotivo",
    niches: ["Oficinas", "Lava-rápidos", "Autopeças"],
  },
  {
    label: "Serviços",
    niches: ["Advogados", "Contabilidades", "Escolas de idiomas", "Autoescolas", "Lavanderias", "Profissionais autônomos"],
  },
] as const;

export const POPULAR_NICHES: readonly string[] = NICHE_GROUPS.flatMap((g) => g.niches);

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
