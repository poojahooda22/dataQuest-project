import { QueryClient } from "@tanstack/react-query";

// One shared QueryClient. Server state lives here (never in useState+useEffect+fetch).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});