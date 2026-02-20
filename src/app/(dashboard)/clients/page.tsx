"use client";

import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { useClients, useDeleteClient } from "@/hooks/useClients";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";
import type { Client } from "@/lib/schemas";

const columnHelper = createColumnHelper<Client>();

export default function ClientsPage() {
  const { data: clients = [], isLoading } = useClients();
  const { mutate: deleteClient } = useDeleteClient();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = [
    columnHelper.accessor("name", {
      header: "Firma",
      cell: (info) => (
        <Link
          href={`/clients/${info.row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor("industry", {
      header: "Branche",
      cell: (info) => <span className="text-gray-700">{info.getValue()}</span>,
    }),
    columnHelper.accessor("zipCity", {
      header: "Ort",
      cell: (info) => <span className="text-gray-600 text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor("employeeCount", {
      header: "Mitarbeiter",
      cell: (info) => <Badge variant="blue">{info.getValue()}</Badge>,
    }),
    columnHelper.accessor("createdAt", {
      header: "Erstellt",
      cell: (info) => (
        <span className="text-gray-500 text-sm">{formatDate(info.getValue())}</span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: (info) => (
        <div className="flex items-center gap-2 justify-end">
          <Link href={`/clients/${info.row.original.id}`}>
            <Button size="sm" variant="ghost">Öffnen</Button>
          </Link>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (confirm("Kunden wirklich löschen?")) {
                deleteClient(info.row.original.id);
              }
            }}
          >
            Löschen
          </Button>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: clients,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div>
      <Header
        title="Kunden"
        subtitle={`${clients.length} Kunden`}
        actions={
          <Link href="/clients/new">
            <Button>+ Neuer Kunde</Button>
          </Link>
        }
      />

      <div className="px-8 py-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-gray-100 bg-gray-50">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getIsSorted() === "asc"
                          ? " ↑"
                          : h.column.getIsSorted() === "desc"
                          ? " ↓"
                          : ""}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {clients.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                <p>Noch keine Kunden vorhanden.</p>
                <Link href="/clients/new">
                  <Button className="mt-3" size="sm">Ersten Kunden anlegen</Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
