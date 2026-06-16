-- ── Daily missile supply: 100 → 20 ──────────────────────────────────────────
ALTER TABLE players ALTER COLUMN missiles_remaining SET DEFAULT 20;

-- ── chat_messages table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname     text NOT NULL,
  country_code text NOT NULL,
  message      text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- Realtime
ALTER TABLE chat_messages REPLICA IDENTITY FULL;

-- RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read chat_messages"   ON chat_messages FOR SELECT USING (true);
CREATE POLICY "service insert chat_messages" ON chat_messages FOR INSERT WITH CHECK (true);

GRANT SELECT ON chat_messages TO anon, authenticated;
GRANT ALL    ON chat_messages TO service_role;
