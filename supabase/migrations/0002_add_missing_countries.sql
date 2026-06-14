-- Add all countries present in lib/countries.ts but missing from the initial seed.
-- The original migration only inserted 30 countries; the frontend has 75.
-- Strikes on missing countries silently updated 0 rows and never appeared in DAMAGE RANKINGS.
INSERT INTO countries (code, name, flag) VALUES
  -- Middle East
  ('IL', 'Israel',       '🇮🇱'),
  ('IR', 'Iran',         '🇮🇷'),
  ('AE', 'UAE',          '🇦🇪'),
  ('IQ', 'Iraq',         '🇮🇶'),
  ('SY', 'Syria',        '🇸🇾'),
  ('JO', 'Jordan',       '🇯🇴'),
  ('LB', 'Lebanon',      '🇱🇧'),
  ('KW', 'Kuwait',       '🇰🇼'),
  ('QA', 'Qatar',        '🇶🇦'),
  ('BH', 'Bahrain',      '🇧🇭'),
  ('OM', 'Oman',         '🇴🇲'),
  ('YE', 'Yemen',        '🇾🇪'),
  -- East Asia
  ('KP', 'North Korea',  '🇰🇵'),
  -- South / Southeast Asia
  ('MY', 'Malaysia',     '🇲🇾'),
  ('SG', 'Singapore',    '🇸🇬'),
  ('BD', 'Bangladesh',   '🇧🇩'),
  ('MM', 'Myanmar',      '🇲🇲'),
  ('NP', 'Nepal',        '🇳🇵'),
  ('LK', 'Sri Lanka',    '🇱🇰'),
  -- Europe
  ('FI', 'Finland',      '🇫🇮'),
  ('DK', 'Denmark',      '🇩🇰'),
  ('CH', 'Switzerland',  '🇨🇭'),
  ('AT', 'Austria',      '🇦🇹'),
  ('BE', 'Belgium',      '🇧🇪'),
  ('PT', 'Portugal',     '🇵🇹'),
  ('GR', 'Greece',       '🇬🇷'),
  ('CZ', 'Czech Republic','🇨🇿'),
  ('HU', 'Hungary',      '🇭🇺'),
  ('RO', 'Romania',      '🇷🇴'),
  ('BG', 'Bulgaria',     '🇧🇬'),
  ('HR', 'Croatia',      '🇭🇷'),
  ('SK', 'Slovakia',     '🇸🇰'),
  ('SI', 'Slovenia',     '🇸🇮'),
  ('EE', 'Estonia',      '🇪🇪'),
  ('LV', 'Latvia',       '🇱🇻'),
  ('LT', 'Lithuania',    '🇱🇹'),
  -- Americas
  ('CL', 'Chile',        '🇨🇱'),
  ('CO', 'Colombia',     '🇨🇴'),
  ('PE', 'Peru',         '🇵🇪'),
  ('VE', 'Venezuela',    '🇻🇪'),
  -- Africa
  ('ZA', 'South Africa', '🇿🇦'),
  ('KE', 'Kenya',        '🇰🇪'),
  ('ET', 'Ethiopia',     '🇪🇹'),
  ('GH', 'Ghana',        '🇬🇭'),
  ('MA', 'Morocco',      '🇲🇦'),
  ('TZ', 'Tanzania',     '🇹🇿'),
  -- Oceania
  ('NZ', 'New Zealand',  '🇳🇿'),
  ('FJ', 'Fiji',         '🇫🇯'),
  ('PG', 'Papua New Guinea', '🇵🇬')
ON CONFLICT (code) DO NOTHING;
