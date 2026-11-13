import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure as coreAdminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { AUTH_SESSION_LIFETIME_MS, createAuthSessionToken, hashAuthSessionToken } from "./_core/localSession";
import { notifyAuthSessionsRevoked } from "./_core/authSessionRuntime";
import { INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE, remoteCommandCredentialKinds } from "@shared/remoteCommandCredentialProfiles";
import { buildCompatecPhysicalZonePayload, buildCompatecSimulationPayload, intelbrasPhysicalCommandInputSchema, isConfirmedCompatecBenchSystem, isConfirmedVettiBenchSystem, isKnownRemoteCommandBenchSystem, remoteCommandSimulationInputSchema, remoteCommandTypes, validateCompatecPhysicalZoneTarget, validateRemoteCommandTarget } from "./remoteCommandContract";
import { buildVettiSimulationPayload, validateVettiSimulationTarget } from "./vettiCommandSimulation";
import { canRestoreVettiZone } from "@shared/vettiZoneRules";
import { isCompatecSessionActive, sendCompatecMw1PhysicalCommand, sendCompatecMw1StatusQuery } from "./receiver";
import { uploadCompanyLogo } from "./companyLogo";
import { buildIntelbrasSimulationPayload, validateIntelbrasSimulationTarget } from "./intelbrasCommandSimulation";
import { buildRemoteCommandRequestNote } from "./remoteCommandEventCorrelation";
import { emitIncidentStateChanged } from "./_core/socketEvents";
import { emitOperatorShiftNotice } from "./_core/operatorShiftRuntime";
import * as operatorShiftDb from "./operatorShiftDb";
import { PROCEDURE_TYPES } from "../shared/operationalProcedures";

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

function assertOperatorScheduleDecisionComplete(ctx: any) {
  if (ctx.user?.role !== "operator") return;
  if (ctx.authSessionScheduleDecisionPending) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Antes de usar o PoliceCentral, informe se você trocou a escala, está fazendo uma dobra ou cobrindo férias." });
}

const operatorProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !["admin", "supervisor", "operator"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário não possui permissão operacional" });
  }
  await assertOperatorScheduleDecisionComplete(ctx);
  return next({ ctx });
});

const scheduleOperatorProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !["admin", "supervisor", "operator"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário não pode administrar agendas operacionais" });
  }
  await assertOperatorScheduleDecisionComplete(ctx);
  return next({ ctx });
});

const partnerDataProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !["admin", "supervisor", "operator", "partner"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso permitido apenas a usuários internos ou parceiros" });
  }
  if (ctx.user.role === "partner" && !ctx.user.partnerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
  }
  await assertOperatorScheduleDecisionComplete(ctx);
  return next({ ctx });
});

async function assertPartnerCompanyScope(ctx: any, partnerCompanyId: number) {
  if (ctx.user?.role !== "partner") return;
  if (!ctx.user.partnerId || ctx.user.partnerId !== partnerCompanyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Empresa parceira não permitida para este usuário" });
  }
}

const procedureManagerProcedure = partnerDataProcedure.use(({ ctx, next }) => {
  if (!["admin", "supervisor", "partner"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "O operador consulta as providências; a alteração cabe ao responsável pelo cadastro" });
  return next({ ctx });
});

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

async function assertPartnerContactScope(ctx: any, contactId: number) {
  if (ctx.user?.role !== "partner") return undefined;
  const contact = await db.getClientContact(contactId);
  if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contato não encontrado" });
  if (contact.alarmSystemId != null) {
    const system = await db.getAlarmSystem(contact.alarmSystemId);
    if (!system || system.clientId !== contact.clientId) throw new TRPCError({ code: "FORBIDDEN", message: "Contato sem vínculo válido com o cliente" });
  }
  await assertPartnerClientScope(ctx, contact.clientId);
  return contact;
}

async function assertPartnerZoneScope(ctx: any, zoneId: number) {
  if (ctx.user?.role !== "partner") return undefined;
  const zone = await db.getAlarmZone(zoneId);
  if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "Zona não encontrada" });
  await assertPartnerSystemScope(ctx, zone.alarmSystemId);
  return zone;
}

async function assertPartnerAlarmUserScope(ctx: any, alarmUserId: number) {
  if (ctx.user?.role !== "partner") return undefined;
  const user = await db.getAlarmUser(alarmUserId);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário da central não encontrado" });
  await assertPartnerSystemScope(ctx, user.alarmSystemId);
  return user;
}

async function assertPartnerCameraScope(ctx: any, cameraId: number) {
  if (ctx.user?.role !== "partner") return undefined;
  const camera = await db.getCamera(cameraId);
  if (!camera) throw new TRPCError({ code: "NOT_FOUND", message: "Câmera não encontrada" });
  await assertPartnerClientScope(ctx, camera.clientId);
  return camera;
}

async function assertPartnerDvrScope(ctx: any, dvrId: number) {
  const dvr = await db.getClientDvr(dvrId);
  if (!dvr) throw new TRPCError({ code: "NOT_FOUND", message: "DVR não encontrado" });
  await assertPartnerClientScope(ctx, dvr.clientId);
  return dvr;
}

async function assertDvrClientScope(ctx: any, clientId: number) {
  await assertPartnerClientScope(ctx, clientId);
  if (ctx.user?.role !== "partner" && !await db.getClient(clientId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
  }
}

function assertDvrPasswordPermission(ctx: any, password: string | undefined) {
  if (password !== undefined && ctx.user?.role !== "admin" && ctx.user?.role !== "partner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "A senha do DVR só pode ser consultada ou alterada por um Administrador ou pela empresa responsável pelo cliente" });
  }
}

async function assertPartnerHolidayRecordScope(ctx: any, holidayId: number) {
  if (ctx.user?.role !== "partner") return undefined;
  const holiday = await db.getPartnerHoliday(holidayId);
  if (!holiday) throw new TRPCError({ code: "NOT_FOUND", message: "Feriado não encontrado" });
  await assertPartnerCompanyScope(ctx, holiday.partnerCompanyId);
  return holiday;
}

async function assertIncidentPartnerScope(ctx: any, incidentId: number) {
  const incident = await db.getIncident(incidentId);
  if (!incident) throw new TRPCError({ code: "NOT_FOUND", message: "Atendimento não encontrado" });
  if (ctx.user?.role === "partner") {
    if (!incident.alarmSystemId) throw new TRPCError({ code: "FORBIDDEN", message: "Atendimento sem central vinculada não pertence a uma parceira identificável" });
    await assertPartnerSystemScope(ctx, incident.alarmSystemId);
  }
  return incident;
}

// ============================================================
// APP ROUTER
// ============================================================
export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => {
      if (opts.ctx.authSessionValidationTimedOut) {
        throw new TRPCError({
          code: "TIMEOUT",
          message: "O sistema demorou para confirmar sua sessão. Tente novamente.",
        });
      }
      const user = opts.ctx.user;
      if (!user) return null;
      const { password: _password, ...safeUser } = user;
      return safeUser;
    }),
    logout: publicProcedure.input(z.object({
      handoffs: z.array(z.object({ incidentId: z.number().int().positive(), toUserId: z.number().int().positive(), message: z.string().max(4000), observationUntil: z.date().optional() })).max(500).default([]),
    }).optional()).mutation(async ({ input, ctx }) => {
      if (ctx.authSessionValidationTimedOut) throw new TRPCError({ code: "TIMEOUT", message: "Não foi possível conferir sua sessão. Nenhum logoff foi realizado; tente novamente." });
      if (ctx.authSessionTokenHash && ctx.user && ["admin", "supervisor", "operator"].includes(ctx.user.role) && !ctx.authSessionId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sessão operacional não identificada. Nenhum logoff foi realizado; atualize a tela." });
      if (ctx.authSessionTokenHash && ctx.user && ctx.authSessionId && ["admin", "supervisor", "operator"].includes(ctx.user.role)) {
        const result = await operatorShiftDb.endOperatorSessionWithHandoff({
          userId: ctx.user.id, authSessionId: ctx.authSessionId, operatorName: ctx.user.name || `Operador ${ctx.user.id}`,
          handoffs: input?.handoffs || [],
        });
        for (const message of result.messages) {
          emitIncidentStateChanged({ incidentId: message.incidentId, incidentStatus: "observing", operatorId: ctx.user.id, operatorName: ctx.user.name || `Operador ${ctx.user.id}`, action: "observing" });
          emitOperatorShiftNotice({
            kind: "shift_message", messageId: message.id, userId: message.toUserId,
            fromOperatorName: message.fromOperatorName, toOperatorName: message.toOperatorName, incidentId: message.incidentId, account: message.account,
          });
        }
        notifyAuthSessionsRevoked(result.revokedSessionIds);
      } else if (ctx.authSessionTokenHash && ctx.user) {
        const revoked = await db.revokeAuthSessionByTokenHash(ctx.authSessionTokenHash);
        notifyAuthSessionsRevoked(revoked);
      } else if (ctx.authSessionTokenHash && !ctx.authSessionInvalid) {
        throw new TRPCError({ code: "TIMEOUT", message: "Não foi possível identificar sua sessão para conferir as pendências. Tente novamente." });
      }
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
      const sessionToken = createAuthSessionToken();
      const session = await db.replaceActiveAuthSession(
        user.id,
        hashAuthSessionToken(sessionToken),
        new Date(Date.now() + AUTH_SESSION_LIFETIME_MS),
      );
      notifyAuthSessionsRevoked(session.revokedSessionIds);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: AUTH_SESSION_LIFETIME_MS });
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

  publicBranding: router({
    get: publicProcedure.query(() => db.getPublicManagingBranding()),
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
    uploadLogo: adminProcedure.input(z.object({
      id: z.number(),
      dataBase64: z.string().min(1),
      mimeType: z.string().min(1),
    })).mutation(async ({ input }) => {
      const company = await db.getManagingCompany(input.id);
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa gestora não encontrada" });
      const uploaded = await uploadCompanyLogo({
        ownerType: "managing",
        ownerId: input.id,
        dataBase64: input.dataBase64,
        mimeType: input.mimeType,
      });
      await db.updateManagingCompany(input.id, { logoUrl: uploaded.url });
      return uploaded;
    }),
  }),

  // ============================================================
  // PARTNER COMPANIES
  // ============================================================
  partnerCompany: router({
    list: partnerDataProcedure.input(z.object({ managingCompanyId: z.number().optional() }).optional()).query(({ input, ctx }) => {
      if (ctx.user.role === "partner") {
        if (!ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
        return db.getPartnerCompany(ctx.user.partnerId).then(partner => partner ? [partner] : []);
      }
      return db.listPartnerCompanies(input?.managingCompanyId);
    }),
    get: partnerDataProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerCompanyScope(ctx, input.id);
      return db.getPartnerCompany(input.id);
    }),
    create: adminProcedure.input(z.object({
      managingCompanyId: z.number(),
      name: z.string().min(1),
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
    uploadLogo: protectedProcedure.input(z.object({
      id: z.number(),
      dataBase64: z.string().min(1),
      mimeType: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "partner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente a gestora ou a própria parceira pode enviar esta logo" });
      }
      await assertPartnerCompanyScope(ctx, input.id);
      const company = await db.getPartnerCompany(input.id);
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa parceira não encontrada" });
      const uploaded = await uploadCompanyLogo({
        ownerType: "partner",
        ownerId: input.id,
        dataBase64: input.dataBase64,
        mimeType: input.mimeType,
      });
      await db.updatePartnerCompany(input.id, { logoUrl: uploaded.url });
      return uploaded;
    }),
  }),

  // ============================================================
  // CLIENTS
  tacticalMobile: router({
    list: operatorProcedure.input(z.object({ partnerCompanyId: z.number() })).query(({ input }) => db.listTacticalMobiles(input.partnerCompanyId)),
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
    list: partnerDataProcedure.input(z.object({ partnerCompanyId: z.number().optional(), monitoringStatus: z.enum(["active", "blocked", "suspended"]).optional() }).optional()).query(async ({ input, ctx }) => {
      if (ctx.user.role === "partner") {
        if (!ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
        return db.listClients(ctx.user.partnerId, input?.monitoringStatus);
      }
      return db.listClients(input?.partnerCompanyId, input?.monitoringStatus);
    }),
    get: partnerDataProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const client = await db.getClient(input.id);
      if (ctx.user.role === "partner" && client?.partnerCompanyId !== ctx.user.partnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cliente não pertence à sua empresa parceira" });
      }
      return client;
    }),
    create: partnerDataProcedure.input(z.object({
      partnerCompanyId: z.number(),
      type: z.enum(["pf", "pj"]),
      propertyType: z.enum(["residence", "company", "condominium"]).optional(),
      name: z.string().min(1),
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
      monitoringStatus: z.enum(["active", "blocked", "suspended"]).optional(),
      monitoringStatusReason: z.string().max(255).optional().nullable(),
      monitoringStatusUntil: z.date().optional().nullable(),
      confirmPartnerDocumentReuse: z.boolean().optional(),
    })).mutation(({ input, ctx }) => {
      const { confirmPartnerDocumentReuse, ...data } = input;
      if (ctx.user.role === "partner") {
        if (!ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
        if (input.partnerCompanyId !== ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Empresa parceira não permitida para este usuário" });
        return db.createClient({ ...data, partnerCompanyId: ctx.user.partnerId, monitoringStatus: "active", monitoringStatusReason: null, monitoringStatusUntil: null, isActive: true }, { confirmPartnerDocumentReuse });
      }
      return db.createClient(data, { confirmPartnerDocumentReuse });
    }),
    update: partnerDataProcedure.input(z.object({
      id: z.number(),
      partnerCompanyId: z.number().optional(),
      type: z.enum(["pf", "pj"]).optional(),
      propertyType: z.enum(["residence", "company", "condominium"]).optional(),
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
      monitoringStatus: z.enum(["active", "blocked", "suspended"]).optional(),
      monitoringStatusReason: z.string().max(255).optional().nullable(),
      monitoringStatusUntil: z.date().optional().nullable(),
      confirmPartnerDocumentReuse: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, confirmPartnerDocumentReuse, ...data } = input;
      if (ctx.user.role === "partner") {
        await assertPartnerClientScope(ctx, id);
        if (input.partnerCompanyId !== undefined && input.partnerCompanyId !== ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Não é permitido reassociar o cliente a outra parceira" });
        if (input.isActive !== undefined || input.monitoringStatus !== undefined || input.monitoringStatusReason !== undefined || input.monitoringStatusUntil !== undefined) throw new TRPCError({ code: "FORBIDDEN", message: "Parceiros não podem alterar o status ou a atividade de monitoramento" });
        delete (data as any).partnerCompanyId;
      }
      return db.updateClient(id, data, { confirmPartnerDocumentReuse });
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteClient(input.id)),
  }),

  // ============================================================
  // CLIENT CONTACTS
  // ============================================================
  clientContact: router({
    list: partnerDataProcedure.input(z.object({ clientId: z.number(), alarmSystemId: z.number().optional() })).query(async ({ input, ctx }) => {
      await assertPartnerClientScope(ctx, input.clientId);
      if (input.alarmSystemId) await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listClientContacts(input.clientId, input.alarmSystemId);
    }),
    create: partnerDataProcedure.input(z.object({
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
    })).mutation(async ({ input, ctx }) => {
      const system = await db.getAlarmSystem(input.alarmSystemId);
      if (!system || system.clientId !== input.clientId) throw new TRPCError({ code: "BAD_REQUEST", message: "A central deve pertencer ao cliente informado" });
      await assertPartnerClientScope(ctx, input.clientId);
      return db.createClientContact(input);
    }),
    update: partnerDataProcedure.input(z.object({
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
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      if (ctx.user.role === "partner") {
        const current = await assertPartnerContactScope(ctx, id);
        if (input.alarmSystemId !== undefined) {
          const nextSystem = await db.getAlarmSystem(input.alarmSystemId);
          if (!nextSystem || nextSystem.clientId !== current!.clientId) throw new TRPCError({ code: "FORBIDDEN", message: "Não é permitido reassociar o contato a outro cliente" });
        }
      }
      return db.updateClientContact(id, data);
    }),
    delete: partnerDataProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => { await assertPartnerContactScope(ctx, input.id); return db.deleteClientContact(input.id); }),
  }),

  // ============================================================
  // ALARM SYSTEMS
  // ============================================================
  alarmSystem: router({
    list: partnerDataProcedure.input(z.object({ clientId: z.number().optional() }).optional()).query(async ({ input, ctx }) => {
      if (ctx.user.role === "partner" && !input?.clientId) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o cliente para consultar sistemas" });
      if (input?.clientId) await assertPartnerClientScope(ctx, input.clientId);
      return db.listAlarmSystems(input?.clientId);
    }),
    get: partnerDataProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.id);
      return db.getAlarmSystem(input.id);
    }),
    getByAccount: operatorProcedure.input(z.object({ account: z.string() })).query(async ({ input, ctx }) => {
      const system = await db.getAlarmSystemByAccount(input.account);
      if (system) await assertPartnerSystemScope(ctx, system.id);
      return system;
    }),
    clientConnectionStatus: partnerDataProcedure.input(z.object({ clientId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerClientScope(ctx, input.clientId);
      const systems = await db.listSystemsConnectionStatus(new Date(), {
        clientId: input.clientId,
        ...(ctx.user.role === "partner" ? { partnerCompanyId: ctx.user.partnerId!, includeInactive: true } : {}),
      });
      return systems.map(system => ({ id: system.id, connectionStatus: system.connectionStatus }));
    }),
    create: partnerDataProcedure.input(z.object({
      clientId: z.number(),
      account: z.string().min(4),
      brand: z.enum(["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"]),
      model: z.string().optional(),
      firmwareVersion: z.string().optional(),
      communicationType: z.enum(["ethernet", "gprs", "both"]).optional(),
      macAddress: z.string().max(6).optional(),
      imeiGprs: z.string().max(6).optional(),
      simCardNumber: z.string().max(50).optional(),
      simPhoneNumber: z.string().max(30).optional(),
      serialNumber: z.string().max(10).optional(),
      viawebCode: z.string().max(4).optional(),
      isepId: z.string().regex(/^[0-9A-Fa-f]{4}$/, "O ID ISEP deve ter 4 caracteres hexadecimais").optional(),
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
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerClientScope(ctx, input.clientId);
      if (ctx.user.role === "partner") {
        const {
          keepAliveMonitoringEnabled: _keepAliveMonitoringEnabled,
          keepAliveExpectedIntervalSeconds: _keepAliveExpectedIntervalSeconds,
          keepAliveFailureEventEnabled: _keepAliveFailureEventEnabled,
          keepAliveOfflineAfterMinutes: _keepAliveOfflineAfterMinutes,
          keepAliveDisconnectAlertEnabled: _keepAliveDisconnectAlertEnabled,
          keepAliveRepeatAlertEnabled: _keepAliveRepeatAlertEnabled,
          keepAliveRepeatAlertEveryMinutes: _keepAliveRepeatAlertEveryMinutes,
          ...registrationData
        } = input;
        return db.createAlarmSystem(registrationData);
      }
      return db.createAlarmSystem(input);
    }),
    update: partnerDataProcedure.input(z.object({
      id: z.number(),
      account: z.string().optional(),
      brand: z.enum(["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"]).optional(),
      model: z.string().optional(),
      firmwareVersion: z.string().optional(),
      communicationType: z.enum(["ethernet", "gprs", "both"]).optional(),
      macAddress: z.string().max(6).optional(),
      imeiGprs: z.string().max(6).optional(),
      simCardNumber: z.string().max(50).optional(),
      simPhoneNumber: z.string().max(30).optional(),
      serialNumber: z.string().max(10).optional(),
      viawebCode: z.string().max(4).optional(),
      isepId: z.string().regex(/^[0-9A-Fa-f]{4}$/, "O ID ISEP deve ter 4 caracteres hexadecimais").optional(),
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
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await assertPartnerSystemScope(ctx, id);
      if (ctx.user.role === "partner" && (
        input.isActive !== undefined
        || input.keepAliveMonitoringEnabled !== undefined
        || input.keepAliveExpectedIntervalSeconds !== undefined
        || input.keepAliveFailureEventEnabled !== undefined
        || input.keepAliveOfflineAfterMinutes !== undefined
        || input.keepAliveDisconnectAlertEnabled !== undefined
        || input.keepAliveRepeatAlertEnabled !== undefined
        || input.keepAliveRepeatAlertEveryMinutes !== undefined
      )) throw new TRPCError({ code: "FORBIDDEN", message: "Parceiros não podem alterar a atividade nem as regras de monitoramento da central" });
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
    delete: adminProcedure.input(z.object({ id: z.number(), confirmation: z.string().trim().min(1) })).mutation(async ({ input }) => {
      const system = await db.getAlarmSystem(input.id);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema não encontrado" });
      const expectedConfirmation = db.getAlarmSystemDeletionConfirmation(system);
      if (input.confirmation.trim().toUpperCase() !== expectedConfirmation) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Confirmação inválida. Digite exatamente: ${expectedConfirmation}` });
      }
      await db.deleteAlarmSystem(input.id);
      return { success: true } as const;
    }),
    remoteCommandCredentialStatus: operatorProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.getAlarmRemoteCredentialStatus(input.alarmSystemId);
    }),
    setRemoteCommandCredential: adminProcedure.input(z.object({
      alarmSystemId: z.number(),
      credentialKind: z.enum(remoteCommandCredentialKinds),
      credential: z.string().trim().min(1, "Informe a credencial técnica da central").max(255),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.setAlarmRemoteCredential({ ...input, updatedBy: ctx.user.id });
    }),
    clearRemoteCommandCredential: adminProcedure.input(z.object({ alarmSystemId: z.number(), credentialKind: z.enum(remoteCommandCredentialKinds) })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.clearAlarmRemoteCredential(input);
    }),
    setRemoteCommandLaboratory: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      enabled: z.boolean(),
      reason: z.string().trim().max(2000).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system || !isKnownRemoteCommandBenchSystem(system)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O modo de bancada é exclusivo para as centrais físicas de testes identificadas por MAC" });
      }
      const isIntelbras = system.brand?.trim().toUpperCase() === "INTELBRAS";
      if (isIntelbras && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente administrador pode habilitar ou desabilitar o modo de bancada AMT-8000" });
      }
      const reason = input.reason?.trim();
      if (isIntelbras && (!reason || reason.length < 5)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um motivo de pelo menos 5 caracteres para auditar a bancada AMT-8000" });
      }
      return db.setAlarmSystemRemoteCommandLabEnabled(
        input.alarmSystemId,
        input.enabled,
        isIntelbras ? { operatorId: ctx.user.id, reason: reason! } : undefined,
      );
    }),
  }),

  // ============================================================
  // ALARM ZONES
  // ============================================================
  alarmZone: router({
    list: partnerDataProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listAlarmZones(input.alarmSystemId);
    }),
    create: partnerDataProcedure.input(z.object({
      alarmSystemId: z.number(),
      zoneNumber: z.number(),
      name: z.string().min(1),
      type: z.enum(["perimeter", "internal", "24h", "fire", "panic", "medical"]).optional(),
      partition: z.number().optional(),
    })).mutation(async ({ input, ctx }) => { await assertPartnerSystemScope(ctx, input.alarmSystemId); return db.createAlarmZone(input); }),
    update: partnerDataProcedure.input(z.object({
      id: z.number(),
      zoneNumber: z.number().optional(),
      name: z.string().optional(),
      type: z.enum(["perimeter", "internal", "24h", "fire", "panic", "medical"]).optional(),
      partition: z.number().optional(),
    })).mutation(async ({ input, ctx }) => { const { id, ...data } = input; await assertPartnerZoneScope(ctx, id); return db.updateAlarmZone(id, data); }),
    delete: partnerDataProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => { await assertPartnerZoneScope(ctx, input.id); return db.deleteAlarmZone(input.id); }),
  }),

  // ============================================================
  // ALARM USERS
  // ============================================================
  alarmUser: router({
    list: partnerDataProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listAlarmUsers(input.alarmSystemId);
    }),
    operationalList: operatorProcedure.query(() => db.listOperationalAlarmUsers()),
    create: partnerDataProcedure.input(z.object({
      alarmSystemId: z.number(),
      userNumber: z.number().int().min(0),
      name: z.string().min(1),
      apartmentNumber: z.string().max(30).optional(),
      phone: z.string().optional(),
      password: z.string().optional(),
      counterPassword: z.string().optional(),
      coercionPassword: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.createAlarmUser(input);
    }),
    update: partnerDataProcedure.input(z.object({
      id: z.number(),
      userNumber: z.number().int().min(0).optional(),
      name: z.string().optional(),
      apartmentNumber: z.string().max(30).optional(),
      phone: z.string().optional(),
      password: z.string().optional(),
      counterPassword: z.string().optional(),
      coercionPassword: z.string().optional(),
    })).mutation(async ({ input, ctx }) => { const { id, ...data } = input; await assertPartnerAlarmUserScope(ctx, id); return db.updateAlarmUser(id, data); }),
    delete: partnerDataProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => { await assertPartnerAlarmUserScope(ctx, input.id); return db.deleteAlarmUser(input.id); }),
  }),

  // ============================================================
  // CAMERAS
  // ============================================================
  camera: router({
    list: partnerDataProcedure.input(z.object({ clientId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerClientScope(ctx, input.clientId);
      return db.listCameras(input.clientId);
    }),
    create: partnerDataProcedure.input(z.object({
      clientId: z.number(),
      name: z.string().min(1),
      rtspUrl: z.string().min(1),
      brand: z.string().optional(),
      model: z.string().optional(),
      location: z.string().optional(),
    })).mutation(async ({ input, ctx }) => { await assertPartnerClientScope(ctx, input.clientId); return db.createCamera(input); }),
    update: partnerDataProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      rtspUrl: z.string().optional(),
      brand: z.string().optional(),
      model: z.string().optional(),
      location: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => { const { id, ...data } = input; await assertPartnerCameraScope(ctx, id); return db.updateCamera(id, data); }),
    delete: partnerDataProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => { await assertPartnerCameraScope(ctx, input.id); return db.deleteCamera(input.id); }),
  }),

  // ============================================================
  // DADOS CADASTRAIS DOS DVRs (sem conexão ao equipamento)
  // ============================================================
  dvr: router({
    list: partnerDataProcedure.input(z.object({ clientId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      await assertDvrClientScope(ctx, input.clientId);
      return db.listClientDvrs(input.clientId, ctx.user.role === "admin" || ctx.user.role === "partner");
    }),
    create: partnerDataProcedure.input(z.object({
      clientId: z.number().int().positive(),
      brand: z.string().trim().min(1).max(100),
      model: z.string().max(150).optional(),
      firmwareVersion: z.string().max(100).optional(),
      serialNumber: z.string().max(150).optional(),
      host: z.string().max(255).optional(),
      tcpPort: z.number().int().min(1).max(65535).nullable().optional(),
      udpPort: z.number().int().min(1).max(65535).nullable().optional(),
      httpPort: z.number().int().min(1).max(65535).nullable().optional(),
      rtspPort: z.number().int().min(1).max(65535).nullable().optional(),
      httpsPort: z.number().int().min(1).max(65535).nullable().optional(),
      serverPort: z.number().int().min(1).max(65535).nullable().optional(),
      username: z.string().max(128).optional(),
      password: z.string().max(500).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertDvrClientScope(ctx, input.clientId);
      assertDvrPasswordPermission(ctx, input.password);
      return db.createClientDvr(input);
    }),
    update: partnerDataProcedure.input(z.object({
      id: z.number().int().positive(),
      brand: z.string().trim().min(1).max(100).optional(),
      model: z.string().max(150).optional(),
      firmwareVersion: z.string().max(100).optional(),
      serialNumber: z.string().max(150).optional(),
      host: z.string().max(255).optional(),
      tcpPort: z.number().int().min(1).max(65535).nullable().optional(),
      udpPort: z.number().int().min(1).max(65535).nullable().optional(),
      httpPort: z.number().int().min(1).max(65535).nullable().optional(),
      rtspPort: z.number().int().min(1).max(65535).nullable().optional(),
      httpsPort: z.number().int().min(1).max(65535).nullable().optional(),
      serverPort: z.number().int().min(1).max(65535).nullable().optional(),
      username: z.string().max(128).optional(),
      password: z.string().max(500).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, password, ...registrationData } = input;
      await assertPartnerDvrScope(ctx, id);
      assertDvrPasswordPermission(ctx, password);
      return db.updateClientDvr(id, { ...registrationData, ...(password === undefined ? {} : { password }) });
    }),
    delete: partnerDataProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await assertPartnerDvrScope(ctx, input.id);
      return db.deleteClientDvr(input.id);
    }),
  }),

  // ============================================================
  // ALARM EVENTS
  // ============================================================
  alarmEvent: router({
    list: operatorProcedure.input(z.object({ limit: z.number().optional(), offset: z.number().optional() }).optional()).query(({ input }) => db.listAlarmEvents(input?.limit, input?.offset)),
    report: operatorProcedure.input(z.object({
      limit: z.number().optional(), offset: z.number().optional(), account: z.string().optional(), clientId: z.number().optional(),
      partnerCompanyId: z.number().optional(), dateFrom: z.string().optional(), dateTo: z.string().optional(),
      eventGroup: z.enum(["all", "alarm", "arm", "disarm", "test", "system"]).optional(),
    }).optional()).query(({ input, ctx }) => {
      if (ctx.user.role === "partner") {
        if (!ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
        return db.listOperationalEventReport({ ...(input || {}), partnerCompanyId: ctx.user.partnerId });
      }
      return db.listOperationalEventReport(input || {});
    }),
    connectionReport: operatorProcedure.input(z.object({ clientId: z.number().optional(), partnerCompanyId: z.number().optional(), status: z.enum(["online", "offline"]).optional() }).optional()).query(({ input, ctx }) => {
      if (ctx.user.role === "partner") {
        if (!ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
        return db.listOperationalConnectionReport({ ...(input || {}), partnerCompanyId: ctx.user.partnerId });
      }
      return db.listOperationalConnectionReport(input || {});
    }),
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
    get: operatorProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      await assertIncidentPartnerScope(ctx, input.id);
      return db.getIncident(input.id);
    }),
    history: operatorProcedure.input(z.object({ incidentId: z.number() })).query(async ({ input, ctx }) => {
      await assertIncidentPartnerScope(ctx, input.incidentId);
      return db.getIncidentHistory(input.incidentId);
    }),
    create: operatorProcedure.input(z.object({
      eventId: z.number(),
      alarmSystemId: z.number().optional(),
      clientId: z.number().optional(),
      priority: z.enum(["critical", "high", "medium", "low"]).optional(),
      notes: z.string().optional(),
    })).mutation(({ input, ctx }) => db.createIncident({ ...input, operatorId: ctx.user?.id || undefined }, ctx.authSessionId)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["attending", "dispatched"]),
    })).mutation(async ({ input, ctx }) => {
      await assertIncidentPartnerScope(ctx, input.id);
      const result = await db.transitionIncidentForOperator({
        incidentId: input.id,
        operatorId: ctx.user.id,
        operatorName: ctx.user.name || `Operador ${ctx.user.id}`,
        authSessionId: ctx.authSessionId,
        status: input.status,
      });
      emitIncidentStateChanged({ incidentId: result.id, parentIncidentId: result.parentIncidentId, incidentStatus: result.status, operatorId: result.operatorId, operatorName: result.operatorName, action: result.action === "claim" ? "claimed" : "status_changed" });
      return result;
    }),
    assume: operatorProcedure.input(z.object({ incidentId: z.number() })).mutation(async ({ input, ctx }) => {
      await assertIncidentPartnerScope(ctx, input.incidentId);
      const result = await db.assumeObservedIncident({ incidentId: input.incidentId, operatorId: ctx.user.id, operatorName: ctx.user.name || `Operador ${ctx.user.id}`, authSessionId: ctx.authSessionId });
      emitIncidentStateChanged({ incidentId: result.id, parentIncidentId: result.parentIncidentId, incidentStatus: result.status, operatorId: result.operatorId, operatorName: result.operatorName, action: "assumed" });
      if (result.forwardedMessage) emitOperatorShiftNotice({
        kind: "shift_message", messageId: result.forwardedMessage.id, userId: result.forwardedMessage.toUserId,
        fromOperatorName: result.forwardedMessage.fromOperatorName, toOperatorName: result.forwardedMessage.toOperatorName,
        incidentId: result.forwardedMessage.incidentId, account: result.forwardedMessage.account,
      });
      return result;
    }),
    bulkPreview: operatorProcedure.input(z.object({
      account: z.string().trim().min(1).max(20),
      alarmSystemId: z.number().int().positive(),
    })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.previewBulkFinalizeOpenIncidents({ ...input, operatorId: ctx.user.id });
    }),
    bulkFinalize: operatorProcedure.input(z.object({
      account: z.string().trim().min(1).max(20),
      alarmSystemId: z.number().optional(),
      clientId: z.number().optional(),
      clientName: z.string().optional(),
      partnerCompanyId: z.number().optional(),
      observations: z.string().trim().min(1, "Informe a descrição da finalização"),
      confirmedIncidentIds: z.array(z.number().int().positive()).min(1, "Atualize o lote antes de confirmar").max(10000),
    })).mutation(async ({ input, ctx }) => {
      if (!input.alarmSystemId) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a central identificada para finalizar apenas os atendimentos desta conta" });
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const result = await db.bulkFinalizeOpenIncidents({ ...input, operatorId: ctx.user.id, operatorName: ctx.user.name, authSessionId: ctx.authSessionId });
      if (result.count > 0) emitIncidentStateChanged({ incidentId: 0, incidentStatus: "closed", operatorId: ctx.user.id, operatorName: ctx.user.name || `Operador ${ctx.user.id}`, action: "status_changed" });
      return result;
    }),
    observe: operatorProcedure.input(z.object({
      incidentId: z.number(),
      until: z.date(),
      notes: z.string().max(2000).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertIncidentPartnerScope(ctx, input.incidentId);
      const result = await db.putIncidentInObservation({ ...input, operatorId: ctx.user.id, operatorName: ctx.user.name || `Operador ${ctx.user.id}`, authSessionId: ctx.authSessionId });
      emitIncidentStateChanged({ incidentId: result.id, parentIncidentId: result.parentIncidentId, incidentStatus: result.status, operatorId: result.operatorId, operatorName: result.operatorName, action: "observing" });
      return result;
    }),
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
    scheduleAlerts: operatorProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "partner" && !ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
      return db.listAlarmScheduleAlerts({
        status: "active",
        limit: 500,
        partnerCompanyId: ctx.user.role === "partner" ? ctx.user.partnerId! : undefined,
      });
    }),
    acknowledgeScheduleAlert: operatorProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const alert = await db.getAlarmScheduleAlertPartnerScope(input.id);
      if (!alert) throw new TRPCError({ code: "NOT_FOUND", message: "Alerta de agenda não encontrado" });
      if (ctx.user.role === "partner" && alert.partnerCompanyId !== ctx.user.partnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Este alerta não pertence à sua empresa parceira" });
      }
      return db.acknowledgeAlarmScheduleAlert({ id: input.id, operatorId: ctx.user.id });
    }),
    connectionStatus: operatorProcedure.query(() => db.listSystemsConnectionStatus()),
  }),
  remoteCommand: router({
    list: operatorProcedure.input(z.object({ alarmSystemId: z.number(), limit: z.number().int().min(1).max(100).optional() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listAlarmRemoteCommands(input.alarmSystemId, input.limit);
    }),
    simulate: operatorProcedure.input(remoteCommandSimulationInputSchema).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema de alarme não encontrado" });
      if (system.brand !== "COMPATEC" && system.brand !== "VETTI" && system.brand !== "INTELBRAS") throw new TRPCError({ code: "BAD_REQUEST", message: "Nesta etapa, os comandos remotos em simulação estão disponíveis para centrais Compatec, Vetti e Intelbras" });
      const targetError = system.brand === "VETTI"
        ? validateVettiSimulationTarget(input)
        : system.brand === "INTELBRAS"
          ? validateIntelbrasSimulationTarget(input)
          : validateRemoteCommandTarget(input);
      if (targetError) throw new TRPCError({ code: "BAD_REQUEST", message: targetError });

      if (system.brand === "VETTI" && input.commandType === "restore_zone") {
        const zone = (await db.listAlarmZones(system.id)).find((item) => item.zoneNumber === input.zoneNumber);
        if (!canRestoreVettiZone(zone)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Na Vetti, Restaurar Zona é reservado a zonas classificadas como 24 horas; zonas comuns são restauradas no Desarme." });
        }
      }

      const commandPayload = system.brand === "VETTI"
        ? buildVettiSimulationPayload(input)
        : system.brand === "INTELBRAS"
          ? buildIntelbrasSimulationPayload(input)
          : buildCompatecSimulationPayload(input);
      const created = await db.createAlarmRemoteCommand({
        alarmSystemId: system.id,
        incidentId: input.incidentId ?? null,
        operatorId: ctx.user.id,
        brand: system.brand,
        commandType: input.commandType,
        transportMode: "simulation",
        status: "simulated",
        partition: input.partition ?? null,
        zoneNumber: input.zoneNumber ?? null,
        pgmNumber: input.pgmNumber ?? null,
        reason: input.reason,
        commandPayload,
        responsePayload: system.brand === "VETTI"
          ? "SIMULAÇÃO CONCLUÍDA — nenhum frame VSec foi transmitido à central."
          : system.brand === "INTELBRAS"
            ? "SIMULAÇÃO CONCLUÍDA — nenhum quadro ISECnet/E7 foi transmitido à central."
            : "SIMULAÇÃO CONCLUÍDA — nenhum pacote MicroBus foi transmitido à central.",
        executedAt: new Date(),
      });
      return { ...created, status: "simulated" as const };
    }),
    sendIntelbrasPhysical: operatorProcedure.input(intelbrasPhysicalCommandInputSchema).mutation(async (): Promise<{ id: number; status: "failed"; message: string }> => {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE });
    }),
    queryVettiBenchStatus: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      incidentId: z.number().optional(),
      reason: z.string().trim().min(5, "Informe o motivo operacional da consulta").max(2000),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema de alarme não encontrado" });
      if (!isConfirmedVettiBenchSystem(system) || system.account !== "0336") {
        throw new TRPCError({ code: "FORBIDDEN", message: "A consulta VSec real está habilitada somente para a central Vetti de testes conta 0336, MAC 2DE4A8 e modo de bancada ativo" });
      }
      const payload = "02 05 AF 14 FF B1";
      const reservation = await db.createExclusiveVettiBenchCommand({
        alarmSystemId: system.id, incidentId: input.incidentId ?? null, operatorId: ctx.user.id,
        brand: "VETTI", commandType: "query_status", transportMode: "vsec_bench", status: "queued",
        partition: null, zoneNumber: null, pgmNumber: null, reason: input.reason,
        commandPayload: payload, responsePayload: "Aguardando a conexão autenticada da central Vetti de testes.", executedAt: null,
      });
      if (!reservation.created) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe uma sequência VSec de bancada em andamento (comando ${reservation.activeCommandId}, status ${reservation.activeStatus}). Aguarde a resposta ou a falha auditada antes de solicitar outra.` });
      }
      const created = { id: reservation.id };
      await db.updateAlarmRemoteCommandDelivery(created.id, { status: "waiting_connection", responsePayload: "Consulta VSec 0x14 aguardando o próximo login autenticado da central." });
      return { ...created, status: "waiting_connection" as const, message: "Consulta VSec aguardando o próximo login autenticado da central." };
    }),
    disarmVettiBench: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      incidentId: z.number().optional(),
      reason: z.string().trim().min(5, "Informe o motivo operacional do Desarme").max(2000),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema de alarme não encontrado" });
      if (!isConfirmedVettiBenchSystem(system) || system.account !== "0336") {
        throw new TRPCError({ code: "FORBIDDEN", message: "O Desarme VSec físico está habilitado somente para a central Vetti de testes conta 0336, MAC 2DE4A8 e modo de bancada ativo" });
      }
      const reservation = await db.createExclusiveVettiBenchCommand({
        alarmSystemId: system.id, incidentId: input.incidentId ?? null, operatorId: ctx.user.id,
        brand: "VETTI", commandType: "disarm", transportMode: "vsec_bench", status: "queued",
        partition: null, zoneNumber: null, pgmNumber: null, reason: input.reason,
        commandPayload: "02 <NB> AF 43 <MÁSCARA_DE_PARTIÇÕES_LIDA_EM_0x14> <SENHA_DE_COMANDO_CIFRADA> FF <CRC>",
        responsePayload: "Aguardando o próximo login autenticado da central Vetti de testes para validar o estado antes do Desarme.", executedAt: null,
      });
      if (!reservation.created) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe uma sequência VSec de bancada em andamento (comando ${reservation.activeCommandId}, status ${reservation.activeStatus}). Aguarde a resposta ou a falha auditada antes de solicitar outra.` });
      }
      const created = { id: reservation.id };
      await db.updateAlarmRemoteCommandDelivery(created.id, { status: "waiting_connection", responsePayload: "Desarme VSec aguardando login, consulta prévia de estado e confirmação da central." });
      return { ...created, status: "waiting_connection" as const, message: "Desarme VSec aguardando o próximo login autenticado da central; o estado será validado antes do envio." };
    }),
    // Operadores de monitoramento podem consultar e comandar exclusivamente a bancada
    // identificada; o bloqueio físico por MAC e modo de laboratório permanece abaixo.
    queryBenchStatus: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      incidentId: z.number().optional(),
      reason: z.string().trim().min(5, "Informe o motivo operacional da consulta").max(2000),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema de alarme não encontrado" });
      if (!isConfirmedCompatecBenchSystem(system)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A consulta MicroBus real está habilitada somente para a central Compatec de bancada identificada pelo MAC C1BDCB" });
      }
      const reservation = await db.createExclusiveCompatecPhysicalCommand({
        alarmSystemId: system.id,
        incidentId: input.incidentId ?? null,
        operatorId: ctx.user.id,
        brand: "COMPATEC",
        commandType: "query_status",
        transportMode: "microbus_compatec",
        status: "queued",
        partition: null,
        zoneNumber: null,
        pgmNumber: null,
        reason: input.reason,
        commandPayload: "MB=AK0\\r\\n",
        responsePayload: "Aguardando a conexão autenticada da central de bancada.",
      });
      if (!reservation.created) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe um comando MicroBus em andamento (comando ${reservation.activeCommandId}, status ${reservation.activeStatus}). Aguarde a resposta antes de consultar novamente.` });
      }
      const created = { id: reservation.id };
      const dispatched = await db.dispatchAlarmRemoteCommand({
        alarmSystemId: system.id, commandId: created.id,
        expectedStatuses: ["queued"], unavailableStatus: "waiting_connection",
        sentResponsePayload: "Consulta MB=AK0 enviada; aguardando a resposta da central.",
        send: () => sendCompatecMw1StatusQuery({ alarmSystemId: system.id, commandId: created.id }),
      });
      if (!dispatched.sent) return { ...created, status: dispatched.status, message: dispatched.message };
      return { ...created, status: dispatched.status, payload: dispatched.payload, message: dispatched.message };
    }),
    queryBenchSectors: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      incidentId: z.number().optional(),
      reason: z.string().trim().min(5, "Informe o motivo operacional da consulta").max(2000),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema de alarme não encontrado" });
      if (!isConfirmedCompatecBenchSystem(system)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A consulta MicroBus real está habilitada somente para a central Compatec de bancada identificada pelo MAC C1BDCB" });
      }
      const payload = "MB=AK1\r\n";
      const reservation = await db.createExclusiveCompatecPhysicalCommand({
        alarmSystemId: system.id, incidentId: input.incidentId ?? null, operatorId: ctx.user.id,
        brand: "COMPATEC", commandType: "query_sectors", transportMode: "microbus_compatec", status: "queued",
        partition: null, zoneNumber: null, pgmNumber: null, reason: input.reason,
        commandPayload: payload, responsePayload: "Aguardando a conexão autenticada da central de bancada.",
      });
      if (!reservation.created) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe um comando MicroBus em andamento (comando ${reservation.activeCommandId}, status ${reservation.activeStatus}). Aguarde a resposta antes de consultar novamente.` });
      }
      const created = { id: reservation.id };
      const dispatched = await db.dispatchAlarmRemoteCommand({
        alarmSystemId: system.id, commandId: created.id,
        expectedStatuses: ["queued"], unavailableStatus: "waiting_connection",
        sentResponsePayload: "Consulta MB=AK1 enviada; aguardando a resposta dos setores.",
        send: () => sendCompatecMw1PhysicalCommand({ alarmSystemId: system.id, commandId: created.id, payload }),
      });
      if (!dispatched.sent) return { ...created, status: dispatched.status, message: dispatched.message };
      return { ...created, status: dispatched.status, payload: dispatched.payload, message: dispatched.message };
    }),
    armCompatecAll: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      incidentId: z.number().optional(),
      reason: z.string().trim().min(5, "Informe o motivo operacional do Arme").max(2000),
      selectionIds: z.array(z.number().int().positive()).max(23).optional(),
      requestedBy: z.string().trim().min(2).max(255).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema de alarme não encontrado" });
      if (system.brand !== "COMPATEC" || system.isActive === false) {
        throw new TRPCError({ code: "FORBIDDEN", message: "O Arme MicroBus real está disponível somente para centrais Compatec ativas e cadastradas" });
      }
      const currentState = await db.getLatestArmDisarmStatusForSystem(system.id);
      if (!currentState || currentState.qualifier !== "E") {
        throw new TRPCError({ code: "CONFLICT", message: "Comando bloqueado: o último estado confirmado da central não é DESARMADO" });
      }
      const payload = "MB=AK4[4]\r\n";
      if (input.selectionIds?.length && !input.requestedBy) throw new TRPCError({ code: "BAD_REQUEST", message: "Identifique quem solicitou o Arme com zonas selecionadas" });
      if (input.selectionIds?.length && !isCompatecSessionActive(system.id)) throw new TRPCError({ code: "CONFLICT", message: "Arme com zonas exige conexão Compatec ativa; a seleção expira sem transmissão e não será executada após reconexão tardia" });
      const reservation = await db.createExclusiveCompatecPhysicalCommand({
        alarmSystemId: system.id, incidentId: input.incidentId ?? null, operatorId: ctx.user.id,
        brand: "COMPATEC", commandType: "arm", transportMode: "microbus_compatec", status: "queued",
        partition: null, zoneNumber: null, pgmNumber: null, reason: input.reason,
        commandPayload: payload, responsePayload: "Aguardando a conexão autenticada da central Compatec.",
      }, input.selectionIds, input.requestedBy);
      if (!reservation.created) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe um comando físico Compatec em andamento (comando ${reservation.activeCommandId}, status ${reservation.activeStatus}). Aguarde a resposta ou a falha auditada antes de solicitar outro.` });
      }
      const created = { id: reservation.id };
      if (input.incidentId) {
        await db.appendIncidentNote(input.incidentId, system.id, buildRemoteCommandRequestNote({
          commandId: reservation.id,
          commandType: "arm",
          operatorName: ctx.user.name || "Operador autenticado",
          reason: input.reason,
        }));
      }
      const dispatched = await db.dispatchAlarmRemoteCommand({
        alarmSystemId: system.id, commandId: created.id,
        expectedStatuses: ["queued"], unavailableStatus: reservation.zoneNumbers.length ? "failed" : "waiting_connection",
        sentResponsePayload: reservation.zoneNumbers.length ? "AK2→AK1 enviados para as zonas selecionadas; aguardando KA1 antes de transmitir AK4[4]." : "Arme MB=AK4[4] enviado; aguardando a confirmação da central.",
        requiredZoneNumbers: reservation.zoneNumbers,
        send: () => sendCompatecMw1PhysicalCommand({ alarmSystemId: system.id, commandId: created.id, payload: reservation.commandPayload }),
      });
      if (!dispatched.sent) return { ...created, status: dispatched.status, message: dispatched.message };
      return { ...created, status: dispatched.status, payload: dispatched.payload, message: dispatched.message };
    }),
    disarmBenchAll: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      incidentId: z.number().optional(),
      reason: z.string().trim().min(5, "Informe o motivo operacional do Desarme").max(2000),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema de alarme não encontrado" });
      if (system.brand !== "COMPATEC" || system.isActive === false) {
        throw new TRPCError({ code: "FORBIDDEN", message: "O Desarme MicroBus real está disponível somente para centrais Compatec ativas e cadastradas" });
      }
      const currentState = await db.getLatestArmDisarmStatusForSystem(system.id);
      if (!currentState || currentState.qualifier !== "R") {
        throw new TRPCError({ code: "CONFLICT", message: "Comando bloqueado: o último estado confirmado da central não é ARMADO" });
      }
      const payload = "MB=AK4[12]\r\n";
      const reservation = await db.createExclusiveCompatecPhysicalCommand({
        alarmSystemId: system.id, incidentId: input.incidentId ?? null, operatorId: ctx.user.id,
        brand: "COMPATEC", commandType: "disarm", transportMode: "microbus_compatec", status: "queued",
        partition: null, zoneNumber: null, pgmNumber: null, reason: input.reason,
        commandPayload: payload, responsePayload: "Aguardando a conexão autenticada da central Compatec.",
      });
      if (!reservation.created) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe um comando físico Compatec em andamento (comando ${reservation.activeCommandId}, status ${reservation.activeStatus}). Aguarde a resposta ou a falha auditada antes de solicitar outro.` });
      }
      const created = { id: reservation.id };
      if (input.incidentId) {
        await db.appendIncidentNote(input.incidentId, system.id, buildRemoteCommandRequestNote({
          commandId: reservation.id,
          commandType: "disarm",
          operatorName: ctx.user.name || "Operador autenticado",
          reason: input.reason,
        }));
      }
      const dispatched = await db.dispatchAlarmRemoteCommand({
        alarmSystemId: system.id, commandId: created.id,
        expectedStatuses: ["queued"], unavailableStatus: "waiting_connection",
        sentResponsePayload: "Desarme MB=AK4[12] enviado; aguardando a confirmação da central.",
        send: () => sendCompatecMw1PhysicalCommand({ alarmSystemId: system.id, commandId: created.id, payload }),
      });
      if (!dispatched.sent) return { ...created, status: dispatched.status, message: dispatched.message };
      return { ...created, status: dispatched.status, payload: dispatched.payload, message: dispatched.message };
    }),
    compatecZoneSelections: operatorProcedure.input(z.object({ alarmSystemId: z.number().int().positive() })).query(({ input, ctx }) => db.listCompatecZoneArmSelections(input.alarmSystemId, ctx.user.id)),
    selectCompatecZoneForArm: operatorProcedure.input(z.object({
      alarmSystemId: z.number().int().positive(), zoneNumber: z.number().int().min(1).max(23), selected: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system || system.brand !== "COMPATEC") throw new TRPCError({ code: "FORBIDDEN", message: "Seleção disponível somente para uma Compatec ativa identificada" });
      return db.setCompatecZoneArmSelection({ ...input, operatorId: ctx.user.id });
    }),
    compatecZonePhysical: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      incidentId: z.number().optional(),
      commandType: z.enum(["isolate_zone", "restore_zone"]),
      zoneNumber: z.number().int().min(1).max(23),
      requestedBy: z.string().trim().min(2, "Informe quem solicitou a alteração da zona").max(255),
      reason: z.string().trim().min(5, "Informe o motivo operacional").max(2000),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      if (input.commandType === "isolate_zone") throw new TRPCError({ code: "BAD_REQUEST", message: "Inibição avulsa desabilitada. Marque a chave da zona e inicie o Arme em até 1 minuto; a chave sozinha não transmite" });
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema de alarme não encontrado ou sem cliente ativo vinculado" });
      if (system.brand !== "COMPATEC") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Inibição física de zona está disponível somente para Compatec" });
      }
      if (input.incidentId) {
        const incident = await db.getIncident(input.incidentId);
        if (!incident || incident.alarmSystemId !== system.id || incident.status === "closed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O atendimento informado não está aberto para esta central Compatec" });
        }
      }
      const targetError = validateCompatecPhysicalZoneTarget(input);
      if (targetError) throw new TRPCError({ code: "BAD_REQUEST", message: targetError });
      const zone = (await db.listAlarmZones(system.id)).find((item) => item.zoneNumber === input.zoneNumber && item.isActive);
      if (!zone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Zona ${input.zoneNumber} não consta como ativa no cadastro desta central` });
      }

      const commandPayload = buildCompatecPhysicalZonePayload({
        commandType: input.commandType,
        zoneNumber: input.zoneNumber,
        requestedBy: input.requestedBy,
      });
      const reservation = await db.createExclusiveCompatecPhysicalCommand({
        alarmSystemId: system.id,
        incidentId: input.incidentId ?? null,
        operatorId: ctx.user.id,
        brand: "COMPATEC",
        commandType: input.commandType,
        transportMode: "microbus_compatec",
        status: "queued",
        partition: null,
        zoneNumber: input.zoneNumber,
        pgmNumber: null,
        reason: input.reason,
        commandPayload,
        responsePayload: "Aguardando sessão TCP identificada pelo cadastro físico Compatec e porta compatível do receptor.",
      });
      if (!reservation.created) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe um comando físico Compatec em andamento (comando ${reservation.activeCommandId}, status ${reservation.activeStatus}). Aguarde o resultado antes de solicitar outro.` });
      }

      if (input.incidentId) {
        await db.appendIncidentNote(input.incidentId, system.id, buildRemoteCommandRequestNote({
          commandId: reservation.id,
          commandType: input.commandType,
          operatorName: ctx.user.name || "Operador autenticado",
          requestedBy: input.requestedBy,
          zoneNumber: input.zoneNumber,
          reason: input.reason,
        }));
      }

      const dispatched = await db.dispatchAlarmRemoteCommand({
        alarmSystemId: system.id,
        commandId: reservation.id,
        requiredZoneNumber: input.zoneNumber,
        expectedStatuses: ["queued"],
        unavailableStatus: "waiting_connection",
        sentResponsePayload: `Sequência de zona AK2→AK1 enviada; aguardando resposta KA1 da central (comando ${reservation.id}).`,
        send: () => sendCompatecMw1PhysicalCommand({
          alarmSystemId: system.id,
          commandId: reservation.id,
          payload: commandPayload,
        }),
      });
      return {
        id: reservation.id,
        status: dispatched.status,
        message: dispatched.sent
          ? "Quadros AK2→AK1 enviados. A resposta KA1 informa recebimento do comando, mas não confirma o estado final do bypass."
          : dispatched.message,
      };
    }),
  }),
  alarmPgm: router({
    list: partnerDataProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
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
    list: partnerDataProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      return db.listAlarmSchedules(input.alarmSystemId);
    }),
    save: partnerDataProcedure.input(z.object({
      alarmSystemId: z.number(),
      partition: z.number().int().min(1).max(8).default(1),
      name: z.string().max(255).optional(),
      isActive: z.boolean(),
      mondayArm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(), mondayDisarm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
      tuesdayArm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(), tuesdayDisarm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
      wednesdayArm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(), wednesdayDisarm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
      thursdayArm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(), thursdayDisarm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
      fridayArm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(), fridayDisarm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
      saturdayArm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(), saturdayDisarm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
      sundayArm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(), sundayDisarm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
      holidayArm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(), holidayDisarm: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const result = await db.upsertAlarmSchedule(input);
      if (!input.isActive) await db.resolveAlarmScheduleAlerts({ alarmSystemId: input.alarmSystemId });
      return result;
    }),
    create: partnerDataProcedure.input(z.object({
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
    })).mutation(async ({ input, ctx }) => { await assertPartnerSystemScope(ctx, input.alarmSystemId); return db.createAlarmSchedule(input); }),
    exceptions: partnerDataProcedure.input(z.object({ alarmSystemId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const [items, audit] = await Promise.all([
        db.listAlarmScheduleOverrides(input.alarmSystemId),
        db.listAlarmScheduleOverrideAudit(input.alarmSystemId),
      ]);
      return { items, audit };
    }),
    report: operatorProcedure.input(z.object({
      limit: z.number().int().min(1).max(2000).optional(),
      dateFrom: z.string().optional(), dateTo: z.string().optional(),
      account: z.string().optional(), clientId: z.number().optional(), partnerCompanyId: z.number().optional(),
    })).query(({ input, ctx }) => {
      if (ctx.user.role === "partner" && !ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
      return db.listAlarmScheduleAlerts({
        ...input,
        status: "all",
        partnerCompanyId: ctx.user.role === "partner" ? ctx.user.partnerId! : input.partnerCompanyId,
      });
    }),
    saveException: partnerDataProcedure.input(z.object({
      alarmSystemId: z.number(),
      overrideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      mode: z.enum(["suspended", "override"]),
      duration: z.enum(["hour", "day", "week"]).default("day"),
      armAt: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
      disarmAt: z.string().regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d)$/).optional(),
      requester: z.string().trim().min(2).max(255),
      reason: z.string().trim().min(5).max(2000),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerSystemScope(ctx, input.alarmSystemId);
      const system = await db.getOperationalAlarmSystem(input.alarmSystemId);
      if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Sistema não encontrado" });
      const requester = input.requester.trim();
      const reason = input.reason.trim();
      return db.saveAlarmScheduleOverride({
        ...input,
        requester,
        reason,
        operatorId: ctx.user.id,
        operatorName: ctx.user.name || `Operador ${ctx.user.id}`,
      });
    }),
    cancelException: partnerDataProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const override = await db.getAlarmScheduleOverride(input.id);
      if (!override) throw new TRPCError({ code: "NOT_FOUND", message: "Exceção de agenda não encontrada" });
      await assertPartnerSystemScope(ctx, override.alarmSystemId);
      return db.cancelAlarmScheduleOverride({ id: input.id, operatorId: ctx.user.id, operatorName: ctx.user.name || `Operador ${ctx.user.id}` });
    }),
  }),
  clientProcedure: router({
    list: partnerDataProcedure.input(z.object({ clientId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      await assertPartnerClientScope(ctx, input.clientId);
      return db.listClientProcedures(input.clientId);
    }),
    treatment: operatorProcedure.input(z.object({ clientId: z.number().int().positive(), eventId: z.number().int().positive() })).query(({ input }) => db.getClientProcedureTreatment(input.clientId, input.eventId)),
    create: procedureManagerProcedure.input(z.object({
      clientId: z.number().int().positive(),
      procedureType: z.enum(PROCEDURE_TYPES).default("general"),
      title: z.string().trim().min(1).max(255),
      description: z.string().trim().min(1).max(20000),
      priority: z.number().int().min(1).max(1000).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerClientScope(ctx, input.clientId);
      if (ctx.user.role !== "partner" && !await db.getClient(input.clientId)) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
      return db.createClientProcedure(input);
    }),
    update: procedureManagerProcedure.input(z.object({
      id: z.number().int().positive(), procedureType: z.enum(PROCEDURE_TYPES).optional(),
      title: z.string().trim().min(1).max(255).optional(), description: z.string().trim().min(1).max(20000).optional(),
      priority: z.number().int().min(1).max(1000).optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const row = await db.getClientProcedure(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Providência não encontrada" });
      await assertPartnerClientScope(ctx, row.clientId);
      const { id, ...data } = input;
      return db.updateClientProcedure(id, row.clientId, data);
    }),
    deactivate: procedureManagerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const row = await db.getClientProcedure(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Providência não encontrada" });
      await assertPartnerClientScope(ctx, row.clientId);
      return db.updateClientProcedure(input.id, row.clientId, { isActive: false });
    }),
  }),
  partnerHoliday: router({
    list: partnerDataProcedure.input(z.object({ partnerCompanyId: z.number() })).query(async ({ input, ctx }) => {
      await assertPartnerCompanyScope(ctx, input.partnerCompanyId);
      return db.listPartnerHolidays(input.partnerCompanyId);
    }),
    create: partnerDataProcedure.input(z.object({
      partnerCompanyId: z.number(),
      name: z.string().min(1),
      date: z.string().min(4),
      type: z.enum(["nacional", "municipal"]).optional(),
      
    })).mutation(async ({ input, ctx }) => {
      await assertPartnerCompanyScope(ctx, input.partnerCompanyId);
      return db.createPartnerHoliday({ ...input, partnerCompanyId: ctx.user.role === "partner" ? ctx.user.partnerId! : input.partnerCompanyId });
    }),
    update: partnerDataProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      date: z.string().min(4).optional(),
      type: z.enum(["nacional", "municipal"]).optional(),
    })).mutation(async ({ input, ctx }) => { const { id, ...data } = input; await assertPartnerHolidayRecordScope(ctx, id); return db.updatePartnerHoliday(id, data); }),
    delete: partnerDataProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => { await assertPartnerHolidayRecordScope(ctx, input.id); return db.deletePartnerHoliday(input.id); }),
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
    operatorNames: operatorProcedure.query(({ ctx }) => {
      if (ctx.user.role === "partner") {
        if (!ctx.user.partnerId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário Parceiro sem empresa vinculada" });
        return db.listOccurrenceOperatorNames(ctx.user.partnerId);
      }
      return db.listOccurrenceOperatorNames();
    }),
    list: operatorProcedure.input(z.object({
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
    getById: operatorProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
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
    })).mutation(async ({ input, ctx }) => {
      const { incidentId, ...occurrence } = input;
      const operatorName = ctx.user.name || `Operador ${ctx.user.id}`;
      if (incidentId) await assertIncidentPartnerScope(ctx, incidentId);
      if (!incidentId) return db.createOccurrence({ ...occurrence, operatorId: ctx.user.id, operatorName });
      const result = await db.createOccurrenceAndCloseIncident(incidentId, occurrence, ctx.user.id, operatorName, ctx.authSessionId);
      emitIncidentStateChanged({ incidentId, incidentStatus: "closed", operatorId: ctx.user.id, operatorName, action: "status_changed" });
      return result;
    }),
  }),
  operatorShift: router({
    loginScheduleDecision: protectedProcedure.query(({ ctx }) => {
      if (ctx.user.role === "partner") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso permitido apenas à equipe operacional" });
      if (!ctx.authSessionId || !["admin", "supervisor", "operator"].includes(ctx.user.role)) return { required: false, scheduleStatus: null, reason: null, attendanceId: null };
      return operatorShiftDb.getLoginScheduleDecision({ userId: ctx.user.id, authSessionId: ctx.authSessionId });
    }),
    confirmLoginScheduleException: protectedProcedure.input(z.object({ reason: z.enum(["scale_swap", "double_shift", "vacation_coverage"]) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "operator") throw new TRPCError({ code: "FORBIDDEN", message: "Somente operadores precisam informar esta justificativa" });
      if (!ctx.authSessionId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão operacional não identificada" });
      return operatorShiftDb.confirmLoginScheduleException({ userId: ctx.user.id, authSessionId: ctx.authSessionId, reason: input.reason });
    }),
    reportUsers: supervisorProcedure.query(() => operatorShiftDb.listOperatorShiftAssignments()),
    recipients: operatorProcedure.query(({ ctx }) => operatorShiftDb.listOperatorMessageRecipients(ctx.user.id)),
    sendMessage: operatorProcedure.input(z.object({ toUserId: z.number().int().positive(), message: z.string().trim().min(10).max(4000) })).mutation(async ({ input, ctx }) => {
      if (!ctx.authSessionId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão operacional não identificada" });
      const result = await operatorShiftDb.sendOperatorShiftMessage({ ...input, userId: ctx.user.id, authSessionId: ctx.authSessionId });
      emitOperatorShiftNotice({ kind: "shift_message", messageId: result.id, userId: result.toUserId, fromOperatorName: result.fromOperatorName, toOperatorName: result.toOperatorName, incidentId: null, account: null });
      return { success: true, id: result.id };
    }),
    inbox: operatorProcedure.query(async ({ ctx }) => {
      const messages = await operatorShiftDb.listOperatorShiftInbox(ctx.user.id);
      return messages.map((message) => ({ ...message, notificationSessionId: ctx.authSessionId ?? null }));
    }),
    markRead: operatorProcedure.input(z.object({ messageId: z.number().int().positive() })).mutation(({ input, ctx }) => operatorShiftDb.markOperatorShiftMessageRead({ messageId: input.messageId, userId: ctx.user.id })),
    pendingReminders: operatorProcedure.query(({ ctx }) => {
      if (!ctx.authSessionId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão operacional não identificada" });
      return operatorShiftDb.listPendingOperatorShiftReminders({ userId: ctx.user.id, authSessionId: ctx.authSessionId });
    }),
    acknowledgeReminder: operatorProcedure.input(z.object({ reminderId: z.number().int().positive() })).mutation(({ input, ctx }) => operatorShiftDb.acknowledgeOperatorShiftReminder({ reminderId: input.reminderId, userId: ctx.user.id })),
    logoutPreview: operatorProcedure.query(({ ctx }) => {
      if (!ctx.authSessionId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão operacional não identificada" });
      return operatorShiftDb.getOperatorLogoutPreview({ userId: ctx.user.id, authSessionId: ctx.authSessionId });
    }),
    report: supervisorProcedure.input(z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), userId: z.number().int().positive().optional() })).query(({ input }) => operatorShiftDb.getOperatorShiftReport(input)),
    exceptions: adminProcedure.input(z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).query(({ input }) => operatorShiftDb.listOperatorShiftExceptions(input.fromDate, input.toDate)),
    swap: adminProcedure.input(z.object({
      firstUserId: z.number().int().positive(), firstWorkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      secondUserId: z.number().int().positive(), secondWorkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      shiftOnFirstDate: z.enum(["first", "second", "third", "commercial"]), shiftOnSecondDate: z.enum(["first", "second", "third", "commercial"]),
      reason: z.string().trim().min(5).max(500),
    })).mutation(({ input, ctx }) => operatorShiftDb.createOperatorShiftExceptionSwap({ ...input, createdBy: ctx.user.id })),
  }),
  systemUser: router({
    list: adminProcedure.query(() => db.listSystemUsers()),
    shiftAssignments: adminProcedure.query(() => operatorShiftDb.listOperatorShiftAssignments()),
    create: adminProcedure.input(z.object({ name: z.string(), email: z.string(), password: z.string(), role: z.enum(["admin", "supervisor", "operator", "partner"]).default("operator"), partnerId: z.number().optional(), shiftAssignment: z.object({ shiftCode: z.enum(["first", "second", "third", "commercial"]), effectiveFromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cycleAnchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), changeReason: z.string().trim().min(5).max(500) }).optional() })).mutation(async ({ input, ctx }) => {
      if (input.role === "partner" && !input.partnerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a empresa parceira deste usuário" });
      if (input.shiftAssignment && input.role === "partner") throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário parceiro não recebe escala de operador" });
      const hashedPassword = await bcrypt.hash(input.password, 10);
      return db.createSystemUser({ ...input, shiftAssignment: input.shiftAssignment ? { ...input.shiftAssignment, changedBy: ctx.user.id } : undefined, password: hashedPassword });
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
      role: z.enum(["admin", "supervisor", "operator", "partner"]).optional(),
      partnerId: z.number().nullable().optional(),
      shiftAssignment: z.object({ shiftCode: z.enum(["first", "second", "third", "commercial"]), effectiveFromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cycleAnchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), changeReason: z.string().trim().min(5).max(500) }).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, password, ...data } = input;
      if (data.role === "partner" && !data.partnerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a empresa parceira deste usuário" });
      if (data.shiftAssignment && data.role === "partner") throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário parceiro não recebe escala de operador" });
      const shiftAssignment = data.shiftAssignment ? { ...data.shiftAssignment, changedBy: ctx.user.id } : undefined;
      return db.updateSystemUser(id, { ...data, shiftAssignment, ...(password ? { password: await bcrypt.hash(password, 10) } : {}) });
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
