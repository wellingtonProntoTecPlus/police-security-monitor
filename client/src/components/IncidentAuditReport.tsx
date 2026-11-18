import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatIncidentAuditDateTime, incidentAuditActionLabel } from "@shared/incidentAudit";
import { toast } from "sonner";
import { getOperatorFacingIncidentNotes } from "@/lib/operatorFacingIncidentNotes";

export function parseAuditReportDateTime(value: string, end = false) {
  if (!value) return undefined;
  // These controls explicitly use Brasília business time, independent of the server TZ.
  const date = new Date(`${value.length === 16 ? `${value}:${end ? "59.999" : "00"}` : value}-03:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Data/hora inválida");
  return date;
}

export default function IncidentAuditReport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [account, setAccount] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [clientId, setClientId] = useState("");
  const [partnerCompanyId, setPartnerCompanyId] = useState("");
  const [filters, setFilters] = useState<{ from?: Date; to?: Date; account?: string; operatorName?: string; incidentId?: number; clientId?: number; partnerCompanyId?: number }>({});
  const [offset, setOffset] = useState(0);
  const clients = trpc.monitoredClient.list.useQuery(undefined);
  const partners = trpc.partnerCompany.list.useQuery(undefined);
  const query = trpc.incident.auditReport.useQuery({ ...filters, offset }, { retry: false });
  function search() {
    try {
      const start = parseAuditReportDateTime(from);
      const end = parseAuditReportDateTime(to, true);
      if (start && end && start > end) throw new Error("O início deve ser anterior ao fim");
      if (incidentId && (!Number.isSafeInteger(Number(incidentId)) || Number(incidentId) <= 0)) throw new Error("Número da ocorrência inválido");
      setFilters({ from: start, to: end, account: account.trim() || undefined, operatorName: operatorName.trim() || undefined, incidentId: incidentId ? Number(incidentId) : undefined, clientId: clientId ? Number(clientId) : undefined, partnerCompanyId: partnerCompanyId ? Number(partnerCompanyId) : undefined });
      setOffset(0);
    } catch (error) { toast.error((error as Error).message); }
  }
  function exportPage() {
    const rows = query.data?.items || [];
    const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [["Data/Hora Brasília", "Ocorrência", "Conta", "Cliente", "Operador", "Ação", "Detalhes"], ...rows.map((row) => [formatIncidentAuditDateTime(row.createdAt), row.incidentId, row.account, row.fantasyName || row.clientName, row.operatorName, incidentAuditActionLabel(row), getOperatorFacingIncidentNotes(row.note)])].map((row) => row.map(cell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `auditoria-ocorrencias-pagina-${offset / 100 + 1}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="space-y-4">
    <h2 className="text-xl font-bold">Logs de auditoria</h2>
    <p className="text-sm text-foreground">Histórico persistido de ações e transições, inclusive de ocorrências já finalizadas. Horários de Brasília. Registros anteriores que não eram auditados não podem ser reconstruídos.</p>
    <Card><CardContent className="grid gap-4 pt-5 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm font-medium">Data/hora inicial<Input aria-label="Data/hora inicial" type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="text-sm font-medium">Data/hora final<Input aria-label="Data/hora final" type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label className="text-sm font-medium">Conta<Input value={account} onChange={(event) => setAccount(event.target.value)} /></label>
      <label className="text-sm font-medium">Operador<Input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} placeholder="Nome do operador" /></label>
      <label className="text-sm font-medium">Ocorrência nº<Input type="number" min={1} value={incidentId} onChange={(event) => setIncidentId(event.target.value)} /></label>
      <label className="text-sm font-medium">Empresa parceira<select className="mt-1 h-9 w-full rounded border border-input bg-background p-2" value={partnerCompanyId} onChange={(event) => { setPartnerCompanyId(event.target.value); setClientId(""); }}><option value="">Todas as parceiras</option>{partners.data?.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
      <label className="text-sm font-medium">Cliente<select className="mt-1 h-9 w-full rounded border border-input bg-background p-2" value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Todos os clientes</option>{clients.data?.filter((client) => !partnerCompanyId || client.partnerCompanyId === Number(partnerCompanyId)).map((client) => <option key={client.id} value={client.id}>{client.fantasyName || client.name}</option>)}</select></label>
      <div className="flex items-end gap-2"><Button onClick={search}>Consultar logs</Button><Button variant="outline" onClick={() => { setFilters({}); setOffset(0); setFrom(""); setTo(""); setAccount(""); setOperatorName(""); setIncidentId(""); setClientId(""); setPartnerCompanyId(""); }}>Limpar</Button></div>
    </CardContent></Card>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">Até 100 registros por página · mais recentes primeiro. A paginação não apaga o histórico.</p><Button variant="outline" onClick={exportPage} disabled={!query.data?.items.length || query.isFetching}>Exportar esta página CSV</Button></div>
    {query.isLoading ? <p role="status">Carregando logs…</p> : query.error ? <p role="alert" className="text-destructive">Não foi possível carregar a auditoria.<Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button></p> : <div className="overflow-x-auto rounded border border-border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{["Data/Hora", "Ocorrência", "Conta / Cliente", "Operador", "Ação / Detalhes"].map((title) => <th key={title} className="p-3 text-left">{title}</th>)}</tr></thead><tbody>{query.data?.items.map((row) => { const shortNote = getOperatorFacingIncidentNotes(row.note); return <tr key={row.id} className="border-t border-border"><td className="whitespace-nowrap p-3">{formatIncidentAuditDateTime(row.createdAt)}</td><td className="p-3">#{row.incidentId}</td><td className="p-3">{row.account || "—"}<p>{row.fantasyName || row.clientName || "Cliente não identificado"}</p></td><td className="p-3 font-semibold">{row.operatorName}</td><td className="p-3"><strong>{incidentAuditActionLabel(row)}</strong><p className="mt-1 line-clamp-2 whitespace-pre-line break-words" title={shortNote}>{shortNote}</p></td></tr>; })}{!query.data?.items.length && <tr><td colSpan={5} className="p-6 text-center">Nenhum log encontrado para os filtros.</td></tr>}</tbody></table></div>}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={offset === 0 || query.isFetching} onClick={() => setOffset((value) => Math.max(0, value - 100))}>Anterior</Button><span>Página {offset / 100 + 1}</span><Button variant="outline" disabled={!query.data?.hasMore || query.isFetching} onClick={() => setOffset((value) => value + 100)}>Próxima</Button></div>
  </div>;
}
