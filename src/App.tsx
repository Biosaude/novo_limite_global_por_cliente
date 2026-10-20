import { useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, CalendarDays, Check, ChevronRight, Database, FileSpreadsheet, LayoutDashboard, ListFilter, Search, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import { EmptyState } from './components/EmptyState';

type View = 'dashboard' | 'clientes' | 'representantes' | 'auditoria' | 'base';
const navigation: { id: View; label: string; icon: typeof Activity }[] = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'representantes', label: 'Representantes', icon: Activity },
  { id: 'auditoria', label: 'Auditoria', icon: ShieldCheck },
  { id: 'base', label: 'Gerenciar Base', icon: Database },
];
const charts = [
  ['Composição do Limite Global', 'Participação de cada categoria financeira', 'composition'],
  ['Comparativo financeiro', 'A Vencer, Vencido e Recebido YTD', 'comparison'],
  ['Principais clientes', 'Ranking por Limite Global', 'clients'],
  ['Distribuição por representante', 'Participação na posição financeira', 'representatives'],
  ['Faixas de atraso', 'Distribuição dos saldos vencidos por dias de atraso', 'aging'],
  ['Recebimentos por mês', 'Evolução no exercício financeiro selecionado', 'monthly'],
];

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [notice, setNotice] = useState(true);
  const [reference, setReference] = useState('2026-10-19');
  const [query, setQuery] = useState('');
  const heading = navigation.find(item => item.id === view)!.label;
  const financial = view === 'dashboard';
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={() => setView('dashboard')} aria-label="BIOSAÚDE — início"><span className="brand-symbol">B<span>+</span></span><div>BIOSAÚDE<small>PRODUTOS HOSPITALARES</small></div></a>
      <div className="workspace-label">INTELIGÊNCIA FINANCEIRA</div>
      <nav aria-label="Navegação principal">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><Icon size={19}/>{label}{view === id && <ChevronRight size={15}/>}</button>)}</nav>
      <div className="sidebar-bottom"><span className="secure-icon"><ShieldCheck size={20}/></span><strong>Seus dados, sob controle</strong><p>Esta versão visual não contém dados financeiros.</p><span className="version">INTERFACE PARA AVALIAÇÃO · V0.1</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Financeiro <ChevronRight size={14}/> <strong>{heading}</strong></div><span className="status"><i/>Sem base importada</span></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">PAINEL EXECUTIVO</div><h1>{financial ? 'Limite Global por Cliente' : heading}</h1><p>{financial ? 'Uma visão integrada da sua posição financeira.' : 'BIOSAÚDE — Limite Global por Cliente'}</p></div><button className="primary" onClick={() => setView(view === 'base' ? 'dashboard' : 'base')}><FileSpreadsheet size={17}/>{view === 'base' ? 'Voltar ao dashboard' : 'Gerenciar Base'}</button></div>
        {notice && <div className="info-banner"><ShieldCheck size={21}/><div><strong>Pronto para receber sua base financeira</strong><p>Interface em avaliação. Os indicadores serão calculados a partir da planilha real, sem valores simulados.</p></div><button className="icon-button" aria-label="Fechar aviso" onClick={() => setNotice(false)}><X size={18}/></button></div>}
        {view === 'base' ? <section className="base-layout">
          <article className="panel"><div className="panel-title"><h2>Importar planilha financeira</h2><span className="tag">PRÓXIMA ETAPA</span></div><div className="upload-area"><span className="upload-icon"><FileSpreadsheet size={38}/></span><h3>Sua posição financeira começa aqui</h3><p>Faturamento A Vencer, Vencido e Faturado.xlsx</p><button className="primary" disabled>Importação após aprovação visual</button><small>A leitura do arquivo será implementada após sua avaliação desta interface.</small></div><label className="date-field">Data de referência da posição<input type="date" value={reference} onChange={event => setReference(event.target.value)}/></label><p className="helper">A data da extração será informada na importação. A data histórica de 19/10/2026 é apenas a referência inicial de conferência.</p></article>
          <article className="panel"><h2>Conferência antes da utilização</h2><ol className="steps">{['Identificar abas e cabeçalhos reais', 'Preservar e contar os registros', 'Conferir totais e recebimentos YTD', 'Analisar advertências de auditoria', 'Confirmar utilização da nova base'].map((text, index) => <li key={text}><span>{index + 1}</span><div>{text}<small>Aguardando implementação da importação</small></div></li>)}</ol><div className="privacy-note"><ShieldCheck size={20}/><p>O processamento será realizado no navegador. Nesta etapa, nenhum arquivo é enviado ou armazenado.</p></div></article>
        </section> : <>
          {view !== 'auditoria' && <section className="filters" aria-label="Filtros financeiros"><span className="filter-label"><ListFilter size={17}/>Filtros</span>{['Ano', 'Mês de referência', 'Cliente', 'Representante', 'Categoria financeira'].map(label => <label key={label}>{label}<select disabled aria-label={label}><option>{label === 'Ano' ? 'Sem exercício' : label === 'Mês de referência' ? 'Sem referência' : 'Todos'}</option></select></label>)}<span className="filter-help">Disponíveis após importação</span></section>}
          {financial && <>
            <section className="kpi-grid" aria-label="Indicadores financeiros">{[
              { title: 'Limite Global', description: 'A Vencer + Vencido + Recebido YTD', icon: Wallet, className: 'global' },
              { title: 'A Vencer', description: 'Saldos em aberto a vencer', icon: CalendarDays, className: 'upcoming' },
              { title: 'Vencido', description: 'Saldos em aberto em atraso', icon: ArrowUpRight, className: 'overdue' },
              { title: 'Recebido YTD', description: 'Recebimentos acumulados no ano', icon: ArrowDownLeft, className: 'received' },
            ].map(({ title, description, icon: Icon, className }) => <article className={`kpi ${className}`} key={title}><div className="kpi-label">{title}<span><Icon size={19}/></span></div><div className="kpi-value" aria-label={`${title}: sem dados`}>—<small>BRL</small></div><p>{description}</p><div className="kpi-footer"><span className="tiny-dot"/> Aguardando base <span>—</span></div></article>)}</section>
            <p className="definition">Limite Global é um indicador de movimentação financeira e não representa crédito contratual concedido.</p>
            <section className="chart-grid" aria-label="Visualizações financeiras">{charts.map(([title, subtitle, id], index) => <article className="panel chart-panel" key={id}><div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="chart-number">0{index + 1}</span></div><EmptyState message={id === 'monthly' ? 'A evolução depende das datas de recebimento presentes na planilha.' : id === 'representatives' ? 'A distribuição depende da identificação dos representantes na planilha.' : undefined}/></article>)}</section>
          </>}
          {view === 'auditoria' ? <section className="panel"><div className="panel-title"><div><h2>Auditoria da base</h2><p>Conferência transparente, sem exclusão automática de registros.</p></div><ShieldCheck size={22}/></div><div className="audit-summary">{['Registros preservados', 'Advertências', 'Erros bloqueantes'].map(label => <div key={label}><span>{label}</span><strong>—</strong></div>)}</div><EmptyState message="Após a importação, serão apresentadas ocorrências de valores, datas, campos ausentes e possíveis sobreposições de títulos."/></section> : <section className="panel ranking"><div className="panel-title"><div><h2>{view === 'representantes' ? 'Indicadores por representante' : 'Ranking de clientes'}</h2><p>Posição financeira consolidada · nenhum registro carregado</p></div><label className="search"><Search size={17}/><input type="search" placeholder={view === 'representantes' ? 'Pesquisar representante' : 'Pesquisar cliente'} value={query} onChange={event => setQuery(event.target.value)} aria-label="Pesquisar ranking"/></label></div><div className="table-scroll"><table><thead><tr>{[view === 'representantes' ? 'Representante' : 'Cliente', 'A Vencer', 'Vencido', 'Recebido YTD', 'Limite Global', 'Participação', 'Registros'].map(text => <th key={text}>{text}</th>)}</tr></thead><tbody><tr><td colSpan={7}><EmptyState message={query ? `Nenhuma base carregada para pesquisar “${query}”.` : 'Importe a planilha para consultar o ranking e o detalhamento financeiro.'}/></td></tr></tbody></table></div></section>}
        </>}
        <footer><span>BIOSAÚDE <span className="footer-divider">/</span> Inteligência para decisões financeiras</span><span><Check size={14}/>Sem conexão ao Neon</span></footer>
      </main>
    </div>
  </div>;
}
