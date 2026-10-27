import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingProgresso() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}
