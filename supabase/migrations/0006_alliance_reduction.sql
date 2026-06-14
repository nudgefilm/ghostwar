-- Create alliances table for bilateral damage reduction pacts.
-- country_a < country_b enforced by CHECK to guarantee a canonical unique pair key.
CREATE TABLE IF NOT EXISTS alliances (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  country_a     text NOT NULL,
  country_b     text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_a, country_b),
  CHECK (country_a < country_b)
);

ALTER TABLE alliances ENABLE ROW LEVEL SECURITY;

-- Public read: client-side polling uses anon key
CREATE POLICY "alliances_read_public" ON alliances FOR SELECT USING (true);

-- Store alliance damage reduction % at launch time so the impact route can apply
-- it correctly even after the alliance is broken (betrayal scenario).
ALTER TABLE missiles ADD COLUMN IF NOT EXISTS alliance_reduction integer DEFAULT 0;
