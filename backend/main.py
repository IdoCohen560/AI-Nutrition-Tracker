from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
import models  # noqa: F401
from database import Base, engine
from routers import auth, dashboard, logs, recommendations, users

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Food Tracker", version="1.0.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(logs.router)
app.include_router(dashboard.router)
app.include_router(recommendations.router)
