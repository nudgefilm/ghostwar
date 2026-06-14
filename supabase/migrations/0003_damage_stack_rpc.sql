-- Backfill damage_stack from all existing hit missiles (nuke=50, missile=1)
UPDATE countries c
SET damage_stack = (
  SELECT COALESCE(SUM(
    m.quantity * CASE WHEN m.type = 'nuke' THEN 50 ELSE 1 END
  ), 0)
  FROM missiles m
  WHERE m.target_country = c.code
    AND m.status = 'hit'
);

-- Recalculate damage_percent from the now-correct damage_stack
UPDATE countries
SET damage_percent = LEAST(100, FLOOR(damage_stack::float / 10));

-- Atomic increment: adds delta to damage_stack and recomputes damage_percent
-- in a single UPDATE statement, avoiding any read-then-write race.
CREATE OR REPLACE FUNCTION increment_country_damage(
  p_code  text,
  p_delta integer
) RETURNS TABLE(new_stack integer, new_percent float) LANGUAGE sql AS $$
  UPDATE countries
  SET
    damage_stack   = damage_stack + p_delta,
    damage_percent = LEAST(100, FLOOR((damage_stack + p_delta)::float / 10))
  WHERE code = p_code
  RETURNING damage_stack, damage_percent;
$$;

GRANT EXECUTE ON FUNCTION increment_country_damage(text, integer) TO service_role;
