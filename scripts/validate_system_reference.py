"""Leitura independente do original, sem publicar identificadores ou nomes: usa hashes por linha."""
import sys, json, re, hashlib
from decimal import Decimal
import openpyxl

wb = openpyxl.load_workbook(sys.argv[1], data_only=True, read_only=True)
def identifier(value):
    return re.sub(r"^[\s']+", '', '' if value is None else str(value)).strip()
records = []
totals = {}
groups = {}
headers = {}
blank = 0
for sheet in wb:
    rows = iter(sheet.values)
    next(rows)
    columns = list(next(rows))
    headers[sheet.title] = columns
    total = 0
    for number, row in enumerate(rows, 3):
        if not any(v is not None for v in row): continue
        code, boleto = identifier(row[0]), identifier(row[39])
        amount = Decimal(str(row[22 if sheet.title == 'RECEBIDO' else 21])) * 100
        assert amount == int(amount)
        total += int(amount)
        blank += not boleto
        fingerprint = hashlib.sha256(json.dumps([code, boleto], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
        records.append([sheet.title, number, fingerprint, int(amount)])
        key = hashlib.sha256(code.encode()).hexdigest()
        groups.setdefault(key, {}).setdefault(sheet.title, 0)
        groups[key][sheet.title] += int(amount)
    totals[sheet.title] = total
print(json.dumps(dict(headers=headers, records=records, totals=totals, blankBoleto=blank, groups=groups)))
