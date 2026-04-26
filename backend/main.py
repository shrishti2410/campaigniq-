import io
import os
from pathlib import Path
from contextlib import asynccontextmanager

import joblib
import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.linear_model import RidgeClassifier
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from database import engine, get_db
import models as db_models
import schemas as user_schemas
import crud
import auth

# ---------------------------------------------------------------------------
# Custom estimator — must be defined before joblib.load() calls so pickle
# can resolve the class when deserialising models that use it.
# ---------------------------------------------------------------------------
class RidgeClassifierWithProba(BaseEstimator, ClassifierMixin):
    def __init__(self, alpha=1.0):
        self.alpha = alpha
        self.model = RidgeClassifier(alpha=self.alpha)

    def fit(self, X, y):
        self.model = RidgeClassifier(alpha=self.alpha)
        self.model.fit(X, y)
        self.classes_ = self.model.classes_
        return self

    def predict(self, X):
        return self.model.predict(X)

    def decision_function(self, X):
        return self.model.decision_function(X)

    def predict_proba(self, X):
        scores = self.decision_function(X)
        probs_pos = 1 / (1 + np.exp(-scores))
        probs_neg = 1 - probs_pos
        return np.column_stack([probs_neg, probs_pos])


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
DATA_PATH = BASE_DIR / "digital_media_dataset.csv"


# ---------------------------------------------------------------------------
# Model registry – populated at startup
# ---------------------------------------------------------------------------
models: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables on startup
    db_models.Base.metadata.create_all(bind=engine)

    for name, filename in [
        ("revenue_model",       "best_model.pkl"),
        ("scaler",              "scaler.pkl"),
        ("feature_names",       "feature_names.pkl"),
        ("success_classifier",  "success_classifier.pkl"),
        ("churn_classifier",    "churn_classifier.pkl"),
        ("label_encoder",       "label_encoder.pkl"),
    ]:
        path = MODELS_DIR / filename
        if not path.exists():
            print(f"[startup] WARNING: {filename} not found, {name} will be unavailable")
            models[name] = None
            continue
        try:
            models[name] = joblib.load(path)
            print(f"[startup] Loaded {filename}")
        except Exception as exc:
            print(f"[startup] WARNING: failed to load {filename}: {exc}")
            models[name] = None
    yield
    models.clear()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="DataSprint API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@app.post("/token", response_model=user_schemas.Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = crud.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/users/", response_model=user_schemas.User)
def register_user(user: user_schemas.UserCreate, db: Session = Depends(get_db)):
    if crud.get_user_by_username(db, username=user.username):
        raise HTTPException(status_code=400, detail="Username already registered")
    return crud.create_user(db=db, user=user)


@app.get("/users/me", response_model=user_schemas.User)
def read_users_me(current_user=Depends(auth.get_current_active_user)):
    return current_user


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class CampaignFeatures(BaseModel):
    channel: str
    region: str
    device_type: str
    audience_segment: str
    campaign_objective: str
    impressions: float
    clicks: float
    spend_usd: float
    conversions: float
    ctr_pct: float = 0.0
    conversion_rate_pct: float = 0.0
    bounce_rate_pct: float = 50.0
    session_duration_sec: float = 120.0
    audience_age: float = 30.0
    ad_quality_score: float = 5.0
    month: int = 1
    day_of_week: int = 0
    quarter: int = 1


class PredictResponse(BaseModel):
    revenue_usd: float


class ClassifyResponse(BaseModel):
    tier: str
    is_successful: bool
    churn_risk: str


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------
def preprocess_for_prediction(data: CampaignFeatures) -> pd.DataFrame:
    # 1. Log-transform numeric inputs
    log_impressions = np.log1p(data.impressions)
    log_clicks      = np.log1p(data.clicks)
    log_spend_usd   = np.log1p(data.spend_usd)
    log_conversions = np.log1p(data.conversions)

    # 2. Engineered features (revenue_usd=0 at prediction time → roas=0)
    cpc  = data.spend_usd / data.clicks      if data.clicks      > 0 else 0.0
    cpa  = data.spend_usd / data.conversions if data.conversions > 0 else 0.0
    roas = 0.0  # revenue unknown at prediction time

    # 3. Base numeric row
    row = {
        "log_impressions": log_impressions,
        "log_clicks":      log_clicks,
        "log_spend_usd":   log_spend_usd,
        "log_conversions": log_conversions,
        "cpc":                  cpc,
        "cpa":                  cpa,
        "roas":                 roas,
        "ctr_pct":              data.ctr_pct,
        "conversion_rate_pct":  data.conversion_rate_pct,
        "bounce_rate_pct":      data.bounce_rate_pct,
        "session_duration_sec": data.session_duration_sec,
        "audience_age":         data.audience_age,
        "ad_quality_score":     data.ad_quality_score,
        "month":                data.month,
        "day_of_week":          data.day_of_week,
        "quarter":              data.quarter,
    }

    # 4. One-hot encode categoricals
    cat_df = pd.get_dummies(pd.DataFrame([{
        "channel":            data.channel,
        "region":             data.region,
        "device_type":        data.device_type,
        "audience_segment":   data.audience_segment,
        "campaign_objective": data.campaign_objective,
    }]))
    row.update(cat_df.iloc[0].to_dict())

    # 5. Align to the exact columns the scaler/model were trained on
    feature_names = models.get("feature_names")
    if feature_names is None:
        raise HTTPException(status_code=503, detail="feature_names not loaded")

    df = pd.DataFrame([row]).reindex(columns=feature_names, fill_value=0)
    return df


# ---------------------------------------------------------------------------
# POST /predict
# ---------------------------------------------------------------------------
@app.post("/predict", response_model=PredictResponse)
def predict(data: CampaignFeatures, _=Depends(auth.get_current_active_user)):
    model  = models.get("revenue_model")
    scaler = models.get("scaler")
    if model is None:
        raise HTTPException(status_code=503, detail="Revenue model not loaded")
    if scaler is None:
        raise HTTPException(status_code=503, detail="Scaler not loaded")

    df = preprocess_for_prediction(data)
    df_scaled  = scaler.transform(df)
    prediction = model.predict(df_scaled)[0]

    return PredictResponse(revenue_usd=float(np.expm1(prediction)))


# ---------------------------------------------------------------------------
# POST /classify
# ---------------------------------------------------------------------------
@app.post("/classify", response_model=ClassifyResponse)
def classify(data: CampaignFeatures, _=Depends(auth.get_current_active_user)):
    success_model = models.get("success_classifier")
    churn_model   = models.get("churn_classifier")
    scaler        = models.get("scaler")

    if success_model is None:
        raise HTTPException(status_code=503, detail="success_classifier not loaded")
    if churn_model is None:
        raise HTTPException(status_code=503, detail="churn_classifier not loaded")
    if scaler is None:
        raise HTTPException(status_code=503, detail="Scaler not loaded")

    df        = preprocess_for_prediction(data)
    df_scaled = scaler.transform(df)

    is_successful = bool(success_model.predict(df_scaled)[0])
    churn_risk    = str(churn_model.predict(df_scaled)[0])

    label_encoder = models.get("label_encoder")
    if label_encoder is not None:
        tier = str(label_encoder.inverse_transform(
            success_model.predict(df_scaled)
        )[0])
    else:
        tier = "Unknown"

    return ClassifyResponse(
        tier=str(tier),
        is_successful=bool(is_successful),
        churn_risk=str(churn_risk),
    )


# ---------------------------------------------------------------------------
# POST /upload-csv
# ---------------------------------------------------------------------------
@app.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...), _=Depends(auth.get_current_active_user)):
    model  = models.get("revenue_model")
    scaler = models.get("scaler")
    if model is None:
        raise HTTPException(status_code=503, detail="Revenue model not loaded")
    if scaler is None:
        raise HTTPException(status_code=503, detail="Scaler not loaded")

    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    df.columns = df.columns.str.lower()

    required_cols = {"channel", "region", "device_type", "audience_segment",
                     "campaign_objective", "impressions", "clicks", "spend_usd", "conversions"}
    missing = required_cols - set(df.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"CSV missing required columns: {missing}")

    has_actual = "revenue_usd" in df.columns

    results = []
    for idx, row in df.iterrows():
        try:
            features = CampaignFeatures(
                channel=str(row.get("channel", "")),
                region=str(row.get("region", "")),
                device_type=str(row.get("device_type", "")),
                audience_segment=str(row.get("audience_segment", "")),
                campaign_objective=str(row.get("campaign_objective", "")),
                impressions=float(row.get("impressions", 0) or 0),
                clicks=float(row.get("clicks", 0) or 0),
                spend_usd=float(row.get("spend_usd", 0) or 0),
                conversions=float(row.get("conversions", 0) or 0),
                ctr_pct=float(row.get("ctr_pct", 0) or 0),
                conversion_rate_pct=float(row.get("conversion_rate_pct", 0) or 0),
                bounce_rate_pct=float(row.get("bounce_rate_pct", 50) or 50),
                session_duration_sec=float(row.get("session_duration_sec", 120) or 120),
                audience_age=float(row.get("audience_age", 30) or 30),
                ad_quality_score=float(row.get("ad_quality_score", 5) or 5),
                month=int(row.get("month", 1) or 1),
                day_of_week=int(row.get("day_of_week", 0) or 0),
                quarter=int(row.get("quarter", 1) or 1),
            )
            processed   = preprocess_for_prediction(features)
            scaled      = scaler.transform(processed)
            predicted   = float(np.expm1(model.predict(scaled)[0]))
            actual      = float(row["revenue_usd"]) if has_actual and pd.notna(row.get("revenue_usd")) else None
            difference  = round(actual - predicted, 2) if actual is not None else None

            results.append({
                "row_number":          int(idx) + 1,
                "channel":             features.channel,
                "region":              features.region,
                "device_type":         features.device_type,
                "impressions":         int(features.impressions),
                "clicks":              int(features.clicks),
                "spend_usd":           round(features.spend_usd, 2),
                "actual_revenue_usd":  round(actual, 2) if actual is not None else None,
                "predicted_revenue_usd": round(predicted, 2),
                "difference":          difference,
            })
        except Exception as exc:
            results.append({
                "row_number":          int(idx) + 1,
                "error":               str(exc),
            })

    return {"rows": results, "total": len(results)}


# ---------------------------------------------------------------------------
# GET /analytics
# ---------------------------------------------------------------------------
@app.get("/analytics")
def analytics():
    if not DATA_PATH.exists():
        raise HTTPException(status_code=404, detail=f"Dataset not found at {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)
    df.columns = df.columns.str.lower()

    required = {"revenue_usd", "spend_usd", "channel", "region", "device_type", "audience_segment"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Dataset missing expected columns: {missing}",
        )

    df["roas"] = df["revenue_usd"] / df["spend_usd"].replace(0, float("nan"))

    avg_by_channel  = df.groupby("channel")["revenue_usd"].mean().round(2)
    avg_by_region   = df.groupby("region")["revenue_usd"].mean().round(2)
    avg_by_device   = df.groupby("device_type")["revenue_usd"].mean().round(2)
    avg_by_audience = df.groupby("audience_segment")["revenue_usd"].mean().round(2)

    perf_cols = ["channel", "region", "device_type", "revenue_usd", "spend_usd"]
    top_performers = (
        df.nlargest(5, "revenue_usd")[perf_cols]
        .round(2)
        .to_dict(orient="records")
    )

    return {
        "total_campaigns":        int(len(df)),
        "total_revenue":          round(float(df["revenue_usd"].sum()), 2),
        "avg_revenue":            round(float(df["revenue_usd"].mean()), 2),
        "best_channel":           str(avg_by_channel.idxmax()),
        "best_region":            str(avg_by_region.idxmax()),
        "best_device":            str(avg_by_device.idxmax()),
        "best_audience":          str(avg_by_audience.idxmax()),
        "median_roas":            round(float(df["roas"].median()), 4),
        "avg_revenue_by_channel":     avg_by_channel.to_dict(),
        "avg_revenue_by_region":      avg_by_region.to_dict(),
        "avg_revenue_by_device_type": avg_by_device.to_dict(),
        "avg_revenue_by_audience":    avg_by_audience.to_dict(),
        "successful_campaigns":   int((df["revenue_usd"] > 19000).sum()),
        "at_risk_campaigns":      int((df["revenue_usd"] < 5000).sum()),
        "star_campaigns":         int((df["revenue_usd"] > 25000).sum()),
        "top_performers":         top_performers,
    }


# ---------------------------------------------------------------------------
# POST /analytics-upload  — compute analytics from an uploaded CSV
# ---------------------------------------------------------------------------
@app.post("/analytics-upload")
async def analytics_upload(file: UploadFile = File(...), _=Depends(auth.get_current_active_user)):
    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    df.columns = df.columns.str.lower()

    required = {"revenue_usd", "spend_usd", "channel", "region", "device_type"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"CSV missing required columns: {missing}")

    df["roas"] = df["revenue_usd"] / df["spend_usd"].replace(0, float("nan"))

    avg_by_channel  = df.groupby("channel")["revenue_usd"].mean().round(2)
    avg_by_region   = df.groupby("region")["revenue_usd"].mean().round(2)
    avg_by_device   = df.groupby("device_type")["revenue_usd"].mean().round(2)

    has_audience    = "audience_segment" in df.columns
    avg_by_audience = (
        df.groupby("audience_segment")["revenue_usd"].mean().round(2)
        if has_audience else pd.Series(dtype=float)
    )

    perf_cols    = [c for c in ["channel", "region", "device_type", "revenue_usd", "spend_usd"] if c in df.columns]
    top_5        = df.nlargest(5, "revenue_usd")[perf_cols].round(2).to_dict(orient="records")

    total        = len(df)
    successful   = int((df["revenue_usd"] > 19000).sum())
    at_risk      = int((df["revenue_usd"] < 5000).sum())
    star         = int((df["revenue_usd"] > 25000).sum())
    core         = int(((df["revenue_usd"] >= 10000) & (df["revenue_usd"] <= 25000)).sum())
    question     = int(((df["revenue_usd"] >= 5000) & (df["revenue_usd"] < 10000)).sum())
    dog          = int((df["revenue_usd"] < 5000).sum())
    success_rate = round(successful / total * 100, 1) if total > 0 else 0.0

    best_ch  = str(avg_by_channel.idxmax())  if len(avg_by_channel)  > 0 else "N/A"
    best_reg = str(avg_by_region.idxmax())   if len(avg_by_region)   > 0 else "N/A"
    best_dev = str(avg_by_device.idxmax())   if len(avg_by_device)   > 0 else "N/A"
    best_aud = str(avg_by_audience.idxmax()) if len(avg_by_audience) > 0 else "N/A"

    # Compute improvement tips from data patterns
    tips: list[str] = []
    if success_rate < 30:
        tips.append(
            "Low success rate — shift underperforming campaigns to the Search channel, "
            f"which averages {fmtk(float(avg_by_channel.get('Search', avg_by_channel.max())))} revenue"
        )
    if "bounce_rate_pct" in df.columns:
        avg_bounce = float(df["bounce_rate_pct"].mean())
        if avg_bounce > 55:
            tips.append(
                f"Average bounce rate is {avg_bounce:.0f}% — improve landing page "
                "relevance and load speed to convert more visitors"
            )
    if "conversion_rate_pct" in df.columns:
        avg_conv = float(df["conversion_rate_pct"].mean())
        if avg_conv < 3:
            tips.append(
                f"Average conversion rate is {avg_conv:.1f}% — refine audience "
                "targeting and creative messaging to boost conversions"
            )
    if len(tips) < 3:
        tips.append(
            f"Your top-performing channel is {best_ch} "
            f"(avg {fmtk(float(avg_by_channel.max()))} revenue) — allocate a larger share of budget there"
        )
    if len(tips) < 4:
        tips.append(
            f"The {best_reg} region shows the highest average revenue in your data "
            "— concentrate regional spend there for better returns"
        )

    return {
        "file_name":                    file.filename,
        "total_campaigns":              total,
        "total_revenue":                round(float(df["revenue_usd"].sum()), 2),
        "avg_revenue":                  round(float(df["revenue_usd"].mean()), 2),
        "best_channel":                 best_ch,
        "best_region":                  best_reg,
        "best_device":                  best_dev,
        "best_audience":                best_aud,
        "median_roas":                  round(float(df["roas"].median()), 4),
        "avg_revenue_by_channel":       avg_by_channel.to_dict(),
        "avg_revenue_by_region":        avg_by_region.to_dict(),
        "avg_revenue_by_device_type":   avg_by_device.to_dict(),
        "avg_revenue_by_audience":      avg_by_audience.to_dict() if has_audience else {},
        "successful_campaigns":         successful,
        "at_risk_campaigns":            at_risk,
        "star_campaigns":               star,
        "core_campaigns":               core,
        "question_campaigns":           question,
        "dog_campaigns":                dog,
        "success_rate":                 success_rate,
        "top_performers":               top_5,
        "improvement_tips":             tips[:5],
    }


# ---------------------------------------------------------------------------
# Google Ads endpoints
# ---------------------------------------------------------------------------
@app.get("/google-ads/campaigns")
def google_ads_campaigns(_=Depends(auth.get_current_active_user)):
    try:
        from google_ads_service import fetch_campaign_metrics
        return {"campaigns": fetch_campaign_metrics()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/google-ads/summary")
def google_ads_summary(_=Depends(auth.get_current_active_user)):
    try:
        from google_ads_service import fetch_summary
        return fetch_summary()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/google-ads/sync")
def google_ads_sync(_=Depends(auth.get_current_active_user)):
    from datetime import datetime, timezone
    try:
        from google_ads_service import fetch_summary
        data = fetch_summary()
        data["synced_at"] = datetime.now(timezone.utc).isoformat()
        return data
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


def fmtk(n: float) -> str:
    """Format a dollar amount compactly, e.g. $33.3k"""
    if n >= 1_000_000:
        return f"${n/1_000_000:.1f}M"
    if n >= 1000:
        return f"${n/1000:.1f}k"
    return f"${n:.0f}"


# ---------------------------------------------------------------------------
# POST /advisor
# ---------------------------------------------------------------------------
ADVISOR_SYSTEM_PROMPT = """You are an expert digital marketing campaign advisor with deep knowledge \
of the DataSprint analytics platform. You have access to campaign performance data showing: \
Search is the top channel ($33,269 avg revenue), East is the top region ($23,318 avg revenue), \
Tablet performs best by device ($21,479 avg revenue), median ROAS is 3.06x. \
The ML model predicts revenue using Ridge Regression with 89% accuracy. \
When users describe their campaign plans, ask clarifying questions if needed \
(budget, target audience, channel preference, campaign objective, region). \
Once you have enough info, provide: \
1) Predicted performance tier (Star >$25k / Core $10k-$25k / Question Mark $5k-$10k / Underperformer <$5k), \
2) Recommended channel and region, \
3) Expected ROAS range, \
4) 3 specific actionable tips. \
Keep responses concise and data-driven. Never use markdown headers, use plain prose."""


class AdvisorMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class AdvisorRequest(BaseModel):
    messages: list[AdvisorMessage]
    campaign_context: dict = {}
    system_prompt: str = ""   # when set, replaces the default advisor system prompt
    max_tokens: int = 500     # allow callers to request longer responses (e.g. 1200 for reports)


class AdvisorResponse(BaseModel):
    response: str
    needs_more_info: bool
    suggested_questions: list[str]


@app.post("/advisor", response_model=AdvisorResponse)
async def advisor(body: AdvisorRequest, _=Depends(auth.get_current_active_user)):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured in backend/.env")

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
    except ImportError:
        raise HTTPException(status_code=503, detail="openai package not installed — run: pip install openai")

    if not body.messages:
        raise HTTPException(status_code=400, detail="messages list is empty")

    system = body.system_prompt.strip() if body.system_prompt.strip() else ADVISOR_SYSTEM_PROMPT
    openai_msgs = [{"role": "system", "content": system}]
    openai_msgs += [{"role": m.role, "content": m.content} for m in body.messages]

    try:
        completion = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=openai_msgs,
            max_tokens=body.max_tokens,
            temperature=0.7,
        )
        text = completion.choices[0].message.content.strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {exc}")

    # Determine if the AI is asking for more info (contains a question, short response)
    needs_more_info = "?" in text and len(text) < 600

    # Suggest contextual follow-ups based on what hasn't been mentioned yet
    conv_lower = " ".join(m.content.lower() for m in body.messages)
    suggested: list[str] = []
    if not any(w in conv_lower for w in ["budget", "$", "spend", "usd"]):
        suggested.append("My total budget is $5,000")
    if not any(w in conv_lower for w in ["channel", "search", "social", "email", "display", "video", "affiliate"]):
        suggested.append("I want to run Search and Social ads")
    if not any(w in conv_lower for w in ["audience", "segment", "millennial", "gen z", "boomer", "gen x"]):
        suggested.append("My target audience is Millennials aged 25-35")
    if not any(w in conv_lower for w in ["region", "north", "south", "east", "west", "central"]):
        suggested.append("I'm targeting the East region")
    if not any(w in conv_lower for w in ["objective", "goal", "awareness", "sales", "leads", "traffic", "install"]):
        suggested.append("My campaign objective is Sales")
    suggested = suggested[:3]

    return AdvisorResponse(response=text, needs_more_info=needs_more_info, suggested_questions=suggested)
