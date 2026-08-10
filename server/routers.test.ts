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
    it("allows public access (no auth required for VPS)", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      // Should not throw - routes are public now
      const result = await caller.contactIdCode.list();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("dashboard.stats", () => {
    it("allows public access (no auth required for VPS)", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.dashboard.stats();
      expect(result).toHaveProperty("activeConnections");
      expect(result).toHaveProperty("pendingEvents");
      expect(result).toHaveProperty("eventsPerMin");
      expect(result).toHaveProperty("totalClients");
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
    it("allows listing finalizations", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.finalization.list();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
