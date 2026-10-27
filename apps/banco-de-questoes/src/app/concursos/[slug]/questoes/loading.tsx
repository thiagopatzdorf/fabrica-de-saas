import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingQuestoes() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
