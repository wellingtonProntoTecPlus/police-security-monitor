import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";

describe("getSessionCookieOptions", () => {
  it("usa SameSite=Lax sem Secure para acesso HTTP por IP", () => {
    const options = getSessionCookieOptions({ protocol: "http", headers: {} } as any);

    expect(options).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("usa SameSite=None com Secure atrás de HTTPS", () => {
    const options = getSessionCookieOptions({ protocol: "http", headers: { "x-forwarded-proto": "https" } } as any);

    expect(options).toMatchObject({
      sameSite: "none",
      secure: true,
    });
  });
});
