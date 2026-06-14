-- Periodic recovery: decrement damage_stack by p_delta_stack for all
-- countries that have taken damage. Called once per minute from the client.
CREATE OR REPLACE FUNCTION recover_countries(p_delta_stack integer DEFAULT 10)
RETURNS TABLE(code text, new_stack integer, new_percent float) LANGUAGE sql AS $$
  UPDATE countries
  SET
    damage_stack   = GREATEST(0, damage_stack - p_delta_stack),
    damage_percent = GREATEST(0, FLOOR(GREATEST(0, damage_stack - p_delta_stack)::float / 10))
  WHERE damage_stack > 0
  RETURNING code, damage_stack, damage_percent;
$$;

GRANT EXECUTE ON FUNCTION recover_countries(integer) TO service_role;
