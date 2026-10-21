"""Leitura independente do Excel: nenhuma saída inclui nomes, pacientes ou títulos.
Uso: python scripts/validate_credit_reference.py /caminho/privado/base.xlsx
Os hashes permitem conciliar todos os clientes sem publicar identificadores.
"""
import sys, json, datetime, hashlib, statistics, calendar, unicodedata
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
import openpyxl
D=Decimal
REFERENCE=datetime.date(2026,10,19)
def day(value):
    return value.date() if isinstance(value,datetime.datetime) else value if isinstance(value,datetime.date) else None
def cash(value): return int((D(str(value))*100).quantize(D('1'),rounding=ROUND_HALF_UP))
def integer(value): return int(D(value).quantize(D('1'),rounding=ROUND_HALF_UP))
def key(name): return ' '.join(unicodedata.normalize('NFC',name).split()).upper()
wb=openpyxl.load_workbook(sys.argv[1],data_only=True)
groups=defaultdict(list)
for sheet in wb:
    data=list(sheet.values);headers=list(data[0]);category='received' if 'RECEBIDO' in sheet.title else 'overdue' if 'VENCIDO' in sheet.title else 'upcoming'
    for row in data[1:]:
        get=lambda name:row[headers.index(name)]
        groups[key(get('Nome cliente'))].append(dict(category=category,cents=cash(get('Vr.recebido' if category=='received' else 'Vr.aberto')),issued=day(get('Dt.emissao')),due=day(get('Dt.vencimento')),received=day(get('Dt.recebimento')) if category=='received' else None,title=(str(get('Duplicata')),str(get('Parcela')))))
start=min(row['received'] for rows in groups.values() for row in rows if row['received'] and row['received'].year==REFERENCE.year and row['received']<=REFERENCE)
cursor=start;window_months=D(0)
while cursor<=REFERENCE:
    days=calendar.monthrange(cursor.year,cursor.month)[1]
    last=datetime.date(cursor.year,cursor.month,days);end=min(last,REFERENCE)
    window_months+=D((end-cursor).days+1)/D(days)
    cursor=last+datetime.timedelta(days=1)
report={}
for name,rows in groups.items():
    upcoming=sum(r['cents'] for r in rows if r['category']=='upcoming');overdue=sum(r['cents'] for r in rows if r['category']=='overdue');exposure=upcoming+overdue
    receipts=[r for r in rows if r['received'] and datetime.date(2026,1,1)<=r['received']<=REFERENCE];positive=[r for r in receipts if r['cents']>0];dated=[r for r in positive if r['due']];late=[r for r in dated if r['received']>r['due']]
    titles=defaultdict(list)
    for r in receipts:titles[r['title']].append(r)
    contracts=defaultdict(set)
    for r in rows:
        if r['category']=='received' and r not in receipts:continue
        if r['issued'] and r['due']:contracts[r['title']].add((r['due']-r['issued']).days)
    usable={k:next(iter(values)) for k,values in contracts.items() if len(values)==1 and next(iter(values))>0}
    terms=list(usable.values());term=statistics.median(terms) if terms else None
    credit=[r for r in positive if r['title'] in usable and r['issued'] and r['received']>=r['issued']]
    received=sum(r['cents'] for r in receipts);credit_received=sum(r['cents'] for r in credit)
    active=len({r['received'].strftime('%Y-%m') for r in positive})
    coverage=D(len(dated))/D(len(positive)) if positive else D(0)
    sufficient=len(positive)>=3 and len({r['title'] for r in positive})>=2 and active>=2 and window_months>=2 and coverage>=D('.8') and all(r['cents']>=0 for r in rows) and exposure>=0
    base_eligible=sufficient and len(credit)>=3 and len({r['title'] for r in credit})>=2 and len({r['received'].strftime('%Y-%m') for r in credit})>=2 and term is not None
    base=integer(D(credit_received)/window_months*D(str(term))/30) if base_eligible else None
    buckets=[0]*6;max_delay=0
    for r in rows:
        if r['category']!='overdue':continue
        delay=(REFERENCE-r['due']).days if r['due'] else None
        i=5 if delay is None else 4 if delay<=0 else 0 if delay<=30 else 1 if delay<=60 else 2 if delay<=90 else 3
        buckets[i]+=r['cents'];max_delay=max(max_delay,delay or 0)
    late_amount=sum(r['cents'] for r in late)
    valid_payment=[r for r in positive if r['issued'] and r['received']>=r['issued']]
    paid_amount=sum(r['cents'] for r in valid_payment)
    average_monthly=integer(D(received)/window_months)
    risk='Dados insuficientes'
    if sufficient:
        risk='Baixo'
        # Critérios propostos documentados: pior limiar, nunca aprovação de crédito.
        for label,ratio,delay,freq,concentration,multiple in [('Crítico',.5,91,.75,.5,6),('Alto',.2,61,.5,.3,4),('Moderado',.01,1,.2,.1,2)]:
            if (overdue>0 and exposure>0 and overdue/exposure>=ratio) or max_delay>=delay or (dated and len(late)/len(dated)>=freq) or (overdue>0 and buckets[3]>0 and buckets[3]/overdue>=concentration) or (average_monthly>0 and exposure/average_monthly>=multiple):
                risk=label;break
    report[hashlib.sha256(name.encode()).hexdigest()]={'upcoming':upcoming,'overdue':overdue,'exposure':exposure,'received':received,'delinquency':overdue/exposure if exposure>0 else None,'receiptRecords':len(receipts),'titleCount':len(titles),'lateCount':len(late),'onTimeCount':len(dated)-len(late),'weightedLateDays':float(sum(D(r['cents'])*(r['received']-r['due']).days for r in late)/late_amount) if late_amount else None,'weightedPaymentDays':float(sum(D(r['cents'])*(r['received']-r['issued']).days for r in valid_payment)/paid_amount) if paid_amount else None,'meanLateDays':statistics.mean([(r['received']-r['due']).days for r in late]) if late else None,'baseLimit':base,'term':term,'creditReceipts':credit_received,'bands':buckets,'risk':risk,'windowMonths':float(window_months),'meanMonthly':average_monthly}
print(json.dumps({'reference':str(REFERENCE),'clients':report,'records':sum(len(v) for v in groups.values()),'clientCount':len(report),'totals':{field:sum(c[field] for c in report.values()) for field in ['upcoming','overdue','exposure','received']}}))
