const base = {
  fabricante: "RADIOENGE",
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

const restore = (code, description) => record(
  code, "R", description, "restauracao", "#3B82F6", 0, 5, "restore", "low",
);

const fault = (code, description, restorationCode = "", prioridade = 3) => record(
  code, "E", description, "tecnico", "#F59E0B", 1, prioridade, "fault",
  prioridade <= 1 ? "critical" : prioridade === 2 ? "high" : "medium",
  restorationCode ? { fechaComRestauracao: 1, codigoRestauracao: restorationCode } : {},
);

const system = (code, description, qualifier = "E", abreTela = 0, prioridade = 5, category = "system", priority = "low") => record(
  code, qualifier, description, "sistema", "#8B5CF6", abreTela, prioridade, category, priority,
  { fechaAutomatico: abreTela ? 0 : 1 },
);

const arm = (code, qualifier, description) => record(
  code, qualifier, description, qualifier === "R" ? "arme" : "desarme",
  qualifier === "R" ? "#10B981" : "#F97316", 0, 5, "arm_disarm", "low",
  { fechaAutomatico: 1 },
);

function pairedFault(code, description, restorationDescription, prioridade = 3) {
  return [fault(code, description, code, prioridade), restore(code, restorationDescription)];
}

export const radioengeContactIdRecords = [
  alarm("100", "Alarme médico"),
  alarm("110", "Alarme de incêndio"),
  alarm("120", "Alarme 24h de pânico"),
  alarm("121", "Desarme com coação"),
  alarm("126", "Alarme 24h hold up"),
  alarm("133", "Alarme 24h de furto"),
  alarm("138", "Acionamento de acelerômetro"),
  alarm("148", "Detecção de abertura"),
  alarm("151", "Alarme 24h de gás"),
  alarm("152", "Alarme 24h de refrigeração"),
  alarm("153", "Alarme 24h de aquecimento"),
  alarm("154", "Alarme 24h de água"),
  alarm("164", "Alarme 24h de campainha"),
  alarm("170", "Disparo de acelerômetro 24h"),

  fault("301", "Falha na alimentação da central"),
  fault("302", "Bateria de alimentação baixa"),
  fault("309", "Falha na bateria"),
  fault("311", "Bateria LiPo ausente"),
  fault("312", "Sobrecarga na saída AUX"),
  fault("321", "Sirene em curto (onboard ou sem fio)"),
  fault("322", "Sirene aberta (onboard ou sem fio)"),
  fault("338", "Bateria baixa de módulo, sirene, teclado ou expansor"),
  fault("340", "Falha de bateria de módulo, sirene, teclado ou expansor"),
  fault("342", "Falha de AC de módulo, sirene, teclado ou expansor"),
  fault("353", "Falha de comunicação com o Rádio Alarme"),
  fault("361", "Falha de internet (WebReceiver, Cloud/GPRS ou monitoramento GPRS)"),
  fault("362", "Perda de vídeo no canal vinculado à zona"),
  fault("363", "Mascaramento de vídeo no canal vinculado à zona"),
  fault("370", "Zona em curto"),
  ...pairedFault("381", "Falha de supervisão (sensor, sirene, teclado, expansor ou DVR)", "Restauração da falha de supervisão"),
  ...pairedFault("383", "Tamper de zona", "Restauração do tamper de zona"),
  fault("384", "Bateria baixa do sensor"),

  system("305", "Reset do sistema", "R"),
  system("306", "Alteração da programação do painel"),
  system("313", "Reset de fábrica", "E", 1, 2, "system", "high"),
  arm("403", "E", "Autoarme da partição"),
  arm("409", "R", "Arme por keyswitch"),
  arm("409", "E", "Desarme por keyswitch"),
  system("410", "Configuração remota da central"),
  system("411", "Configuração remota via Webreceiver"),
  system("412", "Configuração remota via Cloud"),
  system("413", "Configuração remota via Rádio"),
  alarm("422", "Acionamento manual da PGM"),
  fault("455", "Falha de autoarme"),
  arm("456", "R", "Arme parcial (Sleep/Stay)"),
  arm("456", "E", "Desarme de partição que estava parcialmente armada"),
  system("570", "Zona anulada (Bypass)"),
  restore("570", "Zona reativada (restauração do Bypass)"),
  system("607", "Ativação do modo de teste de sensores"),
  ...pairedFault("622", "Buffer de eventos atingiu 50%", "Buffer de eventos restaurado abaixo de 50%"),
  ...pairedFault("623", "Buffer de eventos atingiu 90%", "Buffer de eventos restaurado abaixo de 90%", 2),
  ...pairedFault("624", "Buffer de eventos cheio", "Buffer de eventos restaurado abaixo da capacidade máxima", 1),
  system("850", "Reset manual do buffer de eventos"),
];
