import { useLocation, Link } from "wouter";

interface TabItem {
  href: string;
  label: string;
  icon?: React.ElementType;
}

export function PageTabsNav({ tabs }: { tabs: TabItem[] }) {
  const [location] = useLocation();

  return (
    <div className="flex flex-wrap items-center bg-muted rounded-xl p-1 gap-0.5">
      {tabs.map(({ href, label, icon: Icon }) => {
        const isAnchor = href.startsWith("#");
        const active = !isAnchor && location === href;

        const btnClass = [
          "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer select-none",
          active
            ? "bg-background shadow-sm text-primary"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ");

        if (isAnchor) {
          return (
            <button
              key={href}
              type="button"
              onClick={() => {
                const id = href.slice(1);
                document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={btnClass}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
              {label}
            </button>
          );
        }

        return (
          <Link key={href} href={href}>
            <button type="button" className={btnClass}>
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
              {label}
            </button>
          </Link>
        );
      })}
    </div>
  );
}
