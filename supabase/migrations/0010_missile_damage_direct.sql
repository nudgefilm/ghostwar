-- Direct damage_percent increment for missiles (1% per missile, avoids the /10 stack rounding)
CREATE OR REPLACE FUNCTION increment_missile_damage_direct(
  p_code  text,
  p_delta integer
) RETURNS TABLE(new_percent float) LANGUAGE sql AS $$
  UPDATE countries
  SET
    damage_percent = LEAST(100, damage_percent + p_delta),
    damage_stack   = damage_stack + p_delta
  WHERE code = p_code
  RETURNING damage_percent;
$$;

GRANT EXECUTE ON FUNCTION increment_missile_damage_direct(text, integer) TO service_role;
