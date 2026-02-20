"use client";

import Link from "next/link";
import { useManuals } from "@/hooks/useManual";
import { useClients } from "@/hooks/useClients";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";

export default function ManualsPage() {
  const { data: manuals = [], isLoading } = useManuals();
  const { data: clients = [] } = useClients();

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

  return (
    <div>
      <Header
        title="Handbücher"
        subtitle={`${manuals.length} QM-Handbücher`}
      />

      <div className="px-8 py-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : manuals.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p>Noch keine Handbücher erstellt.</p>
            <p className="text-sm mt-1">
              Öffne einen Kunden und klicke auf &ldquo;Handbuch erstellen&rdquo;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 max-w-4xl">
            {manuals.map((m) => {
              const client = clientMap[m.clientId];
              const aiCount = m.sections.filter((s) => s.aiGenerated).length;
              const progress = Math.round((aiCount / m.sections.length) * 100);

              const statusVariant =
                m.status === "complete"
                  ? "green"
                  : m.status === "in_progress"
                  ? "orange"
                  : "gray";

              return (
                <Link key={m.id} href={`/manuals/${m.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{m.title}</p>
                          {client && (
                            <p className="text-sm text-gray-500 mt-0.5">
                              {client.name} · {client.industry}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div
                                className="bg-primary h-1.5 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 shrink-0">
                              {aiCount}/{m.sections.length} KI
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={statusVariant}>
                            {m.status === "complete"
                              ? "Fertig"
                              : m.status === "in_progress"
                              ? "In Arbeit"
                              : "Entwurf"}
                          </Badge>
                          <span className="text-xs text-gray-400">
                            {formatDate(m.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
