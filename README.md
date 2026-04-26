# 🎯 CampaignIQ — AI-Powered Campaign Performance Platform

> 🥈 **2nd Place — DataSprint, Innovation 2026** | MKSSS Cummins College of Engineering for Women

![Python](https://img.shields.io/badge/Python-3.11-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green) ![React](https://img.shields.io/badge/React-18-61DAFB) ![sklearn](https://img.shields.io/badge/scikit--learn-1.6-orange)

---

## 📌 Overview

CampaignIQ is an end-to-end ML-powered platform that transforms raw digital marketing campaign data into actionable revenue predictions and strategic insights.

A digital marketing firm runs campaigns across Search, Social, Display, Email, Video and Affiliate channels — generating thousands of data points with no predictive system. CampaignIQ solves this by predicting campaign revenue before launch, classifying campaign health, and providing AI-driven recommendations.

---

## ✨ Features

- 📊 **Analytics Dashboard** — Upload any campaign CSV and get instant visual insights
- 💰 **Revenue Predictor** — Predict campaign revenue with 89% accuracy (R² = 0.89)
- 📁 **Batch Predictions** — Upload CSV for bulk campaign predictions with success/risk flags
- 🤖 **AI Campaign Advisor** — NLP-powered chat for campaign strategy recommendations
- 🏆 **Campaign Tier System** — Star / Core / Question / Dog classification (BCG Matrix style)
- 📈 **SHAP Explainability** — Understand exactly what drives each prediction

---

## 🧠 ML Pipeline

### Dataset
- 2,540 campaigns, 18 features
- Channels: Search, Social, Display, Email, Video, Affiliate
- Target: revenue_usd

### Preprocessing
- Removed duplicates and imputed missing values
- Log-transformed skewed features (impressions, clicks, spend, conversions)
- Engineered features: CPC, CPA, ROAS
- One-hot encoded 5 categorical columns
- Extracted time features: month, day of week, quarter

### Models Trained
| Model | CV R² | Test R² | Status |
|-------|-------|---------|--------|
| Ridge Regression | 0.83 | 0.89 | ✅ Best |
| Random Forest | 0.81 | 0.85 | Good |
| XGBoost | 0.84 | 0.82 | Borderline overfit |

### Explainability
- SHAP summary plots, beeswarm, waterfall plots
- LIME local explanations
- Top driver: conversion_rate_pct

---

## 📊 Key Insights

| Insight | Value |
|---------|-------|
| Best Channel | Search — \,269 avg revenue |
| Best Region | East — \,318 avg revenue |
| Best Device | Tablet — \,479 avg revenue |
| Median ROAS | 3.06x |
| Success Rate | Only 25% of campaigns successful |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, uvicorn |
| ML | scikit-learn, XGBoost, SHAP, LIME |
| Frontend | React, Vite, Recharts, React Router |
| AI Layer | OpenAI GPT-3.5 |
| Data | pandas, numpy, joblib |

---

## 📁 Project Structure

\\\
campaigniq/
├── backend/
│   ├── main.py                    # FastAPI app — 6 endpoints
│   ├── requirements.txt
│   ├── digital_media_dataset.csv  # Training dataset
│   └── models/                    # .pkl files (not tracked)
│       ├── best_model.pkl
│       ├── scaler.pkl
│       └── feature_names.pkl
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.jsx      # Analytics overview
        │   ├── Predict.jsx        # Revenue predictor
        │   ├── UploadCSV.jsx      # Batch predictions
        │   └── Advisor.jsx        # AI chat advisor
        └── App.jsx
\\\

---

## 🚀 How to Run

### Backend
\\\ash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
\\\
API runs at: http://localhost:8000
Docs at: http://localhost:8000/docs

### Frontend
\\\ash
cd frontend
npm install
npm run dev
\\\
App runs at: http://localhost:5173

### Environment Variables
Create \ackend/.env\:
\\\
OPENAI_API_KEY=your_key_here
\\\

---

## 🏆 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /predict | Single campaign revenue prediction |
| POST | /classify | Campaign tier + success/churn flags |
| GET | /analytics | Dataset-wide summary stats |
| POST | /analytics-upload | Dynamic analytics from uploaded CSV |
| POST | /upload-csv | Batch predictions on uploaded CSV |
| POST | /advisor | NLP AI campaign advisor |

---

## 👥 Team

- **Shrishti** 
- **Sanika Devkule**
- **Vishnupriya Lappasi**

---

## 🙏 Mentors

Ravi Kukreja · Amit Anand · Mehul Savhdeva · Pankaj Pawar · Utkarsh Bias · Parul Rupalriyas · Pankaj Jadhav · Disha Khanapurkar

---

## 📄 License

MIT License — feel free to use and build upon this project.
