-- 국가 상태
CREATE TABLE countries (
  code text PRIMARY KEY,
  name text NOT NULL,
  flag text NOT NULL,
  damage_stack integer DEFAULT 0,
  damage_percent float DEFAULT 0,
  online_users integer DEFAULT 0,
  last_attacked_at timestamptz
);

-- 플레이어
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text UNIQUE NOT NULL,
  country_code text REFERENCES countries(code),
  missiles_remaining integer DEFAULT 20,
  nukes_remaining integer DEFAULT 0,
  last_missile_reset date DEFAULT CURRENT_DATE,
  total_kills integer DEFAULT 0,
  rank integer DEFAULT 9999,
  created_at timestamptz DEFAULT now()
);

-- 미사일 이벤트 (quantity 단일 row 방식)
CREATE TABLE missiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launcher_id uuid REFERENCES players(id),
  launcher_country text NOT NULL,
  target_country text NOT NULL,
  type text DEFAULT 'missile',
  quantity integer DEFAULT 1,
  status text DEFAULT 'flying',
  launched_at timestamptz DEFAULT now(),
  arrives_at timestamptz NOT NULL,
  intercepted_count integer DEFAULT 0
);

-- 동맹 (알파벳 정렬 강제)
CREATE TABLE alliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_a text NOT NULL,
  country_b text NOT NULL,
  request_count integer DEFAULT 0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE(country_a, country_b),
  CHECK(country_a < country_b)
);

-- 명예의 전당
CREATE TABLE hall_of_fame (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id),
  nickname text NOT NULL,
  country_code text NOT NULL,
  action text NOT NULL,
  expires_at timestamptz DEFAULT now() + interval '30 days',
  created_at timestamptz DEFAULT now()
);

-- 속보 로그
CREATE TABLE news_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  launcher_country text,
  target_country text,
  type text,
  is_template boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 주요 국가 초기 데이터
INSERT INTO countries (code, name, flag) VALUES
('US', 'United States', '🇺🇸'),
('KR', 'South Korea', '🇰🇷'),
('CN', 'China', '🇨🇳'),
('RU', 'Russia', '🇷🇺'),
('JP', 'Japan', '🇯🇵'),
('GB', 'United Kingdom', '🇬🇧'),
('FR', 'France', '🇫🇷'),
('DE', 'Germany', '🇩🇪'),
('IN', 'India', '🇮🇳'),
('BR', 'Brazil', '🇧🇷'),
('AU', 'Australia', '🇦🇺'),
('CA', 'Canada', '🇨🇦'),
('IT', 'Italy', '🇮🇹'),
('ES', 'Spain', '🇪🇸'),
('MX', 'Mexico', '🇲🇽'),
('ID', 'Indonesia', '🇮🇩'),
('TR', 'Turkey', '🇹🇷'),
('SA', 'Saudi Arabia', '🇸🇦'),
('PH', 'Philippines', '🇵🇭'),
('TH', 'Thailand', '🇹🇭'),
('VN', 'Vietnam', '🇻🇳'),
('AR', 'Argentina', '🇦🇷'),
('PK', 'Pakistan', '🇵🇰'),
('NG', 'Nigeria', '🇳🇬'),
('EG', 'Egypt', '🇪🇬'),
('UA', 'Ukraine', '🇺🇦'),
('PL', 'Poland', '🇵🇱'),
('NL', 'Netherlands', '🇳🇱'),
('SE', 'Sweden', '🇸🇪'),
('NO', 'Norway', '🇳🇴');

-- Realtime 활성화
ALTER TABLE missiles REPLICA IDENTITY FULL;
ALTER TABLE news_feed REPLICA IDENTITY FULL;
ALTER TABLE countries REPLICA IDENTITY FULL;
ALTER TABLE alliances REPLICA IDENTITY FULL;
ALTER TABLE hall_of_fame REPLICA IDENTITY FULL;

-- RLS
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE missiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE hall_of_fame ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read countries" ON countries FOR SELECT USING (true);
CREATE POLICY "public read missiles" ON missiles FOR SELECT USING (true);
CREATE POLICY "public read news_feed" ON news_feed FOR SELECT USING (true);
CREATE POLICY "public read hall_of_fame" ON hall_of_fame FOR SELECT USING (true);
CREATE POLICY "public read alliances" ON alliances FOR SELECT USING (true);
CREATE POLICY "players can insert missiles" ON missiles FOR INSERT WITH CHECK (true);
CREATE POLICY "players read own" ON players FOR SELECT USING (true);
CREATE POLICY "players insert own" ON players FOR INSERT WITH CHECK (true);

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT ON missiles, players, alliances, news_feed TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
