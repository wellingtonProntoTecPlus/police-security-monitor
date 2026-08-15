const base = {
  fabricante: "JFL",
  isUniversal: false,
  fechaAutomatico: 0,
  fechaComRestauracao: 0,
  codigoRestauracao: "",
};

function record(code, qualifier, description, tipo, cor, abreTela, prioridade, category, priority, extra = {}) {
  return { ...base, code, qualifier, description, tipo, cor, abreTela, prioridade, category, priority, ...extra };
}

const alarm = (code, description, restorationCode = "") => record(
  code, "E", description, "alarme", "#EF4444", 1, 1, "alarm", "critical",
  restorationCode ? { fechaComRestauracao: 1, codigoRestauracao: restorationCode } : {},
);
const restore = (code, description) => record(code, "R", description, "restauracao", "#3B82F6", 0, 5, "restore", "low");
const fault = (code, description, restorationCode = "") => record(
  code, "E", description, "tecnico", "#F59E0B", 1, 3, "fault", "medium",
  restorationCode ? { fechaComRestauracao: 1, codigoRestauracao: restorationCode } : {},
);
const system = (code, description) => record(code, "E", description, "sistema", "#8B5CF6", 0, 5, "system", "low", { fechaAutomatico: 1 });
const test = (code, description) => record(code, "E", description, "teste", "#6B7280", 0, 5, "test", "low", { fechaAutomatico: 1 });
const arm = (code, qualifier, description) => record(code, qualifier, description, qualifier === "R" ? "arme" : "desarme", qualifier === "R" ? "#10B981" : "#F97316", 0, 5, "arm_disarm", "low", { fechaAutomatico: 1 });

function pairedAlarm(code, description, restorationDescription) {
  return [alarm(code, description, code), restore(code, restorationDescription)];
}

function pairedFault(code, description, restorationDescription) {
  return [fault(code, description, code), restore(code, restorationDescription)];
}

export const jflContactIdRecords = [
  alarm("100", "Emergência médica"),
  alarm("110", "Incêndio"),
  alarm("120", "Pânico"),
  alarm("121", "Coação"),
  alarm("122", "Pânico silencioso"),
  alarm("123", "Pânico audível"),
  ...pairedAlarm("130", "Disparo da zona", "Restauração do disparo da zona"),
  ...pairedAlarm("134", "Alarme de porta aberta", "Restauração do alarme de porta aberta"),
  ...pairedAlarm("137", "Alarme de zona tipo tamper", "Restauração do alarme de zona tipo tamper"),
  ...pairedFault("139", "Inatividade de movimento da zona", "Restauração de movimento da zona"),
  ...pairedFault("300", "Problema da saída auxiliar", "Restauração do problema da saída auxiliar"),
  ...pairedFault("301", "Falta de AC", "Restauração da falta de AC"),
  ...pairedFault("302", "Problema da bateria da central", "Restauração do problema da bateria da central"),
  system("305", "Reset do sistema"),
  system("306", "Alteração de programação"),
  fault("311", "Bateria morta"),
  ...pairedFault("312", "Problema de curto de barramento", "Restauração de curto de barramento"),
  ...pairedFault("321", "Problema de sirene", "Restauração do problema de sirene"),
  ...pairedFault("322", "Problema de supervisão de sirene", "Restauração da supervisão de sirene"),
  ...pairedFault("330", "Problema de teclado", "Restauração do problema de teclado"),
  ...pairedFault("333", "Problema da supervisão PGM", "Restauração da supervisão PGM"),
  ...pairedFault("338", "Problema de bateria fraca de controle remoto", "Restauração de bateria fraca de controle remoto"),
  ...pairedFault("342", "Problema de AC do teclado sem fio", "Restauração de AC do teclado sem fio"),
  ...pairedFault("345", "Problema de bateria fraca do teclado sem fio", "Restauração de bateria fraca do teclado sem fio"),
  ...pairedFault("346", "Problema de tamper de teclado", "Restauração de tamper de teclado"),
  ...pairedFault("351", "Problema de linha telefônica", "Restauração do problema de linha telefônica"),
  ...pairedFault("359", "Problema de Wi-Fi", "Restauração de Wi-Fi"),
  ...pairedFault("360", "Problema de GPRS", "Restauração do problema de GPRS"),
  ...pairedFault("361", "Problema de Ethernet", "Restauração do problema Ethernet"),
  ...pairedFault("362", "Problema de SMS", "Restauração do problema de SMS"),
  ...pairedFault("363", "Problema de módulo de celular", "Restauração do problema de módulo de celular"),
  ...pairedFault("364", "Problema de SIM card", "Restauração do problema de SIM card"),
  ...pairedFault("366", "Problema de módulo de Ethernet", "Restauração do problema de módulo de Ethernet"),
  ...pairedFault("369", "Problema de cabo de rede", "Restauração do cabo de rede"),
  ...pairedFault("370", "Curto de zona", "Restauração do curto de zona"),
  ...pairedFault("381", "Problema de supervisão do sensor", "Restauração de supervisão do sensor"),
  ...pairedFault("383", "Problema de tamper do sensor", "Restauração do problema de tamper do sensor"),
  ...pairedFault("384", "Problema de bateria fraca dos sensores sem fio", "Restauração de bateria fraca dos sensores sem fio"),
  ...pairedFault("391", "Problema de supervisão do dispositivo de pânico", "Restauração de supervisão do dispositivo de pânico"),
  system("410", "Acesso remoto à programação por computador"),
  system("412", "Usuário logado via aplicativo"),
  system("417", "Nova atualização de firmware encontrada"),
  system("419", "Usuário registrado para receber notificação"),
  alarm("421", "Acesso negado após cinco tentativas de senha"),
  ...pairedAlarm("422", "PGM acionada pelo usuário", "PGM desacionada pelo usuário"),
  system("429", "Início de ronda"),
  system("430", "Fim de ronda"),
  fault("454", "Falha ao armar"),
  system("570", "Zona inibida (Bypass)"),
  system("573", "Zona autoanulada"),
  ...pairedFault("578", "Zona armada forçada", "Restauração da zona armada forçada"),
  fault("579", "Tentativa de arme com zona aberta"),
  test("602", "Teste periódico"),
  system("611", "Ronda OK"),
  fault("612", "Falhou ronda"),
  system("627", "Entrou na programação"),
  system("628", "Saiu da programação"),
  arm("401", "R", "Arme"),
  arm("401", "E", "Desarme"),
  arm("403", "R", "Autoarme por horário programado"),
  arm("403", "E", "Autodesarme por horário programado"),
  arm("404", "R", "Autoarme por não movimento"),
  arm("407", "R", "Arme remoto"),
  arm("407", "E", "Desarme remoto"),
  arm("408", "R", "Arme rápido"),
  arm("409", "R", "Arme por controle remoto ou entrada Liga"),
  arm("409", "E", "Desarme por controle remoto ou entrada Liga"),
  arm("441", "R", "Arme Stay"),
  system("464", "Autoarme adiado"),
];
