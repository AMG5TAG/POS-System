interface FloorElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface FloorPlan {
  elements: FloorElement[];
  gridCols: number;
  gridRows: number;
}

const ELEMENT_COLORS: Record<string, { fill: string; stroke: string }> = {
  shelf:    { fill: "#fef3c7", stroke: "#f59e0b" },
  aisle:    { fill: "#dbeafe", stroke: "#3b82f6" },
  wall:     { fill: "#475569", stroke: "#1e293b" },
  entrance: { fill: "#dcfce7", stroke: "#22c55e" },
  counter:  { fill: "#f3e8ff", stroke: "#a855f7" },
  display:  { fill: "#ffedd5", stroke: "#f97316" },
  storage:  { fill: "#fee2e2", stroke: "#ef4444" },
};

const MINI_W = 220;

export function FloorPlanMiniView({
  floorPlan,
  highlightLabel,
}: {
  floorPlan: FloorPlan;
  highlightLabel: string;
}) {
  const gridCols = floorPlan.gridCols || 20;
  const gridRows = floorPlan.gridRows || 15;
  const cellSize = Math.floor(MINI_W / gridCols);
  const svgW = gridCols * cellSize;
  const svgH = gridRows * cellSize;

  const highlighted = floorPlan.elements.filter(
    (el) => el.label && el.label === highlightLabel
  );

  return (
    <div className="mt-3">
      <p className="text-xs text-muted-foreground mb-2">Floor Plan Location</p>
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ border: "1px solid #e5e7eb", borderRadius: 8, display: "block" }}
      >
        <defs>
          <pattern id="fpgrid" width={cellSize} height={cellSize} patternUnits="userSpaceOnUse">
            <path d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`} fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#f9fafb" rx="7" />
        <rect width="100%" height="100%" fill="url(#fpgrid)" rx="7" />

        {floorPlan.elements.map((el) => {
          const isHighlighted = el.label === highlightLabel && el.label !== "";
          const colors = ELEMENT_COLORS[el.type] ?? { fill: "#e5e7eb", stroke: "#9ca3af" };
          return (
            <g key={el.id}>
              <rect
                x={el.x * cellSize + 0.5}
                y={el.y * cellSize + 0.5}
                width={el.width * cellSize - 1}
                height={el.height * cellSize - 1}
                fill={isHighlighted ? "#f97316" : colors.fill}
                stroke={isHighlighted ? "#ea580c" : colors.stroke}
                strokeWidth={isHighlighted ? 1.5 : 0.75}
                rx="1.5"
              />
            </g>
          );
        })}

        {highlighted.map((el) => (
          <text
            key={el.id + "_lbl"}
            x={(el.x + el.width / 2) * cellSize}
            y={(el.y + el.height / 2) * cellSize + 3}
            textAnchor="middle"
            fontSize={Math.max(6, Math.min(9, cellSize * 0.7))}
            fill="white"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            ✓
          </text>
        ))}
      </svg>
      {highlighted.length === 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">Zone not found on map</p>
      )}
    </div>
  );
}
