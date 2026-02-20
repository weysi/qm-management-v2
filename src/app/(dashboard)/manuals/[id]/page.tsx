"use client";

import { use } from "react";
import Link from "next/link";
import { useManual } from "@/hooks/useManual";
import { useClient } from "@/hooks/useClients";
import { ManualEditor } from "@/components/manual-editor/ManualEditor";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ManualPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: manual, isLoading: loadingManual } = useManual(id);
  const { data: client, isLoading: loadingClient } = useClient(
    manual?.clientId ?? ""
  );

  if (loadingManual || loadingClient) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner />
      </div>
    );
  }

  if (!manual || !client) {
    return <div className="p-8 text-gray-500">Handbuch nicht gefunden.</div>;
  }

  const aiCount = manual.sections.filter((s) => s.aiGenerated).length;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        title={manual.title}
        subtitle={`v${manual.version} · ${client.name}`}
        actions={
          <div className="flex items-center gap-3">
            <Badge variant={aiCount === manual.sections.length ? "green" : "orange"}>
              {aiCount}/{manual.sections.length} KI
            </Badge>
            <Link href={`/manuals/${id}/reference-files`}>
              <Button variant="outline" size="sm">
                Referenzdokumente
              </Button>
            </Link>
          </div>
        }
      />
      <div className="flex-1 overflow-hidden">
        <ManualEditor manual={manual} client={client} />
      </div>
    </div>
  );
}
