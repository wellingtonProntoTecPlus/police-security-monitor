import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@police.com",
      name: "Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

function createOperatorContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "operator-user",
      email: "operator@police.com",
      name: "Operador",
      loginMethod: "manus",
      role: "operator",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

function createSupervisorContext(): TrpcContext {
  return {
    user: {
      id: 3,
      openId: "supervisor-user",
      email: "supervisor@police.com",
      name: "Supervisor",
      loginMethod: "local",
      role: "supervisor",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createPartnerContext(): TrpcContext {
  return {
    user: {
      id: 4,
      openId: "partner-user",
      email: "partner@police.com",
      name: "Parceiro",
      loginMethod: "local",
      role: "partner",
      partnerId: 99,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("appRouter", () => {
  describe("auth.me", () => {
    it("returns null for unauthenticated user", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.me();
      expect(result).toBeNull();
    });

    it("returns user for authenticated user", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.me();
      expect(result).toBeDefined();
      expect(result?.name).toBe("Admin");
      expect(result?.role).toBe("admin");
    });
  });

  describe("contactIdCode.list", () => {
    it("exige autenticação", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.contactIdCode.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("dashboard.stats", () => {
    it("bloqueia acesso sem login", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.dashboard.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("allows operator access", async () => {
      const ctx = createOperatorContext();
      const caller = appRouter.createCaller(ctx);
      try {
        const result = await caller.dashboard.stats();
        expect(result).toHaveProperty("activeConnections");
        expect(result).toHaveProperty("pendingEvents");
        expect(result).toHaveProperty("eventsPerMin");
        expect(result).toHaveProperty("totalClients");
      } catch (e: any) {
        // DB not available in test is acceptable
        expect(e.message).toContain("Database");
      }
    });
  });

  describe("finalization", () => {
    it("exige autenticação para listar finalizações", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.finalization.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("hierarquias", () => {
    it("permite que Administrador consulte os usuários", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(caller.systemUser.list()).resolves.toEqual(expect.any(Array));
    });

    it("bloqueia operadores na gestão de usuários", async () => {
      const caller = appRouter.createCaller(createOperatorContext());
      await expect(caller.systemUser.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("permite Supervisor consultar finalizações, mas não gerenciar usuários", async () => {
      const caller = appRouter.createCaller(createSupervisorContext());
      await expect(caller.finalization.list()).resolves.toEqual(expect.any(Array));
      await expect(caller.systemUser.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("bloqueia Parceiro no dashboard operacional", async () => {
      const caller = appRouter.createCaller(createPartnerContext());
      await expect(caller.dashboard.stats()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("bloqueia acesso sem login aos módulos operacionais protegidos", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(caller.monitoredClient.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});
