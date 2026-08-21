import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure as coreAdminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { sdk } from "./_core/sdk";
import { ONE_YEAR_MS } from "@shared/const";
import { createLocalSessionToken } from "./_core/localSession";

// ============================================================
// ADMIN PROCEDURE
// ============================================================
const adminProcedure = coreAdminProcedure;

const supervisorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user || !["admin", "supervisor"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso permitido apenas para Administrador ou Supervisor" });
  }
  return next({ ctx });
});

const operatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user || !["admin", "supervisor", "operator"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário não possui permissão operacional" });
  }
  return next({ ctx });
});

async function assertPartnerCompanyScope(ctx: any, partnerCompanyId: number) {
  if (ctx.user?.role === "partner" && ctx.user.partnerId !== partnerCompanyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Empresa parceira não permitida para este usuário" });
  }
}

async function assertPartnerClientScope(ctx: any, clientId: number) {
  if (ctx.user?.role !== "partner") return;
  const client = await db.getClient(clientId);
  if (!client || client.partnerCompanyId !== ctx.user.partnerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cliente não pertence à sua empresa parceira" });
  }
}

async function assertPartnerSystemScope(ctx: any, alarmSystemId: number) {
  if (ctx.user?.role !== "partner") return;
  const system = await db.getAlarmSystem(alarmSystemId);
  if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema de alarme não encontrado" });
  await assertPartnerClientScope(ctx, system.clientId);
}

// ============================================================
// APP ROUTER
// ============================================================
export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    login: publicProcedure.input(z.object({
      email: z.string().min(1),
      password: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      const user = await db.getUserByEmail(input.email);
      if (!user) throw new Error("Email ou senha inválidos");
      if (!user.password) throw new Error("Usuário sem senha cadastrada");
      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) throw new Error("Email ou senha inválidos");
      // Sessão própria: funciona também na VPS sem depender do OAuth do Manus.
      const sessionToken = createLocalSessionToken({ id: user.id, openId: user.openId });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      // Update lastSignedIn
      await db.updateUserLastSignedIn(user.id);
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),
    verifyPassword: protectedProcedure.input(z.object({
      password: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user?.password) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário sem senha cadastrada" });
      }
      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha inválida" });
      }
      return { success: true } as const;
    }),
    changeOwnPassword: protectedProcedure.input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6, "A nova senha deve ter no mínimo 6 caracteres"),
    })).mutation(async ({ input, ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user?.password) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário sem senha cadastrada" });
      const valid = await bcrypt.compare(input.currentPassword, user.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual inválida" });
      await db.updateSystemUser(ctx.user.id, { password: await bcrypt.hash(input.newPassword, 10) });
      return { success: true } as const;
    }),
  }),

  // ============================================================
  // MANAGING COMPANIES
  // ============================================================
  managingCompany: router({
    list: adminProcedure.query(() => db.listManagingCompanies()),
    get: adminProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getManagingCompany(input.id)),
    create: adminProcedure.input(z.object({
      name: z.string().min(1),
      cnpj: z.string().min(14),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      zipCode: z.string().optional(),
      logoUrl: z.string().optional(),
      primaryColor: z.string().optional(),
    })).mutation(({ input }) => db.createManagingCompany(input)),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      cnpj: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      zipCode: z.string().optional(),
      logoUrl: z.string().optional(),
      primaryColor: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateManagingCompany(id, data);
    }),
  }),

  // ============================================================
  // PARTNER COMPANIES
  // ============================================================
  partnerCompany: router({
    list: protectedProcedure.input(z.object({ managingCompanyId: z.number().optional() }).optional()).query(({ input, ctx }) => {
      if (ctx.user.role === "partner") {
        if (!ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
        return db.getPartnerCompany(ctx.user.partnerId).then(partner => partner ? [partner] : []);
      }
      return db.listPartnerCompanies(input?.managingCompanyId);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerCompanyScope(ctx, input.id);
      return db.getPartnerCompany(input.id);
    }),
    create: adminProcedure.input(z.object({
      managingCompanyId: z.number(),
      name: z.string().min(1),
      cnpj: z.string().min(14),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      zipCode: z.string().optional(),
      logoUrl: z.string().optional(),
      primaryColor: z.string().optional(),
    })).mutation(({ input }) => db.createPartnerCompany(input)),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deletePartnerCompany(input.id)),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      cnpj: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      logoUrl: z.string().optional(),
      primaryColor: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updatePartnerCompany(id, data);
    }),
  }),

  // ============================================================
  // CLIENTS
  tacticalMobile: router({
    list: protectedProcedure.input(z.object({ partnerCompanyId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerCompanyScope(ctx, input.partnerCompanyId);
      return db.listTacticalMobiles(input.partnerCompanyId);
    }),
    create: operatorProcedure.input(z.object({
      partnerCompanyId: z.number(), name: z.string().min(1), phone: z.string().optional(), whatsapp: z.string().optional(),
      vehicle: z.string().optional(), plate: z.string().optional(), notes: z.string().optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerCompanyScope(ctx, input.partnerCompanyId);
      return db.createTacticalMobile(input);
    }),
    update: operatorProcedure.input(z.object({
      id: z.number(), name: z.string().min(1).optional(), phone: z.string().optional(), whatsapp: z.string().optional(),
      vehicle: z.string().optional(), plate: z.string().optional(), notes: z.string().optional(), isActive: z.boolean().optional(),
    })).mutation(({ input }) => { const { id, ...data } = input; return db.updateTacticalMobile(id, data); }),
    delete: operatorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTacticalMobile(input.id)),
  }),

  // ============================================================
  // TÁTICO MÓVEL

  // ============================================================
  // CLIENTS
  // ============================================================
  monitoredClient: router({
    list: protectedProcedure.input(z.object({ partnerCompanyId: z.number().optional() }).optional()).query(({ input, ctx }) => {
      if (ctx.user.role === "partner") {
        if (!ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
        return db.listClients(ctx.user.partnerId);
      }
      return db.listClients(input?.partnerCompanyId);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const client = await db.getClient(input.id);
      if (ctx.user.role === "partner" && client?.partnerCompanyId !== ctx.user.partnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cliente não pertence à sua empresa parceira" });
      }
      return client;
    }),
    create: operatorProcedure.input(z.object({
      partnerCompanyId: z.number(),
      type: z.enum(["pf", "pj"]),
      name: z.string().min(1),
      fantasyName: z.string().optional(),
      document: z.string().min(11),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      number: z.string().optional(),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      zipCode: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(({ input }) => db.createClient(input)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      partnerCompanyId: z.number().optional(),
      type: z.enum(["pf", "pj"]).optional(),
      name: z.string().min(1).optional(),
      fantasyName: z.string().optional(),
      document: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      number: z.string().optional(),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      zipCode: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      notes: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateClient(id, data);
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteClient(input.id)),
  }),

  // ============================================================
  // CLIENT CONTACTS
  // ============================================================
  clientContact: router({
    list: protectedProcedure.input(z.object({ clientId: z.number(), alarmSystemId: z.number().optional() })).query(async ({ input, ctx }) => {
      await assertPartnerClientScope(ctx, input.clientId);
      if (input.alarmSystemId) await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listClientContacts(input.clientId, input.alarmSystemId);
    }),
    create: operatorProcedure.input(z.object({
      clientId: z.number(),
      alarmSystemId: z.number(),
      name: z.string().min(1),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      role: z.string().optional(),
      password: z.string().max(50).optional(),
      counterPassword: z.string().max(50).optional(),
      coercionPassword: z.string().max(50).optional(),
      priority: z.number().optional(),
    })).mutation(({ input }) => db.createClientContact(input)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      alarmSystemId: z.number().optional(),
      name: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      role: z.string().optional(),
      password: z.string().max(50).optional(),
      counterPassword: z.string().max(50).optional(),
      coercionPassword: z.string().max(50).optional(),
      priority: z.number().optional(),
      isActive: z.boolean().optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateClientContact(id, data);
    }),
    delete: operatorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteClientContact(input.id)),
  }),

  // ============================================================
  // ALARM SYSTEMS
  // ============================================================
  alarmSystem: router({
    list: protectedProcedure.input(z.object({ clientId: z.number().optional() }).optional()).query(async ({ input, ctx }) => {
      if (ctx.user.role === "partner" && !input?.clientId) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o cliente para consultar sistemas" });
      if (input?.clientId) await assertPartnerClientScope(ctx, input.clientId);
      return db.listAlarmSystems(input?.clientId);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.id);
      return db.getAlarmSystem(input.id);
    }),
    getByAccount: protectedProcedure.input(z.object({ account: z.string() })).query(async ({ input, ctx }) => {
      const system = await db.getAlarmSystemByAccount(input.account);
      if (system) await assertPartnerSystemScope(ctx, system.id);
      return system;
    }),
    create: operatorProcedure.input(z.object({
      clientId: z.number(),
      account: z.string().min(4),
      brand: z.enum(["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"]),
      model: z.string().optional(),
      firmwareVersion: z.string().optional(),
      communicationType: z.enum(["ethernet", "gprs", "both"]).optional(),
      macAddress: z.string().max(6).optional(),
      imeiGprs: z.string().max(6).optional(),
      serialNumber: z.string().max(10).optional(),
      viawebCode: z.string().max(4).optional(),
      partitions: z.number().optional(),
      receiverPort: z.number().optional(),
      ipAddress: z.string().optional(),
      installDate: z.date().optional(),
      batteryDate: z.date().optional(),
      keepAliveMonitoringEnabled: z.boolean().optional(),
      keepAliveExpectedIntervalSeconds: z.number().int().min(1).max(86400).optional(),
      keepAliveFailureEventEnabled: z.boolean().optional(),
      keepAliveOfflineAfterMinutes: z.number().int().min(1).max(1440).optional(),
      keepAliveDisconnectAlertEnabled: z.boolean().optional(),
      keepAliveRepeatAlertEnabled: z.boolean().optional(),
      keepAliveRepeatAlertEveryMinutes: z.number().int().min(1).max(10080).optional(),
    })).mutation(({ input }) => db.createAlarmSystem(input)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      account: z.string().optional(),
      brand: z.enum(["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"]).optional(),
      model: z.string().optional(),
      firmwareVersion: z.string().optional(),
      communicationType: z.enum(["ethernet", "gprs", "both"]).optional(),
      macAddress: z.string().max(6).optional(),
      imeiGprs: z.string().max(6).optional(),
      serialNumber: z.string().max(10).optional(),
      viawebCode: z.string().max(4).optional(),
      partitions: z.number().optional(),
      receiverPort: z.number().optional(),
      ipAddress: z.string().optional(),
      isActive: z.boolean().optional(),
      installDate: z.date().optional(),
      batteryDate: z.date().optional(),
      keepAliveMonitoringEnabled: z.boolean().optional(),
      keepAliveExpectedIntervalSeconds: z.number().int().min(1).max(86400).optional(),
      keepAliveFailureEventEnabled: z.boolean().optional(),
      keepAliveOfflineAfterMinutes: z.number().int().min(1).max(1440).optional(),
      keepAliveDisconnectAlertEnabled: z.boolean().optional(),
      keepAliveRepeatAlertEnabled: z.boolean().optional(),
      keepAliveRepeatAlertEveryMinutes: z.number().int().min(1).max(10080).optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateAlarmSystem(id, data);
    }),
    startMaintenance: operatorProcedure.input(z.object({
      systemId: z.number(),
      incidentId: z.number().optional(),
      startAt: z.date(),
      endAt: z.date(),
      notes: z.string().max(2000).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.systemId);
      if (input.endAt <= input.startAt) throw new TRPCError({ code: "BAD_REQUEST", message: "O fim deve ser posterior ao início da manutenção" });
      await db.scheduleSystemMaintenance({
        systemId: input.systemId,
        startAt: input.startAt,
        endAt: input.endAt,
        notes: input.notes,
        operatorId: ctx.user.id,
      });
      await db.putSystemIncidentsInMaintenance({
        systemId: input.systemId,
        endAt: input.endAt,
        notes: `Sistema em manutenção de ${input.startAt.toLocaleString("pt-BR")} até ${input.endAt.toLocaleString("pt-BR")}${input.notes ? ` — ${input.notes}` : ""}`,
      });
      const maintenanceIncident = await db.ensureMaintenanceIncident({
        systemId: input.systemId,
        endAt: input.endAt,
        notes: `Sistema em manutenção de ${input.startAt.toLocaleString("pt-BR")} até ${input.endAt.toLocaleString("pt-BR")}${input.notes ? ` — ${input.notes}` : ""}`,
      });
      return { success: true, incidentId: maintenanceIncident.id } as const;
    }),
    endMaintenance: operatorProcedure.input(z.object({ systemId: z.number() })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.systemId);
      await db.endSystemMaintenance(input.systemId);
      await db.releaseMaintenanceIncidents(input.systemId, "Sistema retirado da manutenção pelo operador. Ocorrência retornada para atendimento.");
      return { success: true } as const;
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteAlarmSystem(input.id)),
  }),

  // ============================================================
  // ALARM ZONES
  // ============================================================
  alarmZone: router({
    list: protectedProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listAlarmZones(input.alarmSystemId);
    }),
    create: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      zoneNumber: z.number(),
      name: z.string().min(1),
      type: z.enum(["perimeter", "internal", "24h", "fire", "panic", "medical"]).optional(),
      partition: z.number().optional(),
    })).mutation(({ input }) => db.createAlarmZone(input)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      zoneNumber: z.number().optional(),
      name: z.string().optional(),
      type: z.enum(["perimeter", "internal", "24h", "fire", "panic", "medical"]).optional(),
      partition: z.number().optional(),
    })).mutation(({ input }) => { const { id, ...data } = input; return db.updateAlarmZone(id, data); }),
    delete: operatorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteAlarmZone(input.id)),
  }),

  // ============================================================
  // ALARM USERS
  // ============================================================
  alarmUser: router({
    list: protectedProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listAlarmUsers(input.alarmSystemId);
    }),
    create: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      userNumber: z.number().int().min(0),
      name: z.string().min(1),
      phone: z.string().optional(),
      password: z.string().optional(),
      counterPassword: z.string().optional(),
      coercionPassword: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.createAlarmUser(input);
    }),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      userNumber: z.number().int().min(0).optional(),
      name: z.string().optional(),
      phone: z.string().optional(),
      password: z.string().optional(),
      counterPassword: z.string().optional(),
      coercionPassword: z.string().optional(),
    })).mutation(({ input }) => { const { id, ...data } = input; return db.updateAlarmUser(id, data); }),
    delete: operatorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteAlarmUser(input.id)),
  }),

  // ============================================================
  // CAMERAS
  // ============================================================
  camera: router({
    list: protectedProcedure.input(z.object({ clientId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerClientScope(ctx, input.clientId);
      return db.listCameras(input.clientId);
    }),
    create: operatorProcedure.input(z.object({
      clientId: z.number(),
      name: z.string().min(1),
      rtspUrl: z.string().min(1),
      brand: z.string().optional(),
      model: z.string().optional(),
      location: z.string().optional(),
    })).mutation(({ input }) => db.createCamera(input)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      rtspUrl: z.string().optional(),
      brand: z.string().optional(),
      model: z.string().optional(),
      location: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateCamera(id, data);
    }),
    delete: operatorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteCamera(input.id)),
  }),

  // ============================================================
  // ALARM EVENTS
  // ============================================================
  alarmEvent: router({
    list: operatorProcedure.input(z.object({ limit: z.number().optional(), offset: z.number().optional() }).optional()).query(({ input }) => db.listAlarmEvents(input?.limit, input?.offset)),
    recent: operatorProcedure.input(z.object({ minutes: z.number().optional() }).optional()).query(({ input }) => db.getRecentEvents(input?.minutes)),
    createManual: operatorProcedure.input(z.object({
      account: z.string().min(1).max(10),
      alarmSystemId: z.number().optional(),
      clientId: z.number().optional(),
      brand: z.string().min(1).max(50),
      description: z.string().min(1).max(2000),
      priority: z.enum(["critical", "high", "medium", "low"]),
      receiverPort: z.number().optional(),
    })).mutation(async ({ input }) => {
      const system = await db.getAlarmSystemByManualAccount(input.account);
      const client = system ? await db.getClient(system.clientId) : undefined;
      const resolvedAccount = system?.account || input.account;
      const saved = await db.createAlarmEventWithOpenIncident({
        event: {
          account: resolvedAccount,
          alarmSystemId: system?.id || null,
          brand: system?.brand || input.brand,
          qualifier: "E",
          eventCode: "MANUAL",
          description: input.description,
          priority: input.priority,
          receiverPort: system?.receiverPort || input.receiverPort || null,
          remoteIp: "MANUAL",
          rawData: "Ocorrência criada manualmente pelo operador",
        },
        incident: {
          alarmSystemId: system?.id || null,
          clientId: client?.id || null,
          status: "waiting",
          priority: input.priority,
          notes: "Ocorrência manual criada pelo operador",
        },
      });
      return {
        id: saved.eventId,
        incidentId: saved.incidentId,
        account: resolvedAccount,
        alarmSystemId: system?.id || null,
        clientId: client?.id || null,
        clientName: client?.fantasyName || client?.name || null,
        brand: system?.brand || input.brand,
        incidentStatus: "waiting" as const,
      };
    }),
  }),

  // ============================================================
  // INCIDENTS
  // ============================================================
  incident: router({
    list: operatorProcedure.input(z.object({ status: z.string().optional() }).optional()).query(({ input }) => db.listIncidents(input?.status)),
    openQueue: operatorProcedure.query(() => db.listOpenQueueEvents()),
    get: operatorProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getIncident(input.id)),
    create: operatorProcedure.input(z.object({
      eventId: z.number(),
      alarmSystemId: z.number().optional(),
      clientId: z.number().optional(),
      priority: z.enum(["critical", "high", "medium", "low"]).optional(),
      notes: z.string().optional(),
    })).mutation(({ input, ctx }) => db.createIncident({ ...input, operatorId: ctx.user?.id || undefined })),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["waiting", "attending", "observing", "dispatched", "maintenance", "closed"]).optional(),
      notes: z.string().optional(),
      resolution: z.string().optional(),
      operatorId: z.number().optional(),
    })).mutation(({ input, ctx }) => {
      const { id, ...data } = input;
      if (data.status === 'dispatched') (data as any).dispatchedAt = new Date();
      if (data.status === 'closed') (data as any).closedAt = new Date();
      if (data.status === 'attending' && !data.operatorId) (data as any).operatorId = ctx.user.id;
      return db.updateIncident(id, data);
    }),
    observe: operatorProcedure.input(z.object({
      incidentId: z.number(),
      until: z.date(),
      notes: z.string().max(2000).optional(),
    })).mutation(({ input }) => db.putIncidentInObservation(input)),
  }),

  // ============================================================
  // CONTACT ID CODES
  // ============================================================
  contactIdCode: router({
    list: supervisorProcedure.query(() => db.listContactIdCodes()),
    get: operatorProcedure.input(z.object({ code: z.string() })).query(({ input }) => db.getContactIdDescription(input.code)),
  }),
  contactId: router({
    listByFabricante: supervisorProcedure.input(z.object({ fabricante: z.string() })).query(({ input }) => db.listContactIdByFabricante(input.fabricante)),
    create: supervisorProcedure.input(z.object({
      code: z.string().min(1),
      qualifier: z.string().default("E"),
      fabricante: z.string().min(1),
      isUniversal: z.boolean().default(false),
      description: z.string().min(1),
      tipo: z.string().default("alarme"),
      cor: z.string().default("#EF4444"),
      abreTela: z.number().default(1),
      fechaAutomatico: z.number().default(0),
      fechaComRestauracao: z.number().default(0),
      codigoRestauracao: z.string().default(""),
      tempoEsperaSegundos: z.number().default(0),
      prioridade: z.number().default(1),
    })).mutation(({ input }) => db.createContactId(input)),
    update: supervisorProcedure.input(z.object({
      id: z.number(),
      code: z.string().min(1),
      qualifier: z.string().default("E"),
      fabricante: z.string().min(1),
      isUniversal: z.boolean().default(false),
      description: z.string().min(1),
      tipo: z.string().default("alarme"),
      cor: z.string().default("#EF4444"),
      abreTela: z.number().default(1),
      fechaAutomatico: z.number().default(0),
      fechaComRestauracao: z.number().default(0),
      codigoRestauracao: z.string().default(""),
      tempoEsperaSegundos: z.number().default(0),
      prioridade: z.number().default(1),
    })).mutation(({ input }) => db.updateContactId(input.id, input)),
    delete: supervisorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteContactId(input.id)),
  }),

  // ============================================================
  // DASHBOARD
  // ============================================================
  dashboard: router({
    stats: operatorProcedure.query(() => db.getDashboardStats()),
    armDisarmStatus: operatorProcedure.query(() => db.getArmDisarmStatus()),
    recentAutoFinalizedArmDisarm: operatorProcedure.query(() => db.listRecentAutoFinalizedArmDisarmConfirmations()),
    connectionStatus: operatorProcedure.query(() => db.listSystemsConnectionStatus()),
  }),
  alarmPgm: router({
    list: protectedProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listAlarmPgms(input.alarmSystemId);
    }),
    create: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      pgmNumber: z.number().min(1).max(16),
      name: z.string().min(1),
      type: z.string().optional(),
    })).mutation(({ input }) => db.createAlarmPgm(input)),
  }),
  alarmSchedule: router({
    list: protectedProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listAlarmSchedules(input.alarmSystemId);
    }),
    create: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      partition: z.number().min(1).max(8).optional(),
      name: z.string().optional(),
      mondayArm: z.string().optional(), mondayDisarm: z.string().optional(),
      tuesdayArm: z.string().optional(), tuesdayDisarm: z.string().optional(),
      wednesdayArm: z.string().optional(), wednesdayDisarm: z.string().optional(),
      thursdayArm: z.string().optional(), thursdayDisarm: z.string().optional(),
      fridayArm: z.string().optional(), fridayDisarm: z.string().optional(),
      saturdayArm: z.string().optional(), saturdayDisarm: z.string().optional(),
      sundayArm: z.string().optional(), sundayDisarm: z.string().optional(),
    })).mutation(({ input }) => db.createAlarmSchedule(input)),
  }),
  clientProcedure: router({
    list: protectedProcedure.input(z.object({ clientId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerClientScope(ctx, input.clientId);
      return db.listClientProcedures(input.clientId);
    }),
    create: operatorProcedure.input(z.object({
      clientId: z.number(),
      title: z.string().min(1),
      description: z.string().min(1),
      priority: z.number().optional(),
    })).mutation(({ input }) => db.createClientProcedure(input)),
  }),
  partnerHoliday: router({
    list: protectedProcedure.input(z.object({ partnerCompanyId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerCompanyScope(ctx, input.partnerCompanyId);
      return db.listPartnerHolidays(input.partnerCompanyId);
    }),
    create: operatorProcedure.input(z.object({
      partnerCompanyId: z.number(),
      name: z.string().min(1),
      date: z.string().min(4),
      type: z.enum(["nacional", "municipal"]).optional(),
      
    })).mutation(({ input }) => db.createPartnerHoliday(input)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      date: z.string().min(4).optional(),
      type: z.enum(["nacional", "municipal"]).optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updatePartnerHoliday(id, data);
    }),
    delete: operatorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deletePartnerHoliday(input.id)),
  }),
  managingHoliday: router({
    list: adminProcedure.input(z.object({ managingCompanyId: z.number() })).query(({ input }) => db.listManagingHolidays(input.managingCompanyId)),
    create: adminProcedure.input(z.object({
      managingCompanyId: z.number(),
      name: z.string().min(1),
      date: z.string().min(4),
      type: z.enum(["nacional", "municipal"]).optional(),
      
    })).mutation(({ input }) => db.createManagingHoliday(input)),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteManagingHoliday(input.id)),
  }),
  occurrence: router({
    list: protectedProcedure.input(z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
      account: z.string().optional(),
      clientId: z.number().optional(),
      partnerCompanyId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      operatorName: z.string().optional(),
    }).optional()).query(({ input, ctx }) => {
      if (ctx.user.role === "partner") {
        if (!ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
        return db.listOccurrences({ ...(input || {}), partnerCompanyId: ctx.user.partnerId });
      }
      return db.listOccurrences(input || {});
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const occurrence = await db.getOccurrenceById(input.id);
      if (ctx.user.role === "partner" && occurrence?.partnerCompanyId !== ctx.user.partnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ocorrência não pertence à sua empresa parceira" });
      }
      return occurrence;
    }),
    create: operatorProcedure.input(z.object({
      account: z.string(),
      incidentId: z.number().optional(),
      eventCode: z.string(),
      qualifier: z.string().optional(),
      partition: z.string().optional(),
      zoneUser: z.string().optional(),
      description: z.string().optional(),
      priority: z.string().optional(),
      brand: z.string().optional(),
      clientId: z.number().optional(),
      clientName: z.string().optional(),
      systemId: z.number().optional(),
      partnerCompanyId: z.number().optional(),
      operatorId: z.number().optional(),
      operatorName: z.string().optional(),
      status: z.enum(["finalized", "cancelled", "escalated"]).optional(),
      observations: z.string().optional(),
      logs: z.string().optional(),
      attendingTimeMs: z.number().optional(),
      sendEmail: z.boolean().optional(),
      sendPush: z.boolean().optional(),
      eventReceivedAt: z.date().optional(),
      startedAt: z.date().optional(),
    })).mutation(({ input }) => {
      const { incidentId, ...occurrence } = input;
      return incidentId
        ? db.createOccurrenceAndCloseIncident(incidentId, occurrence)
        : db.createOccurrence(occurrence);
    }),
  }),
  systemUser: router({
    list: adminProcedure.query(() => db.listSystemUsers()),
    create: adminProcedure.input(z.object({ name: z.string(), email: z.string(), password: z.string(), role: z.enum(["admin", "supervisor", "operator", "partner"]).default("operator"), partnerId: z.number().optional() })).mutation(async ({ input }) => {
      if (input.role === "partner" && !input.partnerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a empresa parceira deste usuário" });
      const hashedPassword = await bcrypt.hash(input.password, 10);
      return db.createSystemUser({ ...input, password: hashedPassword });
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
      role: z.enum(["admin", "supervisor", "operator", "partner"]).optional(),
      partnerId: z.number().nullable().optional(),
    })).mutation(async ({ input }) => {
      const { id, password, ...data } = input;
      if (data.role === "partner" && !data.partnerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a empresa parceira deste usuário" });
      return db.updateSystemUser(id, { ...data, ...(password ? { password: await bcrypt.hash(password, 10) } : {}) });
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteSystemUser(input.id)),
  }),
  finalization: router({
    list: operatorProcedure.query(() => db.listFinalizations()),
    create: supervisorProcedure.input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().default("outros"),
      isActive: z.boolean().default(true),
    })).mutation(({ input }) => db.createFinalization(input)),
    update: supervisorProcedure.input(z.object({
      id: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().default("outros"),
      isActive: z.boolean().default(true),
    })).mutation(({ input }) => db.updateFinalization(input.id, input)),
    delete: supervisorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteFinalization(input.id)),
  }),
});

export type AppRouter = typeof appRouter;
