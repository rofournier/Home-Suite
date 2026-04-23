import { showToast, requestNotifPermission } from "/shared/notifications.js";

const MOVIES_CACHE_KEY = "watchlist_movies_v2";

const state = {
  movies: [],
  filterKind: "all",
  filterGenre: null,
  viewMode: "todo",
  sortMode: "date",
  isOffline: false,
};

const listEl = document.getElementById("list");
const addBtn = document.getElementById("add-btn");
const sortToggle = document.getElementById("sort-toggle");
const viewToggle = document.getElementById("view-toggle");
const genreFilterBar = document.getElementById("genre-filter-bar");
const offlineBanner = document.getElementById("offline-banner");
const kindChips = Array.from(document.querySelectorAll("[data-kind]"));

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function movieKindBadge(kind) {
  return kind === "serie" ? "Série" : "Film";
}

/** Get genres array from a movie object (handles legacy `genre` string). */
function getGenres(movie) {
  if (Array.isArray(movie.genres)) return movie.genres;
  // Backwards compat: old localStorage cache with single `genre` string
  const legacy = String(movie.genre || "").trim();
  return legacy ? [legacy] : [];
}

function primaryGenre(movie) {
  const genres = getGenres(movie);
  if (genres.length === 0) return "Sans genre";
  return [...genres].sort((a, b) => a.localeCompare(b, "fr"))[0];
}

function setOfflineMode(offline) {
  state.isOffline = offline;
  if (offlineBanner) offlineBanner.classList.toggle("hidden", !offline);
}

function syncKindFilterUI() {
  kindChips.forEach((node) => node.classList.toggle("active", node.dataset.kind === state.filterKind));
}

function persistMovies() {
  try { localStorage.setItem(MOVIES_CACHE_KEY, JSON.stringify(state.movies)); } catch {}
}

function replaceMovie(updated) {
  state.movies = state.movies.map((m) => (m.id === updated.id ? updated : m));
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`API ${response.status}`);
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
  renderGenreFilterBar();
}

// ─── Filtering & sorting ──────────────────────────────────────────────────────

function filteredMovies() {
  return state.movies
    .filter((m) => state.filterKind === "all" || m.kind === state.filterKind)
    .filter((m) => state.filterGenre === null || getGenres(m).includes(state.filterGenre))
    .filter((m) => state.viewMode === "all" || m.watched === (state.viewMode === "watched"));
}

function sortedMovies(items) {
  const movies = [...items];
  if (state.sortMode === "genre") {
    movies.sort((a, b) => {
      const cmp = primaryGenre(a).localeCompare(primaryGenre(b), "fr");
      return cmp !== 0 ? cmp : b.created_at.localeCompare(a.created_at);
    });
    return movies;
  }
  if (state.sortMode === "rating") {
    movies.sort((a, b) => {
      if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
      return b.created_at.localeCompare(a.created_at);
    });
    return movies;
  }
  return movies.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Deduplicated, sorted list of all genres across state.movies. */
function allGenreOptions() {
  const set = new Set();
  state.movies.forEach((m) => getGenres(m).forEach((g) => set.add(g)));
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
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
  // If we're filtering by a genre the new movie doesn't have, clear the genre filter
  if (state.filterGenre !== null && !getGenres(movie).includes(state.filterGenre)) {
    state.filterGenre = null;
  }
}

// ─── Genre filter bar ─────────────────────────────────────────────────────────

function renderGenreFilterBar() {
  if (!genreFilterBar) return;
  const genres = allGenreOptions();
  genreFilterBar.innerHTML = "";

  if (genres.length === 0) {
    genreFilterBar.hidden = true;
    return;
  }
  genreFilterBar.hidden = false;

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = `chip${state.filterGenre === null ? " active" : ""}`;
  allChip.textContent = "Tous genres";
  allChip.addEventListener("click", () => {
    state.filterGenre = null;
    renderGenreFilterBar();
    render();
  });
  genreFilterBar.appendChild(allChip);

  genres.forEach((genre) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip genre-filter-chip${state.filterGenre === genre ? " active" : ""}`;
    chip.textContent = genre;
    chip.addEventListener("click", () => {
      state.filterGenre = state.filterGenre === genre ? null : genre;
      renderGenreFilterBar();
      render();
    });
    genreFilterBar.appendChild(chip);
  });
}

// ─── Stars ────────────────────────────────────────────────────────────────────

function starsHtml(rating) {
  let html = '<div class="stars">';
  for (let i = 1; i <= 5; i++) {
    html += `<button type="button" class="star${i <= (rating || 0) ? " active" : ""}" data-rate="${i}">★</button>`;
  }
  return html + "</div>";
}

// ─── Genre tag input helpers ──────────────────────────────────────────────────

function genreTagInputHtml(movie, datalistId, disabled) {
  const genres = getGenres(movie);
  const chips = genres
    .map(
      (g) =>
        `<span class="gtag-chip"><span class="gtag-label">${escapeHtml(g)}</span>` +
        `${disabled ? "" : `<button type="button" class="gtag-remove" aria-label="Retirer ${escapeHtml(g)}">×</button>`}</span>`,
    )
    .join("");
  const placeholder = genres.length === 0 ? "Genre…" : "+";
  return (
    `<div class="genre-tag-input"${disabled ? "" : ""} data-movie-id="${escapeHtml(movie.id)}">` +
    chips +
    (disabled
      ? ""
      : `<input class="gtag-input" list="${datalistId}" placeholder="${placeholder}" autocomplete="off" />`) +
    "</div>"
  );
}

/** Update chips in-place without destroying the text input (preserves focus). */
function updateGenreTagInput(movieId, genres) {
  const container = document.querySelector(`.genre-tag-input[data-movie-id="${movieId}"]`);
  if (!container) return;
  const existingInput = container.querySelector(".gtag-input");
  container.querySelectorAll(".gtag-chip").forEach((c) => c.remove());

  genres.forEach((genre) => {
    const chip = document.createElement("span");
    chip.className = "gtag-chip";
    chip.innerHTML =
      `<span class="gtag-label">${escapeHtml(genre)}</span>` +
      `<button type="button" class="gtag-remove" aria-label="Retirer ${escapeHtml(genre)}">×</button>`;
    chip.querySelector(".gtag-remove").addEventListener("click", () => removeGenreFromMovie(movieId, genre));
    container.insertBefore(chip, existingInput);
  });

  if (existingInput) {
    existingInput.placeholder = genres.length === 0 ? "Genre…" : "+";
  }
}

async function addGenreToMovie(movieId, newGenre) {
  const trimmed = newGenre.trim();
  if (!trimmed) return;
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie) return;
  const current = getGenres(movie);
  if (current.includes(trimmed)) return;
  const next = [...current, trimmed];
  try {
    const updated = await apiRequest(`/watchlist/api/movies/${movieId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ genres: next }),
    });
    replaceMovie(updated);
    persistMovies();
    updateGenreTagInput(movieId, updated.genres);
    renderGenreFilterBar();
  } catch {
    showToast("Impossible d'ajouter le genre");
  }
}

async function removeGenreFromMovie(movieId, genre) {
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie) return;
  const next = getGenres(movie).filter((g) => g !== genre);
  try {
    const updated = await apiRequest(`/watchlist/api/movies/${movieId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ genres: next }),
    });
    replaceMovie(updated);
    persistMovies();
    updateGenreTagInput(movieId, updated.genres);
    // If active genre filter is the removed genre, clear it
    if (state.filterGenre === genre && !state.movies.some((m) => getGenres(m).includes(genre))) {
      state.filterGenre = null;
    }
    renderGenreFilterBar();
  } catch {
    showToast("Impossible de retirer le genre");
  }
}

/** Bind keyboard/blur events on the genre tag input inside a row element. */
function bindGenreTagInput(row, movie) {
  const container = row.querySelector(".genre-tag-input");
  if (!container) return;
  const movieId = movie.id;

  // Clicking anywhere in the fake-input area focuses the text input
  container.addEventListener("click", (e) => {
    if (!e.target.closest(".gtag-remove")) {
      container.querySelector(".gtag-input")?.focus();
    }
  });

  // Remove button on each existing chip
  container.querySelectorAll(".gtag-remove").forEach((btn) => {
    const label = btn.closest(".gtag-chip")?.querySelector(".gtag-label")?.textContent || "";
    btn.addEventListener("click", () => removeGenreFromMovie(movieId, label));
  });

  const input = container.querySelector(".gtag-input");
  if (!input) return;

  input.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
      e.preventDefault();
      const genre = input.value.trim().replace(/,+$/, "").trim();
      if (genre) {
        input.value = "";
        addGenreToMovie(movieId, genre);
      }
    }
    // Backspace on empty input removes last chip
    if (e.key === "Backspace" && input.value === "") {
      const genres = getGenres(state.movies.find((m) => m.id === movieId) || {});
      if (genres.length > 0) removeGenreFromMovie(movieId, genres[genres.length - 1]);
    }
  });

  input.addEventListener("blur", () => {
    const genre = input.value.trim().replace(/,+$/, "").trim();
    if (genre) {
      input.value = "";
      addGenreToMovie(movieId, genre);
    }
  });
}

// ─── Render rows ──────────────────────────────────────────────────────────────

function renderRows(container, movies, datalistId) {
  movies.forEach((movie) => {
    const row = document.createElement("article");
    row.className = `row kind-${movie.kind}${movie.watched ? " watched" : ""}`;
    row.dataset.movieId = movie.id;
    const disabled = state.isOffline;
    row.innerHTML = `
      <button type="button" class="kind-btn kind-btn-${movie.kind}"${disabled ? " disabled" : ""}>${movieKindBadge(movie.kind)}</button>
      <div class="card-main">
        <div class="inputs">
          <input class="title-input" value="${escapeHtml(movie.title)}" placeholder="Titre"${disabled ? " disabled" : ""} />
          <div class="subline">
            ${genreTagInputHtml(movie, datalistId, disabled)}
            ${starsHtml(movie.rating)}
          </div>
        </div>
        <div class="card-meta">
          <button type="button" class="watch-btn"${disabled ? " disabled" : ""}>${movie.watched ? "Vu ✓" : "A voir"}</button>
          <button type="button" class="delete-btn" aria-label="Supprimer"${disabled ? " disabled" : ""}>🗑</button>
        </div>
      </div>
    `;
    container.appendChild(row);
    if (!disabled) bindGenreTagInput(row, movie);
  });

  if (state.isOffline) return;

  // Title
  container.querySelectorAll(".title-input").forEach((input) => {
    input.addEventListener("blur", async (e) => {
      const movieId = e.target.closest(".row").dataset.movieId;
      const title = e.target.value.trim();
      if (!title) return;
      try {
        const updated = await apiRequest(`/watchlist/api/movies/${movieId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        replaceMovie(updated);
        persistMovies();
      } catch { showToast("Impossible de sauvegarder le titre"); }
    });
  });

  // Kind toggle (ribbon)
  container.querySelectorAll(".kind-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const movie = state.movies.find((m) => m.id === e.target.closest(".row").dataset.movieId);
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
      } catch { showToast("Impossible de changer le type"); }
    });
  });

  // Watch toggle
  container.querySelectorAll(".watch-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const movie = state.movies.find((m) => m.id === e.target.closest(".row").dataset.movieId);
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
        renderGenreFilterBar();
      } catch { showToast("Impossible de marquer comme vu"); }
    });
  });

  // Delete
  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const movieId = e.target.closest(".row").dataset.movieId;
      try {
        await apiRequest(`/watchlist/api/movies/${movieId}`, { method: "DELETE" });
        state.movies = state.movies.filter((m) => m.id !== movieId);
        persistMovies();
        render();
        renderGenreFilterBar();
      } catch { showToast("Impossible de supprimer"); }
    });
  });

  // Stars
  container.querySelectorAll(".star").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const movie = state.movies.find((m) => m.id === e.target.closest(".row").dataset.movieId);
      if (!movie) return;
      const clicked = Number(e.target.dataset.rate);
      const patch = movie.rating === clicked ? { clear_rating: true } : { rating: clicked, clear_rating: false };
      try {
        const updated = await apiRequest(`/watchlist/api/movies/${movie.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        replaceMovie(updated);
        persistMovies();
        render();
      } catch { showToast("Impossible de noter"); }
    });
  });
}

// ─── Main render ──────────────────────────────────────────────────────────────

function render() {
  const datalistId = "genres-list";
  const options = allGenreOptions();
  listEl.innerHTML = `<datalist id="${datalistId}">${options.map((g) => `<option value="${escapeHtml(g)}"></option>`).join("")}</datalist>`;

  const movies = sortedMovies(filteredMovies());
  if (movies.length === 0) {
    listEl.innerHTML += '<div class="empty">Aucun élément pour ce filtre.</div>';
    return;
  }

  if (state.sortMode === "genre") {
    let currentGroup = "";
    movies.forEach((movie) => {
      const group = primaryGenre(movie);
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

// ─── Controls ─────────────────────────────────────────────────────────────────

function cycleSortMode() {
  if (state.sortMode === "date") state.sortMode = "genre";
  else if (state.sortMode === "genre") state.sortMode = "rating";
  else state.sortMode = "date";
  const label = { date: "Date", genre: "Genre", rating: "Note" }[state.sortMode];
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
      body: JSON.stringify({ title: "Nouveau titre", kind: "film", genres: [], watched: false }),
    });
    state.movies.unshift(created);
    persistMovies();
    ensureMovieVisible(created);
    render();
    renderGenreFilterBar();
    setTimeout(() => {
      const row = listEl.querySelector(`[data-movie-id="${created.id}"]`);
      const titleInput = row?.querySelector(".title-input");
      titleInput?.focus();
      titleInput?.select();
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
    viewToggle.textContent = { todo: "A voir", watched: "Vus", all: "Tous" }[state.viewMode];
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

// ─── Boot ─────────────────────────────────────────────────────────────────────

window.addEventListener("online", () => { setOfflineMode(false); loadMovies(); });
window.addEventListener("offline", () => setOfflineMode(true));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/watchlist/sw.js").catch(() => {});
}

document.addEventListener("pointerup", () => requestNotifPermission(), { once: true });

bindEvents();
syncKindFilterUI();
loadMovies();
