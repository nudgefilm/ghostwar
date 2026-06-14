-- Scorched Earth debuff: track whether the attacker was at 100% damage at launch time.
-- Impact route reads this flag and halves the effective damage delta.
ALTER TABLE missiles ADD COLUMN IF NOT EXISTS attacker_debuffed boolean DEFAULT false;
