import { useState, type FormEvent } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { PROCEDURE_TYPES, PROCEDURE_TYPE_LABELS, type ProcedureType } from "@shared/operationalProcedures";
import { toast } from "sonner";

type ClientProcedure = {
  id: number;
  clientId: number;
  title: string;
  description: string;
  procedureType: ProcedureType;
  priority: number;
  isActive: boolean;
};

type ProcedureForm = Pick<ClientProcedure, "title" | "description" | "procedureType" | "priority">;

const emptyForm = (): ProcedureForm => ({
  title: "",
  description: "",
  procedureType: "general",
  priority: 1,
});

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}

export default function ClientProcedureEditor({ clientId }: { clientId: number }) {
  const { user } = useAuth();
  const canEdit = ["admin", "supervisor", "partner"].includes(user?.role ?? "");
  const proceduresQuery = trpc.clientProcedure.list.useQuery({ clientId });
  const createProcedure = trpc.clientProcedure.create.useMutation();
  const updateProcedure = trpc.clientProcedure.update.useMutation();
  const deactivateProcedure = trpc.clientProcedure.deactivate.useMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<ClientProcedure | null>(null);
  const [form, setForm] = useState<ProcedureForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDeactivation, setPendingDeactivation] = useState<ClientProcedure | null>(null);
  const [deactivationError, setDeactivationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<number | null>(null);

  const formPending = createProcedure.isPending || updateProcedure.isPending;
  const rows = [...((proceduresQuery.data ?? []) as ClientProcedure[])].sort(
    (a, b) => a.priority - b.priority || a.id - b.id,
  );

  function openCreateForm() {
    setEditingProcedure(null);
    setForm(emptyForm());
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(procedure: ClientProcedure) {
    setEditingProcedure(procedure);
    setForm({
      title: procedure.title,
      description: procedure.description,
      procedureType: procedure.procedureType,
      priority: procedure.priority,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm(open: boolean) {
    if (formPending) return;
    setFormOpen(open);
    if (!open) {
      setEditingProcedure(null);
      setFormError(null);
    }
  }

  async function saveProcedure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || formPending) return;

    const title = form.title.trim();
    const description = form.description.trim();
    if (!title || !description || !Number.isInteger(form.priority) || form.priority < 1) {
      setFormError("Informe título, instrução e uma ordem inteira maior que zero.");
      return;
    }

    setFormError(null);
    try {
      if (editingProcedure) {
        await updateProcedure.mutateAsync({
          id: editingProcedure.id,
          title,
          description,
          procedureType: form.procedureType,
          priority: form.priority,
        });
        toast.success("Providência atualizada.");
      } else {
        await createProcedure.mutateAsync({
          clientId,
          title,
          description,
          procedureType: form.procedureType,
          priority: form.priority,
        });
        toast.success("Providência cadastrada.");
      }
    } catch (error) {
      setFormError(getErrorMessage(error));
      return;
    }

    setFormOpen(false);
    setEditingProcedure(null);
    await proceduresQuery.refetch();
  }

  async function confirmDeactivation() {
    if (!pendingDeactivation || deactivateProcedure.isPending) return;
    setDeactivationError(null);
    try {
      await deactivateProcedure.mutateAsync({ id: pendingDeactivation.id });
      toast.success("Providência inativada. O registro foi preservado.");
      setPendingDeactivation(null);
      await proceduresQuery.refetch();
    } catch (error) {
      setDeactivationError(getErrorMessage(error));
    }
  }

  async function reactivateProcedure(procedure: ClientProcedure) {
    if (reactivatingId !== null) return;
    setActionError(null);
    setReactivatingId(procedure.id);
    try {
      await updateProcedure.mutateAsync({ id: procedure.id, isActive: true });
      toast.success("Providência reativada.");
      await proceduresQuery.refetch();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setReactivatingId(null);
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="client-procedures-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="client-procedures-heading" className="text-xl font-semibold">Providências</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            As providências são instruções aprovadas pelo responsável e ficam disponíveis para consulta do operador.
          </p>
        </div>
        {canEdit && <Button type="button" onClick={openCreateForm}>Adicionar providência</Button>}
      </div>

      {proceduresQuery.isLoading && (
        <p className="rounded-md border border-border p-4 text-sm text-muted-foreground" role="status">
          Carregando providências…
        </p>
      )}

      {proceduresQuery.isError && (
        <div className="rounded-md border border-destructive/40 p-4 text-sm" role="alert">
          <p>Não foi possível carregar as providências deste cliente.</p>
          <Button type="button" className="mt-3" size="sm" variant="outline" onClick={() => void proceduresQuery.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {actionError && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive" role="alert">{actionError}</p>}

      {!proceduresQuery.isLoading && !proceduresQuery.isError && rows.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground" role="status">
          Nenhuma providência cadastrada para este cliente.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <ul className="divide-y divide-border" aria-label="Providências cadastradas">
            {rows.map((procedure) => (
              <li key={procedure.id}>
                <article className="space-y-3 p-4" aria-label={`Providência: ${procedure.title}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{procedure.title}</h3>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          {PROCEDURE_TYPE_LABELS[procedure.procedureType]}
                        </span>
                        <span className="text-xs text-muted-foreground">Ordem {procedure.priority}</span>
                        {!procedure.isActive && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Inativa</span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{procedure.description}</p>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEditForm(procedure)}>
                          Editar
                        </Button>
                        {procedure.isActive ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={deactivateProcedure.isPending}
                            onClick={() => {
                              setDeactivationError(null);
                              setPendingDeactivation(procedure);
                            }}
                          >
                            Inativar
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={reactivatingId === procedure.id}
                            onClick={() => void reactivateProcedure(procedure)}
                          >
                            {reactivatingId === procedure.id ? "Reativando…" : "Reativar"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={closeForm}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
          showCloseButton={!formPending}
          onInteractOutside={(event) => { if (formPending) event.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{editingProcedure ? "Editar providência" : "Nova providência"}</DialogTitle>
            <DialogDescription>
              Registre a instrução aprovada pelo responsável para consulta na operação deste cliente.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={saveProcedure}>
            <div className="space-y-2">
              <Label htmlFor="procedure-title">Título</Label>
              <Input
                id="procedure-title"
                value={form.title}
                maxLength={255}
                required
                disabled={formPending}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="procedure-description">Instrução</Label>
              <Textarea
                id="procedure-description"
                value={form.description}
                required
                disabled={formPending}
                rows={5}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="procedure-type">Categoria</Label>
                <select
                  id="procedure-type"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.procedureType}
                  disabled={formPending}
                  onChange={(event) => setForm({ ...form, procedureType: event.target.value as ProcedureType })}
                >
                  {PROCEDURE_TYPES.map((type) => <option key={type} value={type}>{PROCEDURE_TYPE_LABELS[type]}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="procedure-priority">Ordem de exibição</Label>
                <Input
                  id="procedure-priority"
                  type="number"
                  min={1}
                  step={1}
                  required
                  disabled={formPending}
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value === "" ? 0 : Number(event.target.value) })}
                />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={formPending} onClick={() => closeForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formPending}>
                {formPending ? "Salvando…" : editingProcedure ? "Salvar alterações" : "Salvar providência"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDeactivation !== null}
        onOpenChange={(open) => {
          if (!open && !deactivateProcedure.isPending) {
            setPendingDeactivation(null);
            setDeactivationError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar providência?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeactivation ? `“${pendingDeactivation.title}” deixará de estar ativa. O registro será preservado e poderá ser reativado depois.` : "O registro será preservado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deactivationError && <p className="text-sm text-destructive" role="alert">{deactivationError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivateProcedure.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deactivateProcedure.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeactivation();
              }}
            >
              {deactivateProcedure.isPending ? "Inativando…" : "Confirmar inativação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
