"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useManual } from "@/hooks/useManual";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ReferenceFileList } from "@/components/reference-files/ReferenceFileList";
import type { ReferenceFile } from "@/lib/schemas";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ReferenceFilesPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: manual } = useManual(id);

  const { data: files = [], isLoading } = useQuery<ReferenceFile[]>({
    queryKey: ["reference-files", id],
    queryFn: async () => {
      const res = await fetch(`/api/reference-files/${id}`);
      if (!res.ok) throw new Error("Failed to fetch reference files");
      return res.json();
    },
    enabled: !!id,
  });

  return (
    <div>
      <Header
        title="Referenzdokumente"
        subtitle={manual?.title ?? ""}
        actions={
          <Link href={`/manuals/${id}`}>
            <Button variant="outline" size="sm">
              ← Zurück zum Handbuch
            </Button>
          </Link>
        }
      />

      <div className="px-8 py-6" style={{ height: "calc(100vh - 80px)" }}>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <ReferenceFileList files={files} />
        )}
      </div>
    </div>
  );
}
