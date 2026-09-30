export function POSVisual() {
  return (
    <svg viewBox="0 0 520 330" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full rounded-xl border border-border shadow-lg">
      <rect width="520" height="330" rx="12" fill="#f8fafc" />
      {/* Header bar */}
      <rect width="520" height="44" rx="0" fill="#1e293b" />
      <rect x="0" y="0" width="520" height="44" rx="12" fill="#1e293b" />
      <rect x="0" y="22" width="520" height="22" fill="#1e293b" />
      <circle cx="16" cy="22" r="6" fill="#ef4444" />
      <circle cx="32" cy="22" r="6" fill="#f59e0b" />
      <circle cx="48" cy="22" r="6" fill="#22c55e" />
      <rect x="64" y="14" width="200" height="16" rx="8" fill="#334155" />
      <text x="72" y="26" fontSize="9" fill="#94a3b8" fontFamily="system-ui">KoaPOS Register</text>
      <rect x="420" y="14" width="88" height="16" rx="4" fill="#f0b800" />
      <text x="428" y="25.5" fontSize="8.5" fill="#1e293b" fontFamily="system-ui" fontWeight="600">Staff PIN ▾</text>

      {/* Left: product grid */}
      {/* Category tabs */}
      <rect x="8" y="52" width="64" height="20" rx="4" fill="#f0b800" />
      <text x="13" y="65" fontSize="8.5" fill="#1e293b" fontFamily="system-ui" fontWeight="600">All Items</text>
      <rect x="76" y="52" width="68" height="20" rx="4" fill="#e2e8f0" />
      <text x="82" y="65" fontSize="8.5" fill="#64748b" fontFamily="system-ui">Beverages</text>
      <rect x="148" y="52" width="52" height="20" rx="4" fill="#e2e8f0" />
      <text x="154" y="65" fontSize="8.5" fill="#64748b" fontFamily="system-ui">Snacks</text>
      <rect x="204" y="52" width="66" height="20" rx="4" fill="#e2e8f0" />
      <text x="210" y="65" fontSize="8.5" fill="#64748b" fontFamily="system-ui">Electronics</text>

      {/* Product cards row 1 */}
      {[0,1,2].map((i) => {
        const names = ["Latte", "Sparkling Water", "Muffin"];
        const prices = ["$5.50", "$3.00", "$4.50"];
        const colours = ["#fef9c3", "#e0f2fe", "#fce7f3"];
        const x = 8 + i * 105;
        return (
          <g key={i}>
            <rect x={x} y="76" width="100" height="80" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
            <rect x={x + 8} y="84" width="84" height="42" rx="6" fill={colours[i]} />
            <text x={x + 50} y="112" fontSize="22" textAnchor="middle" fontFamily="system-ui">
              {["☕","💧","🧁"][i]}
            </text>
            <text x={x + 50} y="133" fontSize="8" fill="#1e293b" textAnchor="middle" fontFamily="system-ui" fontWeight="600">{names[i]}</text>
            <text x={x + 50} y="147" fontSize="9" fill="#f0b800" textAnchor="middle" fontFamily="system-ui" fontWeight="700">{prices[i]}</text>
          </g>
        );
      })}

      {/* Product cards row 2 */}
      {[0,1,2].map((i) => {
        const names = ["Cold Brew", "Chips", "USB Cable"];
        const prices = ["$6.00", "$2.50", "$12.00"];
        const colours = ["#dcfce7", "#fff7ed", "#ede9fe"];
        const x = 8 + i * 105;
        return (
          <g key={i}>
            <rect x={x} y="162" width="100" height="80" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
            <rect x={x + 8} y="170" width="84" height="42" rx="6" fill={colours[i]} />
            <text x={x + 50} y="198" fontSize="22" textAnchor="middle" fontFamily="system-ui">
              {["🧊","🥔","🔌"][i]}
            </text>
            <text x={x + 50} y="219" fontSize="8" fill="#1e293b" textAnchor="middle" fontFamily="system-ui" fontWeight="600">{names[i]}</text>
            <text x={x + 50} y="233" fontSize="9" fill="#f0b800" textAnchor="middle" fontFamily="system-ui" fontWeight="700">{prices[i]}</text>
          </g>
        );
      })}

      {/* Search bar */}
      <rect x="8" y="248" width="316" height="24" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="22" y="263" fontSize="8.5" fill="#94a3b8" fontFamily="system-ui">🔍  Search products…</text>

      {/* Right: Cart panel */}
      <rect x="332" y="44" width="188" height="286" rx="0" fill="white" />
      <rect x="332" y="44" width="1" height="286" fill="#e2e8f0" />
      <text x="344" y="62" fontSize="10" fill="#1e293b" fontFamily="system-ui" fontWeight="700">Current Sale</text>
      <text x="502" y="62" fontSize="8.5" fill="#64748b" fontFamily="system-ui" textAnchor="end">3 items</text>

      {/* Cart items */}
      {[
        { name: "Latte", qty: "×1", price: "$5.50" },
        { name: "Muffin", qty: "×2", price: "$9.00" },
        { name: "USB Cable", qty: "×1", price: "$12.00" },
      ].map((item, i) => (
        <g key={i}>
          <rect x="340" y={72 + i * 38} width="164" height="32" rx="6" fill="#f8fafc" />
          <text x="348" y={90 + i * 38} fontSize="8.5" fill="#1e293b" fontFamily="system-ui" fontWeight="600">{item.name}</text>
          <text x="348" y={101 + i * 38} fontSize="7.5" fill="#94a3b8" fontFamily="system-ui">{item.qty}</text>
          <text x="496" y={91 + i * 38} fontSize="9" fill="#1e293b" fontFamily="system-ui" fontWeight="600" textAnchor="end">{item.price}</text>
        </g>
      ))}

      {/* Loyalty badge */}
      <rect x="340" y="187" width="164" height="24" rx="6" fill="#fef9c3" />
      <text x="348" y="202" fontSize="8" fill="#854d0e" fontFamily="system-ui">⭐ Sarah J. — 420 pts</text>

      {/* Totals */}
      <line x1="340" y1="220" x2="504" y2="220" stroke="#e2e8f0" strokeWidth="1" />
      <text x="340" y="234" fontSize="8.5" fill="#64748b" fontFamily="system-ui">Subtotal</text>
      <text x="504" y="234" fontSize="8.5" fill="#64748b" fontFamily="system-ui" textAnchor="end">$26.50</text>
      <text x="340" y="248" fontSize="8.5" fill="#64748b" fontFamily="system-ui">GST (10%)</text>
      <text x="504" y="248" fontSize="8.5" fill="#64748b" fontFamily="system-ui" textAnchor="end">$2.41</text>
      <text x="340" y="264" fontSize="10" fill="#1e293b" fontFamily="system-ui" fontWeight="700">Total</text>
      <text x="504" y="264" fontSize="12" fill="#1e293b" fontFamily="system-ui" fontWeight="700" textAnchor="end">$26.50</text>

      {/* Charge button */}
      <rect x="340" y="272" width="164" height="48" rx="8" fill="#f0b800" />
      <text x="422" y="302" fontSize="13" fill="#1e293b" textAnchor="middle" fontFamily="system-ui" fontWeight="700">Charge $26.50</text>
    </svg>
  );
}

export function DashboardVisual() {
  const bars = [62, 45, 78, 55, 90, 68, 82];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <svg viewBox="0 0 520 330" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full rounded-xl border border-border shadow-lg">
      <rect width="520" height="330" rx="12" fill="#f8fafc" />
      <rect width="520" height="44" rx="12" fill="#1e293b" />
      <rect x="0" y="22" width="520" height="22" fill="#1e293b" />
      <circle cx="16" cy="22" r="6" fill="#ef4444" />
      <circle cx="32" cy="22" r="6" fill="#f59e0b" />
      <circle cx="48" cy="22" r="6" fill="#22c55e" />
      <text x="72" y="26" fontSize="9" fill="#94a3b8" fontFamily="system-ui">Dashboard</text>
      <rect x="400" y="14" width="110" height="16" rx="4" fill="#334155" />
      <text x="408" y="25.5" fontSize="8" fill="#94a3b8" fontFamily="system-ui">This Week ▾</text>

      {/* KPI tiles row */}
      {[
        { label: "Today's Sales", value: "$1,240", change: "+12%", color: "#dcfce7", tc: "#16a34a" },
        { label: "This Week", value: "$8,790", change: "+8%", color: "#e0f2fe", tc: "#0284c7" },
        { label: "Transactions", value: "143", change: "+5%", color: "#fef9c3", tc: "#ca8a04" },
        { label: "Avg Value", value: "$61.47", change: "+3%", color: "#ede9fe", tc: "#7c3aed" },
      ].map((kpi, i) => (
        <g key={i}>
          <rect x={8 + i * 127} y="52" width="120" height="60" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
          <rect x={8 + i * 127 + 8} y="60" width="20" height="20" rx="4" fill={kpi.color} />
          <text x={8 + i * 127 + 58} y="72" fontSize="7" fill="#64748b" fontFamily="system-ui" textAnchor="middle">{kpi.label}</text>
          <text x={8 + i * 127 + 10} y="92" fontSize="14" fill="#1e293b" fontFamily="system-ui" fontWeight="700">{kpi.value}</text>
          <text x={8 + i * 127 + 10} y="104" fontSize="7.5" fill={kpi.tc} fontFamily="system-ui">{kpi.change} vs last week</text>
        </g>
      ))}

      {/* Sales chart */}
      <rect x="8" y="120" width="320" height="150" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="20" y="138" fontSize="9" fill="#1e293b" fontFamily="system-ui" fontWeight="600">Sales This Week</text>
      {/* Chart grid lines */}
      {[0,1,2,3].map(i => (
        <line key={i} x1="20" y1={148 + i * 26} x2="320" y2={148 + i * 26} stroke="#f1f5f9" strokeWidth="1" />
      ))}
      {/* Bars */}
      {bars.map((h, i) => {
        const x = 24 + i * 41;
        const barH = h * 0.78;
        return (
          <g key={i}>
            <rect x={x} y={252 - barH} width="28" height={barH} rx="4" fill={i === 6 ? "#f0b800" : "#fef08a"} />
            <text x={x + 14} y="268" fontSize="7" fill="#94a3b8" textAnchor="middle" fontFamily="system-ui">{days[i]}</text>
          </g>
        );
      })}

      {/* Top products widget */}
      <rect x="336" y="120" width="176" height="150" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="348" y="138" fontSize="9" fill="#1e293b" fontFamily="system-ui" fontWeight="600">Top Products</text>
      {[
        { name: "Latte", rev: "$980", pct: 78 },
        { name: "USB Cable", rev: "$740", pct: 58 },
        { name: "Cold Brew", rev: "$620", pct: 49 },
        { name: "Muffin", rev: "$480", pct: 38 },
      ].map((p, i) => (
        <g key={i}>
          <text x="348" y={155 + i * 28} fontSize="8" fill="#1e293b" fontFamily="system-ui">{p.name}</text>
          <rect x="348" y={160 + i * 28} width={p.pct * 1.35} height="6" rx="3" fill="#fef08a" />
          <rect x="348" y={160 + i * 28} width={p.pct * 0.4} height="6" rx="3" fill="#f0b800" />
          <text x="500" y={167 + i * 28} fontSize="7.5" fill="#64748b" textAnchor="end" fontFamily="system-ui">{p.rev}</text>
        </g>
      ))}

      {/* Low stock widget */}
      <rect x="8" y="278" width="504" height="44" rx="8" fill="#fff7ed" stroke="#fed7aa" strokeWidth="1" />
      <text x="20" y="298" fontSize="9" fill="#c2410c" fontFamily="system-ui" fontWeight="600">⚠  Low Stock Alert</text>
      <text x="20" y="312" fontSize="8" fill="#ea580c" fontFamily="system-ui">3 products are running low — USB Cable (2 left), Chips (4 left), Muffin (1 left)</text>
    </svg>
  );
}

export function ProductsVisual() {
  return (
    <svg viewBox="0 0 520 330" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full rounded-xl border border-border shadow-lg">
      <rect width="520" height="330" rx="12" fill="#f8fafc" />
      <rect width="520" height="44" rx="12" fill="#1e293b" />
      <rect x="0" y="22" width="520" height="22" fill="#1e293b" />
      <circle cx="16" cy="22" r="6" fill="#ef4444" />
      <circle cx="32" cy="22" r="6" fill="#f59e0b" />
      <circle cx="48" cy="22" r="6" fill="#22c55e" />
      <text x="72" y="26" fontSize="9" fill="#94a3b8" fontFamily="system-ui">Products</text>
      <rect x="396" y="14" width="116" height="16" rx="6" fill="#f0b800" />
      <text x="408" y="25.5" fontSize="8.5" fill="#1e293b" fontFamily="system-ui" fontWeight="600">+ Add Product</text>

      {/* Search + filter row */}
      <rect x="8" y="52" width="220" height="24" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="20" y="67" fontSize="8.5" fill="#94a3b8" fontFamily="system-ui">🔍  Search products…</text>
      <rect x="236" y="52" width="90" height="24" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="248" y="67" fontSize="8.5" fill="#64748b" fontFamily="system-ui">Category ▾</text>
      <rect x="332" y="52" width="70" height="24" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="344" y="67" fontSize="8.5" fill="#64748b" fontFamily="system-ui">Type ▾</text>
      <rect x="408" y="52" width="70" height="24" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="420" y="67" fontSize="8.5" fill="#64748b" fontFamily="system-ui">Tag ▾</text>

      {/* Table header */}
      <rect x="8" y="84" width="504" height="22" rx="4" fill="#f1f5f9" />
      <text x="70" y="98" fontSize="8" fill="#64748b" fontFamily="system-ui" fontWeight="600">PRODUCT</text>
      <text x="210" y="98" fontSize="8" fill="#64748b" fontFamily="system-ui" fontWeight="600">SKU</text>
      <text x="290" y="98" fontSize="8" fill="#64748b" fontFamily="system-ui" fontWeight="600">CATEGORY</text>
      <text x="370" y="98" fontSize="8" fill="#64748b" fontFamily="system-ui" fontWeight="600">STOCK</text>
      <text x="430" y="98" fontSize="8" fill="#64748b" fontFamily="system-ui" fontWeight="600">PRICE</text>
      <text x="490" y="98" fontSize="8" fill="#64748b" fontFamily="system-ui" fontWeight="600">TYPE</text>

      {/* Product rows */}
      {[
        { name: "Latte", sku: "BEV-001", cat: "Beverages", stock: 48, price: "$5.50", type: "Standard", stockOk: true, emoji: "☕" },
        { name: "USB-C Cable 1m", sku: "ELEC-014", cat: "Electronics", stock: 2, price: "$12.00", type: "Standard", stockOk: false, emoji: "🔌" },
        { name: "Blueberry Muffin", sku: "SNK-003", cat: "Snacks", stock: 1, price: "$4.50", type: "Standard", stockOk: false, emoji: "🧁" },
        { name: "Cold Brew", sku: "BEV-007", cat: "Beverages", stock: 18, price: "$6.00", type: "Standard", stockOk: true, emoji: "🧊" },
        { name: "Phone Repair (Labour)", sku: "SVC-001", cat: "Services", stock: 0, price: "$85.00", type: "Service", stockOk: true, emoji: "🔧" },
      ].map((p, i) => (
        <g key={i}>
          <rect x="8" y={110 + i * 38} width="504" height="34" rx="4" fill={i % 2 === 0 ? "white" : "#fafafa"} stroke="#f1f5f9" strokeWidth="1" />
          <rect x="16" y={118 + i * 38} width="20" height="20" rx="4" fill="#f1f5f9" />
          <text x="26" y={133 + i * 38} fontSize="11" textAnchor="middle" fontFamily="system-ui">{p.emoji}</text>
          <text x="48" y={130 + i * 38} fontSize="8.5" fill="#1e293b" fontFamily="system-ui" fontWeight="600">{p.name}</text>
          <text x="210" y={130 + i * 38} fontSize="8" fill="#94a3b8" fontFamily="system-ui">{p.sku}</text>
          <rect x="284" y={119 + i * 38} width="62" height="14" rx="4" fill="#f1f5f9" />
          <text x="315" y={130 + i * 38} fontSize="7.5" fill="#475569" textAnchor="middle" fontFamily="system-ui">{p.cat}</text>
          <rect x="360" y={119 + i * 38} width="36" height="14" rx="4" fill={p.stockOk ? "#dcfce7" : "#fee2e2"} />
          <text x="378" y={130 + i * 38} fontSize="7.5" fill={p.stockOk ? "#16a34a" : "#dc2626"} textAnchor="middle" fontFamily="system-ui" fontWeight="600">{p.stock === 0 ? "—" : p.stock}</text>
          <text x="430" y={130 + i * 38} fontSize="8.5" fill="#1e293b" fontFamily="system-ui" fontWeight="600">{p.price}</text>
          <rect x="474" y={119 + i * 38} width="32" height="14" rx="4" fill={p.type === "Service" ? "#ede9fe" : "#e0f2fe"} />
          <text x="490" y={130 + i * 38} fontSize="7" fill={p.type === "Service" ? "#7c3aed" : "#0284c7"} textAnchor="middle" fontFamily="system-ui">{p.type}</text>
        </g>
      ))}

      {/* Pagination */}
      <text x="20" y="322" fontSize="8" fill="#94a3b8" fontFamily="system-ui">Showing 1–5 of 142 products</text>
      <rect x="430" y="310" width="32" height="16" rx="4" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="446" y="321" fontSize="8" fill="#64748b" textAnchor="middle" fontFamily="system-ui">‹</text>
      <rect x="466" y="310" width="32" height="16" rx="4" fill="#f0b800" />
      <text x="482" y="321" fontSize="8" fill="#1e293b" textAnchor="middle" fontFamily="system-ui">›</text>
    </svg>
  );
}

export function CustomersVisual() {
  return (
    <svg viewBox="0 0 520 330" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full rounded-xl border border-border shadow-lg">
      <rect width="520" height="330" rx="12" fill="#f8fafc" />
      <rect width="520" height="44" rx="12" fill="#1e293b" />
      <rect x="0" y="22" width="520" height="22" fill="#1e293b" />
      <circle cx="16" cy="22" r="6" fill="#ef4444" />
      <circle cx="32" cy="22" r="6" fill="#f59e0b" />
      <circle cx="48" cy="22" r="6" fill="#22c55e" />
      <text x="72" y="26" fontSize="9" fill="#94a3b8" fontFamily="system-ui">Customers</text>
      <rect x="396" y="14" width="116" height="16" rx="6" fill="#f0b800" />
      <text x="408" y="25.5" fontSize="8.5" fill="#1e293b" fontFamily="system-ui" fontWeight="600">+ Add Customer</text>

      {/* Search */}
      <rect x="8" y="52" width="260" height="24" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="20" y="67" fontSize="8.5" fill="#94a3b8" fontFamily="system-ui">🔍  Search by name, email, or phone…</text>
      <rect x="276" y="52" width="100" height="24" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="288" y="67" fontSize="8.5" fill="#64748b" fontFamily="system-ui">Segment ▾</text>
      <rect x="384" y="52" width="128" height="24" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="396" y="67" fontSize="8.5" fill="#64748b" fontFamily="system-ui">Referral Source ▾</text>

      {/* Customer cards */}
      {[
        { initials: "SJ", name: "Sarah Johnson", email: "sarah@example.com", phone: "0412 345 678", pts: 1240, spent: "$3,480", visits: 28, color: "#fce7f3", tc: "#be185d", tag: "VIP" },
        { initials: "MC", name: "Mike Chen", email: "mike@example.com", phone: "0401 987 654", pts: 340, spent: "$890", visits: 7, color: "#e0f2fe", tc: "#0369a1", tag: "Regular" },
        { initials: "EB", name: "Emma Brown", email: "emma@example.com", phone: "0423 111 222", pts: 80, spent: "$210", visits: 3, color: "#dcfce7", tc: "#15803d", tag: "New" },
        { initials: "TL", name: "Tom Lee", email: "tom@example.com", phone: "0455 678 901", pts: 670, spent: "$1,920", visits: 15, color: "#fef9c3", tc: "#a16207", tag: "Regular" },
      ].map((c, i) => (
        <g key={i}>
          <rect x="8" y={84 + i * 58} width="504" height="52" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
          {/* Avatar */}
          <circle cx="38" cy={110 + i * 58} r="18" fill={c.color} />
          <text x="38" y={115 + i * 58} fontSize="10" fill={c.tc} textAnchor="middle" fontFamily="system-ui" fontWeight="700">{c.initials}</text>
          {/* Name + email */}
          <text x="64" y={104 + i * 58} fontSize="9.5" fill="#1e293b" fontFamily="system-ui" fontWeight="600">{c.name}</text>
          <text x="64" y={116 + i * 58} fontSize="8" fill="#94a3b8" fontFamily="system-ui">{c.email}</text>
          <text x="64" y={127 + i * 58} fontSize="8" fill="#94a3b8" fontFamily="system-ui">{c.phone}</text>
          {/* Tag */}
          <rect x="190" y={100 + i * 58} width="42" height="14" rx="4" fill={c.color} />
          <text x="211" y={111 + i * 58} fontSize="7.5" fill={c.tc} textAnchor="middle" fontFamily="system-ui" fontWeight="600">{c.tag}</text>
          {/* Stats */}
          <text x="290" y={107 + i * 58} fontSize="7.5" fill="#94a3b8" fontFamily="system-ui">Total Spent</text>
          <text x="290" y={120 + i * 58} fontSize="10" fill="#1e293b" fontFamily="system-ui" fontWeight="700">{c.spent}</text>
          <text x="380" y={107 + i * 58} fontSize="7.5" fill="#94a3b8" fontFamily="system-ui">Loyalty Pts</text>
          <text x="380" y={120 + i * 58} fontSize="10" fill="#f0b800" fontFamily="system-ui" fontWeight="700">⭐ {c.pts}</text>
          <text x="460" y={107 + i * 58} fontSize="7.5" fill="#94a3b8" fontFamily="system-ui">Visits</text>
          <text x="460" y={120 + i * 58} fontSize="10" fill="#1e293b" fontFamily="system-ui" fontWeight="700">{c.visits}</text>
        </g>
      ))}

      <text x="20" y="322" fontSize="8" fill="#94a3b8" fontFamily="system-ui">Showing 1–4 of 312 customers</text>
    </svg>
  );
}

export function ServiceJobsVisual() {
  return (
    <svg viewBox="0 0 520 330" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full rounded-xl border border-border shadow-lg">
      <rect width="520" height="330" rx="12" fill="#f8fafc" />
      <rect width="520" height="44" rx="12" fill="#1e293b" />
      <rect x="0" y="22" width="520" height="22" fill="#1e293b" />
      <circle cx="16" cy="22" r="6" fill="#ef4444" />
      <circle cx="32" cy="22" r="6" fill="#f59e0b" />
      <circle cx="48" cy="22" r="6" fill="#22c55e" />
      <text x="72" y="26" fontSize="9" fill="#94a3b8" fontFamily="system-ui">Service Jobs</text>
      <rect x="388" y="14" width="124" height="16" rx="6" fill="#f0b800" />
      <text x="400" y="25.5" fontSize="8.5" fill="#1e293b" fontFamily="system-ui" fontWeight="600">+ New Service Job</text>

      {/* Overdue banner */}
      <rect x="8" y="52" width="504" height="22" rx="6" fill="#fee2e2" stroke="#fca5a5" strokeWidth="1" />
      <text x="20" y="66" fontSize="8.5" fill="#dc2626" fontFamily="system-ui" fontWeight="600">⚠  2 jobs are overdue — SVC-0041, SVC-0038</text>

      {/* Status filter tabs */}
      <rect x="8" y="82" width="58" height="20" rx="4" fill="#f0b800" />
      <text x="37" y="95" fontSize="8" fill="#1e293b" textAnchor="middle" fontFamily="system-ui" fontWeight="600">All (12)</text>
      {[["Pending (3)","#e0f2fe","#0284c7"],["In Progress (5)","#fef9c3","#ca8a04"],["Awaiting (2)","#ede9fe","#7c3aed"],["Done (2)","#dcfce7","#16a34a"]].map(([label, bg, tc], i) => (
        <g key={i}>
          <rect x={70 + i * 108} y="82" width="100" height="20" rx="4" fill={bg} />
          <text x={70 + i * 108 + 50} y="95" fontSize="8" fill={tc} textAnchor="middle" fontFamily="system-ui">{label}</text>
        </g>
      ))}

      {/* Table header */}
      <rect x="8" y="110" width="504" height="20" rx="4" fill="#f1f5f9" />
      <text x="20" y="123" fontSize="7.5" fill="#64748b" fontFamily="system-ui" fontWeight="600"># JOB</text>
      <text x="110" y="123" fontSize="7.5" fill="#64748b" fontFamily="system-ui" fontWeight="600">CUSTOMER</text>
      <text x="220" y="123" fontSize="7.5" fill="#64748b" fontFamily="system-ui" fontWeight="600">DEVICE / JOB</text>
      <text x="350" y="123" fontSize="7.5" fill="#64748b" fontFamily="system-ui" fontWeight="600">STATUS</text>
      <text x="430" y="123" fontSize="7.5" fill="#64748b" fontFamily="system-ui" fontWeight="600">PRIORITY</text>

      {/* Job rows */}
      {[
        { id: "SVC-0043", cust: "Mike Chen", device: "iPhone 14 — Screen repair", status: "In Progress", statusBg: "#fef9c3", statusTc: "#ca8a04", priority: "Normal", prioBg: "#f1f5f9", prioTc: "#475569", overdue: false },
        { id: "SVC-0042", cust: "Sarah Johnson", device: "MacBook Pro — Battery", status: "Awaiting Stock", statusBg: "#ede9fe", statusTc: "#7c3aed", priority: "High", prioBg: "#fee2e2", prioTc: "#dc2626", overdue: false },
        { id: "SVC-0041", cust: "Tom Lee", device: "PS5 — HDMI port", status: "Pending", statusBg: "#e0f2fe", statusTc: "#0284c7", priority: "Critical", prioBg: "#fee2e2", prioTc: "#dc2626", overdue: true },
        { id: "SVC-0040", cust: "Emma Brown", device: "Samsung S23 — Charging", status: "Completed", statusBg: "#dcfce7", statusTc: "#16a34a", priority: "Normal", prioBg: "#f1f5f9", prioTc: "#475569", overdue: false },
      ].map((j, i) => (
        <g key={i}>
          <rect x="8" y={134 + i * 40} width="504" height="36" rx="4" fill={j.overdue ? "#fff7f7" : (i % 2 === 0 ? "white" : "#fafafa")} stroke={j.overdue ? "#fca5a5" : "#f1f5f9"} strokeWidth="1" />
          <text x="20" y={155 + i * 40} fontSize="8.5" fill="#6366f1" fontFamily="system-ui" fontWeight="600">{j.id}</text>
          <text x="110" y={155 + i * 40} fontSize="8.5" fill="#1e293b" fontFamily="system-ui">{j.cust}</text>
          <text x="220" y={151 + i * 40} fontSize="8" fill="#1e293b" fontFamily="system-ui" fontWeight="600">{j.device.split("—")[0]}</text>
          <text x="220" y={162 + i * 40} fontSize="7.5" fill="#94a3b8" fontFamily="system-ui">— {j.device.split("—")[1]?.trim()}</text>
          <rect x="344" y={142 + i * 40} width="76" height="16" rx="4" fill={j.statusBg} />
          <text x="382" y={153 + i * 40} fontSize="7.5" fill={j.statusTc} textAnchor="middle" fontFamily="system-ui" fontWeight="600">{j.status}</text>
          <rect x="424" y={142 + i * 40} width="56" height="16" rx="4" fill={j.prioBg} />
          <text x="452" y={153 + i * 40} fontSize="7.5" fill={j.prioTc} textAnchor="middle" fontFamily="system-ui" fontWeight="600">{j.priority}</text>
        </g>
      ))}

      <text x="20" y="322" fontSize="8" fill="#94a3b8" fontFamily="system-ui">Showing 1–4 of 12 open jobs</text>
    </svg>
  );
}

export function ReportsVisual() {
  const linePoints = [
    [30, 200], [80, 175], [130, 185], [180, 150], [230, 130], [280, 145], [330, 110], [380, 95],
  ] as const;
  const polyline = linePoints.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${linePoints[0][0]},220 ${polyline} ${linePoints[linePoints.length - 1][0]},220`;
  return (
    <svg viewBox="0 0 520 330" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full rounded-xl border border-border shadow-lg">
      <rect width="520" height="330" rx="12" fill="#f8fafc" />
      <rect width="520" height="44" rx="12" fill="#1e293b" />
      <rect x="0" y="22" width="520" height="22" fill="#1e293b" />
      <circle cx="16" cy="22" r="6" fill="#ef4444" />
      <circle cx="32" cy="22" r="6" fill="#f59e0b" />
      <circle cx="48" cy="22" r="6" fill="#22c55e" />
      <text x="72" y="26" fontSize="9" fill="#94a3b8" fontFamily="system-ui">Reports</text>
      <rect x="390" y="14" width="122" height="16" rx="4" fill="#334155" />
      <text x="400" y="25.5" fontSize="8.5" fill="#94a3b8" fontFamily="system-ui">Jun 1 – Jun 30 ▾</text>

      {/* Report type pills */}
      {[["Sales", true], ["BAS/GST", false], ["Margin", false], ["Staff", false], ["Voids", false]].map(([label, active], i) => (
        <g key={i}>
          <rect x={8 + i * 100} y="52" width="92" height="20" rx="4" fill={active ? "#f0b800" : "white"} stroke={active ? "none" : "#e2e8f0"} strokeWidth="1" />
          <text x={54 + i * 100} y="65" fontSize="8.5" fill={active ? "#1e293b" : "#64748b"} textAnchor="middle" fontFamily="system-ui" fontWeight={active ? "600" : "400"}>{label as string}</text>
        </g>
      ))}

      {/* Line chart */}
      <rect x="8" y="80" width="504" height="160" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <text x="20" y="98" fontSize="9" fill="#1e293b" fontFamily="system-ui" fontWeight="600">Revenue — June 2025</text>
      <text x="490" y="98" fontSize="9" fill="#f0b800" textAnchor="end" fontFamily="system-ui" fontWeight="700">$38,420 total</text>
      {/* Grid */}
      {[0,1,2,3].map(i => (
        <g key={i}>
          <line x1="20" y1={108 + i * 28} x2="500" y2={108 + i * 28} stroke="#f1f5f9" strokeWidth="1" />
          <text x="16" y={111 + i * 28} fontSize="6.5" fill="#cbd5e1" textAnchor="end" fontFamily="system-ui">{["$2k","$1.5k","$1k","$0.5k"][i]}</text>
        </g>
      ))}
      {/* Offset line chart into chart area */}
      <g transform="translate(110, -10)">
        <polygon points={area} fill="#fef9c3" fillOpacity="0.6" />
        <polyline points={polyline} fill="none" stroke="#f0b800" strokeWidth="2.5" strokeLinejoin="round" />
        {linePoints.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.5" fill="#f0b800" stroke="white" strokeWidth="1.5" />
        ))}
      </g>
      {/* X axis labels */}
      {["1 Jun","5 Jun","10 Jun","15 Jun","20 Jun","25 Jun","30 Jun"].map((d, i) => (
        <text key={i} x={130 + i * 56} y="235" fontSize="6.5" fill="#94a3b8" textAnchor="middle" fontFamily="system-ui">{d}</text>
      ))}

      {/* Summary table */}
      <rect x="8" y="248" width="504" height="74" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <rect x="8" y="248" width="504" height="20" rx="8" fill="#f1f5f9" />
      <rect x="8" y="258" width="504" height="10" fill="#f1f5f9" />
      {["PRODUCT","UNITS SOLD","REVENUE","MARGIN"].map((h, i) => (
        <text key={i} x={[20, 200, 320, 430][i]} y="261" fontSize="7.5" fill="#64748b" fontFamily="system-ui" fontWeight="600">{h}</text>
      ))}
      {[
        ["Latte", "312", "$1,716", "68%"],
        ["USB-C Cable 1m", "87", "$1,044", "52%"],
        ["Cold Brew", "198", "$1,188", "61%"],
      ].map((row, i) => (
        <g key={i}>
          <text x="20" y={280 + i * 14} fontSize="8" fill="#1e293b" fontFamily="system-ui">{row[0]}</text>
          <text x="200" y={280 + i * 14} fontSize="8" fill="#64748b" fontFamily="system-ui">{row[1]}</text>
          <text x="320" y={280 + i * 14} fontSize="8" fill="#1e293b" fontFamily="system-ui" fontWeight="600">{row[2]}</text>
          <rect x="424" y={269 + i * 14} width="32" height="12" rx="4" fill="#dcfce7" />
          <text x="440" y={279 + i * 14} fontSize="7.5" fill="#16a34a" textAnchor="middle" fontFamily="system-ui" fontWeight="600">{row[3]}</text>
        </g>
      ))}
    </svg>
  );
}
