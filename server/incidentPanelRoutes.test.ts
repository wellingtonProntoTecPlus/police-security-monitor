import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

const leaseToken = "00000000-0000-4000-8000-000000000001";
function context(role: "operator" | "partner" = "operator"): TrpcContext {
  return { user: { id:1,name:"Amanda",openId:"panel-route",role,partnerId:1,email:"test@example.invalid",createdAt:new Date(),updatedAt:new Date(),lastSignedIn:new Date(),loginMethod:"test" } as any,authSessionId:101,authSessionTokenHash:"a".repeat(64),req:{headers:{}} as any,res:{clearCookie:vi.fn()} as any };
}
afterEach(()=>vi.restoreAllMocks());
describe("Painel operacional · rotas de concessão",()=>{
  it("nega as três rotas ao parceiro antes de consultar ou modificar banco",async()=>{
    const open=vi.spyOn(db,"openIncidentPanel"); const renew=vi.spyOn(db,"renewIncidentPanel"); const pause=vi.spyOn(db,"pauseIncidentPanel");
    const partner=appRouter.createCaller(context("partner"));
    await expect(partner.incident.openPanel({incidentId:20,leaseToken,assume:true})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(partner.incident.renewPanel({incidentId:20,leaseToken})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(partner.incident.pausePanel({incidentId:20,leaseToken,reason:"Cliente pediu para aguardar."})).rejects.toMatchObject({code:"FORBIDDEN"});
    expect(open).not.toHaveBeenCalled();expect(renew).not.toHaveBeenCalled();expect(pause).not.toHaveBeenCalled();
  });
  it("usa identidade/autenticação do servidor e não aceita operador ou horário fornecido pelo navegador",async()=>{
    vi.spyOn(db,"getIncident").mockResolvedValue({id:20} as any);
    const open=vi.spyOn(db,"openIncidentPanel").mockResolvedValue({id:20,parentIncidentId:null,status:"observing",operatorId:1,operatorName:"Amanda",leaseToken} as any);
    const caller=appRouter.createCaller(context());
    await caller.incident.openPanel({incidentId:20,leaseToken,assume:true});
    expect(open).toHaveBeenCalledWith({incidentId:20,leaseToken,assume:true},{operatorId:1,operatorName:"Amanda",authSessionId:101,leaseToken});
    await expect(caller.incident.openPanel({incidentId:20,leaseToken,assume:true,operatorId:99,expiresAt:new Date()} as any)).rejects.toMatchObject({code:"BAD_REQUEST"});
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("recusa pausa e observação sem motivo, inclusive branco, antes de gravar",async()=>{
    const pause=vi.spyOn(db,"pauseIncidentPanel"); const observe=vi.spyOn(db,"putIncidentInObservation");
    const caller=appRouter.createCaller(context());
    for(const reason of [undefined,"","   ","oi"]){
      await expect(caller.incident.pausePanel({incidentId:20,leaseToken,reason} as any)).rejects.toMatchObject({code:"BAD_REQUEST"});
      await expect(caller.incident.observe({incidentId:20,leaseToken,until:new Date(Date.now()+60000),notes:reason} as any)).rejects.toMatchObject({code:"BAD_REQUEST"});
    }
    expect(pause).not.toHaveBeenCalled();expect(observe).not.toHaveBeenCalled();
  });
  it("recusa início de manutenção sem motivo ou sem concessão",async()=>{
    const start=vi.spyOn(db,"startSystemMaintenanceForOperator");
    const caller=appRouter.createCaller(context());
    const input={systemId:10,incidentId:20,leaseToken,startAt:new Date(),endAt:new Date(Date.now()+3600000)};
    await expect(caller.alarmSystem.startMaintenance({...input,notes:"  "})).rejects.toMatchObject({code:"BAD_REQUEST"});
    await expect(caller.alarmSystem.startMaintenance({...input,leaseToken:undefined,notes:"Troca programada de equipamento"} as any)).rejects.toMatchObject({code:"BAD_REQUEST"});
    expect(start).not.toHaveBeenCalled();
  });
  it("encaminha token e motivo da pausa ao helper autenticado",async()=>{
    vi.spyOn(db,"getIncident").mockResolvedValue({id:20} as any);
    const pause=vi.spyOn(db,"pauseIncidentPanel").mockResolvedValue({id:20,status:"attending",pauseReason:"Aguardando o tático"} as any);
    await appRouter.createCaller(context()).incident.pausePanel({incidentId:20,leaseToken,reason:"  Aguardando o tático  "});
    expect(pause).toHaveBeenCalledWith(20,"Aguardando o tático",{operatorId:1,operatorName:"Amanda",authSessionId:101,leaseToken});
  });
});
