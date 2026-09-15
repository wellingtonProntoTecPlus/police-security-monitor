type ViewTransitionRuntime = {
  blurActiveElement: () => void;
  schedule: (callback: () => void) => void;
};

const browserRuntime: ViewTransitionRuntime = {
  blurActiveElement: () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  },
  schedule: (callback) => window.setTimeout(callback, 0),
};

/**
 * Fecha o elemento com foco antes de desmontar uma tela que pode conter
 * componentes com portal (como Select e DropdownMenu). A transição no próximo
 * ciclo do navegador evita que o cleanup do portal tente remover um nó já
 * removido durante a troca de conteúdo.
 */
export function deferViewTransition(callback: () => void, runtime = browserRuntime) {
  runtime.blurActiveElement();
  runtime.schedule(callback);
}
