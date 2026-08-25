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
    { kind: "intelbras_master", label: "Senha Master (Usuário 0)", help: "Usada para comandos e registrada no monitoramento como Usuário 0.", supportsRemoteCommand: true },
    { kind: "intelbras_installer", label: "Senha de Instalador", help: "Usada para programações pelo teclado da central." },
    { kind: "intelbras_remote_configuration", label: "Senha de Configuração Remota", help: "Usada na programação remota da central Intelbras." },
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
