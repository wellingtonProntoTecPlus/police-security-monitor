import { ExternalLink, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getWorkspaceScreensForRole } from "@/lib/workspaceScreens";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type WorkspaceScreenMenuProps = {
  className?: string;
  label?: string;
  compact?: boolean;
};

export default function WorkspaceScreenMenu({
  className,
  label = "Abrir em nova aba",
  compact = false,
}: WorkspaceScreenMenuProps) {
  const { user } = useAuth();
  const screens = getWorkspaceScreensForRole(user?.role);

  function openScreen(path: string) {
    window.open(path, "_blank", "noopener,noreferrer");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          className={cn("shrink-0", className)}
          title={label}
          aria-label={label}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {!compact && <span>{label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[120] max-h-[70vh] w-60 overflow-y-auto">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          A tela de atendimento continuará aberta
        </div>
        {screens.map((screen) => (
          <DropdownMenuItem
            key={screen.path}
            className="cursor-pointer gap-2"
            onSelect={() => openScreen(screen.path)}
          >
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <span>Abrir {screen.label}</span>
            <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
