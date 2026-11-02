export const remoteCommandCredentialKinds = [
  "jfl_master",
  "jfl_installer",
  "intelbras_master",
  "intelbras_installer",
  "intelbras_remote_configuration",
  "vetti_installer",
  "vetti_command_user",
  "compatec_transport",
] as const;

export type RemoteCommandCredentialKind = typeof remoteCommandCredentialKinds[number];

/** Segurança: o fluxo físico AMT-8000 fica bloqueado até validar F0F0/401E com Senha Master. */
export const INTELBRAS_PHYSICAL_COMMAND_ENABLED = false;
export const INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE = "Comando físico AMT-8000 bloqueado: o fluxo antigo usa Senha de Acesso Remoto para programação, não Senha Master. O comando 401E com autenticação Master ainda não está implementado. A simulação não transmite.";

export type RemoteCommandCredentialProfile = {
  kind: RemoteCommandCredentialKind;
  label: string;
  help: string;
  supportsRemoteCommand?: boolean;
};

export function getRemoteCommandCredentialProfiles(brand: string): RemoteCommandCredentialProfile[] {
  if (brand === "JFL") return [
    { kind: "jfl_master", label: "Senha Master (Usuário 0)", help: "Usada nos comandos e registrada no monitoramento como Usuário 0.", supportsRemoteCommand: true },
    { kind: "jfl_installer", label: "Senha de Instalador", help: "Usada para acessar o painel no Programador JFL e para programações da central." },
  ];
  if (brand === "INTELBRAS") return [
    { kind: "intelbras_master", label: "Senha Master (Usuário 0)", help: "Credencial do usuário Master do painel. Deve ser usada para Arme/Desarme físico AMT-8000 quando o fluxo correto estiver habilitado; o envio físico está temporariamente bloqueado.", supportsRemoteCommand: true },
    { kind: "intelbras_installer", label: "Senha de Instalador", help: "Usada para programações pelo teclado da central." },
    { kind: "intelbras_remote_configuration", label: "Senha de Acesso Remoto / Configuração", help: "Credencial separada para acesso remoto/configuração. Não usar como Senha Master para Arme/Desarme AMT-8000." },
  ];
  if (brand === "VETTI") return [
    { kind: "vetti_installer", label: "Senha de Instalador", help: "Credencial técnica de acesso e programação da central Vetti." },
    { kind: "vetti_command_user", label: "Senha do Usuário de Comando", help: "Usada para arme e desarme. Os dois primeiros dígitos definem o usuário Vetti derivado.", supportsRemoteCommand: true },
  ];
  if (brand === "COMPATEC") return [
    { kind: "compatec_transport", label: "Chave ou senha de transporte", help: "Somente se exigida pela rota MicroBus homologada para este módulo.", supportsRemoteCommand: true },
  ];
  return [];
}

/** A Vetti deriva o usuário como prefixo 3 seguido dos dois primeiros dígitos da senha de comando. */
export function deriveVettiCommandUser(commandPassword: string) {
  const digits = commandPassword.replace(/\D/g, "");
  if (!/^\d{4}(\d{2})?$/.test(digits)) throw new Error("A senha de comando Vetti deve ter 4 ou 6 dígitos numéricos");
  return `3${digits.slice(0, 2)}`;
}
