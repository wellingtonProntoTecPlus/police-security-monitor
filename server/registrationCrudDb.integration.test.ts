import { beforeEach, describe, expect, it } from "vitest";
import {
  createAlarmSystem,
  createAlarmUser,
  createClient,
  createClientProcedure,
  createContactId,
  createFinalization,
  createSystemUser,
  setDbForTesting,
  updateAlarmSystem,
  updateAlarmUser,
  updateClient,
  updateContactId,
  updateFinalization,
  updateSystemUser,
  generateIsepId,
  isValidIsepId,
} from "./db";

const inserted: unknown[] = [];
const updated: unknown[] = [];
let currentSystem: Record<string, unknown> = { id: 1, brand: "VIAWEB", account: "0336", isepId: "693E" };

const fakeDb = {
  insert: () => ({
    values: async (value: unknown) => {
      inserted.push(value);
      return [{ insertId: 1 }];
    },
  }),
  update: () => ({
    set: (value: unknown) => ({
      where: async () => {
        updated.push(value);
      },
    }),
  }),
  delete: () => ({
    where: async () => undefined,
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [currentSystem],
      }),
    }),
  }),
};

describe("CRUDs reais com textos padronizados", () => {
  beforeEach(() => {
    inserted.length = 0;
    updated.length = 0;
    currentSystem = { id: 1, brand: "VIAWEB", account: "0336", isepId: "693E" };
    setDbForTesting(fakeDb as any);
  });

  it("persiste sistema normalizado e preserva identificadores técnicos", async () => {
    await createAlarmSystem({ clientId: 1, brand: "VIAWEB", account: "03-36", model: "central principal", macAddress: "c1-bd-cb", imeiGprs: "12 34 56", simCardNumber: "8955032123456789012", simPhoneNumber: "11987654321", serialNumber: "2801-936621", isepId: "69-3e", firmwareVersion: "V4.0" } as any);
    await updateAlarmSystem(1, { model: "central reserva", account: "03-37", macAddress: "aa-bb-cc", imeiGprs: "65 43 21", simCardNumber: "8955032123456789013", simPhoneNumber: "11987654322", serialNumber: "9876-543210", isepId: "69-3e", firmwareVersion: "V5.0" } as any);

    expect(inserted[0]).toMatchObject({ model: "Central Principal", account: "0336", macAddress: "C1BDCB", imeiGprs: "123456", simCardNumber: "8955032123456789012", simPhoneNumber: "11987654321", serialNumber: "2801936621", isepId: "693E", firmwareVersion: "V4.0" });
    expect(updated[0]).toMatchObject({ model: "Central Reserva", account: "0337", macAddress: "AABBCC", imeiGprs: "654321", simCardNumber: "8955032123456789013", simPhoneNumber: "11987654322", serialNumber: "9876543210", isepId: "693E", firmwareVersion: "V5.0" });
  });

  it("gera ISEP ViaWeb com quatro caracteres hexadecimais e recusa letras inválidas", async () => {
    currentSystem = undefined as any;
    const generated = await generateIsepId();
    expect(generated).toMatch(/^[0-9A-F]{4}$/);
    expect(isValidIsepId("A0F9")).toBe(true);
    expect(isValidIsepId("LYUL")).toBe(false);
    await expect(createAlarmSystem({ clientId: 1, brand: "VIAWEB", account: "0337", isepId: "LYUL" } as any))
      .rejects.toThrow("4 caracteres hexadecimais");
  });

  it("persiste a classificação do cliente e apartamentos sem restringir vários usuários por unidade", async () => {
    await createClient({ partnerCompanyId: 1, type: "pj", propertyType: "condominium", name: "condomínio das flores" } as any);
    await updateClient(1, { propertyType: "company" } as any);
    currentSystem = { id: 1, alarmSystemId: 1, userNumber: 11, name: "Porteiro Manhã", apartmentNumber: "1204" };
    await createAlarmUser({ alarmSystemId: 1, userNumber: 11, name: "porteiro manhã", apartmentNumber: "1204" } as any);
    currentSystem = { id: 2, alarmSystemId: 1, userNumber: 12, name: "Morador", apartmentNumber: "1204" };
    await createAlarmUser({ alarmSystemId: 1, userNumber: 12, name: "morador", apartmentNumber: "1204" } as any);
    await updateAlarmUser(1, { apartmentNumber: "1205" } as any);

    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ propertyType: "condominium", name: "Condomínio das Flores" }),
      expect.objectContaining({ alarmSystemId: 1, userNumber: 11, apartmentNumber: "1204" }),
      expect.objectContaining({ alarmSystemId: 1, userNumber: 12, apartmentNumber: "1204" }),
    ]));
    expect(updated).toEqual(expect.arrayContaining([
      expect.objectContaining({ propertyType: "company" }),
      expect.objectContaining({ apartmentNumber: "1205" }),
    ]));
  });

  it("persiste usuários, finalizações, procedimentos e códigos com a regra correta", async () => {
    await createSystemUser({ name: "JOÃO DA SILVA", email: "joao@example.com", password: "hash", role: "operator" });
    await updateSystemUser(1, { name: "MARIA DE SOUZA" });
    await createFinalization({ title: "contato realizado", category: "outros" } as any);
    await updateFinalization(1, { title: "visita técnica agendada" } as any);
    await createClientProcedure({ clientId: 1, title: "avisar o responsável", description: "MANTER TEXTO" } as any);
    await createContactId({ code: "E401", description: "ARME DO SISTEMA", fabricante: "VETTI", tipo: "arme", cor: "green", abreTela: false });
    await updateContactId(1, { code: "R401", qualifier: "R", description: "RESTAURO DO SISTEMA", fabricante: "VETTI", tipo: "restauro", cor: "blue", abreTela: false });

    expect(inserted.map((value) => value as Record<string, unknown>)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "João da Silva" }),
      expect.objectContaining({ title: "Contato Realizado" }),
      expect.objectContaining({ title: "Avisar o Responsável", description: "MANTER TEXTO" }),
      expect.objectContaining({ code: "E401", description: "ARME DO SISTEMA" }),
    ]));
    expect(updated).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Maria de Souza" }),
      expect.objectContaining({ title: "Visita Técnica Agendada" }),
      expect.objectContaining({ code: "R401", qualifier: "R", description: "RESTAURO DO SISTEMA" }),
    ]));
  });
});
