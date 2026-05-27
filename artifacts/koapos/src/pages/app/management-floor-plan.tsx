import { useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQueryClient } from "@tanstack/react-query";
import { useGetFloorPlan, useSaveFloorPlan } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Save, Trash2, RotateCw, Plus, Minus, MapPin, Info } from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────────────── */

type ElementType = "shelf" | "aisle" | "wall" | "entrance" | "counter" | "display" | "storage";

interface FloorElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

/* ── Element Definitions ──────────────────────────────────────────────────── */

const ELEMENT_DEFS: Record<ElementType, {
  label: string; emoji: string; defaultW: number; defaultH: number;
  bg: string; border: string; text: string;
}> = {
  shelf:    { label: "Shelf",    emoji: "🗄", defaultW: 3, defaultH: 1, bg: "bg-amber-50",   border: "border-amber-400",  text: "text-amber-800" },
  aisle:    { label: "Aisle",    emoji: "↔",  defaultW: 5, defaultH: 1, bg: "bg-blue-50",    border: "border-blue-400",   text: "text-blue-800" },
  wall:     { label: "Wall",     emoji: "█",  defaultW: 5, defaultH: 1, bg: "bg-slate-600",  border: "border-slate-800",  text: "text-slate-100" },
  entrance: { label: "Entrance", emoji: "🚪", defaultW: 2, defaultH: 1, bg: "bg-green-50",   border: "border-green-500",  text: "text-green-800" },
  counter:  { label: "Counter",  emoji: "🏪", defaultW: 3, defaultH: 2, bg: "bg-purple-50",  border: "border-purple-400", text: "text-purple-800" },
  display:  { label: "Display",  emoji: "📺", defaultW: 2, defaultH: 2, bg: "bg-orange-50",  border: "border-orange-400", text: "text-orange-800" },
  storage:  { label: "Storage",  emoji: "📦", defaultW: 2, defaultH: 2, bg: "bg-red-50",     border: "border-red-400",    text: "text-red-800" },
};

const PALETTE_ORDER: ElementType[] = ["shelf", "aisle", "wall", "entrance", "counter", "display", "storage"];

const CELL = 48; // px per grid cell

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/* ── Main Page ────────────────────────────────────────────────────────────── */

export default function ManagementFloorPlanPage() {
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLDivElement>(null);

  const { data: savedPlan, isLoading } = useGetFloorPlan();
  const saveMutation = useSaveFloorPlan();

  const [elements, setElements] = useState<FloorElement[]>([]);
  const [gridCols, setGridCols] = useState(20);
  const [gridRows, setGridRows] = useState(15);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);

  /* Load saved plan once */
  if (!isLoading && !initialized && savedPlan) {
    const els = (savedPlan.elements ?? []) as FloorElement[];
    setElements(els);
    setGridCols(savedPlan.gridCols ?? 20);
    setGridRows(savedPlan.gridRows ?? 15);
    setInitialized(true);
  }
  if (!isLoading && !initialized && !savedPlan) {
    setInitialized(true);
  }

  /* ── Mutation helpers ── */
  const markDirty = useCallback(() => setDirty(true), []);

  const updateElement = useCallback((id: string, patch: Partial<FloorElement>) => {
    setElements((prev) => prev.map((el) => el.id === id ? { ...el, ...patch } : el));
    markDirty();
  }, [markDirty]);

  const deleteElement = useCallback((id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    setSelectedId((s) => s === id ? null : s);
    markDirty();
  }, [markDirty]);

  /* ── Drag from palette ── */
  function handlePaletteDragStart(e: React.DragEvent, type: ElementType) {
    e.dataTransfer.setData("action", "create");
    e.dataTransfer.setData("elementType", type);
    e.dataTransfer.effectAllowed = "copy";
  }

  /* ── Drag existing element ── */
  function handleElementDragStart(e: React.DragEvent, el: FloorElement) {
    e.stopPropagation();
    e.dataTransfer.setData("action", "move");
    e.dataTransfer.setData("elementId", el.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = Math.floor((e.clientX - rect.left) / CELL);
    const offsetY = Math.floor((e.clientY - rect.top) / CELL);
    e.dataTransfer.setData("offsetX", offsetX.toString());
    e.dataTransfer.setData("offsetY", offsetY.toString());
    e.dataTransfer.effectAllowed = "move";
  }

  /* ── Drop on canvas ── */
  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const action = e.dataTransfer.getData("action");
    const canvasRect = canvasRef.current!.getBoundingClientRect();
    const rawX = Math.floor((e.clientX - canvasRect.left) / CELL);
    const rawY = Math.floor((e.clientY - canvasRect.top) / CELL);

    if (action === "create") {
      const type = e.dataTransfer.getData("elementType") as ElementType;
      const def = ELEMENT_DEFS[type];
      const x = Math.max(0, Math.min(rawX, gridCols - def.defaultW));
      const y = Math.max(0, Math.min(rawY, gridRows - def.defaultH));
      const newEl: FloorElement = { id: newId(), type, x, y, width: def.defaultW, height: def.defaultH, label: "" };
      setElements((prev) => [...prev, newEl]);
      setSelectedId(newEl.id);
      setDirty(true);
    } else if (action === "move") {
      const elementId = e.dataTransfer.getData("elementId");
      const offsetX = parseInt(e.dataTransfer.getData("offsetX"), 10) || 0;
      const offsetY = parseInt(e.dataTransfer.getData("offsetY"), 10) || 0;
      setElements((prev) => prev.map((el) => {
        if (el.id !== elementId) return el;
        const x = Math.max(0, Math.min(rawX - offsetX, gridCols - el.width));
        const y = Math.max(0, Math.min(rawY - offsetY, gridRows - el.height));
        return { ...el, x, y };
      }));
      setDirty(true);
    }
  }

  /* ── Save ── */
  function handleSave() {
    saveMutation.mutate(
      { data: { elements: elements as never[], gridCols, gridRows } },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Floor plan saved");
          queryClient.invalidateQueries({ queryKey: ["/api/floor-plan"] });
          queryClient.invalidateQueries({ queryKey: ["/api/floor-plan/zones"] });
        },
        onError: () => toast.error("Failed to save floor plan"),
      }
    );
  }

  const selectedEl = elements.find((el) => el.id === selectedId) ?? null;

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 gap-4">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Shop Floor Plan</h1>
              <p className="text-xs text-muted-foreground">Design your store layout — drag elements onto the grid and label zones</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Unsaved changes
              </span>
            )}
            {/* Grid size controls */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-1.5">
              <span>Grid:</span>
              <button className="hover:text-foreground" onClick={() => { setGridCols((c) => Math.max(10, c - 1)); markDirty(); }}><Minus className="w-3 h-3" /></button>
              <span className="font-mono font-medium text-foreground">{gridCols}×{gridRows}</span>
              <button className="hover:text-foreground" onClick={() => { setGridCols((c) => Math.min(40, c + 1)); markDirty(); }}><Plus className="w-3 h-3" /></button>
            </div>
            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Palette */}
          <div className="w-44 shrink-0 border-r overflow-y-auto p-3 space-y-1.5 bg-muted/20">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">Elements</p>
            {PALETTE_ORDER.map((type) => {
              const def = ELEMENT_DEFS[type];
              return (
                <div
                  key={type}
                  draggable
                  onDragStart={(e) => handlePaletteDragStart(e, type)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 cursor-grab transition-all hover:shadow-sm active:cursor-grabbing select-none",
                    def.bg, def.border
                  )}
                >
                  <span className="text-base leading-none">{def.emoji}</span>
                  <span className={cn("text-xs font-semibold", def.text)}>{def.label}</span>
                </div>
              );
            })}
            <div className="border-t mt-3 pt-3">
              <p className="text-[10px] text-muted-foreground px-1 leading-relaxed flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                Drag elements onto the grid. Click to select &amp; rename zones.
              </p>
            </div>
          </div>

          {/* Canvas area */}
          <div className="flex-1 overflow-auto p-4 bg-muted/10">
            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading floor plan…</div>
            ) : (
              <div
                ref={canvasRef}
                className="relative select-none inline-block"
                style={{
                  width: gridCols * CELL,
                  height: gridRows * CELL,
                  backgroundImage: `linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)`,
                  backgroundSize: `${CELL}px ${CELL}px`,
                  backgroundColor: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  cursor: "crosshair",
                }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                onDrop={handleCanvasDrop}
                onClick={() => setSelectedId(null)}
              >
                {elements.map((el) => {
                  const def = ELEMENT_DEFS[el.type];
                  const isSelected = el.id === selectedId;
                  return (
                    <div
                      key={el.id}
                      draggable
                      onDragStart={(e) => handleElementDragStart(e, el)}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                      style={{
                        position: "absolute",
                        left: el.x * CELL,
                        top: el.y * CELL,
                        width: el.width * CELL,
                        height: el.height * CELL,
                      }}
                      className={cn(
                        "border-2 rounded flex flex-col items-center justify-center cursor-grab overflow-hidden transition-shadow",
                        def.bg, def.border,
                        isSelected && "ring-2 ring-primary ring-offset-1 shadow-lg z-10",
                      )}
                    >
                      <span className="text-lg leading-none pointer-events-none">{def.emoji}</span>
                      {el.label && (
                        <span className={cn("text-[9px] font-semibold text-center px-1 leading-tight mt-0.5 pointer-events-none truncate w-full text-center", def.text)}>
                          {el.label}
                        </span>
                      )}
                    </div>
                  );
                })}
                {elements.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50 pointer-events-none">
                    <MapPin className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm font-medium">Drag elements here to design your floor plan</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Properties panel */}
          {selectedEl ? (
            <div className="w-56 shrink-0 border-l p-4 space-y-4 overflow-y-auto bg-background">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Properties</h3>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", ELEMENT_DEFS[selectedEl.type].bg, ELEMENT_DEFS[selectedEl.type].border, ELEMENT_DEFS[selectedEl.type].text)}>
                  {ELEMENT_DEFS[selectedEl.type].label}
                </span>
              </div>

              {/* Zone Label */}
              <div>
                <Label className="text-xs text-muted-foreground">Zone Name</Label>
                <Input
                  className="mt-1.5 h-8 text-sm"
                  value={selectedEl.label}
                  onChange={(e) => updateElement(selectedEl.id, { label: e.target.value })}
                  placeholder="e.g. Aisle 3 Shelf B"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Used to assign products to this location</p>
              </div>

              {/* Position */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Position</p>
                <p className="text-xs font-mono text-foreground">Col {selectedEl.x + 1}, Row {selectedEl.y + 1}</p>
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Width</p>
                  <div className="flex items-center gap-1">
                    <button
                      className="w-6 h-6 rounded border border-input flex items-center justify-center hover:bg-muted transition-colors"
                      onClick={() => updateElement(selectedEl.id, { width: Math.max(1, selectedEl.width - 1) })}
                    ><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-semibold w-5 text-center">{selectedEl.width}</span>
                    <button
                      className="w-6 h-6 rounded border border-input flex items-center justify-center hover:bg-muted transition-colors"
                      onClick={() => updateElement(selectedEl.id, { width: Math.min(gridCols - selectedEl.x, selectedEl.width + 1) })}
                    ><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Height</p>
                  <div className="flex items-center gap-1">
                    <button
                      className="w-6 h-6 rounded border border-input flex items-center justify-center hover:bg-muted transition-colors"
                      onClick={() => updateElement(selectedEl.id, { height: Math.max(1, selectedEl.height - 1) })}
                    ><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-semibold w-5 text-center">{selectedEl.height}</span>
                    <button
                      className="w-6 h-6 rounded border border-input flex items-center justify-center hover:bg-muted transition-colors"
                      onClick={() => updateElement(selectedEl.id, { height: Math.min(gridRows - selectedEl.y, selectedEl.height + 1) })}
                    ><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>

              {/* Rotate */}
              <Button
                variant="outline" size="sm" className="w-full gap-2 h-8"
                onClick={() => updateElement(selectedEl.id, { width: selectedEl.height, height: selectedEl.width })}
              >
                <RotateCw className="w-3.5 h-3.5" />
                Rotate 90°
              </Button>

              {/* Delete */}
              <Button
                variant="destructive" size="sm" className="w-full gap-2 h-8"
                onClick={() => { deleteElement(selectedEl.id); }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Element
              </Button>
            </div>
          ) : (
            <div className="w-56 shrink-0 border-l p-4 bg-background">
              <p className="text-xs text-muted-foreground text-center mt-8">
                Click an element on the canvas to edit its properties
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
