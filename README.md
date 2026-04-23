# Home Suite

Un serveur unique pour deux apps maison — HomeRadar et Courses.

---

## Développement local

```bash
# Créer le virtualenv (une seule fois)
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# Lancer
cd backend
../.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Accès : http://localhost:8000

---

## Déploiement VPS (Docker + Nginx + HTTPS)

### 1. Sur le VPS — première installation

```bash
# Cloner le dépôt
git clone <url-du-repo> home_suite
cd home_suite

# Lancer l'application
docker compose up -d --build

# Vérifier que ça tourne
docker compose ps
docker compose logs -f
```

### 2. Nginx — remplacer la configuration existante

```bash
# Copier le fichier de conf
sudo cp nginx/home_suite.conf /etc/nginx/sites-available/home_suite

# Désactiver les anciens sites si besoin
sudo rm -f /etc/nginx/sites-enabled/default
sudo rm -f /etc/nginx/sites-enabled/<ancien-site>

# Activer le nouveau site
sudo ln -sf /etc/nginx/sites-available/home_suite /etc/nginx/sites-enabled/home_suite

# Tester et recharger nginx
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Mises à jour

```bash
cd home_suite
git pull
docker compose up -d --build
```

---

## Structure

```
home_suite/
├── Dockerfile
├── docker-compose.yml
├── nginx/
│   └── home_suite.conf     ← conf nginx à copier sur le serveur
├── backend/                ← FastAPI (uvicorn main:app, port 8000)
│   ├── main.py
│   ├── home_radar/         ← WebSocket /home-radar/ws
│   └── notes/              ← API /notes/api/*, WS /notes/ws/*
├── frontend/
│   ├── index.html          ← homepage
│   ├── shared/             ← notifications.js centralisé
│   ├── home_radar/
│   └── notes/
└── data/                   ← SQLite (home_radar.db, notes.db) — gitignored, monté en volume
```

## URLs

| URL | App |
|-----|-----|
| `/` | Homepage (installable PWA) |
| `/home-radar/` | HomeRadar — plan interactif (PWA) |
| `/notes/` | Courses — liste collaborative (PWA) |
