import type { DatasetRepository } from "../../src/persistencia/contracts.js";
import type { Dataset } from "../../src/domain/types.js";
import { enrichCreditRecords } from "../../src/credito/analysis.js";
import { refreshDayAnalysis } from "../../src/importacao/dayAnalysis.js";
import type { ScopedDatabase, Statement } from "../db/client.js";
import {
  denyAll,
  validateScope,
  type AuthorizationGate,
} from "../security/authorization.js";
import {
  validateDataset,
  financialSnapshot,
  decodeDataset,
} from "./dataset-codec.js";
const matchKey = (s: string) =>
  s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
/** Porta compatível com IndexedDB; usada somente por rotas remotas explicitamente habilitadas. */
export class PostgresDatasetRepository implements DatasetRepository {
  constructor(
    private readonly db: ScopedDatabase,
    private readonly authorization: AuthorizationGate = denyAll,
  ) {}
  async load(): Promise<Dataset | null> {
    const scope = validateScope(
      await this.authorization.authorize("datasets:read"),
    );
    const [rows] = await this.db.transaction(scope.workspaceId, [
      {
        text: "SELECT v.dataset_payload,s.reviews,s.client_updated_at FROM biosaude.active_datasets a JOIN biosaude.import_versions v ON (v.workspace_id,v.id)=(a.workspace_id,a.version_id) JOIN biosaude.dataset_state s ON (s.workspace_id,s.version_id)=(v.workspace_id,v.id) WHERE a.workspace_id=$1",
        values: [scope.workspaceId],
      },
    ]);
    return rows[0] ? refreshDayAnalysis(decodeDataset(rows[0])) : null;
  }
  async history(): Promise<Dataset[]> {
    const scope = validateScope(
      await this.authorization.authorize("datasets:read"),
    );
    const [rows] = await this.db.transaction(scope.workspaceId, [
      {
        text: "SELECT v.dataset_payload,s.reviews,s.client_updated_at FROM biosaude.import_versions v JOIN biosaude.dataset_state s ON (s.workspace_id,s.version_id)=(v.workspace_id,v.id) WHERE v.workspace_id=$1 ORDER BY s.updated_at DESC,v.id",
        values: [scope.workspaceId],
      },
    ]);
    return rows.map((row) => refreshDayAnalysis(decodeDataset(row)));
  }
  async loadVersion(versionId: string): Promise<Dataset | null> {
    const scope = validateScope(
      await this.authorization.authorize("datasets:read"),
    );
    const [rows] = await this.db.transaction(scope.workspaceId, [
      {
        text: "SELECT v.dataset_payload,s.reviews,s.client_updated_at FROM biosaude.import_versions v JOIN biosaude.dataset_state s ON (s.workspace_id,s.version_id)=(v.workspace_id,v.id) WHERE v.workspace_id=$1 AND v.id=$2",
        values: [scope.workspaceId, versionId],
      },
    ]);
    return rows[0] ? refreshDayAnalysis(decodeDataset(rows[0])) : null;
  }
  async versions(limit: number, offset: number) {
    const scope = validateScope(
      await this.authorization.authorize("datasets:read"),
    );
    const [rows] = await this.db.transaction(scope.workspaceId, [
      {
        text: "SELECT v.id,v.reference_date::text AS reference,v.filename,v.imported_at,(v.dataset_payload->'records') IS NOT NULL AS has_records,(SELECT count(*)::int FROM biosaude.financial_records r WHERE (r.workspace_id,r.version_id)=(v.workspace_id,v.id)) AS record_count,EXISTS(SELECT 1 FROM biosaude.active_datasets a WHERE (a.workspace_id,a.version_id)=(v.workspace_id,v.id)) AS active FROM biosaude.import_versions v WHERE v.workspace_id=$1 ORDER BY v.imported_at DESC,v.id LIMIT $2 OFFSET $3",
        values: [scope.workspaceId, limit, offset],
      },
    ]);
    return rows;
  }
  async activate(versionId: string): Promise<void> {
    const scope = validateScope(
      await this.authorization.authorize("datasets:write"),
    );
    await this.db.transaction(scope.workspaceId, [
      {
        text: "SELECT biosaude.require_version($1,$2)",
        values: [scope.workspaceId, versionId],
      },
      {
        text: "INSERT INTO biosaude.active_datasets(workspace_id,version_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO UPDATE SET version_id=EXCLUDED.version_id",
        values: [scope.workspaceId, versionId],
      },
      {
        text: "INSERT INTO biosaude.audit_events(workspace_id,version_id,actor_subject,action) VALUES($1,$2,$3,'dataset.activate')",
        values: [scope.workspaceId, versionId, scope.subject],
      },
    ]);
  }
  /** Só revisões de auditoria; não regrava finanças nem troca a versão ativa. */
  async updateReviews(
    versionId: string,
    reviews: Dataset["reviews"],
  ): Promise<void> {
    const scope = validateScope(
      await this.authorization.authorize("datasets:write"),
    );
    const w = scope.workspaceId,
      json = JSON.stringify(reviews),
      now = new Date().toISOString();
    await this.db.transaction(w, [
      {
        text: "SELECT biosaude.require_version($1,$2)",
        values: [w, versionId],
      },
      {
        text: `WITH prior AS (SELECT reviews FROM biosaude.dataset_state WHERE workspace_id=$1 AND version_id=$2), keys AS (SELECT jsonb_object_keys($3::jsonb) AS k UNION SELECT jsonb_object_keys(reviews) FROM prior)
        INSERT INTO biosaude.audit_review_history(workspace_id,version_id,issue_key,operation,review,actor_subject)
        SELECT $1::uuid,$2,keys.k,CASE WHEN ($3::jsonb)->keys.k IS NULL THEN 'removed' ELSE 'recorded' END,($3::jsonb)->keys.k,$4 FROM keys,prior WHERE prior.reviews->keys.k IS DISTINCT FROM ($3::jsonb)->keys.k`,
        values: [w, versionId, json, scope.subject],
      },
      {
        text: "UPDATE biosaude.dataset_state SET reviews=$3::jsonb,updated_at=$4,client_updated_at=$5 WHERE workspace_id=$1 AND version_id=$2",
        values: [w, versionId, json, now, now],
      },
      {
        text: "INSERT INTO biosaude.audit_events(workspace_id,version_id,actor_subject,action) VALUES($1,$2,$3,'dataset.reviews.update')",
        values: [w, versionId, scope.subject],
      },
    ]);
  }
  async clear(): Promise<void> {
    const scope = validateScope(
      await this.authorization.authorize("datasets:write"),
    );
    await this.db.transaction(scope.workspaceId, [
      {
        text: "DELETE FROM biosaude.active_datasets WHERE workspace_id=$1",
        values: [scope.workspaceId],
      },
      {
        text: "INSERT INTO biosaude.audit_events(workspace_id,actor_subject,action) VALUES($1,$2,'dataset.deactivate')",
        values: [scope.workspaceId, scope.subject],
      },
    ]);
  }
  async save(value: Dataset): Promise<void> {
    const scope = validateScope(
      await this.authorization.authorize("datasets:write"),
    );
    const d = validateDataset(value),
      snapshot = financialSnapshot(d),
      w = scope.workspaceId;
    const records = enrichCreditRecords(d).map((r) => {
      const clientKey = matchKey(r.client || "Sem cliente");
      const titleKey = JSON.stringify([
        clientKey,
        r.document && r.installment
          ? [r.document.trim(), r.installment.trim()]
          : r.title
            ? ["title", matchKey(r.title)]
            : ["row", r.id],
      ]);
      return {
        id: r.id,
        category: r.category,
        client_key: clientKey,
        client_name: r.client,
        representative: r.representative,
        title_key: titleKey,
        document: r.document ?? "",
        installment: r.installment ?? "",
        display_title: r.title,
        sheet: r.sheet,
        source_row: r.row,
        issued_on: r.issued ?? null,
        due_on: r.due,
        received_on: r.received,
        amount_cents: r.cents,
      };
    });
    const json = JSON.stringify(records),
      input =
        "jsonb_to_recordset($3::jsonb) AS x(id text,category text,client_key text,client_name text,representative text,title_key text,document text,installment text,display_title text,sheet text,source_row integer,issued_on date,due_on date,received_on date,amount_cents bigint)";
    const statements: Statement[] = [
      {
        text: "INSERT INTO biosaude.import_versions(workspace_id,id,reference_date,filename,imported_at,content_hash,dataset_payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING",
        values: [
          w,
          d.id,
          d.reference,
          d.filename,
          d.importedAt,
          snapshot.hash,
          JSON.stringify(snapshot.payload),
        ],
      },
      {
        text: "SELECT biosaude.assert_import_content($1,$2,$3)",
        values: [w, d.id, snapshot.hash],
      },
      {
        text: `INSERT INTO biosaude.clients(workspace_id,match_key,display_name) SELECT DISTINCT ON(x.client_key) $1::uuid,x.client_key,x.client_name FROM ${input.replace("$3", "$2")} ON CONFLICT DO NOTHING`,
        values: [w, json],
      },
      {
        text: `INSERT INTO biosaude.financial_titles(workspace_id,client_id,identity_key,document,installment,display_title) SELECT DISTINCT ON(x.title_key) $1::uuid,c.id,x.title_key,x.document,x.installment,x.display_title FROM ${input.replace("$3", "$2")} JOIN biosaude.clients c ON c.workspace_id=$1 AND c.match_key=x.client_key ON CONFLICT DO NOTHING`,
        values: [w, json],
      },
      {
        text: `INSERT INTO biosaude.import_titles(workspace_id,version_id,title_id) SELECT DISTINCT $1::uuid,$2,t.id FROM ${input} JOIN biosaude.financial_titles t ON t.workspace_id=$1 AND t.identity_key=x.title_key ON CONFLICT DO NOTHING`,
        values: [w, d.id, json],
      },
      {
        text: `INSERT INTO biosaude.financial_records(workspace_id,version_id,id,title_id,category,client_original_name,representative,source_sheet,source_row,issued_on,due_on,amount_cents) SELECT $1::uuid,$2,x.id,t.id,x.category,x.client_name,x.representative,x.sheet,x.source_row,x.issued_on,x.due_on,x.amount_cents FROM ${input} JOIN biosaude.financial_titles t ON t.workspace_id=$1 AND t.identity_key=x.title_key ON CONFLICT DO NOTHING`,
        values: [w, d.id, json],
      },
      {
        text: `INSERT INTO biosaude.receipt_entries(workspace_id,version_id,record_id,received_on) SELECT $1::uuid,$2,x.id,x.received_on FROM ${input} WHERE x.category='received' ON CONFLICT DO NOTHING`,
        values: [w, d.id, json],
      },
      {
        text: `INSERT INTO biosaude.delinquency_positions(workspace_id,version_id,record_id) SELECT $1::uuid,$2,x.id FROM ${input} WHERE x.category='overdue' ON CONFLICT DO NOTHING`,
        values: [w, d.id, json],
      },
      {
        text: "INSERT INTO biosaude.audit_issues(workspace_id,version_id,id,severity,code,message,record_ids) SELECT $1::uuid,$2,x.id,x.severity,x.code,x.message,x.records FROM jsonb_to_recordset($3::jsonb) AS x(id text,severity text,code text,message text,records jsonb) ON CONFLICT DO NOTHING",
        values: [w, d.id, JSON.stringify(d.issues)],
      },
      {
        text: `WITH prior AS (SELECT COALESCE((SELECT reviews FROM biosaude.dataset_state WHERE workspace_id=$1 AND version_id=$2),'{}'::jsonb) AS reviews), keys AS (SELECT jsonb_object_keys($3::jsonb) AS k UNION SELECT jsonb_object_keys(reviews) FROM prior)
        INSERT INTO biosaude.audit_review_history(workspace_id,version_id,issue_key,operation,review,actor_subject)
        SELECT $1::uuid,$2,keys.k,CASE WHEN ($3::jsonb)->keys.k IS NULL THEN 'removed' ELSE 'recorded' END,($3::jsonb)->keys.k,$4 FROM keys,prior WHERE prior.reviews->keys.k IS DISTINCT FROM ($3::jsonb)->keys.k`,
        values: [w, d.id, JSON.stringify(d.reviews), scope.subject],
      },
      {
        text: "INSERT INTO biosaude.dataset_state(workspace_id,version_id,reviews,updated_at,client_updated_at) VALUES($1,$2,$3::jsonb,$4,$5) ON CONFLICT(workspace_id,version_id) DO UPDATE SET reviews=EXCLUDED.reviews,updated_at=EXCLUDED.updated_at,client_updated_at=EXCLUDED.client_updated_at",
        values: [
          w,
          d.id,
          JSON.stringify(d.reviews),
          d.updatedAt ?? d.importedAt,
          d.updatedAt ?? null,
        ],
      },
      {
        text: "INSERT INTO biosaude.active_datasets(workspace_id,version_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO UPDATE SET version_id=EXCLUDED.version_id",
        values: [w, d.id],
      },
      {
        text: "INSERT INTO biosaude.audit_events(workspace_id,version_id,actor_subject,action,metadata) VALUES($1,$2,$3,'dataset.save',$4::jsonb)",
        values: [
          w,
          d.id,
          scope.subject,
          JSON.stringify({
            recordCount: d.records.length,
            reviewCount: Object.keys(d.reviews).length,
          }),
        ],
      },
    ];
    await this.db.transaction(w, statements);
  }
}
