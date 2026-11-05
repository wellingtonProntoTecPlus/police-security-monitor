import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type OperatorScheduleExceptionReason = "scale_swap" | "double_shift" | "vacation_coverage";

export default function OperatorScheduleDecisionDialog({
  open,
  operatorName,
  isError = false,
  errorMessage = "",
  isRetrying = false,
  isSubmitting = false,
  submitError = "",
  onRetry,
  onChoose,
}: {
  open: boolean;
  operatorName: string;
  isError?: boolean;
  errorMessage?: string;
  isRetrying?: boolean;
  isSubmitting?: boolean;
  submitError?: string;
  onRetry: () => void;
  onChoose: (reason: OperatorScheduleExceptionReason) => void;
}) {
  return <Dialog open={open} onOpenChange={() => {}}>
    <DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Confirme sua escala de hoje</DialogTitle>
        <DialogDescription className="text-base font-semibold text-foreground">{isError ? `${operatorName}, ainda não foi possível conferir sua escala.` : `${operatorName}, hoje não é o seu dia de trabalho.`}</DialogDescription>
      </DialogHeader>
      {isError ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Não foi possível conferir sua escala: {errorMessage}</div> : <p className="text-sm text-muted-foreground">Escolha o motivo para registrar no relatório de presença. A resposta é obrigatória para continuar usando o sistema; ela não altera sua escala permanente.</p>}
      {submitError ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{submitError}</div> : null}
      <DialogFooter className="flex-col sm:flex-col">
        {isError ? <Button onClick={onRetry} disabled={isRetrying}>{isRetrying ? "Consultando..." : "Tentar novamente"}</Button> : <>
          <Button variant="outline" className="w-full" onClick={() => onChoose("scale_swap")} disabled={isSubmitting}>EU TROQUEI MINHA ESCALA</Button>
          <Button variant="outline" className="w-full" onClick={() => onChoose("double_shift")} disabled={isSubmitting}>ESTOU FAZENDO UMA DOBRA</Button>
          <Button className="w-full" onClick={() => onChoose("vacation_coverage")} disabled={isSubmitting}>ESTOU COBRINDO FÉRIAS</Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
