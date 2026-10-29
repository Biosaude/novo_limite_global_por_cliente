-- Etapa 1: somente definição versionada. Não executada automaticamente.
CREATE SCHEMA biosaude;
CREATE TABLE biosaude.schema_migrations (
 version text PRIMARY KEY, checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'), applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE biosaude.workspaces (id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE biosaude.import_versions (
 workspace_id uuid NOT NULL REFERENCES biosaude.workspaces(id), id text NOT NULL,
 reference_date date NOT NULL, filename text NOT NULL, imported_at timestamptz NOT NULL,
 content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
 dataset_payload jsonb NOT NULL CHECK (jsonb_typeof(dataset_payload)='object'),
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,id,reference_date)
);
CREATE TABLE biosaude.dataset_state (
 workspace_id uuid NOT NULL, version_id text NOT NULL, reviews jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(reviews)='object'),
 updated_at timestamptz NOT NULL, client_updated_at text,
 PRIMARY KEY(workspace_id,version_id), FOREIGN KEY(workspace_id,version_id) REFERENCES biosaude.import_versions(workspace_id,id)
);
CREATE TABLE biosaude.active_datasets (
 workspace_id uuid PRIMARY KEY REFERENCES biosaude.workspaces(id), version_id text NOT NULL,
 FOREIGN KEY(workspace_id,version_id) REFERENCES biosaude.import_versions(workspace_id,id)
);
CREATE TABLE biosaude.clients (
 workspace_id uuid NOT NULL REFERENCES biosaude.workspaces(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 match_key text NOT NULL, display_name text NOT NULL, cnpj text,
 identification_ambiguous boolean NOT NULL DEFAULT true,
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,match_key)
);
CREATE TABLE biosaude.financial_titles (
 workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), client_id uuid NOT NULL,
 identity_key text NOT NULL, document text NOT NULL, installment text NOT NULL, display_title text NOT NULL,
 identification_ambiguous boolean NOT NULL DEFAULT true,
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,identity_key),
 FOREIGN KEY(workspace_id,client_id) REFERENCES biosaude.clients(workspace_id,id)
);
CREATE TABLE biosaude.import_titles (
 workspace_id uuid NOT NULL, version_id text NOT NULL, title_id uuid NOT NULL,
 PRIMARY KEY(workspace_id,version_id,title_id),
 FOREIGN KEY(workspace_id,version_id) REFERENCES biosaude.import_versions(workspace_id,id),
 FOREIGN KEY(workspace_id,title_id) REFERENCES biosaude.financial_titles(workspace_id,id)
);
CREATE TABLE biosaude.financial_records (
 workspace_id uuid NOT NULL, version_id text NOT NULL, id text NOT NULL, title_id uuid NOT NULL,
 category text NOT NULL CHECK (category IN ('upcoming','overdue','received')),
 client_original_name text NOT NULL, representative text NOT NULL,
 source_sheet text NOT NULL, source_row integer NOT NULL CHECK (source_row>0),
 issued_on date, due_on date,
 -- Categoria define o significado: saldo aberto OU valor efetivamente recebido. Nunca o nominal.
 amount_cents bigint CHECK(amount_cents BETWEEN -9007199254740991 AND 9007199254740991),
 PRIMARY KEY(workspace_id,version_id,id), UNIQUE(workspace_id,version_id,id,category),
 FOREIGN KEY(workspace_id,version_id,title_id) REFERENCES biosaude.import_titles(workspace_id,version_id,title_id)
);
CREATE TABLE biosaude.receipt_entries (
 workspace_id uuid NOT NULL, version_id text NOT NULL, record_id text NOT NULL,
 category text NOT NULL DEFAULT 'received' CHECK(category='received'), received_on date,
 PRIMARY KEY(workspace_id,version_id,record_id),
 FOREIGN KEY(workspace_id,version_id,record_id,category) REFERENCES biosaude.financial_records(workspace_id,version_id,id,category)
);
CREATE TABLE biosaude.delinquency_positions (
 workspace_id uuid NOT NULL, version_id text NOT NULL, record_id text NOT NULL,
 category text NOT NULL DEFAULT 'overdue' CHECK(category='overdue'),
 PRIMARY KEY(workspace_id,version_id,record_id),
 FOREIGN KEY(workspace_id,version_id,record_id,category) REFERENCES biosaude.financial_records(workspace_id,version_id,id,category)
);
CREATE TABLE biosaude.credit_proposals (
 workspace_id uuid NOT NULL REFERENCES biosaude.workspaces(id), id text NOT NULL, version integer NOT NULL CHECK(version>0),
 created_at timestamptz NOT NULL, reason text NOT NULL, config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
 status text NOT NULL CHECK(status='draft'), actor_subject text NOT NULL CHECK(length(trim(actor_subject))>0),
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE biosaude.audit_issues (
 workspace_id uuid NOT NULL, version_id text NOT NULL, id text NOT NULL,
 severity text NOT NULL CHECK(severity IN ('warning','error')), code text NOT NULL, message text NOT NULL, record_ids jsonb NOT NULL CHECK(jsonb_typeof(record_ids)='array'),
 PRIMARY KEY(workspace_id,version_id,id), FOREIGN KEY(workspace_id,version_id) REFERENCES biosaude.import_versions(workspace_id,id)
);
CREATE TABLE biosaude.audit_events (
 workspace_id uuid NOT NULL REFERENCES biosaude.workspaces(id), id uuid NOT NULL DEFAULT gen_random_uuid(), version_id text,
 actor_subject text NOT NULL CHECK(length(trim(actor_subject))>0), action text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,version_id) REFERENCES biosaude.import_versions(workspace_id,id)
);
CREATE TABLE biosaude.audit_review_history (
 workspace_id uuid NOT NULL, version_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), issue_key text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('recorded','removed')), review jsonb,
 actor_subject text NOT NULL CHECK(length(trim(actor_subject))>0), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((operation='recorded' AND review IS NOT NULL AND jsonb_typeof(review)='object') OR (operation='removed' AND review IS NULL)),
 PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,version_id) REFERENCES biosaude.import_versions(workspace_id,id)
);
CREATE TABLE biosaude.collection_actions (
 workspace_id uuid NOT NULL, version_id text NOT NULL, title_id uuid NOT NULL, id text NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0), created_at timestamptz NOT NULL DEFAULT now(),
 stage text NOT NULL CHECK(stage IN ('Não iniciado','Cobrança administrativa','Aguardando retorno','Em negociação','Acordo formalizado','Acordo descumprido','Encaminhado ao jurídico','Judicializado','Recuperado','Encerrado por outro motivo')),
 responsible text NOT NULL, actor_subject text NOT NULL CHECK(length(trim(actor_subject))>0),
 contact_on date NOT NULL, action text NOT NULL, result text NOT NULL DEFAULT '', next_step text NOT NULL DEFAULT '', next_on date, notes text NOT NULL DEFAULT '',
 agreement_reference text, agreement_cents bigint CHECK(agreement_cents BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,version_id,title_id,sequence),
 FOREIGN KEY(workspace_id,version_id,title_id) REFERENCES biosaude.import_titles(workspace_id,version_id,title_id)
);
CREATE TABLE biosaude.legal_processes (
 workspace_id uuid NOT NULL REFERENCES biosaude.workspaces(id), id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,id)
);
CREATE TABLE biosaude.process_revisions (
 workspace_id uuid NOT NULL, process_id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 process_number text NOT NULL, interested_party text NOT NULL, opposing_party text NOT NULL,
 nature text NOT NULL CHECK(nature IN ('judicial','administrative')), action_type text NOT NULL, court text NOT NULL,
 claim_cents bigint CHECK(claim_cents BETWEEN 0 AND 9007199254740991), declared_status text NOT NULL,
 responsible text NOT NULL, next_step text NOT NULL, source text NOT NULL,
 actor_subject text NOT NULL CHECK(length(trim(actor_subject))>0), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,process_id,revision), FOREIGN KEY(workspace_id,process_id) REFERENCES biosaude.legal_processes(workspace_id,id)
);
CREATE TABLE biosaude.process_title_links (
 workspace_id uuid NOT NULL, process_id text NOT NULL, process_revision integer NOT NULL, version_id text NOT NULL, title_id uuid NOT NULL,
 confirmed_by text NOT NULL CHECK(length(trim(confirmed_by))>0), confirmed_at timestamptz NOT NULL,
 evidence text NOT NULL CHECK(length(trim(evidence))>0),
 PRIMARY KEY(workspace_id,process_id,process_revision,version_id,title_id),
 FOREIGN KEY(workspace_id,process_id,process_revision) REFERENCES biosaude.process_revisions(workspace_id,process_id,revision),
 FOREIGN KEY(workspace_id,version_id,title_id) REFERENCES biosaude.import_titles(workspace_id,version_id,title_id)
);
CREATE INDEX records_by_category ON biosaude.financial_records(workspace_id,version_id,category);
CREATE INDEX records_by_title ON biosaude.financial_records(workspace_id,title_id,version_id);
CREATE INDEX receipt_dates ON biosaude.receipt_entries(workspace_id,version_id,received_on);
CREATE INDEX version_history ON biosaude.dataset_state(workspace_id,updated_at DESC);
CREATE INDEX action_history ON biosaude.collection_actions(workspace_id,version_id,title_id,sequence DESC);
CREATE INDEX process_history ON biosaude.process_revisions(workspace_id,process_id,revision DESC);
CREATE INDEX audit_history ON biosaude.audit_events(workspace_id,version_id,created_at);
