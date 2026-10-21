"""Conferência independente, por cabeçalhos, sem emitir nomes ou documentos.
Uso: python scripts/validate_aging_reference.py /caminho/privado/base.xlsx
"""
import sys, json, datetime, hashlib
from collections import defaultdict
from decimal import Decimal
import openpyxl
reference = datetime.date(2026, 10, 19)
groups = defaultdict(list)
for sheet in openpyxl.load_workbook(sys.argv[1], data_only=True):
    rows = iter(sheet.values)
    headers = list(next(rows))
    category = 'received' if 'RECEBIDO' in sheet.title else 'overdue' if 'VENCIDO' in sheet.title else 'upcoming'
    for row in rows:
        get = lambda field: row[headers.index(field)]
        amount = Decimal(str(get('Vr.recebido' if category == 'received' else 'Vr.aberto'))) * 100
        assert amount == int(amount), 'Precisão superior a centavos'
        due = get('Dt.vencimento')
        due = due.date() if isinstance(due, datetime.datetime) else due
        received = get('Dt.recebimento') if category == 'received' else None
        received = received.date() if isinstance(received, datetime.datetime) else received
        record = (category, int(amount), due, received)
        groups['all'].append(record)
        for field, kind in [('Nome cliente', 'client'), ('Nome representante', 'representative')]:
            name = str(get(field) or ('Sem cliente' if kind == 'client' else 'Sem representante'))
            groups[kind + ':' + hashlib.sha256(name.strip().encode()).hexdigest()].append(record)

def calculate(rows):
    totals = {k: sum(r[1] for r in rows if r[0] == k and (k != 'received' or r[3] and datetime.date(2026,1,1) <= r[3] <= reference)) for k in ['upcoming', 'overdue', 'received']}
    bands = [0] * 7
    numerator = Decimal(0)
    denominator = 0
    eligible = 0
    excluded = 0
    for category, amount, due, _ in rows:
        if category != 'overdue': continue
        days = (reference - due).days if due else None
        index = 6 if days is None else 0 if days <= 0 else 1 if days <= 30 else 2 if days <= 60 else 3 if days <= 90 else 4 if days <= 180 else 5
        bands[index] += amount
        if amount == 0: continue
        if amount < 0 or days is None or days <= 0:
            excluded += 1
        else:
            numerator += Decimal(amount) * days
            denominator += amount
            eligible += 1
    exposure = totals['upcoming'] + totals['overdue']
    return {**totals, 'exposure': exposure, 'bands': bands,
        'agingDays': str(numerator / denominator) if denominator and not excluded else None,
        'eligibleCount': eligible, 'excludedCount': excluded,
        'upcomingRatio': str(Decimal(totals['upcoming']) / exposure) if exposure else None,
        'overdueRatio': str(Decimal(totals['overdue']) / exposure) if exposure else None,
        'criticalRatio': str(Decimal(bands[5]) / totals['overdue']) if totals['overdue'] else None,
        'count': len(rows)}
print(json.dumps({key: calculate(rows) for key, rows in groups.items()}))
