export const AUTH_SESSION_VALIDATION_TIMEOUT_MS = 3_500;

export class AuthSessionValidationTimeoutError extends Error {
  constructor() {
    super("A validação da sessão demorou mais que o permitido.");
    this.name = "AuthSessionValidationTimeoutError";
  }
}

/**
 * A sessão operacional só é aceita depois de confirmada no banco, pois a
 * revogação em outro computador precisa ser imediata. Este limite impede que
 * uma oscilação do banco deixe a aplicação inteira em carregamento infinito.
 */
export async function withAuthSessionValidationTimeout<T>(
  operation: Promise<T>,
  timeoutMs = AUTH_SESSION_VALIDATION_TIMEOUT_MS,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new AuthSessionValidationTimeoutError()),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
