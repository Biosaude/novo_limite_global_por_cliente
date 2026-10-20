import { ChartNoAxesCombined } from 'lucide-react';
export function EmptyState({ message = 'Os dados serão exibidos após a importação da base.' }: { message?: string }) {
  return <div className="empty-state"><span className="empty-icon"><ChartNoAxesCombined size={24}/></span><strong>Aguardando dados financeiros</strong><p>{message}</p></div>;
}
