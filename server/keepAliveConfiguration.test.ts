import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schemaSource = fs.readFileSync(path.resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("persistência da configuração operacional de Keep Alive", () => {
  it("mantém frequência, falha, alerta e repetição por sistema", () => {
    expect(schemaSource).toContain('keepAliveExpectedIntervalSeconds: int("keepAliveExpectedIntervalSeconds").default(60).notNull()');
    expect(schemaSource).toContain('keepAliveFailureEventEnabled: boolean("keepAliveFailureEventEnabled").default(false).notNull()');
    expect(schemaSource).toContain('keepAliveDisconnectAlertEnabled: boolean("keepAliveDisconnectAlertEnabled").default(true).notNull()');
    expect(schemaSource).toContain('keepAliveRepeatAlertEveryMinutes: int("keepAliveRepeatAlertEveryMinutes").default(60).notNull()');
    expect(routerSource).toContain("keepAliveExpectedIntervalSeconds: z.number().int().min(1).max(86400).optional()");
    expect(routerSource).toContain("keepAliveRepeatAlertEveryMinutes: z.number().int().min(1).max(10080).optional()");
  });
});
