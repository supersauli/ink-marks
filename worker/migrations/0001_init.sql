CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  , style_guide TEXT NOT NULL DEFAULT '');
CREATE TABLE outline_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES outline_items(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE INDEX idx_outline_project ON outline_items(project_id, sort_order);
CREATE TABLE chapters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'outline',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE INDEX idx_chapter_project ON chapters(project_id, sort_order);
CREATE TABLE blocks (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    instruction TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE INDEX idx_block_chapter ON blocks(chapter_id, sort_order);
CREATE TABLE revisions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chapter_id TEXT,
    block_id TEXT,
    target_id TEXT,
    scope TEXT NOT NULL DEFAULT 'block',
    instruction TEXT NOT NULL DEFAULT '',
    original_text TEXT NOT NULL DEFAULT '',
    revised_text TEXT NOT NULL DEFAULT '',
    model_name TEXT,
    created_at TEXT NOT NULL
  );
CREATE INDEX idx_revision_chapter ON revisions(chapter_id, created_at);
CREATE TABLE versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE INDEX idx_version_target ON versions(target_type, target_id, created_at);
CREATE TABLE providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    api_type TEXT NOT NULL DEFAULT 'openai',
    extra_headers TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    temperature REAL NOT NULL DEFAULT 0.7,
    max_tokens INTEGER NOT NULL DEFAULT 4096,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  , context_length INTEGER NOT NULL DEFAULT 0, extra_body TEXT NOT NULL DEFAULT '{}');
CREATE INDEX idx_model_provider ON models(provider_id, sort_order);
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    model_name TEXT,
    created_at TEXT NOT NULL
  , usage_json TEXT NOT NULL DEFAULT '');
CREATE INDEX idx_chat_project ON chat_messages(project_id, created_at);
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
CREATE TABLE characters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    alias TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    age TEXT NOT NULL DEFAULT '',
    appearance TEXT NOT NULL DEFAULT '',
    background TEXT NOT NULL DEFAULT '',
    relations TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  , gender TEXT NOT NULL DEFAULT '', debut TEXT NOT NULL DEFAULT '', debut_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL);
CREATE INDEX idx_character_project ON characters(project_id, sort_order);
CREATE TABLE character_stages (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL DEFAULT '',
    traits TEXT NOT NULL DEFAULT '',
    inner TEXT NOT NULL DEFAULT '',
    behavior TEXT NOT NULL DEFAULT '',
    speech TEXT NOT NULL DEFAULT '',
    event TEXT NOT NULL DEFAULT '',
    is_current INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  , chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL);
CREATE INDEX idx_stage_character ON character_stages(character_id, sort_order);
CREATE TABLE card_templates (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'character',
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, kind)
  );
CREATE TABLE card_fields (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES card_templates(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    field_type TEXT NOT NULL DEFAULT 'text',
    unit TEXT NOT NULL DEFAULT '',
    options TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE INDEX idx_card_field_template ON card_fields(template_id, sort_order);
CREATE TABLE attribute_values (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_id TEXT NOT NULL REFERENCES card_fields(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_type, entity_id, field_id)
  );
CREATE INDEX idx_attribute_value_entity ON attribute_values(entity_type, entity_id);
CREATE TABLE attribute_logs (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_id TEXT NOT NULL REFERENCES card_fields(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  , chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL);
CREATE INDEX idx_attribute_log_entity ON attribute_logs(entity_type, entity_id, created_at);
CREATE TABLE items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '物品',
    rarity TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    debut TEXT NOT NULL DEFAULT '',
    background TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'intact',
    current_holder TEXT NOT NULL DEFAULT '',
    is_destroyed INTEGER NOT NULL DEFAULT 0,
    destroyed_by TEXT NOT NULL DEFAULT '',
    destroyed_at TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE INDEX idx_item_project ON items(project_id, sort_order);
CREATE TABLE item_events (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    period TEXT NOT NULL DEFAULT '',
    holder TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    destroyed_by TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  , chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL);
CREATE INDEX idx_item_event_item ON item_events(item_id, created_at);
CREATE TABLE character_status_logs (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'alive',
    period TEXT NOT NULL DEFAULT '',
    chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
CREATE INDEX idx_status_character ON character_status_logs(character_id, created_at);
CREATE TABLE character_skills (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE INDEX idx_skill_character ON character_skills(character_id, sort_order);
CREATE TABLE character_relations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    to_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    relation TEXT NOT NULL DEFAULT '陌生',
    period TEXT NOT NULL DEFAULT '',
    chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
CREATE INDEX idx_relation_pair ON character_relations(from_character_id, to_character_id, created_at);
CREATE INDEX idx_relation_project ON character_relations(project_id);
CREATE TABLE llm_usage_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    scene TEXT NOT NULL DEFAULT 'chat',
    model_name TEXT,
    provider_name TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cache_hit_tokens INTEGER,
    cache_miss_tokens INTEGER,
    cache_hit_rate REAL,
    context_length INTEGER NOT NULL DEFAULT 0,
    context_used INTEGER NOT NULL DEFAULT 0,
    context_rate REAL,
    estimated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  , duration_ms INTEGER NOT NULL DEFAULT 0, first_token_ms INTEGER);
CREATE INDEX idx_usage_created ON llm_usage_logs(created_at);
CREATE INDEX idx_usage_project ON llm_usage_logs(project_id, created_at);

-- 记事本：project_id 为空表示全局记事，非空表示某部小说专属。
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE INDEX IF NOT EXISTS idx_note_project ON notes(project_id, sort_order);
