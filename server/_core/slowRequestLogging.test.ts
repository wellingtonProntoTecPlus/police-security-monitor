import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createSlowRequestLoggingMiddleware } from "./slowRequestLogging";

function createResponse() {
  const response = new EventEmitter() as EventEmitter & { statusCode: number };
  response.statusCode = 200;
  return response as Response & EventEmitter;
}

describe("registro de requisições lentas", () => {
  it("registra somente rota/status/duração quando a requisição passa de um segundo", () => {
    let now = 100;
    const warn = vi.fn();
    const next = vi.fn() as unknown as NextFunction;
    const middleware = createSlowRequestLoggingMiddleware({ now: () => now, warn });
    const request = { path: "/api/trpc/auth.me", method: "GET", originalUrl: "/api/trpc/auth.me?secret=nao-registrar" } as Request;
    const response = createResponse();

    middleware(request, response, next);
    expect(next).toHaveBeenCalledOnce();
    now += 1_200;
    response.emit("finish");

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[HTTP-LENTO] GET /api/trpc/auth.me status=200 duracao_ms=1200");
    expect(warn.mock.calls[0][0]).not.toContain("secret");
  });

  it("não mede polling do Socket.IO nem registra solicitações rápidas", () => {
    let now = 100;
    const warn = vi.fn();
    const next = vi.fn() as unknown as NextFunction;
    const middleware = createSlowRequestLoggingMiddleware({ now: () => now, warn });
    const socketRequest = { path: "/api/socket.io/", method: "GET" } as Request;
    const socketResponse = createResponse();
    middleware(socketRequest, socketResponse, next);
    now += 5_000;
    socketResponse.emit("finish");

    const quickRequest = { path: "/api/trpc/auth.me", method: "GET" } as Request;
    const quickResponse = createResponse();
    middleware(quickRequest, quickResponse, next);
    now += 200;
    quickResponse.emit("finish");

    expect(warn).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(2);
  });
});
