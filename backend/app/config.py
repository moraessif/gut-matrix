import os

SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "14"))
STALE_DAYS = int(os.environ.get("STALE_DAYS", "7"))          # "problems without updates" threshold
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "auto")     # "1", "0" or "auto" (secure when request is https)
SUPERADMIN_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "admin@example.com")
SUPERADMIN_NAME = os.environ.get("SUPERADMIN_NAME", "Super Admin")
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "")  # if empty a random one is generated and logged once
# Signs the login cookie. Required in production (any long random string); a dev default keeps local runs working.
SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-only-change-me")
