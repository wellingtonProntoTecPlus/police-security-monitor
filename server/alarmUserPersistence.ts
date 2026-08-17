export type AlarmUserWrite = {
  id?: number;
  alarmSystemId: number;
  userNumber: number;
  name: string;
  phone?: string | null;
  password?: string | null;
  counterPassword?: string | null;
  coercionPassword?: string | null;
};

export function verifyPersistedAlarmUser(
  saved: AlarmUserWrite | undefined,
  expected: Pick<AlarmUserWrite, "alarmSystemId" | "userNumber" | "name"> & Partial<Pick<AlarmUserWrite, "password" | "counterPassword" | "coercionPassword">>,
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

  for (const credential of ["password", "counterPassword", "coercionPassword"] as const) {
    if (expected[credential] !== undefined && saved[credential] !== expected[credential]) {
      throw new Error("Credenciais do usuário do painel não foram gravadas corretamente.");
    }
  }

  return saved;
}
