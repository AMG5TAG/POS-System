import { useQuery } from "@tanstack/react-query";
import { listCustomers, type Customer } from "@workspace/api-client-react";

/**
 * Fetch EVERY customer for the merchant (paginated), for reports/analytics that
 * must aggregate across the whole customer base rather than a single capped page.
 *
 * The list endpoint has no server-side row cap, so we page through in fixed
 * chunks until we've collected `total` (or a short page signals the end), which
 * keeps any single request bounded regardless of how many customers exist.
 */
export function useAllCustomers() {
  const query = useQuery({
    queryKey: ["all-customers"],
    queryFn: async () => {
      const pageSize = 1000;
      const all: Customer[] = [];
      let offset = 0;
      for (;;) {
        const page = await listCustomers({ limit: pageSize, offset });
        all.push(...page.items);
        if (all.length >= page.total || page.items.length < pageSize) break;
        offset += pageSize;
      }
      return all;
    },
    staleTime: 60_000,
  });
  return { customers: query.data ?? [], isLoading: query.isLoading };
}
