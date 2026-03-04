'use client';

import Link from 'next/link';
import { useHandbooks } from '@/hooks/useHandbook';
import { useClients } from '@/hooks/useClients';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/utils';

function statusVariant(status: string) {
  if (status === 'READY' || status === 'EXPORTED') return 'green';
  if (status === 'IN_PROGRESS') return 'orange';
  return 'gray';
}

export default function HandbooksPage() {
  const { data: handbooks = [], isLoading } = useHandbooks();
  const { data: clients = [] } = useClients();

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  return (
    <div>
      <Header title="Handbuecher" subtitle={`${handbooks.length} QM-Handbuecher`} />

      <div className="px-8 py-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : handbooks.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p>Noch keine Handbuecher erstellt.</p>
            <p className="text-sm mt-1">Oeffne einen Kunden und klicke auf "Handbuch erstellen".</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 max-w-4xl">
            {handbooks.map(item => {
              const client = clientMap[item.customer_id];
              return (
                <Link key={item.id} href={`/handbooks/${item.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{item.type}</p>
                          {client && (
                            <p className="text-sm text-gray-500 mt-0.5">{client.name} · {client.industry}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-3">
                            Erstellt: {formatDate(item.created_at)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                          <span className="text-xs text-gray-400">{formatDate(item.updated_at)}</span>
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
