import { showToast, requestNotifPermission } from "/shared/notifications.js";

const MOVIES_CACHE_KEY = "watchlist_movies_v1";

const state = {
  movies: [],
  filterKind: "all",
  viewMode: "todo",
  sortMode: "date",
  isOffline: false,
};

const listEl = document.getElementById("list");
const addBtn = document.getElementById("add-btn");
const sortToggle = document.getElementById("sort-toggle");
const viewToggle = document.getElementById("view-toggle");
const offlineBanner = document.getElementById("offline-banner");
const kindChips = Array.from(document.querySelectorAll("[data-kind]"));

function setOfflineMode(offline) {
  state.isOffline = offline;
  if (offlineBanner) offlineBanner.classList.toggle("hidden", !offline);
}

function movieKindBadge(kind) {
  return kind === "serie" ? "Serie" : "Film";
}

function syncKindFilterUI() {
  kindChips.forEach((node) => node.classList.toggle("active", node.dataset.kind === state.filterKind));
}

function normalizedGenre(value) {
  const text = String(value || "").trim();
  return text || "Sans genre";
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json();
}

async function loadMovies() {
  try {
    const payload = await apiRequest("/watchlist/api/movies");
    state.movies = payload.movies || [];
    try { localStorage.setItem(MOVIES_CACHE_KEY, JSON.stringify(state.movies)); } catch {}
    setOfflineMode(false);
  } catch {
    const raw = localStorage.getItem(MOVIES_CACHE_KEY);
    state.movies = raw ? JSON.parse(raw) : [];
    setOfflineMode(true);
  }
  render();
}

function filteredMovies() {
  return state.movies
    .filter((movie) => (state.filterKind === "all" ? true : movie.kind === state.filterKind))
    .filter((movie) => (state.viewMode === "all" ? true : movie.watched === (state.viewMode === "watched")));
}

function sortedMovies(items) {
  const movies = [...items];
  if (state.sortMode === "genre") {
    movies.sort((a, b) => {
      const genreCmp = normalizedGenre(a.genre).localeCompare(normalizedGenre(b.genre), "fr");
      if (genreCmp !== 0) return genreCmp;
      return b.created_at.localeCompare(a.created_at);
    });
    return movies;
  }
  if (state.sortMode === "rating") {
    movies.sort((a, b) => {
      const aRate = a.rating || 0;
      const bRate = b.rating || 0;
      if (aRate !== bRate) return bRate - aRate;
      return b.created_at.localeCompare(a.created_at);
    });
    return movies;
  }
  movies.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return movies;
}

function genreOptions() {
  const values = new Set();
  state.movies.forEach((movie) => {
    const value = String(movie.genre || "").trim();
    if (value) values.add(value);
  });
  return [...values].sort((a, b) => a.localeCompare(b, "fr"));
}

function starsHtml(rating) {
  let html = '<div class="stars">';
  for (let i = 1; i <= 5; i += 1) {
    html += `<button type="button" class="star ${i <= (rating || 0) ? "active" : ""}" data-rate="${i}">★</button>`;
  }
  html += "</div>";
  return html;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function persistMovies() {
  try { localStorage.setItem(MOVIES_CACHE_KEY, JSON.stringify(state.movies)); } catch {}
}

function renderRows(container, movies, datalistId) {
  movies.forEach((movie) => {
    const row = document.createElement("article");
    row.className = `row kind-${movie.kind} ${movie.watched ? "watched" : ""}`;
    row.dataset.movieId = movie.id;
    row.innerHTML = `
      <button type="button" class="kind-btn kind-btn-${movie.kind}">${movieKindBadge(movie.kind)}</button>
      <div class="card-main">
        <div class="inputs">
          <input class="title-input" value="${escapeHtml(movie.title)}" placeholder="Titre" ${state.isOffline ? "disabled" : ""} />
          <div class="subline">
            <input class="genre-input" list="${datalistId}" value="${escapeHtml(movie.genre || "")}" placeholder="Genre" ${state.isOffline ? "disabled" : ""} />
            ${starsHtml(movie.rating)}
          </div>
        </div>
        <div class="card-meta">
          <button type="button" class="watch-btn" ${state.isOffline ? "disabled" : ""}>${movie.watched ? "Vu" : "A voir"}</button>
          <button type="button" class="delete-btn" aria-label="Supprimer" ${state.isOffline ? "disabled" : ""}>🗑</button>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  if (state.isOffline) return;

  container.querySelectorAll(".title-input").forEach((input) => {
    input.addEventListener("blur", async (event) => {
      const row = event.target.closest(".row");
      const movieId = row.dataset.movieId;
      const title = event.target.value.trim();
      if (!title) return;
      try {
        const updated = await apiRequest(`/watchlist/api/movies/${movieId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        replaceMovie(updated);
        persistMovies();
      } catch {
        showToast("Impossible de sauvegarder le titre");
      }
    });
  });

  container.querySelectorAll(".genre-input").forEach((input) => {
    input.addEventListener("blur", async (event) => {
      const row = event.target.closest(".row");
      const movieId = row.dataset.movieId;
      const genre = event.target.value.trim();
      const patch = genre ? { genre, clear_genre: false } : { clear_genre: true };
      try {
        const updated = await apiRequest(`/watchlist/api/movies/${movieId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        replaceMovie(updated);
        persistMovies();
        render();
      } catch {
        showToast("Impossible de sauvegarder le genre");
      }
    });
  });

  container.querySelectorAll(".kind-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const row = event.target.closest(".row");
      const movie = state.movies.find((item) => item.id === row.dataset.movieId);
      if (!movie) return;
      const nextKind = movie.kind === "film" ? "serie" : "film";
      try {
        const updated = await apiRequest(`/watchlist/api/movies/${movie.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: nextKind }),
        });
        replaceMovie(updated);
        persistMovies();
        render();
      } catch {
        showToast("Impossible de changer le type");
      }
    });
  });

  container.querySelectorAll(".watch-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const row = event.target.closest(".row");
      const movie = state.movies.find((item) => item.id === row.dataset.movieId);
      if (!movie) return;
      try {
        const updated = await apiRequest(`/watchlist/api/movies/${movie.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ watched: !movie.watched }),
        });
        replaceMovie(updated);
        persistMovies();
        render();
      } catch {
        showToast("Impossible de marquer comme vu");
      }
    });
  });

  container.querySelectorAll(".delete-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const row = event.target.closest(".row");
      const movieId = row.dataset.movieId;
      try {
        await apiRequest(`/watchlist/api/movies/${movieId}`, { method: "DELETE" });
        state.movies = state.movies.filter((item) => item.id !== movieId);
        persistMovies();
        render();
      } catch {
        showToast("Impossible de supprimer");
      }
    });
  });

  container.querySelectorAll(".star").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const row = event.target.closest(".row");
      const movie = state.movies.find((item) => item.id === row.dataset.movieId);
      if (!movie) return;
      const clickedRate = Number(event.target.dataset.rate);
      const isReset = movie.rating === clickedRate;
      const patch = isReset ? { clear_rating: true } : { rating: clickedRate, clear_rating: false };
      try {
        const updated = await apiRequest(`/watchlist/api/movies/${movie.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        replaceMovie(updated);
        persistMovies();
        render();
      } catch {
        showToast("Impossible de noter");
      }
    });
  });
}

function replaceMovie(updated) {
  state.movies = state.movies.map((movie) => (movie.id === updated.id ? updated : movie));
}

function ensureMovieVisible(movie) {
  if (state.filterKind !== "all" && state.filterKind !== movie.kind) {
    state.filterKind = movie.kind;
    syncKindFilterUI();
  }

  if (state.viewMode === "watched" && !movie.watched) {
    state.viewMode = "todo";
    viewToggle.textContent = "A voir";
  } else if (state.viewMode === "todo" && movie.watched) {
    state.viewMode = "watched";
    viewToggle.textContent = "Vus";
  }
}

function render() {
  const datalistId = "genres-list";
  const options = genreOptions();
  listEl.innerHTML = `<datalist id="${datalistId}">${options.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("")}</datalist>`;

  const movies = sortedMovies(filteredMovies());
  if (movies.length === 0) {
    listEl.innerHTML += '<div class="empty">Aucun element pour ce filtre.</div>';
    return;
  }

  if (state.sortMode === "genre") {
    let currentGroup = "";
    movies.forEach((movie) => {
      const group = normalizedGenre(movie.genre);
      if (group !== currentGroup) {
        currentGroup = group;
        const title = document.createElement("div");
        title.className = "group-title";
        title.textContent = group;
        listEl.appendChild(title);
      }
      const wrapper = document.createElement("div");
      listEl.appendChild(wrapper);
      renderRows(wrapper, [movie], datalistId);
    });
    return;
  }

  renderRows(listEl, movies, datalistId);
}

function cycleSortMode() {
  if (state.sortMode === "date") state.sortMode = "genre";
  else if (state.sortMode === "genre") state.sortMode = "rating";
  else state.sortMode = "date";
  const label = state.sortMode === "date" ? "Date" : state.sortMode === "genre" ? "Genre" : "Note";
  sortToggle.textContent = `Tri: ${label}`;
  render();
}

async function createMovie() {
  if (state.isOffline) {
    showToast("Hors ligne — impossible d'ajouter");
    return;
  }
  try {
    const created = await apiRequest("/watchlist/api/movies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nouveau titre", kind: "film", watched: false }),
    });
    state.movies.unshift(created);
    persistMovies();
    ensureMovieVisible(created);
    render();

    setTimeout(() => {
      const row = listEl.querySelector(`[data-movie-id="${created.id}"]`);
      row?.querySelector(".title-input")?.focus();
      row?.querySelector(".title-input")?.select();
    }, 0);
  } catch {
    showToast("Impossible de créer un film");
  }
}

function bindEvents() {
  addBtn.addEventListener("click", createMovie);
  sortToggle.addEventListener("click", cycleSortMode);
  viewToggle.addEventListener("click", () => {
    state.viewMode = state.viewMode === "todo" ? "watched" : state.viewMode === "watched" ? "all" : "todo";
    viewToggle.textContent = state.viewMode === "todo" ? "A voir" : state.viewMode === "watched" ? "Vus" : "Tous";
    render();
  });

  kindChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.filterKind = chip.dataset.kind;
      syncKindFilterUI();
      render();
    });
  });
}

window.addEventListener("online", () => {
  setOfflineMode(false);
  loadMovies();
});

window.addEventListener("offline", () => setOfflineMode(true));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/watchlist/sw.js").catch(() => {});
}

document.addEventListener("pointerup", () => requestNotifPermission(), { once: true });

bindEvents();
syncKindFilterUI();
loadMovies();
