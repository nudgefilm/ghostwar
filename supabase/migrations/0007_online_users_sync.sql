-- Atomic online_users adjustment (GREATEST prevents negative values)
CREATE OR REPLACE FUNCTION adjust_online_users(p_code text, p_delta integer)
RETURNS void AS $$
BEGIN
  UPDATE countries
  SET online_users = GREATEST(0, online_users + p_delta)
  WHERE code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION adjust_online_users(text, integer) TO service_role;

-- Trigger: auto-sync online_users on INSERT or country_code UPDATE
CREATE OR REPLACE FUNCTION sync_players_online_users()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM adjust_online_users(NEW.country_code, 1);
  ELSIF TG_OP = 'UPDATE' AND OLD.country_code IS DISTINCT FROM NEW.country_code THEN
    PERFORM adjust_online_users(OLD.country_code, -1);
    PERFORM adjust_online_users(NEW.country_code, 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS players_online_users_sync ON players;
CREATE TRIGGER players_online_users_sync
  AFTER INSERT OR UPDATE OF country_code ON players
  FOR EACH ROW EXECUTE FUNCTION sync_players_online_users();

-- Enable Realtime for countries table so clients receive UPDATE events instantly
ALTER PUBLICATION supabase_realtime ADD TABLE countries;
