import { LegiscastCard } from "@/components/legiscast-card";
import type { LegiscastItem } from "@/lib/legiscast";

export function LegiscastGrid({ items }: { items: LegiscastItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 min-[460px]:grid-cols-2 lg:grid-cols-3 lg:gap-6">
      {items.map((item) => <LegiscastCard key={item.slug} item={item} />)}
    </div>
  );
}
