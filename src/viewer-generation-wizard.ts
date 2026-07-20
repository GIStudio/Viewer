export type GenerationPrimaryPage = "source" | "strategy" | "output";
export type GenerationStrategyPage = "assets" | "skeleton" | "furniture";
export type GenerationStepStatus = "pending" | "complete" | "warning" | "error" | "running";

type WizardStep =
  | { primary: "source" }
  | { primary: "strategy"; strategy: GenerationStrategyPage }
  | { primary: "output" };

export type ViewerGenerationWizardController = {
  open(): void;
  close(options?: { restoreFocus?: boolean }): void;
  activatePrimary(page: GenerationPrimaryPage, options?: { focus?: boolean }): void;
  activateStrategy(page: GenerationStrategyPage, options?: { focus?: boolean }): void;
  setPrimaryStatus(page: GenerationPrimaryPage, status: GenerationStepStatus): void;
  setStrategyStatus(page: GenerationStrategyPage, status: GenerationStepStatus): void;
  setBusy(busy: boolean): void;
  activePrimary(): GenerationPrimaryPage;
  activeStrategy(): GenerationStrategyPage;
  destroy(): void;
};

type ViewerGenerationWizardDeps = {
  dialogEl: HTMLElement;
  triggerEl: HTMLButtonElement;
  onClose(): void;
  onStepChange?(): void;
};

const PRIMARY_ORDER: GenerationPrimaryPage[] = ["source", "strategy", "output"];
const STRATEGY_ORDER: GenerationStrategyPage[] = ["assets", "skeleton", "furniture"];
const WALK_ORDER: WizardStep[] = [
  { primary: "source" },
  ...STRATEGY_ORDER.map((strategy) => ({ primary: "strategy" as const, strategy })),
  { primary: "output" },
];

export function createViewerGenerationWizardController(
  deps: ViewerGenerationWizardDeps,
): ViewerGenerationWizardController {
  const abortController = new AbortController();
  const { signal } = abortController;
  const primaryTabs = new Map(PRIMARY_ORDER.map((page) => [page, requireSelector<HTMLButtonElement>(deps.dialogEl, `[data-generation-primary-tab="${page}"]`)]));
  const primaryPanels = new Map(PRIMARY_ORDER.map((page) => [page, requireSelector<HTMLElement>(deps.dialogEl, `[data-generation-primary-panel="${page}"]`)]));
  const strategyTabs = new Map(STRATEGY_ORDER.map((page) => [page, requireSelector<HTMLButtonElement>(deps.dialogEl, `[data-generation-strategy-tab="${page}"]`)]));
  const strategyPanels = new Map(STRATEGY_ORDER.map((page) => [page, requireSelector<HTMLElement>(deps.dialogEl, `[data-generation-strategy-panel="${page}"]`)]));
  const backEl = requireSelector<HTMLButtonElement>(deps.dialogEl, "#viewer-generation-back");
  const nextEl = requireSelector<HTMLButtonElement>(deps.dialogEl, "#viewer-generation-next");
  const confirmEl = requireSelector<HTMLButtonElement>(deps.dialogEl, "#viewer-design-generate");
  const positionEl = requireSelector<HTMLElement>(deps.dialogEl, "#viewer-generation-step-position");
  let primary: GenerationPrimaryPage = "source";
  let strategy: GenerationStrategyPage = "assets";
  let busy = false;

  for (const [page, tab] of primaryTabs) {
    tab.addEventListener("click", () => activatePrimary(page, { focus: true }), { signal });
  }
  for (const [page, tab] of strategyTabs) {
    tab.addEventListener("click", () => activateStrategy(page, { focus: true }), { signal });
  }
  bindTabKeyboard(primaryTabs, PRIMARY_ORDER, (page) => activatePrimary(page, { focus: true }), signal);
  bindTabKeyboard(strategyTabs, STRATEGY_ORDER, (page) => activateStrategy(page, { focus: true }), signal);
  backEl.addEventListener("click", () => move(-1), { signal });
  nextEl.addEventListener("click", () => move(1), { signal });
  deps.dialogEl.addEventListener("keydown", handleDialogKeydown, { signal });

  function currentWalkIndex(): number {
    return WALK_ORDER.findIndex((step) => step.primary === primary && (step.primary !== "strategy" || step.strategy === strategy));
  }

  function move(delta: -1 | 1): void {
    if (busy) return;
    const target = WALK_ORDER[Math.max(0, Math.min(WALK_ORDER.length - 1, currentWalkIndex() + delta))];
    if (!target) return;
    if (target.primary === "strategy") activateStrategy(target.strategy, { focus: false });
    else activatePrimary(target.primary, { focus: false });
    activeTab()?.focus();
  }

  function activeTab(): HTMLButtonElement | undefined {
    return primary === "strategy" ? strategyTabs.get(strategy) : primaryTabs.get(primary);
  }

  function activatePrimary(page: GenerationPrimaryPage, options: { focus?: boolean } = {}): void {
    primary = page;
    for (const [candidate, tab] of primaryTabs) {
      const selected = candidate === page;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      primaryPanels.get(candidate)!.hidden = !selected;
    }
    if (page === "strategy") syncStrategyVisibility();
    syncFooter();
    deps.onStepChange?.();
    if (options.focus) primaryTabs.get(page)?.focus();
  }

  function activateStrategy(page: GenerationStrategyPage, options: { focus?: boolean } = {}): void {
    strategy = page;
    if (primary !== "strategy") activatePrimary("strategy");
    syncStrategyVisibility();
    syncFooter();
    deps.onStepChange?.();
    if (options.focus) strategyTabs.get(page)?.focus();
  }

  function syncStrategyVisibility(): void {
    for (const [candidate, tab] of strategyTabs) {
      const selected = candidate === strategy;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      strategyPanels.get(candidate)!.hidden = !selected;
    }
  }

  function syncFooter(): void {
    const index = currentWalkIndex();
    positionEl.textContent = `${String(index + 1).padStart(2, "0")} / ${String(WALK_ORDER.length).padStart(2, "0")}`;
    backEl.disabled = busy || index <= 0;
    nextEl.hidden = primary === "output";
    nextEl.disabled = busy || index >= WALK_ORDER.length - 1;
    confirmEl.hidden = primary !== "output";
  }

  function handleDialogKeydown(event: KeyboardEvent): void {
    if (deps.dialogEl.dataset.open !== "true") return;
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      close();
      deps.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(deps.dialogEl);
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function open(): void {
    activatePrimary(primary);
    window.requestAnimationFrame(() => activeTab()?.focus());
  }

  function close(options: { restoreFocus?: boolean } = {}): void {
    if (options.restoreFocus !== false) window.requestAnimationFrame(() => deps.triggerEl.focus());
  }

  function setBusy(nextBusy: boolean): void {
    busy = nextBusy;
    deps.dialogEl.dataset.busy = busy ? "true" : "false";
    for (const tab of [...primaryTabs.values(), ...strategyTabs.values()]) tab.disabled = busy;
    if (busy) confirmEl.disabled = true;
    syncFooter();
  }

  syncStrategyVisibility();
  syncFooter();

  return {
    open,
    close,
    activatePrimary,
    activateStrategy,
    setPrimaryStatus: (page, status) => { primaryTabs.get(page)!.dataset.status = status; },
    setStrategyStatus: (page, status) => { strategyTabs.get(page)!.dataset.status = status; },
    setBusy,
    activePrimary: () => primary,
    activeStrategy: () => strategy,
    destroy: () => abortController.abort(),
  };
}

function requireSelector<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing generation wizard element: ${selector}`);
  return element;
}

function bindTabKeyboard<T extends string>(
  tabs: Map<T, HTMLButtonElement>,
  order: readonly T[],
  activate: (page: T) => void,
  signal: AbortSignal,
): void {
  for (const [page, tab] of tabs) {
    tab.addEventListener("keydown", (event) => {
      const current = order.indexOf(page);
      let next = current;
      if (event.key === "ArrowRight") next = (current + 1) % order.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + order.length) % order.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = order.length - 1;
      else return;
      event.preventDefault();
      activate(order[next]!);
    }, { signal });
  }
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex='-1'])"))
    .filter((element) => !element.closest("[hidden]") && element.getClientRects().length > 0);
}
