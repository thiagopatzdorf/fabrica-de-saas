"use client";

import { useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ContestPicker({
  contests,
  selectedSlug,
}: {
  contests: { slug: string; name: string }[];
  selectedSlug: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={selectedSlug}
      onValueChange={(slug) => router.push(`/minha-chance?concurso=${slug}`)}
    >
      <SelectTrigger className="w-full sm:w-72">
        <SelectValue placeholder="Escolha um concurso" />
      </SelectTrigger>
      <SelectContent>
        {contests.map((contest) => (
          <SelectItem key={contest.slug} value={contest.slug}>
            {contest.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
