-- =========================================================================
-- 2026-07-01 — admin_activate_user MEGERŐSÍTÉS: már-aktív fiók egyházközsége is átállítható
-- =========================================================================
-- KONTEXTUS (Bug 2 gyökér-megelőzés):
--   Az eredeti admin_activate_user (2026-05-04) a congregation_id / diocese_id /
--   district_id mezőket CSAK akkor írta be, ha a profil épp `pending` volt
--   (IF v_prev_status <> 'pending' THEN RETURN … no-op). Ezért egy MÁR AKTÍV
--   második fiók egyházközségét az admin felületről nem lehetett (újra)beállítani —
--   így maradt NULL/rossz a skalár, és az RLS nem engedett adatot.
--
-- VÁLTOZÁS:
--   - pending → active: változatlan (a COALESCE beírja a megadott mezőket).
--   - MÁR aktív: ha van megadott org-mező (congregation/diocese/district), azt most
--     COALESCE-szel beírjuk (a státusz marad 'active'), és was_updated = TRUE-t adunk,
--     ha ténylegesen változott valami. Ha nincs megadott mező, a régi no-op viselkedés.
--   - A jogosultság-ellenőrzés (admin/master/kerületi admin) változatlan.
--
-- Ez visszafelé kompatibilis: eddig a már-aktív ág úgyis csak no-op volt.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.admin_activate_user(
  p_user_id          uuid,
  p_congregation_id  uuid DEFAULT NULL,
  p_diocese_id       uuid DEFAULT NULL,
  p_district_id      uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id          uuid,
  previous_status  text,
  new_status       text,
  was_updated      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev_status text;
  v_changed     boolean;
BEGIN
  -- Jogosultság check
  IF NOT public.is_caller_admin_for_user_mgmt() THEN
    RAISE EXCEPTION 'Nincs jogosultsága a felhasználó aktiválására (admin / master / kerületi admin szükséges).'
      USING HINT = 'Lépjen be admin fiókkal vagy kérjen jogosultságot.';
  END IF;

  -- Előző status
  SELECT status INTO v_prev_status FROM public.profiles WHERE id = p_user_id;

  IF v_prev_status IS NULL THEN
    RAISE EXCEPTION 'A felhasználó nem található (id=%).', p_user_id;
  END IF;

  IF v_prev_status = 'pending' THEN
    -- pending → active (a megadott org-mezőkkel)
    UPDATE public.profiles
       SET status          = 'active',
           congregation_id = COALESCE(p_congregation_id, congregation_id),
           diocese_id      = COALESCE(p_diocese_id, diocese_id),
           district_id     = COALESCE(p_district_id, district_id)
     WHERE id = p_user_id;
    RETURN QUERY SELECT p_user_id, v_prev_status, 'active'::text, TRUE;
    RETURN;
  END IF;

  -- MÁR aktív (vagy más nem-pending): ha van megadott org-mező, azt beírjuk (a Bug 2
  -- gyökerének megelőzésére), egyébként no-op a régi szerződés szerint.
  IF v_prev_status = 'active'
     AND (p_congregation_id IS NOT NULL OR p_diocese_id IS NOT NULL OR p_district_id IS NOT NULL) THEN
    UPDATE public.profiles
       SET congregation_id = COALESCE(p_congregation_id, congregation_id),
           diocese_id      = COALESCE(p_diocese_id, diocese_id),
           district_id     = COALESCE(p_district_id, district_id)
     WHERE id = p_user_id
       AND (
         congregation_id IS DISTINCT FROM COALESCE(p_congregation_id, congregation_id)
         OR diocese_id   IS DISTINCT FROM COALESCE(p_diocese_id, diocese_id)
         OR district_id  IS DISTINCT FROM COALESCE(p_district_id, district_id)
       );
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RETURN QUERY SELECT p_user_id, v_prev_status, v_prev_status, (v_changed > 0);
    RETURN;
  END IF;

  -- Egyébként: no-op (a korábbi viselkedés)
  RETURN QUERY SELECT p_user_id, v_prev_status, v_prev_status, FALSE;
END;
$$;

COMMENT ON FUNCTION public.admin_activate_user(uuid, uuid, uuid, uuid) IS
  $$Pending profiles → active. Csak admin / master / kerületi admin hívhatja. Az opcionális
    congregation_id / diocese_id / district_id COALESCE-szel íródik. 2026-07-01: már AKTÍV
    fiókra is beírja a megadott org-mezőket (Bug 2 megelőzés), egyébként no-op.$$;

GRANT EXECUTE ON FUNCTION public.admin_activate_user(uuid, uuid, uuid, uuid) TO authenticated;
