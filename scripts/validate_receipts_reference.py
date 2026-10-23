"""Leitura independente da aba Recebido: valores em centavos, sem divulgar nomes."""
import sys,json,datetime,decimal,collections,hashlib,unicodedata
import openpyxl
wb=openpyxl.load_workbook(sys.argv[1],data_only=True)
ref=datetime.date.fromisoformat(sys.argv[2])
sheet=next(s for s in wb if 'RECEBIDO' in s.title.upper())
def norm(v):return ''.join(c for c in unicodedata.normalize('NFD',str(v or '')).lower() if c.isalnum() and not unicodedata.combining(c))
headers={norm(c.value):i for i,c in enumerate(sheet[1])}
amounts=collections.Counter();counts=collections.Counter();months=collections.Counter();quarters=collections.Counter();clients=collections.Counter();representatives=collections.Counter()
excluded=0
for row in sheet.iter_rows(min_row=2,values_only=True):
 if not row[headers['nomecliente']]:continue
 get=lambda name:row[headers[norm(name)]]
 rec=get('Dt.recebimento');due=get('Dt.vencimento')
 if not isinstance(rec,datetime.datetime) or rec.date()>ref:excluded+=1;continue
 value=int((decimal.Decimal(str(get('Vr.recebido')))*100).quantize(decimal.Decimal('1'),rounding=decimal.ROUND_HALF_UP))
 condition='unknown' if not isinstance(due,datetime.datetime) else 'early' if rec.date()<due.date() else 'late' if rec.date()>due.date() else 'ontime'
 amounts[condition]+=value;counts[condition]+=1;months[rec.strftime('%Y-%m')]+=value;quarters[f'{rec.year} Q{(rec.month-1)//3+1}']+=value
 for field,group in [('Nome cliente',clients),('Nome representante',representatives)]:
  key=' '.join(unicodedata.normalize('NFC',str(get(field) or ('Sem cliente' if group is clients else 'Sem representante'))).split()).upper()
  group[hashlib.sha256(key.encode()).hexdigest()]+=value
print(json.dumps(dict(total=sum(amounts.values()),count=sum(counts.values()),amounts=dict(amounts),counts=dict(counts),monthly=dict(months),quarterly=dict(quarters),clients=dict(clients),representatives=dict(representatives),excluded=excluded)))
