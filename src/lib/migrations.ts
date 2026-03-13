import { readFileSync } from 'fs'
import { join } from 'path'
import type Database from 'better-sqlite3'

export type Migration = {
  id: string
  up: (db: Database.Database) => void
}

// Plugin hook: extensions can register additional migrations without modifying this file.
const extraMigrations: Migration[] = []
export function registerMigrations(newMigrations: Migration[]): void {
  extraMigrations.push(...newMigrations)
}

const migrations: Migration[] = [
  {
    id: '001_init',
    up: (db) => {
      const schemaPath = join(process.cwd(), 'src', 'lib', 'schema.sql')
      const schema = readFileSync(schemaPath, 'utf8')
      const statements = schema.split(';').filter((stmt) => stmt.trim())
      db.transaction(() => {
        for (const statement of statements) {
          db.exec(statement.trim())
        }
      })()
    }
  },
  {
    id: '002_quality_reviews',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS quality_reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          reviewer TEXT NOT NULL,
          status TEXT NOT NULL,
          notes TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_quality_reviews_task_id ON quality_reviews(task_id);
        CREATE INDEX IF NOT EXISTS idx_quality_reviews_reviewer ON quality_reviews(reviewer);
      `)
    }
  },
  {
    id: '003_quality_review_status_backfill',
    up: (db) => {
      // Convert existing review tasks to quality_review to enforce the gate
      db.exec(`
        UPDATE tasks
        SET status = 'quality_review'
        WHERE status = 'review';
      `)
    }
  },
  {
    id: '004_messages',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id TEXT NOT NULL,
          from_agent TEXT NOT NULL,
          to_agent TEXT,
          content TEXT NOT NULL,
          message_type TEXT DEFAULT 'text',
          metadata TEXT,
          read_at INTEGER,
          created_at INTEGER DEFAULT (unixepoch())
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_agents ON messages(from_agent, to_agent)
      `)
    }
  },
  {
    id: '005_users',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'operator',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          last_login_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          ip_address TEXT,
          user_agent TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
      `)
    }
  },
  {
    id: '006_workflow_templates',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          model TEXT NOT NULL DEFAULT 'sonnet',
          task_prompt TEXT NOT NULL,
          timeout_seconds INTEGER NOT NULL DEFAULT 300,
          agent_role TEXT,
          tags TEXT,
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          last_used_at INTEGER,
          use_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_workflow_templates_name ON workflow_templates(name);
        CREATE INDEX IF NOT EXISTS idx_workflow_templates_created_by ON workflow_templates(created_by);
      `)
    }
  },
  {
    id: '007_audit_log',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          actor TEXT NOT NULL,
          actor_id INTEGER,
          target_type TEXT,
          target_id INTEGER,
          detail TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
        CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
        CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
      `)
    }
  },
  {
    id: '008_webhooks',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS webhooks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          secret TEXT,
          events TEXT NOT NULL DEFAULT '["*"]',
          enabled INTEGER NOT NULL DEFAULT 1,
          last_fired_at INTEGER,
          last_status INTEGER,
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          webhook_id INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          status_code INTEGER,
          response_body TEXT,
          error TEXT,
          duration_ms INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
        CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
      `)
    }
  },
  {
    id: '009_pipelines',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_pipelines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          steps TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          use_count INTEGER NOT NULL DEFAULT 0,
          last_used_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS pipeline_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pipeline_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          current_step INTEGER NOT NULL DEFAULT 0,
          steps_snapshot TEXT NOT NULL DEFAULT '[]',
          started_at INTEGER,
          completed_at INTEGER,
          triggered_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (pipeline_id) REFERENCES workflow_pipelines(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline_id ON pipeline_runs(pipeline_id);
        CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
        CREATE INDEX IF NOT EXISTS idx_workflow_pipelines_name ON workflow_pipelines(name);
      `)
    }
  },
  {
    id: '010_settings',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL DEFAULT 'general',
          updated_by TEXT,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
      `)
    }
  },
  {
    id: '011_alert_rules',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS alert_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          entity_type TEXT NOT NULL,
          condition_field TEXT NOT NULL,
          condition_operator TEXT NOT NULL,
          condition_value TEXT NOT NULL,
          action_type TEXT NOT NULL DEFAULT 'notification',
          action_config TEXT NOT NULL DEFAULT '{}',
          cooldown_minutes INTEGER NOT NULL DEFAULT 60,
          last_triggered_at INTEGER,
          trigger_count INTEGER NOT NULL DEFAULT 0,
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);
        CREATE INDEX IF NOT EXISTS idx_alert_rules_entity_type ON alert_rules(entity_type);
      `)
    }
  },
  {
    id: '012_super_admin_tenants',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tenants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          linux_user TEXT NOT NULL UNIQUE,
          plan_tier TEXT NOT NULL DEFAULT 'standard',
          status TEXT NOT NULL DEFAULT 'pending',
          openclaw_home TEXT NOT NULL,
          workspace_root TEXT NOT NULL,
          gateway_port INTEGER,
          dashboard_port INTEGER,
          config TEXT NOT NULL DEFAULT '{}',
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS provision_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          job_type TEXT NOT NULL DEFAULT 'bootstrap',
          status TEXT NOT NULL DEFAULT 'queued',
          dry_run INTEGER NOT NULL DEFAULT 1,
          requested_by TEXT NOT NULL DEFAULT 'system',
          approved_by TEXT,
          runner_host TEXT,
          idempotency_key TEXT,
          request_json TEXT NOT NULL DEFAULT '{}',
          plan_json TEXT NOT NULL DEFAULT '[]',
          result_json TEXT,
          error_text TEXT,
          started_at INTEGER,
          completed_at INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS provision_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id INTEGER NOT NULL,
          level TEXT NOT NULL DEFAULT 'info',
          step_key TEXT,
          message TEXT NOT NULL,
          data TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (job_id) REFERENCES provision_jobs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
        CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
        CREATE INDEX IF NOT EXISTS idx_provision_jobs_tenant_id ON provision_jobs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_provision_jobs_status ON provision_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_provision_jobs_created_at ON provision_jobs(created_at);
        CREATE INDEX IF NOT EXISTS idx_provision_events_job_id ON provision_events(job_id);
        CREATE INDEX IF NOT EXISTS idx_provision_events_created_at ON provision_events(created_at);
      `)
    }
  },
  {
    id: '013_tenant_owner_gateway',
    up: (db) => {
      // Check if tenants table exists (may not on fresh installs without super-admin)
      const hasTenants = (db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'`
      ).get() as any)
      if (!hasTenants) return

      const columns = db.prepare(`PRAGMA table_info(tenants)`).all() as Array<{ name: string }>
      const hasOwnerGateway = columns.some((c) => c.name === 'owner_gateway')
      if (!hasOwnerGateway) {
        db.exec(`ALTER TABLE tenants ADD COLUMN owner_gateway TEXT`)
      }

      const defaultGatewayName =
        String(process.env.MC_DEFAULT_OWNER_GATEWAY || process.env.MC_DEFAULT_GATEWAY_NAME || 'primary').trim() ||
        'primary'

      // Check if gateways table exists (created lazily by gateways API, not in migrations)
      const hasGateways = (db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='gateways'`
      ).get() as any)

      if (hasGateways) {
        db.prepare(`
          UPDATE tenants
          SET owner_gateway = COALESCE(
            (SELECT name FROM gateways ORDER BY is_primary DESC, id ASC LIMIT 1),
            ?
          )
          WHERE owner_gateway IS NULL OR trim(owner_gateway) = ''
        `).run(defaultGatewayName)
      } else {
        db.prepare(`
          UPDATE tenants
          SET owner_gateway = ?
          WHERE owner_gateway IS NULL OR trim(owner_gateway) = ''
        `).run(defaultGatewayName)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_tenants_owner_gateway ON tenants(owner_gateway)`)
    }
  },
  {
    id: '014_auth_google_approvals',
    up: (db) => {
      const userCols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>
      const has = (name: string) => userCols.some((c) => c.name === name)

      if (!has('provider')) db.exec(`ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'local'`)
      if (!has('provider_user_id')) db.exec(`ALTER TABLE users ADD COLUMN provider_user_id TEXT`)
      if (!has('email')) db.exec(`ALTER TABLE users ADD COLUMN email TEXT`)
      if (!has('avatar_url')) db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`)
      if (!has('is_approved')) db.exec(`ALTER TABLE users ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 1`)
      if (!has('approved_by')) db.exec(`ALTER TABLE users ADD COLUMN approved_by TEXT`)
      if (!has('approved_at')) db.exec(`ALTER TABLE users ADD COLUMN approved_at INTEGER`)

      db.exec(`
        UPDATE users
        SET provider = COALESCE(NULLIF(provider, ''), 'local'),
            is_approved = COALESCE(is_approved, 1)
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS access_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL DEFAULT 'google',
          email TEXT NOT NULL,
          provider_user_id TEXT,
          display_name TEXT,
          avatar_url TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
          last_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
          attempt_count INTEGER NOT NULL DEFAULT 1,
          reviewed_by TEXT,
          reviewed_at INTEGER,
          review_note TEXT,
          approved_user_id INTEGER,
          FOREIGN KEY (approved_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `)

      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_email_provider ON access_requests(email, provider)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`)
    }
  },
  {
    id: '015_missing_indexes',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
        CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications(recipient, read_at);
        CREATE INDEX IF NOT EXISTS idx_activities_actor ON activities(actor);
        CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at);
      `)
    }
  },
  {
    id: '016_direct_connections',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS direct_connections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          tool_name TEXT NOT NULL,
          tool_version TEXT,
          connection_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'connected',
          last_heartbeat INTEGER,
          metadata TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_direct_connections_agent_id ON direct_connections(agent_id);
        CREATE INDEX IF NOT EXISTS idx_direct_connections_connection_id ON direct_connections(connection_id);
        CREATE INDEX IF NOT EXISTS idx_direct_connections_status ON direct_connections(status);
      `)
    }
  },
  {
    id: '017_github_sync',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS github_syncs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo TEXT NOT NULL,
          last_synced_at INTEGER NOT NULL DEFAULT (unixepoch()),
          issue_count INTEGER NOT NULL DEFAULT 0,
          sync_direction TEXT NOT NULL DEFAULT 'inbound',
          status TEXT NOT NULL DEFAULT 'success',
          error TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_github_syncs_repo ON github_syncs(repo);
        CREATE INDEX IF NOT EXISTS idx_github_syncs_created_at ON github_syncs(created_at);
      `)
    }
  },
  {
    id: '018_token_usage',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS token_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model TEXT NOT NULL,
          session_id TEXT NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_token_usage_session_id ON token_usage(session_id);
        CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);
        CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
      `)
    }
  },
  {
    id: '019_webhook_retry',
    up: (db) => {
      // Add retry columns to webhook_deliveries
      const deliveryCols = db.prepare(`PRAGMA table_info(webhook_deliveries)`).all() as Array<{ name: string }>
      const hasCol = (name: string) => deliveryCols.some((c) => c.name === name)

      if (!hasCol('attempt')) db.exec(`ALTER TABLE webhook_deliveries ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0`)
      if (!hasCol('next_retry_at')) db.exec(`ALTER TABLE webhook_deliveries ADD COLUMN next_retry_at INTEGER`)
      if (!hasCol('is_retry')) db.exec(`ALTER TABLE webhook_deliveries ADD COLUMN is_retry INTEGER NOT NULL DEFAULT 0`)
      if (!hasCol('parent_delivery_id')) db.exec(`ALTER TABLE webhook_deliveries ADD COLUMN parent_delivery_id INTEGER`)

      // Add circuit breaker column to webhooks
      const webhookCols = db.prepare(`PRAGMA table_info(webhooks)`).all() as Array<{ name: string }>
      if (!webhookCols.some((c) => c.name === 'consecutive_failures')) {
        db.exec(`ALTER TABLE webhooks ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0`)
      }

      // Partial index for retry queue processing
      db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE next_retry_at IS NOT NULL`)
    }
  },
  {
    id: '020_claude_sessions',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS claude_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL UNIQUE,
          project_slug TEXT NOT NULL,
          project_path TEXT,
          model TEXT,
          git_branch TEXT,
          user_messages INTEGER NOT NULL DEFAULT 0,
          assistant_messages INTEGER NOT NULL DEFAULT 0,
          tool_uses INTEGER NOT NULL DEFAULT 0,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          estimated_cost REAL NOT NULL DEFAULT 0,
          first_message_at TEXT,
          last_message_at TEXT,
          last_user_prompt TEXT,
          is_active INTEGER NOT NULL DEFAULT 0,
          scanned_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_claude_sessions_active ON claude_sessions(is_active) WHERE is_active = 1`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_claude_sessions_project ON claude_sessions(project_slug)`)
    }
  },
  {
    id: '021_workspace_isolation_phase1',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `)

      db.prepare(`
        INSERT OR IGNORE INTO workspaces (id, slug, name, created_at, updated_at)
        VALUES (1, 'default', 'Default Workspace', unixepoch(), unixepoch())
      `).run()

      const addWorkspaceIdColumn = (table: string) => {
        const tableExists = db
          .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .get(table) as { ok?: number } | undefined
        if (!tableExists?.ok) return

        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        if (!cols.some((c) => c.name === 'workspace_id')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1`)
        }
        db.exec(`UPDATE ${table} SET workspace_id = COALESCE(workspace_id, 1)`)
      }

      const scopedTables = [
        'users',
        'user_sessions',
        'tasks',
        'agents',
        'comments',
        'activities',
        'notifications',
        'quality_reviews',
        'standup_reports',
      ]

      for (const table of scopedTables) {
        addWorkspaceIdColumn(table)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_workspace_id ON users(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_user_sessions_workspace_id ON user_sessions(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_workspace_id ON agents(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_workspace_id ON comments(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_workspace_id ON activities(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON notifications(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_quality_reviews_workspace_id ON quality_reviews(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_standup_reports_workspace_id ON standup_reports(workspace_id)`)
    }
  },
  {
    id: '022_workspace_isolation_phase2',
    up: (db) => {
      const addWorkspaceIdColumn = (table: string) => {
        const tableExists = db
          .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .get(table) as { ok?: number } | undefined
        if (!tableExists?.ok) return

        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        if (!cols.some((c) => c.name === 'workspace_id')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1`)
        }
        db.exec(`UPDATE ${table} SET workspace_id = COALESCE(workspace_id, 1)`)
      }

      const scopedTables = [
        'messages',
        'alert_rules',
        'direct_connections',
        'github_syncs',
        'workflow_pipelines',
        'pipeline_runs',
      ]

      for (const table of scopedTables) {
        addWorkspaceIdColumn(table)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_workspace_id ON messages(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_alert_rules_workspace_id ON alert_rules(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_direct_connections_workspace_id ON direct_connections(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_github_syncs_workspace_id ON github_syncs(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_pipelines_workspace_id ON workflow_pipelines(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_pipeline_runs_workspace_id ON pipeline_runs(workspace_id)`)
    }
  },
  {
    id: '023_workspace_isolation_phase3',
    up: (db) => {
      const addWorkspaceIdColumn = (table: string) => {
        const tableExists = db
          .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .get(table) as { ok?: number } | undefined
        if (!tableExists?.ok) return

        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        if (!cols.some((c) => c.name === 'workspace_id')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1`)
        }
        db.exec(`UPDATE ${table} SET workspace_id = COALESCE(workspace_id, 1)`)
      }

      const scopedTables = [
        'workflow_templates',
        'webhooks',
        'webhook_deliveries',
        'token_usage',
      ]

      for (const table of scopedTables) {
        addWorkspaceIdColumn(table)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace_id ON workflow_templates(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_webhooks_workspace_id ON webhooks(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_workspace_id ON webhook_deliveries(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_workspace_id ON token_usage(workspace_id)`)
    }
  },
  {
    id: '024_projects_support',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          description TEXT,
          ticket_prefix TEXT NOT NULL,
          ticket_counter INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(workspace_id, slug),
          UNIQUE(workspace_id, ticket_prefix)
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_workspace_status ON projects(workspace_id, status)`)

      const taskCols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>
      if (!taskCols.some((c) => c.name === 'project_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN project_id INTEGER`)
      }
      if (!taskCols.some((c) => c.name === 'project_ticket_no')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN project_ticket_no INTEGER`)
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_project ON tasks(workspace_id, project_id)`)

      const workspaceRows = db.prepare(`SELECT id FROM workspaces ORDER BY id ASC`).all() as Array<{ id: number }>
      const ensureDefaultProject = db.prepare(`
        INSERT OR IGNORE INTO projects (workspace_id, name, slug, description, ticket_prefix, ticket_counter, status, created_at, updated_at)
        VALUES (?, 'General', 'general', 'Default project for uncategorized tasks', 'TASK', 0, 'active', unixepoch(), unixepoch())
      `)
      const getDefaultProject = db.prepare(`
        SELECT id, ticket_counter FROM projects
        WHERE workspace_id = ? AND slug = 'general'
        LIMIT 1
      `)
      const setTaskProject = db.prepare(`
        UPDATE tasks SET project_id = ?
        WHERE workspace_id = ? AND (project_id IS NULL OR project_id = 0)
      `)
      const listProjectTasks = db.prepare(`
        SELECT id FROM tasks
        WHERE workspace_id = ? AND project_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      const setTaskNo = db.prepare(`UPDATE tasks SET project_ticket_no = ? WHERE id = ?`)
      const setProjectCounter = db.prepare(`UPDATE projects SET ticket_counter = ?, updated_at = unixepoch() WHERE id = ?`)

      for (const workspace of workspaceRows) {
        ensureDefaultProject.run(workspace.id)
        const defaultProject = getDefaultProject.get(workspace.id) as { id: number; ticket_counter: number } | undefined
        if (!defaultProject) continue

        setTaskProject.run(defaultProject.id, workspace.id)

        const projectRows = db.prepare(`
          SELECT id FROM projects
          WHERE workspace_id = ?
          ORDER BY id ASC
        `).all(workspace.id) as Array<{ id: number }>

        for (const project of projectRows) {
          const tasks = listProjectTasks.all(workspace.id, project.id) as Array<{ id: number }>
          let counter = 0
          for (const task of tasks) {
            counter += 1
            setTaskNo.run(counter, task.id)
          }
          setProjectCounter.run(counter, project.id)
        }
      }
    }
  },
  {
    id: '025_token_usage_task_attribution',
    up: (db) => {
      const hasTokenUsageTable = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'`)
        .get() as { ok?: number } | undefined

      if (!hasTokenUsageTable?.ok) return

      const cols = db.prepare(`PRAGMA table_info(token_usage)`).all() as Array<{ name: string }>
      const hasCol = (name: string) => cols.some((c) => c.name === name)

      if (!hasCol('task_id')) {
        db.exec(`ALTER TABLE token_usage ADD COLUMN task_id INTEGER`)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_task_id ON token_usage(task_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_workspace_task_time ON token_usage(workspace_id, task_id, created_at)`)
    }
  },
  {
    id: '026_task_outcome_tracking',
    up: (db) => {
      const hasTasks = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'tasks'`)
        .get() as { ok?: number } | undefined
      if (!hasTasks?.ok) return

      const taskCols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>
      const hasCol = (name: string) => taskCols.some((c) => c.name === name)

      if (!hasCol('outcome')) db.exec(`ALTER TABLE tasks ADD COLUMN outcome TEXT`)
      if (!hasCol('error_message')) db.exec(`ALTER TABLE tasks ADD COLUMN error_message TEXT`)
      if (!hasCol('resolution')) db.exec(`ALTER TABLE tasks ADD COLUMN resolution TEXT`)
      if (!hasCol('feedback_rating')) db.exec(`ALTER TABLE tasks ADD COLUMN feedback_rating INTEGER`)
      if (!hasCol('feedback_notes')) db.exec(`ALTER TABLE tasks ADD COLUMN feedback_notes TEXT`)
      if (!hasCol('retry_count')) db.exec(`ALTER TABLE tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`)
      if (!hasCol('completed_at')) db.exec(`ALTER TABLE tasks ADD COLUMN completed_at INTEGER`)

      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_outcome ON tasks(outcome)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_outcome ON tasks(workspace_id, outcome, completed_at)`)
    }
  },
  {
    id: '027_enhanced_projects',
    up: (db) => {
      const hasProjects = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'projects'`)
        .get() as { ok?: number } | undefined
      if (!hasProjects?.ok) return

      const cols = db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>
      const hasCol = (name: string) => cols.some((c) => c.name === name)

      if (!hasCol('github_repo')) db.exec(`ALTER TABLE projects ADD COLUMN github_repo TEXT`)
      if (!hasCol('deadline')) db.exec(`ALTER TABLE projects ADD COLUMN deadline INTEGER`)
      if (!hasCol('color')) db.exec(`ALTER TABLE projects ADD COLUMN color TEXT`)
      if (!hasCol('metadata')) db.exec(`ALTER TABLE projects ADD COLUMN metadata TEXT`)

      db.exec(`
        CREATE TABLE IF NOT EXISTS project_agent_assignments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          agent_name TEXT NOT NULL,
          role TEXT DEFAULT 'member',
          assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          UNIQUE(project_id, agent_name)
        );
        CREATE INDEX IF NOT EXISTS idx_paa_project ON project_agent_assignments(project_id);
        CREATE INDEX IF NOT EXISTS idx_paa_agent ON project_agent_assignments(agent_name);
      `)
    }
  },
  {
    id: '028_github_sync_v2',
    up: (db) => {
      // Tasks: promote GitHub fields from metadata JSON to proper columns
      const taskCols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>
      const hasTaskCol = (name: string) => taskCols.some((c) => c.name === name)

      if (!hasTaskCol('github_issue_number')) db.exec(`ALTER TABLE tasks ADD COLUMN github_issue_number INTEGER`)
      if (!hasTaskCol('github_repo')) db.exec(`ALTER TABLE tasks ADD COLUMN github_repo TEXT`)
      if (!hasTaskCol('github_synced_at')) db.exec(`ALTER TABLE tasks ADD COLUMN github_synced_at INTEGER`)
      if (!hasTaskCol('github_branch')) db.exec(`ALTER TABLE tasks ADD COLUMN github_branch TEXT`)
      if (!hasTaskCol('github_pr_number')) db.exec(`ALTER TABLE tasks ADD COLUMN github_pr_number INTEGER`)
      if (!hasTaskCol('github_pr_state')) db.exec(`ALTER TABLE tasks ADD COLUMN github_pr_state TEXT`)

      // Unique index for dedup (partial — only rows with issue numbers)
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_github_issue
          ON tasks(workspace_id, github_repo, github_issue_number)
          WHERE github_issue_number IS NOT NULL
      `)

      // Projects: sync control columns
      const projCols = db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>
      const hasProjCol = (name: string) => projCols.some((c) => c.name === name)

      if (!hasProjCol('github_sync_enabled')) db.exec(`ALTER TABLE projects ADD COLUMN github_sync_enabled INTEGER NOT NULL DEFAULT 0`)
      if (!hasProjCol('github_labels_initialized')) db.exec(`ALTER TABLE projects ADD COLUMN github_labels_initialized INTEGER NOT NULL DEFAULT 0`)
      if (!hasProjCol('github_default_branch')) db.exec(`ALTER TABLE projects ADD COLUMN github_default_branch TEXT DEFAULT 'main'`)

      // Enhanced sync history columns
      const syncCols = db.prepare(`PRAGMA table_info(github_syncs)`).all() as Array<{ name: string }>
      const hasSyncCol = (name: string) => syncCols.some((c) => c.name === name)

      if (!hasSyncCol('project_id')) db.exec(`ALTER TABLE github_syncs ADD COLUMN project_id INTEGER`)
      if (!hasSyncCol('changes_pushed')) db.exec(`ALTER TABLE github_syncs ADD COLUMN changes_pushed INTEGER NOT NULL DEFAULT 0`)
      if (!hasSyncCol('changes_pulled')) db.exec(`ALTER TABLE github_syncs ADD COLUMN changes_pulled INTEGER NOT NULL DEFAULT 0`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_github_syncs_project ON github_syncs(project_id)`)

      // Data migration: copy existing metadata JSON values into new columns
      db.exec(`
        UPDATE tasks
        SET github_repo = json_extract(metadata, '$.github_repo'),
            github_issue_number = json_extract(metadata, '$.github_issue_number'),
            github_synced_at = CAST(strftime('%s', json_extract(metadata, '$.github_synced_at')) AS INTEGER)
        WHERE json_extract(metadata, '$.github_repo') IS NOT NULL
          AND github_repo IS NULL
      `)
    }
  },
  {
    id: '029_link_workspaces_to_tenants',
    up: (db) => {
      const hasWorkspaces = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'`)
        .get() as { ok?: number } | undefined
      if (!hasWorkspaces?.ok) return

      const hasTenants = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'tenants'`)
        .get() as { ok?: number } | undefined
      if (!hasTenants?.ok) return

      const workspaceCols = db.prepare(`PRAGMA table_info(workspaces)`).all() as Array<{ name: string }>
      const hasWorkspaceTenantId = workspaceCols.some((c) => c.name === 'tenant_id')
      if (!hasWorkspaceTenantId) {
        db.exec(`ALTER TABLE workspaces ADD COLUMN tenant_id INTEGER`)
      }

      const tenantCount = (db.prepare(`SELECT COUNT(*) as c FROM tenants`).get() as { c: number } | undefined)?.c || 0
      let defaultTenantId: number
      if (tenantCount > 0) {
        const existing = db.prepare(`
          SELECT id
          FROM tenants
          ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC
          LIMIT 1
        `).get() as { id: number } | undefined
        if (!existing?.id) throw new Error('Failed to resolve default tenant')
        defaultTenantId = existing.id
      } else {
        const rawHost = String(process.env.MC_HOSTNAME || 'default').trim().toLowerCase()
        const slug = rawHost.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'default'
        const linuxUser = (String(process.env.USER || 'local').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'local').slice(0, 30)
        const home = String(process.env.HOME || '/tmp').trim() || '/tmp'
        const insert = db.prepare(`
          INSERT INTO tenants (slug, display_name, linux_user, plan_tier, status, openclaw_home, workspace_root, config, created_by, owner_gateway)
          VALUES (?, ?, ?, 'standard', 'active', ?, ?, '{}', 'system', ?)
        `).run(
          slug,
          'Local Owner',
          linuxUser,
          `${home}/.openclaw`,
          `${home}/workspace`,
          process.env.MC_DEFAULT_OWNER_GATEWAY || process.env.MC_DEFAULT_GATEWAY_NAME || 'primary'
        )
        defaultTenantId = Number(insert.lastInsertRowid)
      }

      db.prepare(`UPDATE workspaces SET tenant_id = ? WHERE tenant_id IS NULL`).run(defaultTenantId)

      // Ensure session rows can carry tenant context derived from workspace.
      const sessionCols = db.prepare(`PRAGMA table_info(user_sessions)`).all() as Array<{ name: string }>
      if (!sessionCols.some((c) => c.name === 'tenant_id')) {
        db.exec(`ALTER TABLE user_sessions ADD COLUMN tenant_id INTEGER`)
      }
      db.exec(`
        UPDATE user_sessions
        SET tenant_id = (
          SELECT w.tenant_id
          FROM users u
          JOIN workspaces w ON w.id = COALESCE(user_sessions.workspace_id, u.workspace_id, 1)
          WHERE u.id = user_sessions.user_id
          LIMIT 1
        )
        WHERE tenant_id IS NULL
      `)
      db.prepare(`UPDATE user_sessions SET tenant_id = ? WHERE tenant_id IS NULL`).run(defaultTenantId)

      const workspaceFk = db.prepare(`PRAGMA foreign_key_list(workspaces)`).all() as Array<{ table: string; from: string; to: string }>
      const hasTenantFk = workspaceFk.some((fk) => fk.table === 'tenants' && fk.from === 'tenant_id' && fk.to === 'id')
      const tenantCol = (db.prepare(`PRAGMA table_info(workspaces)`).all() as Array<{ name: string; notnull: number }>).find((c) => c.name === 'tenant_id')
      const tenantColNotNull = tenantCol?.notnull === 1

      if (!hasTenantFk || !tenantColNotNull) {
        db.exec(`ALTER TABLE workspaces RENAME TO workspaces__legacy`)
        db.exec(`
          CREATE TABLE workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            tenant_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
          )
        `)
        db.prepare(`
          INSERT INTO workspaces (id, slug, name, tenant_id, created_at, updated_at)
          SELECT id, slug, name, COALESCE(tenant_id, ?), created_at, updated_at
          FROM workspaces__legacy
        `).run(defaultTenantId)
        db.exec(`DROP TABLE workspaces__legacy`)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_id ON workspaces(tenant_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON user_sessions(tenant_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_user_sessions_workspace_tenant ON user_sessions(workspace_id, tenant_id)`)
    }
  },
  {
    id: '032_adapter_configs',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS adapter_configs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL,
          framework TEXT NOT NULL,
          config TEXT DEFAULT '{}',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `)
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_adapter_configs_workspace_framework ON adapter_configs(workspace_id, framework)`)
    }
  },
  {
    id: '033_skills',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS skills (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          source TEXT NOT NULL,
          path TEXT NOT NULL,
          description TEXT,
          content_hash TEXT,
          registry_slug TEXT,
          registry_version TEXT,
          security_status TEXT DEFAULT 'unchecked',
          installed_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(source, name)
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_registry_slug ON skills(registry_slug)`)
    }
  },
  {
    id: '034_agents_source',
    up(db: Database.Database) {
      const cols = db.prepare(`PRAGMA table_info(agents)`).all() as Array<{ name: string }>
      if (!cols.some(c => c.name === 'source')) {
        db.exec(`ALTER TABLE agents ADD COLUMN source TEXT DEFAULT 'manual'`)
      }
      if (!cols.some(c => c.name === 'content_hash')) {
        db.exec(`ALTER TABLE agents ADD COLUMN content_hash TEXT`)
      }
      if (!cols.some(c => c.name === 'workspace_path')) {
        db.exec(`ALTER TABLE agents ADD COLUMN workspace_path TEXT`)
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_source ON agents(source)`)
    }
  },
  {
    id: '035_api_keys_v2',
    up(db: Database.Database) {
      // Previous migrations (027/030) may have created an api_keys table with a different schema.
      // Drop and recreate with the full user-scoped schema.
      const existing = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'api_keys'`)
        .get() as { ok?: number } | undefined

      if (existing?.ok) {
        db.exec(`DROP TABLE api_keys`)
      }

      db.exec(`
        CREATE TABLE api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          label TEXT NOT NULL,
          key_prefix TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL DEFAULT 'viewer',
          scopes TEXT,
          expires_at INTEGER,
          last_used_at INTEGER,
          last_used_ip TEXT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          tenant_id INTEGER NOT NULL DEFAULT 1,
          is_revoked INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_id ON api_keys(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)`)
    }
  },
  {
    id: '036_recurring_tasks_index',
    up(db: Database.Database) {
      // Index to efficiently find recurring task templates
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_recurring
        ON tasks(workspace_id)
        WHERE json_extract(metadata, '$.recurrence.enabled') = 1
      `)
    }
  },
  {
    id: '037_security_audit',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS security_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'info',
          source TEXT,
          agent_name TEXT,
          detail TEXT,
          ip_address TEXT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          tenant_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_agent_name ON security_events(agent_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_workspace_id ON security_events(workspace_id)`)

      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_trust_scores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT NOT NULL,
          trust_score REAL NOT NULL DEFAULT 1.0,
          auth_failures INTEGER NOT NULL DEFAULT 0,
          injection_attempts INTEGER NOT NULL DEFAULT 0,
          rate_limit_hits INTEGER NOT NULL DEFAULT 0,
          secret_exposures INTEGER NOT NULL DEFAULT 0,
          successful_tasks INTEGER NOT NULL DEFAULT 0,
          failed_tasks INTEGER NOT NULL DEFAULT 0,
          last_anomaly_at INTEGER,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(agent_name, workspace_id)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_call_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT,
          mcp_server TEXT,
          tool_name TEXT,
          success INTEGER NOT NULL DEFAULT 1,
          duration_ms INTEGER,
          error TEXT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_call_log_agent_name ON mcp_call_log(agent_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_call_log_created_at ON mcp_call_log(created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_call_log_tool_name ON mcp_call_log(tool_name)`)
    }
  },
  {
    id: '038_agent_evals',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS eval_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT NOT NULL,
          eval_layer TEXT NOT NULL,
          score REAL,
          passed INTEGER,
          detail TEXT,
          golden_dataset_id INTEGER,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_runs_agent_name ON eval_runs(agent_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_runs_eval_layer ON eval_runs(eval_layer)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_runs_created_at ON eval_runs(created_at)`)

      db.exec(`
        CREATE TABLE IF NOT EXISTS eval_golden_sets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          entries TEXT NOT NULL DEFAULT '[]',
          created_by TEXT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(name, workspace_id)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS eval_traces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT NOT NULL,
          task_id INTEGER,
          trace TEXT NOT NULL DEFAULT '[]',
          convergence_score REAL,
          total_steps INTEGER,
          optimal_steps INTEGER,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_traces_agent_name ON eval_traces(agent_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_traces_task_id ON eval_traces(task_id)`)
    }
  },
  {
    id: '039_session_costs',
    up(db: Database.Database) {
      const columns = db.prepare(`PRAGMA table_info(token_usage)`).all() as Array<{ name: string }>
      const existing = new Set(columns.map((c) => c.name))

      if (!existing.has('cost_usd')) {
        db.exec(`ALTER TABLE token_usage ADD COLUMN cost_usd REAL`)
      }
      if (!existing.has('agent_name')) {
        db.exec(`ALTER TABLE token_usage ADD COLUMN agent_name TEXT`)
      }
      if (!existing.has('task_id')) {
        db.exec(`ALTER TABLE token_usage ADD COLUMN task_id INTEGER`)
      }
    }
  },
  {
    id: '040_agent_api_keys',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id INTEGER NOT NULL,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          name TEXT NOT NULL,
          key_hash TEXT NOT NULL,
          key_prefix TEXT NOT NULL,
          scopes TEXT NOT NULL DEFAULT '[]',
          expires_at INTEGER,
          revoked_at INTEGER,
          last_used_at INTEGER,
          created_by TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(workspace_id, key_hash)
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_agent_id ON agent_api_keys(agent_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_workspace_id ON agent_api_keys(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_expires_at ON agent_api_keys(expires_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_revoked_at ON agent_api_keys(revoked_at)`)
    }
  },
  {
    id: '041_gateway_health_logs',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS gateway_health_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          gateway_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          latency INTEGER,
          probed_at INTEGER NOT NULL DEFAULT (unixepoch()),
          error TEXT
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_gateway_health_logs_gateway_id ON gateway_health_logs(gateway_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_gateway_health_logs_probed_at ON gateway_health_logs(probed_at)`)
    }
  },
  {
    id: '042_workstreams',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workstreams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'scope',
          assignee_id TEXT,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'not_started',
          color TEXT,
          frd_path TEXT,
          frd_content TEXT,
          frd_synced_at TEXT,
          progress REAL DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          deep_work_completed INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS workstream_tasks (
          id TEXT PRIMARY KEY,
          workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'todo',
          assignee_id TEXT,
          due_date TEXT,
          clickup_task_id TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS workstream_meetings (
          id TEXT PRIMARY KEY,
          workstream_id TEXT REFERENCES workstreams(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          attendees TEXT,
          meet_link TEXT,
          gcal_event_id TEXT UNIQUE,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)

      db.exec(`CREATE INDEX IF NOT EXISTS idx_workstream_tasks_ws ON workstream_tasks(workstream_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workstream_meetings_ws ON workstream_meetings(workstream_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workstream_meetings_gcal ON workstream_meetings(gcal_event_id)`)

      // Seed with real Tryps workstreams
      const now = new Date().toISOString()

      // -- Phases --
      const phases = [
        { id: 'p1-core', name: 'P1: Core App', start: '2026-03-09', end: '2026-03-21', color: '#D9071C', status: 'in_progress', progress: 0.65, order: 0 },
        { id: 'p2-payments', name: 'P2: Stripe + Linq', start: '2026-03-22', end: '2026-03-30', color: '#e53e3e', status: 'not_started', progress: 0, order: 1 },
        { id: 'p3-agents', name: 'P3: Agent Layer', start: '2026-03-30', end: '2026-04-02', color: '#c53030', status: 'not_started', progress: 0, order: 2 },
      ]

      // -- Scopes --
      const scopes = [
        { id: 'auth-system', name: 'Auth & Onboarding', start: '2026-03-09', end: '2026-03-15', color: '#2563eb', status: 'in_progress', progress: 0.8, order: 10, assignee: 'asif' },
        { id: 'expense-tracking', name: 'Expense Tracking', start: '2026-03-12', end: '2026-03-20', color: '#059669', status: 'in_progress', progress: 0.35, order: 11, assignee: 'nadeem' },
        { id: 'invite-flow', name: 'Invite Flow', start: '2026-03-10', end: '2026-03-16', color: '#7c3aed', status: 'in_progress', progress: 0.5, order: 12, assignee: 'asif' },
        { id: 'trip-detail', name: 'Trip Detail Tabs', start: '2026-03-14', end: '2026-03-22', color: '#d97706', status: 'not_started', progress: 0, order: 13, assignee: 'nadeem' },
        { id: 'notifications', name: 'Notifications', start: '2026-03-18', end: '2026-03-25', color: '#0891b2', status: 'not_started', progress: 0, order: 14, assignee: 'muneeb' },
        { id: 'explore-globe', name: 'Explore & Globe Hub', start: '2026-03-20', end: '2026-03-28', color: '#4f46e5', status: 'not_started', progress: 0, order: 15 },
        { id: 'design-system', name: 'Design System', start: '2026-03-09', end: '2026-03-30', color: '#c026d3', status: 'in_progress', progress: 0.2, order: 16, assignee: 'krisna' },
        { id: 'qa-testing', name: 'QA & Testing', start: '2026-03-15', end: '2026-04-02', color: '#65a30d', status: 'not_started', progress: 0, order: 17, assignee: 'andreas' },
      ]

      const insertWs = db.prepare(`
        INSERT OR IGNORE INTO workstreams (id, name, category, assignee_id, start_date, end_date, status, color, progress, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const p of phases) {
        insertWs.run(p.id, p.name, 'phase', null, p.start, p.end, p.status, p.color, p.progress, p.order, now, now)
      }
      for (const s of scopes) {
        insertWs.run(s.id, s.name, 'scope', s.assignee || null, s.start, s.end, s.status, s.color, s.progress, s.order, now, now)
      }

      // Seed sub-tasks
      const insertTask = db.prepare(`
        INSERT OR IGNORE INTO workstream_tasks (id, workstream_id, title, status, assignee_id, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const tasks = [
        // Auth
        { id: 't-auth-1', ws: 'auth-system', title: 'Phone OTP flow', status: 'done', assignee: 'asif' },
        { id: 't-auth-2', ws: 'auth-system', title: 'Profile setup screen', status: 'done', assignee: 'asif' },
        { id: 't-auth-3', ws: 'auth-system', title: 'Onboarding gate', status: 'done', assignee: 'asif' },
        { id: 't-auth-4', ws: 'auth-system', title: 'Display name fallback chain', status: 'in_progress', assignee: 'asif' },
        { id: 't-auth-5', ws: 'auth-system', title: 'Deep link callback handler', status: 'todo', assignee: 'asif' },
        // Expenses
        { id: 't-exp-1', ws: 'expense-tracking', title: 'Add expense form', status: 'done', assignee: 'nadeem' },
        { id: 't-exp-2', ws: 'expense-tracking', title: 'Expense list view', status: 'in_progress', assignee: 'nadeem' },
        { id: 't-exp-3', ws: 'expense-tracking', title: 'Split logic (equal/custom)', status: 'todo', assignee: 'nadeem' },
        { id: 't-exp-4', ws: 'expense-tracking', title: 'Settlement ledger', status: 'todo', assignee: 'nadeem' },
        { id: 't-exp-5', ws: 'expense-tracking', title: 'Receipt photo upload', status: 'todo', assignee: 'nadeem' },
        // Invite flow
        { id: 't-inv-1', ws: 'invite-flow', title: 'Deep link generation', status: 'done', assignee: 'asif' },
        { id: 't-inv-2', ws: 'invite-flow', title: 'Join trip handler', status: 'in_progress', assignee: 'asif' },
        { id: 't-inv-3', ws: 'invite-flow', title: 'Share sheet integration', status: 'todo', assignee: 'asif' },
        { id: 't-inv-4', ws: 'invite-flow', title: 'iMessage preview card', status: 'todo', assignee: 'asif' },
        // Design system
        { id: 't-des-1', ws: 'design-system', title: 'Trip card component in Figma', status: 'done', assignee: 'krisna' },
        { id: 't-des-2', ws: 'design-system', title: 'Tab bar & nav design', status: 'in_progress', assignee: 'krisna' },
        { id: 't-des-3', ws: 'design-system', title: 'Expense screens design', status: 'todo', assignee: 'krisna' },
      ]

      tasks.forEach((t, i) => {
        insertTask.run(t.id, t.ws, t.title, t.status, t.assignee || null, i, now, now)
      })

      // Recalculate progress for seeded workstreams
      const wsIds = [...phases.map(p => p.id), ...scopes.map(s => s.id)]
      for (const wsId of wsIds) {
        const row = db.prepare(`
          SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
          FROM workstream_tasks WHERE workstream_id = ?
        `).get(wsId) as { total: number; done: number }
        if (row.total > 0) {
          db.prepare('UPDATE workstreams SET progress = ? WHERE id = ?').run(row.done / row.total, wsId)
        }
      }
    }
  },
  {
    id: '043_frd_paths',
    up(db: Database.Database) {
      // Set frd_path for all scope workstreams pointing to tryps-docs repo
      const frdPaths: Record<string, string> = {
        'auth-system': 'docs/frds/auth-system.md',
        'expense-tracking': 'docs/frds/expense-tracking.md',
        'invite-flow': 'docs/frds/invite-flow.md',
        'trip-detail': 'docs/frds/trip-detail.md',
        'notifications': 'docs/frds/notifications.md',
        'explore-globe': 'docs/frds/explore-globe.md',
        'design-system': 'docs/frds/design-system.md',
        'qa-testing': 'docs/frds/qa-testing.md',
      }

      const update = db.prepare('UPDATE workstreams SET frd_path = ? WHERE id = ? AND frd_path IS NULL')
      for (const [id, path] of Object.entries(frdPaths)) {
        update.run(path, id)
      }
    }
  },
  {
    id: '044_seed_token_usage',
    up(db: Database.Database) {
      // Seed 7 days of realistic token usage data so Cost Tracker panel renders charts.
      // Only seed if table is empty (idempotent).
      const count = db.prepare('SELECT COUNT(*) as n FROM token_usage').get() as { n: number }
      if (count.n > 0) return

      const agents = ['marty', 'marty:standup', 'marty:pr-review', 'marty:bug-triage', 'marty:spec-review']
      const models = ['claude-opus-4-6', 'claude-sonnet-4-6']
      const now = Math.floor(Date.now() / 1000)
      const daySeconds = 86400

      const insert = db.prepare(`
        INSERT INTO token_usage (model, session_id, input_tokens, output_tokens, created_at, workspace_id, agent_name, cost_usd)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `)

      // Generate 7 days of data, 8-15 requests per day
      for (let day = 6; day >= 0; day--) {
        const baseTime = now - (day * daySeconds)
        const requestCount = 8 + Math.floor(Math.abs(Math.sin(day * 7)) * 8)

        for (let req = 0; req < requestCount; req++) {
          const agent = agents[Math.floor(Math.abs(Math.sin(day * 13 + req * 7)) * agents.length)]
          const model = req % 3 === 0 ? models[0] : models[1]
          const inputTokens = 1000 + Math.floor(Math.abs(Math.sin(day * 3 + req * 11)) * 8000)
          const outputTokens = 500 + Math.floor(Math.abs(Math.sin(day * 5 + req * 13)) * 4000)

          // Pricing: opus=$15/$75 per 1M, sonnet=$3/$15 per 1M
          const isOpus = model === 'claude-opus-4-6'
          const costUsd = isOpus
            ? (inputTokens * 15 + outputTokens * 75) / 1_000_000
            : (inputTokens * 3 + outputTokens * 15) / 1_000_000

          const timestamp = baseTime + Math.floor((req / requestCount) * daySeconds * 0.6) + 28800 // start at ~8am

          insert.run(model, `${agent}:session-${day}-${req}`, inputTokens, outputTokens, timestamp, agent, costUsd)
        }
      }
    }
  },
  {
    id: '045_phase_frd_paths',
    up(db: Database.Database) {
      // Set frd_path for phase workstreams (P1, P2, P3)
      const phaseFrds: Record<string, string> = {
        'p1-core': 'docs/frds/p1-core.md',
        'p2-payments': 'docs/frds/p2-payments.md',
        'p3-agents': 'docs/frds/p3-agents.md',
      }

      const update = db.prepare('UPDATE workstreams SET frd_path = ? WHERE id = ? AND frd_path IS NULL')
      for (const [id, path] of Object.entries(phaseFrds)) {
        update.run(path, id)
      }
    }
  },
  {
    id: '046_post_trip_and_logistics_scopes',
    up(db: Database.Database) {
      const now = new Date().toISOString()

      const insertWs = db.prepare(`
        INSERT OR IGNORE INTO workstreams (id, name, category, assignee_id, start_date, end_date, status, color, frd_path, progress, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      // Post-Trip Review scope
      insertWs.run('post-trip-review', 'Post-Trip Review', 'scope', null, '2026-03-25', '2026-04-02', 'not_started', '#e11d48', 'docs/frds/post-trip-review.md', 0, 20, now, now)

      // Tryps Logistics Agent scope
      insertWs.run('logistics-agent', 'Tryps Logistics Agent', 'scope', null, '2026-03-28', '2026-04-02', 'not_started', '#0ea5e9', 'docs/frds/logistics-agent.md', 0, 21, now, now)

      // Sub-features for Post-Trip Review
      const insertTask = db.prepare(`
        INSERT OR IGNORE INTO workstream_tasks (id, workstream_id, title, status, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      insertTask.run('t-ptr-1', 'post-trip-review', 'Time Capsule / Montage Video — Snapchat-style group montage, view-once, 60s clipped version', 'todo', 0, now, now)
      insertTask.run('t-ptr-2', 'post-trip-review', 'Sentiment Analysis — NLP trip recaps in natural language', 'todo', 1, now, now)
      insertTask.run('t-ptr-3', 'post-trip-review', 'Tryps Review System — like/dislike/feedback for trips', 'todo', 2, now, now)
      insertTask.run('t-ptr-4', 'post-trip-review', 'Trip Cash / Miles Rewards — earn miles per trip (real distance from home airport), rewards for DNA quiz & data collection, funds X-402 API calls', 'todo', 3, now, now)
    }
  },
  {
    id: '047_replace_scopes_with_p1_scopes',
    up(db: Database.Database) {
      const now = new Date().toISOString()

      // 1. Add parent_id column to workstreams
      const cols = db.prepare(`PRAGMA table_info(workstreams)`).all() as { name: string }[]
      if (!cols.some(c => c.name === 'parent_id')) {
        db.exec(`ALTER TABLE workstreams ADD COLUMN parent_id TEXT REFERENCES workstreams(id)`)
      }

      // 2. Delete ALL existing scope workstreams and their tasks
      const existingScopes = db.prepare(`SELECT id FROM workstreams WHERE category = 'scope'`).all() as { id: string }[]
      for (const scope of existingScopes) {
        db.prepare(`DELETE FROM workstream_tasks WHERE workstream_id = ?`).run(scope.id)
        db.prepare(`DELETE FROM workstream_meetings WHERE workstream_id = ?`).run(scope.id)
        db.prepare(`DELETE FROM workstreams WHERE id = ?`).run(scope.id)
      }

      // 3. Update P1 end date to cover all scopes
      db.prepare(`UPDATE workstreams SET end_date = '2026-04-05' WHERE id = 'p1-core'`).run()

      // 4. Insert 6 new P1 scopes
      const insertWs = db.prepare(`
        INSERT OR IGNORE INTO workstreams (id, name, category, assignee_id, start_date, end_date, status, color, frd_path, progress, sort_order, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const scopes = [
        { id: 'p1-core-flows',            name: '1. Core Flows (19 Flows)',         start: '2026-03-09', end: '2026-03-22', color: '#2563eb', status: 'in_progress', progress: 0.45, order: 10 },
        { id: 'p1-tooltips-teaching',      name: '2. Tooltips & Teaching',           start: '2026-03-22', end: '2026-03-28', color: '#7c3aed', status: 'not_started', progress: 0,    order: 11 },
        { id: 'p1-notifications-voting',   name: '3. Notifications & Voting',        start: '2026-03-22', end: '2026-03-30', color: '#059669', status: 'not_started', progress: 0,    order: 12 },
        { id: 'p1-post-trip-review',       name: '4. Post-Trip Review',              start: '2026-03-25', end: '2026-04-02', color: '#d97706', status: 'not_started', progress: 0,    order: 13 },
        { id: 'p1-travel-dna',            name: '5. Travel DNA',                    start: '2026-03-24', end: '2026-03-31', color: '#0891b2', status: 'not_started', progress: 0,    order: 14 },
        { id: 'p1-recommendations',        name: '6. Recommendation Algorithm',      start: '2026-03-28', end: '2026-04-05', color: '#4f46e5', status: 'not_started', progress: 0,    order: 15 },
      ]

      for (const s of scopes) {
        insertWs.run(
          s.id, s.name, 'scope', null,
          s.start, s.end, s.status, s.color,
          `scopes/p1/${s.id.replace('p1-', '')}/frd.md`,
          s.progress, s.order, 'p1-core', now, now
        )
      }

      // 5. Insert sub-tasks for each scope
      const insertTask = db.prepare(`
        INSERT OR IGNORE INTO workstream_tasks (id, workstream_id, title, status, assignee_id, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      // --- Scope 1: Core Flows (19 flows from flow-tracker) ---
      const coreFlows = [
        { id: 't-cf-01', title: 'Flow 1: New User Onboarding (12 screens)',         status: 'done' },
        { id: 't-cf-02', title: 'Flow 2: Invite → Join — New User (12 screens)',    status: 'done' },
        { id: 't-cf-03', title: 'Flow 3: Invite → Join — Existing (9 screens)',     status: 'done' },
        { id: 't-cf-04', title: 'Flow 4: Trip Creation / Trip Menu (21 screens)',   status: 'done' },
        { id: 't-cf-05', title: 'Flow 5: Invite & Share (11 screens)',              status: 'done' },
        { id: 't-cf-06', title: 'Flow 6: Itinerary Tab (~12 screens)',              status: 'done' },
        { id: 't-cf-07', title: 'Flow 7: Activities Tab (~11 screens)',             status: 'done' },
        { id: 't-cf-08', title: 'Flow 8: People Tab — Trip (14 screens)',           status: 'done' },
        { id: 't-cf-09', title: 'Flow 9: Stay Tab (24 screens)',                    status: 'todo' },
        { id: 't-cf-10', title: 'Flow 10: Vibe Tab (15 screens)',                   status: 'done' },
        { id: 't-cf-11', title: 'Flow 11: Packing List Tab (9 screens)',            status: 'in_progress' },
        { id: 't-cf-12', title: 'Flow 12: Expenses Tab (32 screens)',               status: 'in_progress' },
        { id: 't-cf-13', title: 'Flow 13: Post-Trip State (6 screens)',             status: 'todo' },
        { id: 't-cf-14', title: 'Flow 14: Travel DNA Standalone (6 screens)',       status: 'todo' },
        { id: 't-cf-15', title: 'Flow 15: Calendar Tab — Reskin (10 screens)',      status: 'todo' },
        { id: 't-cf-16', title: 'Flow 16: Explore Tab — Reskin (10 screens)',       status: 'todo' },
        { id: 't-cf-17', title: 'Flow 17: People Tab Social — Reskin (11 screens)', status: 'todo' },
        { id: 't-cf-18', title: 'Flow 18: Profile & Settings — Reskin (11 screens)',status: 'todo' },
        { id: 't-cf-19', title: 'Flow 19: Home & Discover (10 screens)',            status: 'todo' },
      ]
      coreFlows.forEach((t, i) => {
        insertTask.run(t.id, 'p1-core-flows', t.title, t.status, null, i, now, now)
      })

      // --- Scope 2: Tooltips & Teaching ---
      const tooltipTasks = [
        { id: 't-tt-01', title: 'Tooltip system framework & component library' },
        { id: 't-tt-02', title: 'First-launch onboarding tooltip sequence' },
        { id: 't-tt-03', title: 'Feature discovery tooltips (trip card sections)' },
        { id: 't-tt-04', title: 'Contextual teaching moments (empty states → action)' },
        { id: 't-tt-05', title: 'Progressive disclosure strategy (beginner → power user)' },
      ]
      tooltipTasks.forEach((t, i) => {
        insertTask.run(t.id, 'p1-tooltips-teaching', t.title, 'todo', null, i, now, now)
      })

      // --- Scope 3: Notifications & Voting ---
      const notifTasks = [
        { id: 't-nv-01', title: 'Push notification system (Expo Notifications)' },
        { id: 't-nv-02', title: '48-hour voting window rules & auto-close' },
        { id: 't-nv-03', title: 'Vote management UI (create poll, cast vote, results)' },
        { id: 't-nv-04', title: 'Notification preferences & quiet hours' },
        { id: 't-nv-05', title: 'Activity-based notifications (new expense, itinerary change)' },
        { id: 't-nv-06', title: 'Deadline reminders (trip departure, vote closing)' },
      ]
      notifTasks.forEach((t, i) => {
        insertTask.run(t.id, 'p1-notifications-voting', t.title, 'todo', null, i, now, now)
      })

      // --- Scope 4: Post-Trip Review ---
      const postTripTasks = [
        { id: 't-pt-01', title: '60-second montage video (annual recap, auto-generated)' },
        { id: 't-pt-02', title: 'Top 3 activities selection (group votes post-trip)' },
        { id: 't-pt-03', title: 'Post-trip sentiment review & trip rating' },
        { id: 't-pt-04', title: 'Yearly "on this day" memories (push notification)' },
        { id: 't-pt-05', title: 'Post-trip photo gallery & highlights reel' },
      ]
      postTripTasks.forEach((t, i) => {
        insertTask.run(t.id, 'p1-post-trip-review', t.title, 'todo', null, i, now, now)
      })

      // --- Scope 5: Travel DNA ---
      const travelDnaTasks = [
        { id: 't-td-01', title: 'Travel DNA scoring algorithm design & implementation' },
        { id: 't-td-02', title: 'NL enhancements — natural language quiz instead of multiple choice' },
        { id: 't-td-03', title: 'Influence strategy — prompts & nudges to fill out DNA section' },
        { id: 't-td-04', title: 'DNA profile display & sharing card' },
        { id: 't-td-05', title: 'Group DNA compatibility score (trip-level)' },
      ]
      travelDnaTasks.forEach((t, i) => {
        insertTask.run(t.id, 'p1-travel-dna', t.title, 'todo', null, i, now, now)
      })

      // --- Scope 6: Recommendation Algorithm ---
      const recoTasks = [
        { id: 't-rc-01', title: 'Sub-scope A: Activity recommendations (based on DNA + location)' },
        { id: 't-rc-02', title: 'Sub-scope B: Trip recommendations (based on group DNA overlap)' },
        { id: 't-rc-03', title: 'Sub-scope C: Flight recommendations (arrival time + trip days)' },
        { id: 't-rc-04', title: 'Sub-scope D: Accommodation recommendations (stay preferences)' },
        { id: 't-rc-05', title: 'Sub-scope E: Discovery engine — "other places to recommend"' },
        { id: 't-rc-06', title: 'Recommendation algorithm core (scoring, ranking, personalization)' },
      ]
      recoTasks.forEach((t, i) => {
        insertTask.run(t.id, 'p1-recommendations', t.title, 'todo', null, i, now, now)
      })

      // Recalculate progress for new scopes
      for (const s of scopes) {
        const row = db.prepare(`
          SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
          FROM workstream_tasks WHERE workstream_id = ?
        `).get(s.id) as { total: number; done: number }
        if (row.total > 0) {
          db.prepare('UPDATE workstreams SET progress = ?, updated_at = ? WHERE id = ?').run(row.done / row.total, now, s.id)
        }
      }
    }
  },
  {
    id: '048_p2_p3_scopes_and_spec_path',
    up(db: Database.Database) {
      const now = new Date().toISOString()

      // 1. Add spec_path and spec_content columns
      const cols = db.prepare(`PRAGMA table_info(workstreams)`).all() as { name: string }[]
      if (!cols.some(c => c.name === 'spec_path')) {
        db.exec(`ALTER TABLE workstreams ADD COLUMN spec_path TEXT`)
      }
      if (!cols.some(c => c.name === 'spec_content')) {
        db.exec(`ALTER TABLE workstreams ADD COLUMN spec_content TEXT`)
      }

      // 2. Set spec_path for existing P1 scopes
      const updateSpec = db.prepare('UPDATE workstreams SET spec_path = ? WHERE id = ?')
      const p1Scopes = ['core-flows', 'tooltips-teaching', 'notifications-voting', 'post-trip-review', 'travel-dna', 'recommendations']
      for (const name of p1Scopes) {
        updateSpec.run(`scopes/p1/${name}/spec.md`, `p1-${name}`)
      }

      // 3. Insert P2 scopes
      const insertWs = db.prepare(`
        INSERT OR IGNORE INTO workstreams (id, name, category, assignee_id, start_date, end_date, status, color, frd_path, spec_path, progress, sort_order, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const p2Scopes = [
        { id: 'p2-linq-imessage',     name: '1. iMessage via Linq',            start: '2026-03-22', end: '2026-04-05', color: '#7c3aed', status: 'not_started', order: 20 },
        { id: 'p2-stripe-payments',   name: '2. Stripe Payments',              start: '2026-03-25', end: '2026-04-08', color: '#6366f1', status: 'not_started', order: 21 },
        { id: 'p2-booking-links',     name: '3. Booking Links',                start: '2026-03-28', end: '2026-04-10', color: '#8b5cf6', status: 'not_started', order: 22 },
        { id: 'p2-connectors',        name: '4. Travel Life Connectors',       start: '2026-04-01', end: '2026-04-12', color: '#a78bfa', status: 'not_started', order: 23 },
      ]

      for (const s of p2Scopes) {
        const frdPath = `scopes/p2/${s.id.replace('p2-', '')}/frd.md`
        const specPath = `scopes/p2/${s.id.replace('p2-', '')}/spec.md`
        insertWs.run(s.id, s.name, 'scope', null, s.start, s.end, s.status, s.color, frdPath, specPath, 0, s.order, 'p2-payments', now, now)
      }

      // Update P2 dates to cover scopes
      db.prepare(`UPDATE workstreams SET end_date = '2026-04-12' WHERE id = 'p2-payments'`).run()

      // 4. Insert P3 scopes
      const p3Scopes = [
        { id: 'p3-vote-on-behalf',    name: '1. Vote on My Behalf',            start: '2026-04-05', end: '2026-04-15', color: '#ef4444', status: 'not_started', order: 30 },
        { id: 'p3-pay-on-behalf',     name: '2. Pay on My Behalf (X-402)',     start: '2026-04-08', end: '2026-04-18', color: '#dc2626', status: 'not_started', order: 31 },
        { id: 'p3-duffel-apis',       name: '3. Duffel API & Dependencies',    start: '2026-04-10', end: '2026-04-20', color: '#b91c1c', status: 'not_started', order: 32 },
        { id: 'p3-logistics-agent',   name: '4. Logistics Agent',              start: '2026-04-12', end: '2026-04-22', color: '#991b1b', status: 'not_started', order: 33 },
      ]

      for (const s of p3Scopes) {
        const frdPath = `scopes/p3/${s.id.replace('p3-', '')}/frd.md`
        const specPath = `scopes/p3/${s.id.replace('p3-', '')}/spec.md`
        insertWs.run(s.id, s.name, 'scope', null, s.start, s.end, s.status, s.color, frdPath, specPath, 0, s.order, 'p3-agents', now, now)
      }

      // Update P3 dates to cover scopes
      db.prepare(`UPDATE workstreams SET end_date = '2026-04-22' WHERE id = 'p3-agents'`).run()

      // 5. Insert sub-tasks for P2 scopes
      const insertTask = db.prepare(`
        INSERT OR IGNORE INTO workstream_tasks (id, workstream_id, title, status, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      // P2 Scope 1: Linq iMessage
      const linqTasks = [
        { id: 't-lq-01', title: 'Linq webhook integration (inbound message parsing)' },
        { id: 't-lq-02', title: 'NL intent parser (activity, vote, RSVP, expense, query)' },
        { id: 't-lq-03', title: 'Outbound message API (replies, proactive notifications, blasts)' },
        { id: 't-lq-04', title: 'Group chat ↔ trip mapping (conversation_id → trip_id)' },
        { id: 't-lq-05', title: 'User identity mapping (iMessage phone → Tryps user)' },
        { id: 't-lq-06', title: 'Delivery status webhooks & retry logic' },
      ]
      linqTasks.forEach((t, i) => insertTask.run(t.id, 'p2-linq-imessage', t.title, 'todo', i, now, now))

      // P2 Scope 2: Stripe Payments
      const stripeTasks = [
        { id: 't-sp-01', title: 'Stripe Connect setup (platform account + connected accounts)' },
        { id: 't-sp-02', title: 'In-app payment flow (settle expense balance)' },
        { id: 't-sp-03', title: 'Payment tracking UI (paid/unpaid status per expense)' },
        { id: 't-sp-04', title: 'Vercel billing implications research & architecture' },
        { id: 't-sp-05', title: 'Payout scheduling & settlement reconciliation' },
      ]
      stripeTasks.forEach((t, i) => insertTask.run(t.id, 'p2-stripe-payments', t.title, 'todo', i, now, now))

      // P2 Scope 3: Booking Links
      const bookingTasks = [
        { id: 't-bl-01', title: 'Booking link embed system (Stay, Activities, Flights tabs)' },
        { id: 't-bl-02', title: 'Pre-filled partner links (dates, location, group size)' },
        { id: 't-bl-03', title: 'Affiliate/referral tracking per booking click' },
        { id: 't-bl-04', title: 'Booking confirmation callback & trip card update' },
      ]
      bookingTasks.forEach((t, i) => insertTask.run(t.id, 'p2-booking-links', t.title, 'todo', i, now, now))

      // P2 Scope 4: Connectors
      const connectorTasks = [
        { id: 't-cn-01', title: 'Airline account linking (United, Delta, AA loyalty numbers)' },
        { id: 't-cn-02', title: 'Hotel loyalty linking (Marriott, Hilton, Airbnb)' },
        { id: 't-cn-03', title: 'ChatGPT custom prompt integration (user sends travel context)' },
        { id: 't-cn-04', title: 'Connector framework (OAuth + API key patterns)' },
        { id: 't-cn-05', title: 'Import existing bookings from connected accounts' },
      ]
      connectorTasks.forEach((t, i) => insertTask.run(t.id, 'p2-connectors', t.title, 'todo', i, now, now))

      // P3 Scope 1: Vote on My Behalf
      const voteTasks = [
        { id: 't-vb-01', title: 'Agent learns user preferences from Travel DNA + vote history' },
        { id: 't-vb-02', title: 'Auto-vote inference engine (predict user vote before 48h deadline)' },
        { id: 't-vb-03', title: 'Pre-deadline nudge: "I think you\'d pick Option B — change it?"' },
        { id: 't-vb-04', title: '48-hour auto-vote fallback (agent votes if user doesn\'t)' },
        { id: 't-vb-05', title: 'Confidence scoring (high/medium/low certainty on inferred vote)' },
        { id: 't-vb-06', title: 'Opt-in/opt-out per trip and per category (activities, dates, locations)' },
      ]
      voteTasks.forEach((t, i) => insertTask.run(t.id, 'p3-vote-on-behalf', t.title, 'todo', i, now, now))

      // P3 Scope 2: Pay on My Behalf (X-402)
      const payTasks = [
        { id: 't-xp-01', title: 'X-402 protocol research & integration design' },
        { id: 't-xp-02', title: 'Tryps Cash wallet system (per-trip agent execution budget)' },
        { id: 't-xp-03', title: 'Micropayment flow: agent hits API → HTTP 402 → X-402 pays → result' },
        { id: 't-xp-04', title: 'Cost logging per trip (track agent spend for future billing)' },
        { id: 't-xp-05', title: 'Budget limits & approval thresholds per trip' },
      ]
      payTasks.forEach((t, i) => insertTask.run(t.id, 'p3-pay-on-behalf', t.title, 'todo', i, now, now))

      // P3 Scope 3: Duffel API & Dependencies
      const duffelTasks = [
        { id: 't-df-01', title: 'Duffel API integration (flight search, booking, ticketing)' },
        { id: 't-df-02', title: 'Amadeus API evaluation (backup flight provider)' },
        { id: 't-df-03', title: 'Restaurant/activity API research (OpenTable, Viator, GetYourGuide)' },
        { id: 't-df-04', title: 'Hotel API integration (Booking.com affiliate or Duffel stays)' },
        { id: 't-df-05', title: 'API credential management & rate limit handling' },
      ]
      duffelTasks.forEach((t, i) => insertTask.run(t.id, 'p3-duffel-apis', t.title, 'todo', i, now, now))

      // P3 Scope 4: Logistics Agent
      const logisticsTasks = [
        { id: 't-la-01', title: 'Agent task creation from trip card buttons & empty states' },
        { id: 't-la-02', title: 'Ranked options display (Citymapper-style: cost, time, details)' },
        { id: 't-la-03', title: 'Group voting on agent options (48h window, majority wins)' },
        { id: 't-la-04', title: 'Booking confirmation flow (agent → API → trip card update)' },
        { id: 't-la-05', title: 'Error recovery (sold out → auto-alternatives, API down → retry)' },
        { id: 't-la-06', title: 'Free-text chat trigger (NL → agent task)' },
        { id: 't-la-07', title: 'Duplicate request deduplication' },
      ]
      logisticsTasks.forEach((t, i) => insertTask.run(t.id, 'p3-logistics-agent', t.title, 'todo', i, now, now))
    }
  },
  {
    id: '049_p4_p5_phases_and_scopes',
    up(db: Database.Database) {
      const now = new Date().toISOString()

      // 1. Insert P4 and P5 phase workstreams
      const insertWs = db.prepare(`
        INSERT OR IGNORE INTO workstreams (id, name, category, assignee_id, start_date, end_date, status, color, frd_path, spec_path, progress, sort_order, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      // P4 phase
      insertWs.run('p4-brand-gtm', 'P4: Brand & Go-to-Market', 'phase', null, '2026-04-22', '2026-05-10', 'not_started', '#f59e0b', null, null, 0, 4, null, now, now)
      // P5 phase
      insertWs.run('p5-v2-beta', 'P5: V2 Beta', 'phase', null, '2026-05-10', '2026-05-30', 'not_started', '#0d9488', null, null, 0, 5, null, now, now)

      // 2. Insert P4 scopes (4 scopes)
      const p4Scopes = [
        { id: 'p4-socials-presence',      name: '1. Socials & Presence',               start: '2026-04-22', end: '2026-05-03', color: '#f59e0b', status: 'not_started', order: 40 },
        { id: 'p4-wispr-playbook',        name: '2. Wispr Flow Playbook (UGC)',        start: '2026-04-25', end: '2026-05-06', color: '#d97706', status: 'not_started', order: 41 },
        { id: 'p4-referral-incentives',   name: '3. Referral Incentives (999/369)',    start: '2026-04-28', end: '2026-05-08', color: '#ea580c', status: 'not_started', order: 42 },
        { id: 'p4-giveaways',            name: '4. Giveaways (Dream Trip)',           start: '2026-05-01', end: '2026-05-10', color: '#c2410c', status: 'not_started', order: 43 },
      ]

      for (const s of p4Scopes) {
        const frdPath = `scopes/p4/${s.id.replace('p4-', '')}/frd.md`
        const specPath = `scopes/p4/${s.id.replace('p4-', '')}/spec.md`
        insertWs.run(s.id, s.name, 'scope', null, s.start, s.end, s.status, s.color, frdPath, specPath, 0, s.order, 'p4-brand-gtm', now, now)
      }

      // 3. Insert P5 scopes (2 scopes)
      const p5Scopes = [
        { id: 'p5-friends-family',        name: '1. Family & Friends Testing',         start: '2026-05-10', end: '2026-05-22', color: '#0d9488', status: 'not_started', order: 50 },
        { id: 'p5-strangers-review',      name: '2. MIT + Stranger Reviews',           start: '2026-05-15', end: '2026-05-30', color: '#0f766e', status: 'not_started', order: 51 },
      ]

      for (const s of p5Scopes) {
        const frdPath = `scopes/p5/${s.id.replace('p5-', '')}/frd.md`
        const specPath = `scopes/p5/${s.id.replace('p5-', '')}/spec.md`
        insertWs.run(s.id, s.name, 'scope', null, s.start, s.end, s.status, s.color, frdPath, specPath, 0, s.order, 'p5-v2-beta', now, now)
      }

      // 4. Insert sub-tasks
      const insertTask = db.prepare(`
        INSERT OR IGNORE INTO workstream_tasks (id, workstream_id, title, status, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      // --- P4 Scope 1: Socials & Presence ---
      const socialsTasks = [
        { id: 't-sp4-01', title: 'Social media strategy & channel selection (IG, TikTok, Twitter)' },
        { id: 't-sp4-02', title: 'Brand voice & content calendar framework' },
        { id: 't-sp4-03', title: 'Influencer partnership outreach & deal structure' },
        { id: 't-sp4-04', title: 'Public trip discovery layer (social sharing)' },
        { id: 't-sp4-05', title: 'Content templates & asset library (Canva/Figma)' },
      ]
      socialsTasks.forEach((t, i) => insertTask.run(t.id, 'p4-socials-presence', t.title, 'todo', i, now, now))

      // --- P4 Scope 2: Wispr Flow Playbook (UGC) ---
      const wisprTasks = [
        { id: 't-wp-01', title: 'Creator recruitment pipeline (identify & reach 50 candidates)' },
        { id: 't-wp-02', title: 'Compensation model design ($6.2K/week benchmark from Wispr)' },
        { id: 't-wp-03', title: 'Content hook library (viral hooks adapted for travel)' },
        { id: 't-wp-04', title: 'UGC replication system adapted for Tryps' },
        { id: 't-wp-05', title: 'Creator onboarding workflow & brief templates' },
        { id: 't-wp-06', title: 'Performance tracking dashboard (views, conversions, CAC)' },
      ]
      wisprTasks.forEach((t, i) => insertTask.run(t.id, 'p4-wispr-playbook', t.title, 'todo', i, now, now))

      // --- P4 Scope 3: Referral Incentives (999/369) ---
      const referralTasks = [
        { id: 't-ri-01', title: 'Trip Fund referral program ($5 per side, "refer 9 → $99" framing)' },
        { id: 't-ri-02', title: 'Tryps 100 invite-only launch club mechanics' },
        { id: 't-ri-03', title: 'Trip Unlock people-wall (features at 3/6/9 people)' },
        { id: 't-ri-04', title: 'Feature gatekeeping mechanics (unlock via invites or milestones)' },
        { id: 't-ri-05', title: '999/369 tier structure & reward ladder' },
        { id: 't-ri-06', title: 'First Mover Credit organizer incentives ($10 per qualifying trip)' },
        { id: 't-ri-07', title: 'Referral tracking & attribution system' },
      ]
      referralTasks.forEach((t, i) => insertTask.run(t.id, 'p4-referral-incentives', t.title, 'todo', i, now, now))

      // --- P4 Scope 4: Giveaways (Dream Trip) ---
      const giveawayTasks = [
        { id: 't-gw-01', title: 'Cabo trip giveaway (4-6 tickets + 2 nights Airbnb)' },
        { id: 't-gw-02', title: 'Paris trip giveaway (4-6 tickets + accommodation)' },
        { id: 't-gw-03', title: 'Napa trip giveaway (weekend wine country)' },
        { id: 't-gw-04', title: 'Dream trip contest mechanics (entry, selection, fulfillment)' },
        { id: 't-gw-05', title: 'Cost model & budget per giveaway (~$1.6K/trip, 3 rounds)' },
        { id: 't-gw-06', title: 'Partner/sponsor integration (co-branded giveaways)' },
      ]
      giveawayTasks.forEach((t, i) => insertTask.run(t.id, 'p4-giveaways', t.title, 'todo', i, now, now))

      // --- P5 Scope 1: Family & Friends Testing ---
      const ffTasks = [
        { id: 't-ff-01', title: 'Feedback prompt workflow (talk-to-prompt system for collecting reactions)' },
        { id: 't-ff-02', title: 'Structured testing scripts per feature area' },
        { id: 't-ff-03', title: 'TestFlight distribution to inner circle (curated list)' },
        { id: 't-ff-04', title: 'Feedback collection & triage pipeline (Supabase → ClickUp)' },
        { id: 't-ff-05', title: 'Testing-specific onboarding flow (guided first experience)' },
        { id: 't-ff-06', title: 'Session recording & interaction heatmaps' },
      ]
      ffTasks.forEach((t, i) => insertTask.run(t.id, 'p5-friends-family', t.title, 'todo', i, now, now))

      // --- P5 Scope 2: MIT + Stranger Reviews ---
      const strangerTasks = [
        { id: 't-sr-01', title: 'MIT Product People outreach (structured cold emails)' },
        { id: 't-sr-02', title: 'Reddit seeding (r/travel, r/grouptravel, r/solotravel)' },
        { id: 't-sr-03', title: 'Travel forum posts (Lonely Planet, TripAdvisor community)' },
        { id: 't-sr-04', title: 'Cold outreach to travel bloggers & micro-influencers' },
        { id: 't-sr-05', title: 'Stranger feedback collection (different prompt than friends)' },
        { id: 't-sr-06', title: 'Campus ambassador pilot (college group trip targeting)' },
      ]
      strangerTasks.forEach((t, i) => insertTask.run(t.id, 'p5-strangers-review', t.title, 'todo', i, now, now))
    }
  },
  {
    id: '050_scope_pipeline_steps',
    up: (db) => {
      // Create pipeline steps table
      db.exec(`
        CREATE TABLE IF NOT EXISTS scope_pipeline_steps (
          id TEXT PRIMARY KEY,
          workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
          step_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'not_started',
          content TEXT,
          generated_at TEXT,
          meta TEXT,
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(workstream_id, step_key)
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_scope_pipeline_ws ON scope_pipeline_steps(workstream_id)`)

      // Migrate existing spec data
      db.exec(`
        INSERT OR IGNORE INTO scope_pipeline_steps (id, workstream_id, step_key, status, content, meta)
        SELECT
          'sp-' || id || '-spec',
          id,
          'spec',
          CASE WHEN spec_content IS NOT NULL AND spec_content != '' THEN 'ready' ELSE 'empty' END,
          spec_content,
          json_object('specPath', spec_path)
        FROM workstreams
        WHERE category = 'scope'
      `)

      // Migrate existing FRD data
      db.exec(`
        INSERT OR IGNORE INTO scope_pipeline_steps (id, workstream_id, step_key, status, content, meta)
        SELECT
          'sp-' || id || '-frd',
          id,
          'frd',
          CASE WHEN frd_content IS NOT NULL AND frd_content != '' THEN 'ready'
               WHEN frd_path IS NOT NULL AND frd_path != '' THEN 'draft'
               ELSE 'empty' END,
          frd_content,
          json_object('frdPath', frd_path)
        FROM workstreams
        WHERE category = 'scope'
      `)
    }
  },
  {
    id: '051_compress_timelines_april2',
    up: (db) => {
      const now = new Date().toISOString()
      const deadline = '2026-04-02'
      const update = db.prepare('UPDATE workstreams SET start_date = ?, end_date = ?, updated_at = ? WHERE id = ?')

      // P1: Core App — Mar 9 to Apr 2 (full window, already in progress)
      update.run('2026-03-09', deadline, now, 'p1-core')
      update.run('2026-03-09', '2026-03-21', now, 'p1-core-flows')        // 1. in progress, needs most time
      update.run('2026-03-19', '2026-03-25', now, 'p1-tooltips-teaching')  // 2. overlaps with tail of core flows
      update.run('2026-03-19', '2026-03-26', now, 'p1-notifications-voting') // 3. parallel with tooltips
      update.run('2026-03-24', '2026-03-30', now, 'p1-post-trip-review')   // 4.
      update.run('2026-03-22', '2026-03-28', now, 'p1-travel-dna')        // 5.
      update.run('2026-03-26', deadline, now, 'p1-recommendations')        // 6. last P1 scope

      // P2: Stripe + Linq — Mar 16 to Apr 2
      update.run('2026-03-16', deadline, now, 'p2-payments')
      update.run('2026-03-16', '2026-03-25', now, 'p2-linq-imessage')     // 1.
      update.run('2026-03-20', '2026-03-28', now, 'p2-stripe-payments')   // 2.
      update.run('2026-03-24', '2026-03-31', now, 'p2-booking-links')     // 3.
      update.run('2026-03-27', deadline, now, 'p2-connectors')            // 4.

      // P3: Agent Layer — Mar 20 to Apr 2
      update.run('2026-03-20', deadline, now, 'p3-agents')
      update.run('2026-03-20', '2026-03-27', now, 'p3-vote-on-behalf')    // 1.
      update.run('2026-03-23', '2026-03-30', now, 'p3-pay-on-behalf')     // 2.
      update.run('2026-03-25', deadline, now, 'p3-duffel-apis')           // 3.
      update.run('2026-03-27', deadline, now, 'p3-logistics-agent')       // 4.

      // P4: Brand & GTM — Mar 23 to Apr 2
      update.run('2026-03-23', deadline, now, 'p4-brand-gtm')
      update.run('2026-03-23', '2026-03-29', now, 'p4-socials-presence')   // 1.
      update.run('2026-03-25', '2026-03-31', now, 'p4-wispr-playbook')    // 2.
      update.run('2026-03-27', deadline, now, 'p4-referral-incentives')   // 3.
      update.run('2026-03-29', deadline, now, 'p4-giveaways')            // 4.

      // P5: V2 Beta — Mar 26 to Apr 2
      update.run('2026-03-26', deadline, now, 'p5-v2-beta')
      update.run('2026-03-26', '2026-03-31', now, 'p5-friends-family')    // 1.
      update.run('2026-03-28', deadline, now, 'p5-strangers-review')      // 2.
    }
  }
]

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row: any) => row.id)
  )

  for (const migration of [...migrations, ...extraMigrations]) {
    if (applied.has(migration.id)) continue
    db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)').run(migration.id)
    })()
  }
}
