import { Avatar, AvatarFallback } from '@/admin/components/ui/avatar';

/** Exemplos fixos (pessoas fictícias), só para o visual do template. */
const sales = [
  { initials: 'AS', name: 'Ana Souza', phone: '(11) 9****-4321', amount: '+R$ 1.999,00' },
  { initials: 'JL', name: 'João Lima', phone: '(21) 9****-1180', amount: '+R$ 39,00' },
  { initials: 'MC', name: 'Maria Costa', phone: '(31) 9****-7712', amount: '+R$ 299,00' },
  { initials: 'PR', name: 'Pedro Rocha', phone: '(41) 9****-0045', amount: '+R$ 99,00' },
  { initials: 'BF', name: 'Beatriz Fernandes', phone: '(51) 9****-3398', amount: '+R$ 39,00' },
];

export function RecentSales() {
  return (
    <div className="space-y-8">
      {sales.map((sale) => (
        <div key={sale.name} className="flex items-center gap-4">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{sale.initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-wrap items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm leading-none font-medium">{sale.name}</p>
              <p className="text-sm text-muted-foreground">{sale.phone}</p>
            </div>
            <div className="font-medium">{sale.amount}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
