from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
import models  # noqa: F401
from database import Base, engine
from routers import admin, auth, dashboard, logs, recommendations, users, wellness

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Food Tracker", version="1.0.0")

_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "https://nutribooai.netlify.app",
]
_env_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
origins = list({*_DEFAULT_ORIGINS, *_env_origins})
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # Also allow any netlify.app deploy preview (pr-123--nutribooai.netlify.app)
    allow_origin_regex=r"https://([a-z0-9-]+--)?nutribooai\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    from scripts.migrate_v2 import run as migrate_v2
    from scripts.migrate_v3 import run as migrate_v3
    from scripts.migrate_v4 import run as migrate_v4
    from scripts.migrate_v5 import run as migrate_v5
    from scripts.migrate_v6 import run as migrate_v6
    migrate_v2()
    migrate_v3()
    migrate_v4()
    migrate_v5()
    migrate_v6()
    Base.metadata.create_all(bind=engine)


@app.get("/")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(logs.router)
app.include_router(dashboard.router)
app.include_router(recommendations.router)
app.include_router(admin.router)
app.include_router(wellness.router)
