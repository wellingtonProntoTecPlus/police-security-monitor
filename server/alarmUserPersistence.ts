export type AlarmUserWrite = {
  id?: number;
  alarmSystemId: number;
  userNumber: number;
  name: string;
  phone?: string | null;
};

export function verifyPersistedAlarmUser(
  saved: AlarmUserWrite | undefined,
  expected: Pick<AlarmUserWrite, "alarmSystemId" | "userNumber" | "name">,
) {
  if (!saved) {
    throw new Error("Usuário do painel não foi gravado. Tente novamente.");
  }

  if (
    saved.alarmSystemId !== expected.alarmSystemId ||
    saved.userNumber !== expected.userNumber ||
    saved.name !== expected.name
  ) {
    throw new Error("Usuário do painel foi gravado com vínculo diferente do solicitado.");
  }

  return saved;
}
