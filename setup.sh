#!/bin/bash
# LensAI — One-command setup script
set -e

echo "🔍 LensAI Setup"
echo "=========================="

# ── Backend ──────────────────────────────────────────────────────────────────

echo ""
echo "📦 Setting up backend..."
cd backend

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created backend/.env — fill in your API keys before running"
fi

if command -v docker &> /dev/null; then
  echo "🐳 Docker found — starting Redis + PostgreSQL..."
  docker-compose up -d db redis
  echo "✅ Infrastructure started"
else
  echo "⚠️  Docker not found. Install Docker Desktop or start Redis/PostgreSQL manually."
fi

if command -v python3 &> /dev/null; then
  python3 -m venv venv
  source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
  pip install -r requirements.txt -q
  echo "✅ Python dependencies installed"
else
  echo "⚠️  Python 3 not found. Install Python 3.12+."
fi

cd ..

# ── Extension ─────────────────────────────────────────────────────────────────

echo ""
echo "🧩 Setting up extension..."
cd extension

if command -v node &> /dev/null; then
  npm install --silent
  npm run build
  echo "✅ Extension built → extension/dist/"
else
  echo "⚠️  Node.js not found. Install Node.js 18+ to build the extension."
fi

cd ..

echo ""
echo "=========================="
echo "✅ LensAI Setup Complete!"
echo ""
echo "Next steps:"
echo "  1. Add your ANTHROPIC_API_KEY to backend/.env"
echo "  2. Start the backend:  cd backend && uvicorn app.main:app --reload"
echo "  3. Load the extension: chrome://extensions → Load unpacked → select extension/dist/"
echo "  4. Press Ctrl+Shift+L on any page to start scanning!"
echo ""
