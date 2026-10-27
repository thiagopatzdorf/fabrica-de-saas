import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function hubError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 400);
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message) return message.slice(0, 400);
  }
  return "Não foi possível concluir.";
}

export function useHubQuery<T>(key: readonly unknown[], queryFn: () => Promise<T>) {
  return useQuery({ queryKey: ["hub", ...key], queryFn });
}

export function useHubMut<T, R>(fn: (data: T) => Promise<R>, done?: (result: R) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["hub"] });
      done?.(result);
    },
    onError: (error) => toast.error(hubError(error)),
  });
}
