import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

// ============================================================
// ADMIN PROCEDURE
// ============================================================
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new Error('Acesso negado. Apenas administradores.');
  }
  return next({ ctx });
});

const operatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'operator', 'partner'].includes(ctx.user.role)) {
    throw new Error('Acesso negado.');
  }
  return next({ ctx });
});

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
  }),

  // ============================================================
  // MANAGING COMPANIES
  // ============================================================
  managingCompany: router({
    list: protectedProcedure.query(() => db.listManagingCompanies()),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getManagingCompany(input.id)),
    create: adminProcedure.input(z.object({
      name: z.string().min(1),
      cnpj: z.string().min(14),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().email().optional(),
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
      email: z.string().email().optional(),
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
    list: protectedProcedure.input(z.object({ managingCompanyId: z.number().optional() }).optional()).query(({ input }) => db.listPartnerCompanies(input?.managingCompanyId)),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getPartnerCompany(input.id)),
    create: adminProcedure.input(z.object({
      managingCompanyId: z.number(),
      name: z.string().min(1),
      cnpj: z.string().min(14),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().email().optional(),
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
      email: z.string().email().optional(),
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
  // ============================================================
  monitoredClient: router({
    list: protectedProcedure.input(z.object({ partnerCompanyId: z.number().optional() }).optional()).query(({ input }) => db.listClients(input?.partnerCompanyId)),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getClient(input.id)),
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
    list: protectedProcedure.input(z.object({ clientId: z.number() })).query(({ input }) => db.listClientContacts(input.clientId)),
    create: operatorProcedure.input(z.object({
      clientId: z.number(),
      name: z.string().min(1),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().email().optional(),
      role: z.string().optional(),
      priority: z.number().optional(),
    })).mutation(({ input }) => db.createClientContact(input)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      role: z.string().optional(),
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
    list: protectedProcedure.input(z.object({ clientId: z.number().optional() }).optional()).query(({ input }) => db.listAlarmSystems(input?.clientId)),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getAlarmSystem(input.id)),
    getByAccount: protectedProcedure.input(z.object({ account: z.string() })).query(({ input }) => db.getAlarmSystemByAccount(input.account)),
    create: operatorProcedure.input(z.object({
      clientId: z.number(),
      account: z.string().min(4),
      brand: z.enum(["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"]),
      model: z.string().optional(),
      firmwareVersion: z.string().optional(),
      communicationType: z.enum(["ethernet", "gprs", "both"]).optional(),
      macAddress: z.string().max(6).optional(),
      viawebCode: z.string().max(4).optional(),
      partitions: z.number().optional(),
      receiverPort: z.number().optional(),
      ipAddress: z.string().optional(),
      installDate: z.date().optional(),
      batteryDate: z.date().optional(),
    })).mutation(({ input }) => db.createAlarmSystem(input)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      account: z.string().optional(),
      brand: z.enum(["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"]).optional(),
      model: z.string().optional(),
      firmwareVersion: z.string().optional(),
      communicationType: z.enum(["ethernet", "gprs", "both"]).optional(),
      macAddress: z.string().max(6).optional(),
      viawebCode: z.string().max(4).optional(),
      partitions: z.number().optional(),
      receiverPort: z.number().optional(),
      ipAddress: z.string().optional(),
      isActive: z.boolean().optional(),
      installDate: z.date().optional(),
      batteryDate: z.date().optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateAlarmSystem(id, data);
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteAlarmSystem(input.id)),
  }),

  // ============================================================
  // ALARM ZONES
  // ============================================================
  alarmZone: router({
    list: protectedProcedure.input(z.object({ alarmSystemId: z.number() })).query(({ input }) => db.listAlarmZones(input.alarmSystemId)),
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
    list: protectedProcedure.input(z.object({ alarmSystemId: z.number() })).query(({ input }) => db.listAlarmUsers(input.alarmSystemId)),
    create: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      userNumber: z.number(),
      name: z.string().min(1),
      phone: z.string().optional(),
    })).mutation(({ input }) => db.createAlarmUser(input)),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      userNumber: z.number().optional(),
      name: z.string().optional(),
      phone: z.string().optional(),
    })).mutation(({ input }) => { const { id, ...data } = input; return db.updateAlarmUser(id, data); }),
    delete: operatorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteAlarmUser(input.id)),
  }),

  // ============================================================
  // CAMERAS
  // ============================================================
  camera: router({
    list: protectedProcedure.input(z.object({ clientId: z.number() })).query(({ input }) => db.listCameras(input.clientId)),
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
  }),

  // ============================================================
  // INCIDENTS
  // ============================================================
  incident: router({
    list: operatorProcedure.input(z.object({ status: z.string().optional() }).optional()).query(({ input }) => db.listIncidents(input?.status)),
    get: operatorProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getIncident(input.id)),
    create: operatorProcedure.input(z.object({
      eventId: z.number(),
      alarmSystemId: z.number().optional(),
      clientId: z.number().optional(),
      priority: z.enum(["critical", "high", "medium", "low"]).optional(),
      notes: z.string().optional(),
    })).mutation(({ input, ctx }) => db.createIncident({ ...input, operatorId: ctx.user.id })),
    update: operatorProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["waiting", "attending", "observing", "dispatched", "closed"]).optional(),
      notes: z.string().optional(),
      resolution: z.string().optional(),
      operatorId: z.number().optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      if (data.status === 'dispatched') (data as any).dispatchedAt = new Date();
      if (data.status === 'closed') (data as any).closedAt = new Date();
      return db.updateIncident(id, data);
    }),
  }),

  // ============================================================
  // CONTACT ID CODES
  // ============================================================
  contactIdCode: router({
    list: protectedProcedure.query(() => db.listContactIdCodes()),
    get: protectedProcedure.input(z.object({ code: z.string() })).query(({ input }) => db.getContactIdDescription(input.code)),
  }),
  contactId: router({
    listByFabricante: publicProcedure.input(z.object({ fabricante: z.string() })).query(({ input }) => db.listContactIdByFabricante(input.fabricante)),
    create: publicProcedure.input(z.object({
      code: z.string().min(1),
      fabricante: z.string().min(1),
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
    update: publicProcedure.input(z.object({
      id: z.number(),
      code: z.string().min(1),
      fabricante: z.string().min(1),
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
    delete: publicProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteContactId(input.id)),
  }),

  // ============================================================
  // DASHBOARD
  // ============================================================
  dashboard: router({
    stats: operatorProcedure.query(() => db.getDashboardStats()),
  }),
  alarmPgm: router({
    list: protectedProcedure.input(z.object({ alarmSystemId: z.number() })).query(({ input }) => db.listAlarmPgms(input.alarmSystemId)),
    create: operatorProcedure.input(z.object({
      alarmSystemId: z.number(),
      pgmNumber: z.number().min(1).max(16),
      name: z.string().min(1),
      type: z.string().optional(),
    })).mutation(({ input }) => db.createAlarmPgm(input)),
  }),
  alarmSchedule: router({
    list: protectedProcedure.input(z.object({ alarmSystemId: z.number() })).query(({ input }) => db.listAlarmSchedules(input.alarmSystemId)),
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
    list: protectedProcedure.input(z.object({ clientId: z.number() })).query(({ input }) => db.listClientProcedures(input.clientId)),
    create: operatorProcedure.input(z.object({
      clientId: z.number(),
      title: z.string().min(1),
      description: z.string().min(1),
      priority: z.number().optional(),
    })).mutation(({ input }) => db.createClientProcedure(input)),
  }),
  partnerHoliday: router({
    list: protectedProcedure.input(z.object({ partnerCompanyId: z.number() })).query(({ input }) => db.listPartnerHolidays(input.partnerCompanyId)),
    create: operatorProcedure.input(z.object({
      partnerCompanyId: z.number(),
      name: z.string().min(1),
      date: z.string().min(8),
      recurring: z.boolean().optional(),
    })).mutation(({ input }) => db.createPartnerHoliday(input)),
    delete: operatorProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deletePartnerHoliday(input.id)),
  }),
  managingHoliday: router({
    list: protectedProcedure.input(z.object({ managingCompanyId: z.number() })).query(({ input }) => db.listManagingHolidays(input.managingCompanyId)),
    create: adminProcedure.input(z.object({
      managingCompanyId: z.number(),
      name: z.string().min(1),
      date: z.string().min(8),
      recurring: z.boolean().optional(),
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
    }).optional()).query(({ input }) => db.listOccurrences(input || {})),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getOccurrenceById(input.id)),
    create: protectedProcedure.input(z.object({
      account: z.string(),
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
    })).mutation(({ input }) => db.createOccurrence(input)),
  }),
});

export type AppRouter = typeof appRouter;
