const base = {
  fabricante: "INTELBRAS",
  isUniversal: false,
  abreTela: 0,
  fechaAutomatico: 1,
  fechaComRestauracao: 0,
  codigoRestauracao: "",
  tempoEsperaSegundos: 0,
  prioridade: 5,
  category: "arm_disarm",
  priority: "low",
};

export const intelbrasContactIdRecords = [
  {
    ...base,
    code: "407",
    qualifier: "R",
    description: "Armado por aplicativo",
    tipo: "arme",
    cor: "#10B981",
  },
  {
    ...base,
    code: "407",
    qualifier: "E",
    description: "Desarmado por aplicativo",
    tipo: "desarme",
    cor: "#F97316",
  },
  {
    ...base,
    code: "403",
    qualifier: "E",
    description: "Auto-desativação (Desarme automático)",
    tipo: "desarme",
    cor: "#F97316",
  },
  {
    ...base,
    code: "403",
    qualifier: "R",
    description: "Auto-ativação (Arme automático)",
    tipo: "arme",
    cor: "#10B981",
  },
];
