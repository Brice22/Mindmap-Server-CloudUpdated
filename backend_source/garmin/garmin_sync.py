"""
⌚ GARMIN SYNC - Garmin Connect → HServer (runs in the garmin_sync container)
==========================================================================
Every GARMIN_SYNC_HOURS (default 2) — or right away when you press
"Sync now" in Health → ⌚ Garmin — this reads the last few days from Garmin
Connect and sends them to HServer:
  sleep (time + score) · steps · resting heart rate · stress · Body Battery
  · calories · intensity minutes · hydration · food (calories, protein,
  carbs, fat — from Garmin's food log or MyFitnessPal linked to Garmin)

Garmin has no free personal API, so this uses the open-source
`garminconnect` library and your Garmin login (GARMIN_EMAIL /
GARMIN_PASSWORD in .env). After the first login it keeps a login token in
/data (the host folder /srv/hserverdir-data/garmin) and only logs in again
when Garmin asks. If Garmin wants a code (MFA), HServer shows a box for it.

It talks to the backend over the Docker network with GARMIN_SYNC_KEY.
"""

import datetime as dt
import logging
import os
import time

import requests
from garminconnect import Garmin

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("garmin_sync")

URL = os.getenv("HSERVER_URL", "http://backend_nest:3000").rstrip("/")
KEY = os.getenv("GARMIN_SYNC_KEY", "")
EMAIL = os.getenv("GARMIN_EMAIL", "")
PASSWORD = os.getenv("GARMIN_PASSWORD", "")
TOKENS = os.getenv("GARMIN_TOKENS", "/data/tokens")
EVERY = max(0.25, float(os.getenv("GARMIN_SYNC_HOURS", "2") or 2)) * 3600
FIRST_DAYS = int(os.getenv("GARMIN_FIRST_DAYS", "30") or 30)   # first sync goes this far back
DAYS = int(os.getenv("GARMIN_DAYS", "3") or 3)                  # later syncs: today + the last few days


def api(method, path, body=None):
    try:
        r = requests.request(method, URL + path, json=body, timeout=30, headers={"x-hserver-sync-key": KEY})
        if r.status_code >= 400:
            log.warning("%s %s → %s %s", method, path, r.status_code, r.text[:200])
            return {}
        return r.json() if r.text else {}
    except Exception as e:  # backend restarting etc.
        log.warning("HServer not reachable (%s)", e)
        return {}


def status(state, message="", **extra):
    api("POST", "/api/integrations/garmin/status", {"state": state, "message": message, **extra})


def num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def first(d, *keys):
    """First value found under any of these keys (searching nested dicts too)."""
    if not isinstance(d, dict):
        return None
    for k in keys:
        if d.get(k) is not None:
            return d[k]
    for v in d.values():
        if isinstance(v, dict):
            found = first(v, *keys)
            if found is not None:
                return found
    return None


def login():
    if not EMAIL or not PASSWORD:
        status("no_credentials", "Add GARMIN_EMAIL and GARMIN_PASSWORD to .env, then restart garmin_sync.")
        return None
    os.makedirs(TOKENS, mode=0o700, exist_ok=True)
    # 1) The saved login (if Garmin turns it down and needs no code, this logs in fresh by itself)
    if os.listdir(TOKENS):
        try:
            g = Garmin(EMAIL, PASSWORD)
            g.login(TOKENS)
            return g
        except Exception as e:
            log.info("Saved Garmin login not accepted (%s) - logging in again", e)
    # 2) A fresh login, stopping for the code if Garmin sends one
    try:
        g = Garmin(EMAIL, PASSWORD, return_on_mfa=True)
        result = g.login()
        if result and result[0] == "needs_mfa":
            status("needs_mfa", "Garmin sent you a code — type it in Health → ⌚ Garmin.")
            state, deadline = result[1], time.time() + 15 * 60
            while True:
                if time.time() > deadline:
                    status("error", "No code arrived within 15 minutes. Press Sync now to try again.")
                    return None
                code = str(api("GET", "/api/integrations/garmin/poll").get("mfaCode") or "").strip()
                if code:
                    try:
                        g.resume_login(state, code)
                        break
                    except Exception as e:
                        status("needs_mfa", f"That code didn't work ({e}). Type the newest code.")
                time.sleep(5)
        # Keep the login, then open a normal session from it (loads your profile)
        g.client.dump(TOKENS)
        g = Garmin(EMAIL, PASSWORD)
        g.login(TOKENS)
        return g
    except Exception as e:
        status("error", f"Garmin login failed: {e}")
        log.exception("login failed")
        return None


def day_summary(g, day):
    s = {"day": day}
    raw = {}

    def safe(name, fn):
        try:
            raw[name] = fn()
        except Exception as e:
            log.info("%s %s: %s", name, day, e)
            raw[name] = None
        return raw[name]

    st = safe("summary", lambda: g.get_user_summary(day)) or {}
    s["steps"] = num(st.get("totalSteps"))
    s["restingHr"] = num(st.get("restingHeartRate"))
    s["stressAvg"] = num(st.get("averageStressLevel"))
    s["bodyBatteryHigh"] = num(st.get("bodyBatteryHighestValue"))
    s["bodyBatteryLow"] = num(st.get("bodyBatteryLowestValue"))
    s["caloriesTotal"] = num(st.get("totalKilocalories"))
    s["caloriesActive"] = num(st.get("activeKilocalories"))
    mod, vig = num(st.get("moderateIntensityMinutes")), num(st.get("vigorousIntensityMinutes"))
    s["intensityMinutes"] = None if mod is None and vig is None else (mod or 0) + 2 * (vig or 0)

    sl = safe("sleep", lambda: g.get_sleep_data(day)) or {}
    dto = sl.get("dailySleepDTO") or {}
    s["sleepSeconds"] = num(dto.get("sleepTimeSeconds"))
    score = ((dto.get("sleepScores") or {}).get("overall") or {}).get("value")
    s["sleepScore"] = num(score)

    hy = safe("hydration", lambda: g.get_hydration_data(day)) or {}
    s["hydrationMl"] = num(hy.get("valueInML"))

    food = safe("food", lambda: g.get_calorie_summary(day, day, day)) or {}
    s["foodCalories"] = num(first(food, "consumedCalories", "totalCalories", "calories", "consumedKilocalories"))
    s["proteinG"] = num(first(food, "protein", "consumedProtein", "proteinGrams"))
    s["carbsG"] = num(first(food, "carbohydrates", "consumedCarbohydrates", "carbs", "carbohydrateGrams"))
    s["fatG"] = num(first(food, "fat", "consumedFat", "fatGrams"))

    s["raw"] = raw
    return s


def sync(g, days):
    today = dt.date.today()
    out = []
    for i in range(days - 1, -1, -1):
        d = (today - dt.timedelta(days=i)).isoformat()
        out.append(day_summary(g, d))
        time.sleep(1)   # be gentle with Garmin
    api("POST", "/api/integrations/garmin/ingest", {"days": out})
    status("ok", f"Synced {len(out)} day(s)", lastSync=dt.datetime.now().isoformat(timespec="seconds"))
    log.info("synced %s day(s)", len(out))


def main():
    if not KEY:
        log.error("GARMIN_SYNC_KEY is not set — add it to .env (same value for backend_nest and garmin_sync)")
    g, first_run, last = None, True, 0.0
    while True:
        poll = api("GET", "/api/integrations/garmin/poll")
        due = time.time() - last >= EVERY
        if due or poll.get("syncRequested"):
            if g is None:
                g = login()
            if g is not None:
                try:
                    status("syncing", "Reading Garmin Connect…")
                    sync(g, FIRST_DAYS if first_run else DAYS)
                    first_run = False
                except Exception as e:
                    status("error", f"Sync failed: {e}")
                    log.exception("sync failed")
                    g = None   # log in again next time
            last = time.time()
        time.sleep(60)


if __name__ == "__main__":
    main()