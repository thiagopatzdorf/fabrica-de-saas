import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingMinhaChance() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
