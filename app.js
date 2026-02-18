/* ============================================
   YallaShoof - app.js
   Core: API, Config, Init, Navigation, Home
   + Arabic Content Support
   ============================================ */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    API_KEYS: [
        'ea797c00b28b5207268f14eb4b6e4acf',
        '4e44d9029b1270a757cddc766a1bcb63',
        'd7b37c987b2e0f3c9f21dbbb83aee543',
        'b5e0b29f406c39037a2fef05be0d851e',
        '15d2ea6d0dc1d476efbca3eba2b9bbfb'
    ],
    TMDB_BASE: 'https://api.themoviedb.org/3',
    IMG_W500: 'https://image.tmdb.org/t/p/w500',
    IMG_ORIGINAL: 'https://image.tmdb.org/t/p/original',
    IMG_W300: 'https://image.tmdb.org/t/p/w300',

    EMBED_SOURCES: [
        {
            name: 'VidSrc Pro',
            movie: (id) => `https://vidsrc.pro/embed/movie/${id}`,
            tv: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`
        },
        {
            name: 'VidSrc To',
            movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
            tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
        },
        {
            name: 'VidSrc CC',
            movie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
            tv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`
        },
        {
            name: 'SuperEmbed',
            movie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
            tv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`
        },
        {
            name: 'AutoEmbed',
            movie: (id) => `https://autoembed.co/movie/tmdb/${id}`,
            tv: (id, s, e) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}`
        },
        {
            name: 'NontonGo',
            movie: (id) => `https://www.NontonGo.win/embed/movie/${id}`,
            tv: (id, s, e) => `https://www.NontonGo.win/embed/tv/${id}/${s}/${e}`
        }
    ],

    // Arabic language codes for TMDB
    ARABIC_LANGUAGES: 'ar',
    ARABIC_REGIONS: 'EG|SA|AE|KW|LB|SY|IQ|JO|MA|TN|DZ|BH|QA|OM|YE|LY|SD|PS',

    HERO_COUNT: 8,
    SEARCH_DELAY: 400,
    TOAST_DURATION: 3000,
    HERO_INTERVAL: 8000,
    CONTROLS_TIMEOUT: 3000
};

// ============================================
// GLOBAL STATE
// ============================================
let currentKeyIndex = 0;

const state = {
    currentPage: 'home',
    myList: JSON.parse(localStorage.getItem('freeflix_mylist') || '[]'),
    watched: JSON.parse(localStorage.getItem('freeflix_watched') || '{}'),
    heroItems: [],
    heroIndex: 0,
    heroTimer: null,
    pages: {
        movies: { page: 1, totalPages: 1, items: [], loading: false, loaded: false },
        series: { page: 1, totalPages: 1, items: [], loading: false, loaded: false },
        anime: { page: 1, totalPages: 1, items: [], loading: false, loaded: false },
        arabic: { page: 1, totalPages: 1, items: [], loading: false, loaded: false }
    },
    searchTimer: null,
    searchQuery: '',
    currentEmbedIndex: 0,
    currentPlayInfo: null,
    movieGenres: {},
    tvGenres: {},
    controlsTimer: null,
    detailCache: {}
};

// ============================================
// WATCHED EPISODES TRACKING
// ============================================
function markAsWatched(tvId, season, episode) {
    var key = tvId + '_s' + season + '_e' + episode;
    state.watched[key] = Date.now();
    localStorage.setItem('freeflix_watched', JSON.stringify(state.watched));
}

function isWatched(tvId, season, episode) {
    var key = tvId + '_s' + season + '_e' + episode;
    return !!state.watched[key];
}

function markMovieWatched(movieId) {
    var key = 'movie_' + movieId;
    state.watched[key] = Date.now();
    localStorage.setItem('freeflix_watched', JSON.stringify(state.watched));
}

// ============================================
// API KEY MANAGEMENT
// ============================================
function getApiKey() {
    return CONFIG.API_KEYS[currentKeyIndex];
}

function rotateApiKey() {
    currentKeyIndex = (currentKeyIndex + 1) % CONFIG.API_KEYS.length;
}

// ============================================
// TMDB FETCH WITH RETRY + CACHING
// ============================================
const fetchCache = {};

async function tmdbFetch(endpoint, params, retries) {
    params = params || {};
    retries = retries || 5;

    var cacheKey = endpoint + JSON.stringify(params);
    if (fetchCache[cacheKey] && (Date.now() - fetchCache[cacheKey].time < 300000)) {
        return fetchCache[cacheKey].data;
    }

    for (var attempt = 0; attempt < retries; attempt++) {
        try {
            var url = new URL(CONFIG.TMDB_BASE + endpoint);
            url.searchParams.set('api_key', getApiKey());
            // Use language from params if provided, otherwise default
            if (!params.language) {
                url.searchParams.set('language', 'en-US');
            }

            var keys = Object.keys(params);
            for (var i = 0; i < keys.length; i++) {
                var val = params[keys[i]];
                if (val !== undefined && val !== null && val !== '') {
                    url.searchParams.set(keys[i], String(val));
                }
            }

            var response = await fetch(url.toString());

            if (response.status === 401 || response.status === 429) {
                rotateApiKey();
                await new Promise(function(r) { setTimeout(r, 300); });
                continue;
            }

            if (!response.ok) throw new Error('HTTP ' + response.status);

            var data = await response.json();
            fetchCache[cacheKey] = { data: data, time: Date.now() };
            return data;
        } catch (error) {
            if (attempt < retries - 1) {
                rotateApiKey();
                await new Promise(function(r) { setTimeout(r, 400); });
            }
        }
    }
    return null;
}

// ============================================
// API FUNCTIONS
// ============================================
async function loadGenres() {
    var results = await Promise.all([
        tmdbFetch('/genre/movie/list'),
        tmdbFetch('/genre/tv/list')
    ]);
    if (results[0] && results[0].genres) {
        results[0].genres.forEach(function(g) { state.movieGenres[g.id] = g.name; });
    }
    if (results[1] && results[1].genres) {
        results[1].genres.forEach(function(g) { state.tvGenres[g.id] = g.name; });
    }
}

function getGenreNames(ids, type) {
    var map = type === 'tv' ? state.tvGenres : state.movieGenres;
    return (ids || []).map(function(id) { return map[id]; }).filter(Boolean);
}

function getTrending(type, time, page) {
    return tmdbFetch('/trending/' + (type||'all') + '/' + (time||'week'), { page: page||1 });
}
function getPopularMovies(p) { return tmdbFetch('/movie/popular', { page: p||1 }); }
function getTopRatedMovies(p) { return tmdbFetch('/movie/top_rated', { page: p||1 }); }
function getNowPlayingMovies(p) { return tmdbFetch('/movie/now_playing', { page: p||1 }); }
function getUpcomingMovies(p) { return tmdbFetch('/movie/upcoming', { page: p||1 }); }
function getPopularTV(p) { return tmdbFetch('/tv/popular', { page: p||1 }); }
function getTopRatedTV(p) { return tmdbFetch('/tv/top_rated', { page: p||1 }); }
function getOnTheAirTV(p) { return tmdbFetch('/tv/on_the_air', { page: p||1 }); }

function discoverMovies(params) {
    return tmdbFetch('/discover/movie', Object.assign({ 'vote_count.gte': 50 }, params || {}));
}
function discoverTV(params) {
    return tmdbFetch('/discover/tv', Object.assign({ 'vote_count.gte': 50 }, params || {}));
}
function getAnime(params, type) {
    var base = Object.assign({
        with_genres: '16',
        with_original_language: 'ja',
        sort_by: 'popularity.desc',
        'vote_count.gte': 20
    }, params || {});
    return (type || 'tv') === 'tv' ? discoverTV(base) : discoverMovies(base);
}

// ============================================
// ARABIC CONTENT API FUNCTIONS
// ============================================
function getArabicMovies(params) {
    var base = Object.assign({
        with_original_language: 'ar',
        sort_by: 'popularity.desc',
        'vote_count.gte': 5,
        language: 'ar-EG'
    }, params || {});
    return discoverMovies(base);
}

function getArabicTV(params) {
    var base = Object.assign({
        with_original_language: 'ar',
        sort_by: 'popularity.desc',
        'vote_count.gte': 5,
        language: 'ar-EG'
    }, params || {});
    return discoverTV(base);
}

function getArabicContent(params, type) {
    if (type === 'movie') return getArabicMovies(params);
    if (type === 'tv') return getArabicTV(params);
    // If "all", fetch both and merge
    return Promise.all([
        getArabicMovies(params),
        getArabicTV(params)
    ]).then(function(results) {
        var movies = (results[0] && results[0].results) ? results[0].results.map(function(m) { m.media_type = 'movie'; return m; }) : [];
        var tvShows = (results[1] && results[1].results) ? results[1].results.map(function(t) { t.media_type = 'tv'; return t; }) : [];
        var all = movies.concat(tvShows);
        // Sort by popularity
        all.sort(function(a, b) { return (b.popularity || 0) - (a.popularity || 0); });
        return {
            results: all,
            total_pages: Math.max(
                (results[0] && results[0].total_pages) || 1,
                (results[1] && results[1].total_pages) || 1
            ),
            total_results: all.length
        };
    });
}

function getPopularArabicMovies(p) {
    return getArabicMovies({ page: p || 1, sort_by: 'popularity.desc' });
}

function getPopularArabicTV(p) {
    return getArabicTV({ page: p || 1, sort_by: 'popularity.desc' });
}

function getTopRatedArabicMovies(p) {
    return getArabicMovies({ page: p || 1, sort_by: 'vote_average.desc', 'vote_count.gte': 20 });
}

function getTopRatedArabicTV(p) {
    return getArabicTV({ page: p || 1, sort_by: 'vote_average.desc', 'vote_count.gte': 20 });
}

function getNewArabicMovies(p) {
    return getArabicMovies({ page: p || 1, sort_by: 'primary_release_date.desc', 'primary_release_date.lte': new Date().toISOString().split('T')[0] });
}

function getNewArabicTV(p) {
    return getArabicTV({ page: p || 1, sort_by: 'first_air_date.desc', 'first_air_date.lte': new Date().toISOString().split('T')[0] });
}

function getArabicDrama(p) {
    return getArabicTV({ page: p || 1, with_genres: '18', sort_by: 'popularity.desc' });
}

function getArabicComedy(p) {
    return getArabicMovies({ page: p || 1, with_genres: '35', sort_by: 'popularity.desc' });
}

function getArabicAction(p) {
    return getArabicMovies({ page: p || 1, with_genres: '28', sort_by: 'popularity.desc' });
}

function getArabicCrime(p) {
    return getArabicTV({ page: p || 1, with_genres: '80', sort_by: 'popularity.desc' });
}

function getEgyptianMovies(p) {
    return discoverMovies({
        with_original_language: 'ar',
        region: 'EG',
        sort_by: 'popularity.desc',
        'vote_count.gte': 3,
        page: p || 1,
        language: 'ar-EG'
    });
}

function getEgyptianTV(p) {
    return discoverTV({
        with_original_language: 'ar',
        sort_by: 'popularity.desc',
        'vote_count.gte': 3,
        page: p || 1,
        language: 'ar-EG',
        with_origin_country: 'EG'
    });
}

function getKhaleejiContent(p) {
    return Promise.all([
        discoverTV({
            with_original_language: 'ar',
            sort_by: 'popularity.desc',
            'vote_count.gte': 2,
            page: p || 1,
            language: 'ar-SA',
            with_origin_country: 'SA|AE|KW'
        }),
        discoverMovies({
            with_original_language: 'ar',
            sort_by: 'popularity.desc',
            'vote_count.gte': 2,
            page: p || 1,
            language: 'ar-SA'
        })
    ]).then(function(results) {
        var all = [];
        if (results[0] && results[0].results) {
            all = all.concat(results[0].results.map(function(t) { t.media_type = 'tv'; return t; }));
        }
        if (results[1] && results[1].results) {
            all = all.concat(results[1].results.map(function(m) { m.media_type = 'movie'; return m; }));
        }
        all.sort(function(a, b) { return (b.popularity || 0) - (a.popularity || 0); });
        return { results: all, total_pages: 5 };
    });
}

// ============================================
// STANDARD DETAIL FUNCTIONS
// ============================================
function getMovieDetails(id) {
    if (state.detailCache['m' + id]) return Promise.resolve(state.detailCache['m' + id]);
    return tmdbFetch('/movie/' + id, { append_to_response: 'credits,videos,recommendations,similar' }).then(function(d) {
        if (d) state.detailCache['m' + id] = d;
        return d;
    });
}
function getTVDetails(id) {
    if (state.detailCache['t' + id]) return Promise.resolve(state.detailCache['t' + id]);
    return tmdbFetch('/tv/' + id, { append_to_response: 'credits,videos,recommendations,similar' }).then(function(d) {
        if (d) state.detailCache['t' + id] = d;
        return d;
    });
}
function getTVSeason(tvId, season) {
    return tmdbFetch('/tv/' + tvId + '/season/' + season);
}
function searchMulti(query, page) {
    return tmdbFetch('/search/multi', { query: query, page: page||1, include_adult: false });
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    startApp();
});

async function startApp() {
    try {
        await loadGenres();
        await initHero();
        await buildHomeContent();
        setupNavbar();
        setupSearch();
        setupScrollEvents();
        setupPlayerEvents();
    } catch (err) {
        console.error('Init error:', err);
        showToast('Loading issue, retrying...', 'error');
        setTimeout(startApp, 3000);
    }
    setTimeout(function() {
        var pre = document.getElementById('preloader');
        if (pre) pre.classList.add('hidden');
    }, 1800);
}

// ============================================
// NAVBAR
// ============================================
function setupNavbar() {
    window.addEventListener('scroll', function() {
        var nav = document.getElementById('navbar');
        var btn = document.getElementById('scrollTopBtn');
        if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
        if (btn) btn.classList.toggle('visible', window.scrollY > 500);
    });
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.profile-menu')) closeProfileDropdown();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { closeModal(); closePlayer(); closeSearch(); closeTrailer(); }
    });
}

// ============================================
// NAVIGATION (Updated with Arabic)
// ============================================
function navigateTo(page) {
    state.currentPage = page;
    document.querySelectorAll('.nav-link').forEach(function(l) {
        l.classList.toggle('active', l.dataset.page === page);
    });
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    var target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');
    closeSearchOverlay();
    closeProfileDropdown();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (page === 'movies' && !state.pages.movies.loaded) loadPageData('movies');
    if (page === 'series' && !state.pages.series.loaded) loadPageData('series');
    if (page === 'anime' && !state.pages.anime.loaded) loadPageData('anime');
    if (page === 'arabic' && !state.pages.arabic.loaded) loadPageData('arabic');
    if (page === 'mylist') renderMyList();
}

// ============================================
// HERO
// ============================================
async function initHero() {
    var data = await getTrending('all', 'week');
    if (!data || !data.results || !data.results.length) {
        data = await getPopularMovies();
        if (data && data.results) data.results.forEach(function(i) { i.media_type = 'movie'; });
    }
    if (!data || !data.results) return;

    state.heroItems = data.results
        .filter(function(i) { return i.backdrop_path && i.overview && (i.media_type==='movie'||i.media_type==='tv'); })
        .slice(0, CONFIG.HERO_COUNT);
    if (!state.heroItems.length) return;
    renderHero(0);
    buildHeroIndicators();
    startHeroTimer();
}

function renderHero(idx) {
    var item = state.heroItems[idx];
    if (!item) return;
    var bd = document.getElementById('heroBackdrop');
    var ct = document.getElementById('heroContent');
    var title = item.title || item.name;
    var year = (item.release_date || item.first_air_date || '').substring(0,4);
    var rating = item.vote_average ? item.vote_average.toFixed(1) : '—';
    var tl = item.media_type === 'movie' ? 'Movie' : 'Series';
    var ti = item.media_type === 'movie' ? 'fa-film' : 'fa-tv';
    var genres = getGenreNames(item.genre_ids, item.media_type);

    bd.style.backgroundImage = 'url(' + CONFIG.IMG_ORIGINAL + item.backdrop_path + ')';
    ct.innerHTML = '<div class="hero-type-badge"><i class="fas '+ti+'"></i> '+tl+'</div>'
        + '<h1 class="hero-title">'+title+'</h1>'
        + '<div class="hero-meta"><span class="hero-meta-item rating"><i class="fas fa-star"></i> '+rating+'</span><span class="hero-meta-item">'+year+'</span><span class="hero-meta-item maturity">HD</span></div>'
        + '<p class="hero-description">'+item.overview+'</p>'
        + '<div class="hero-genres">'+genres.slice(0,4).map(function(g){return '<span class="hero-genre-tag">'+g+'</span>';}).join('')+'</div>'
        + '<div class="hero-buttons">'
        + '<button class="btn-play" onclick="handlePlayClick(\''+item.media_type+'\','+item.id+')"><i class="fas fa-play"></i> Play Now</button>'
        + '<button class="btn-info" onclick="openDetail(\''+item.media_type+'\','+item.id+')"><i class="fas fa-info-circle"></i> More Info</button>'
        + '<button class="btn-trailer" onclick="playTrailer(\''+item.media_type+'\','+item.id+')"><i class="fas fa-video"></i> Trailer</button>'
        + '</div>';
    ct.style.animation = 'none';
    ct.offsetHeight;
    ct.style.animation = 'heroContentIn 0.7s ease forwards';
    updateHeroIndicators(idx);
}

function buildHeroIndicators() {
    var c = document.getElementById('heroIndicators');
    if (!c) return;
    c.innerHTML = state.heroItems.map(function(_,i) {
        return '<div class="hero-indicator '+(i===0?'active':'')+'" onclick="goToHero('+i+')"></div>';
    }).join('');
}
function updateHeroIndicators(idx) {
    document.querySelectorAll('.hero-indicator').forEach(function(el,i) { el.classList.toggle('active', i===idx); });
}
function goToHero(i) {
    state.heroIndex = i;
    renderHero(i);
    clearInterval(state.heroTimer);
    startHeroTimer();
}
function startHeroTimer() {
    state.heroTimer = setInterval(function() {
        state.heroIndex = (state.heroIndex + 1) % state.heroItems.length;
        renderHero(state.heroIndex);
    }, CONFIG.HERO_INTERVAL);
}

// ============================================
// PLAY CLICK HANDLER
// ============================================
function handlePlayClick(type, id) {
    if (type === 'movie') {
        playMedia('movie', id);
    } else {
        openDetail('tv', id, true);
    }
}

// ============================================
// HOME ROWS (Updated with Arabic rows)
// ============================================
async function buildHomeContent() {
    var container = document.getElementById('homeContent');
    if (!container) return;
    container.innerHTML = '';

    var rows = [
        { title: '🔥 Trending Now', fn: function(){return getTrending('all','day');} },
        { title: '🎬 Popular Movies', fn: function(){return getPopularMovies();} },
        { title: '📺 Popular TV Series', fn: function(){return getPopularTV();} },
        { title: '🏆 Top Rated Movies', fn: function(){return getTopRatedMovies();} },
        { title: '🎌 Popular Anime', fn: function(){return getAnime();} },
        
        // === ARABIC CONTENT ROWS ===
        { title: '🇪🇬 أفلام عربية', fn: function(){return getPopularArabicMovies();} },
        { title: '📺 مسلسلات عربية', fn: function(){return getPopularArabicTV();} },
        { title: '🎭 دراما عربية', fn: function(){return getArabicDrama();} },
        { title: '🇪🇬 مسلسلات مصرية', fn: function(){return getEgyptianTV();} },
        { title: '😂 كوميديا عربية', fn: function(){return getArabicComedy();} },
        
        { title: '🍿 Now Playing', fn: function(){return getNowPlayingMovies();} },
        { title: '⭐ Top Rated Shows', fn: function(){return getTopRatedTV();} },
        { title: '📡 On The Air', fn: function(){return getOnTheAirTV();} },
        { title: '💥 Action Movies', fn: function(){return discoverMovies({with_genres:'28',sort_by:'popularity.desc'});} },
        { title: '😂 Comedy', fn: function(){return discoverMovies({with_genres:'35',sort_by:'popularity.desc'});} },
        { title: '😱 Horror', fn: function(){return discoverMovies({with_genres:'27',sort_by:'popularity.desc'});} },
        { title: '🧬 Sci-Fi', fn: function(){return discoverMovies({with_genres:'878',sort_by:'popularity.desc'});} },
        { title: '💕 Romance', fn: function(){return discoverMovies({with_genres:'10749',sort_by:'popularity.desc'});} },
        { title: '🎭 Drama Series', fn: function(){return discoverTV({with_genres:'18',sort_by:'popularity.desc'});} },
        
        // More Arabic
        { title: '⭐ أفضل الأفلام العربية', fn: function(){return getTopRatedArabicMovies();} },
        { title: '🆕 أحدث المسلسلات العربية', fn: function(){return getNewArabicTV();} },
        { title: '🔫 أكشن عربي', fn: function(){return getArabicAction();} },
        { title: '🕵️ جريمة وإثارة عربي', fn: function(){return getArabicCrime();} },
        
        { title: '📅 Upcoming', fn: function(){return getUpcomingMovies();} }
    ];

    // Show skeletons
    for (var i = 0; i < 8; i++) {
        container.appendChild(makeSkeletonRow(rows[i] ? rows[i].title : 'Loading...', i));
    }

    // Load rows in parallel batches
    var batch1 = rows.slice(0, 6);
    var batch2 = rows.slice(6, 12);
    var batch3 = rows.slice(12, 18);
    var batch4 = rows.slice(18);

    await loadRowBatch(batch1, 0, container);
    loadRowBatch(batch2, 6, container);
    loadRowBatch(batch3, 12, container);
    loadRowBatch(batch4, 18, container);
}

async function loadRowBatch(batch, startIdx, container) {
    var promises = batch.map(function(cfg, i) {
        return loadSingleRow(cfg, startIdx + i, container);
    });
    await Promise.all(promises);
}

async function loadSingleRow(cfg, index, container) {
    try {
        var data = await cfg.fn();
        if (!data || !data.results) return;
        var items = data.results.filter(function(i) { return i.poster_path; });
        if (!items.length) return;
        var rowEl = makeContentRow(cfg.title, items, index);
        var skel = container.querySelector('[data-skel="'+index+'"]');
        if (skel) skel.replaceWith(rowEl);
        else container.appendChild(rowEl);
    } catch(e) {}
}

function makeSkeletonRow(title, index) {
    var el = document.createElement('div');
    el.className = 'content-row';
    el.dataset.skel = index;
    el.innerHTML = '<div class="row-header"><h2 class="row-title">'+title+'</h2></div>'
        + '<div class="slider-wrapper"><div class="slider">'
        + Array(8).fill('<div class="card-skeleton"><div class="skeleton-poster"></div></div>').join('')
        + '</div></div>';
    return el;
}

function makeContentRow(title, items, index) {
    var row = document.createElement('div');
    row.className = 'content-row fade-in';
    row.style.animationDelay = Math.min(index * 0.06, 0.4) + 's';
    var isTop = title.includes('Top Rated') || title.includes('أفضل');
    var cards = items.map(function(item, i) { return makeCardHTML(item, isTop && i < 10 ? i+1 : null); }).join('');
    row.innerHTML = '<div class="row-header"><h2 class="row-title">'+title+'<span class="row-explore" onclick="goToCategory(\''+title+'\')">Explore All <i class="fas fa-chevron-right"></i></span></h2></div>'
        + '<div class="slider-wrapper"><button class="slider-btn left" onclick="slideRow(this,-1)"><i class="fas fa-chevron-left"></i></button>'
        + '<div class="slider">'+cards+'</div>'
        + '<button class="slider-btn right" onclick="slideRow(this,1)"><i class="fas fa-chevron-right"></i></button></div>';
    return row;
}

function goToCategory(t) {
    // Arabic categories
    if (t.includes('عربي') || t.includes('مصري') || t.includes('عربية') || t.includes('مسلسلات عربية') || t.includes('أفلام عربية') || t.includes('دراما عربية') || t.includes('كوميديا عربية') || t.includes('أكشن عربي') || t.includes('جريمة')) {
        navigateTo('arabic');
    } else if (t.includes('Anime')) {
        navigateTo('anime');
    } else if (t.includes('Series')||t.includes('Shows')||t.includes('Air')||t.includes('Drama')) {
        navigateTo('series');
    } else {
        navigateTo('movies');
    }
}

// ============================================
// CARD HTML
// ============================================
function makeCardHTML(item, rank) {
    var title = item.title || item.name || 'Unknown';
    var mt = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    var year = (item.release_date || item.first_air_date || '').substring(0,4);
    var rating = item.vote_average ? item.vote_average.toFixed(1) : '';
    var poster = item.poster_path ? CONFIG.IMG_W500 + item.poster_path : '';
    var genres = getGenreNames(item.genre_ids || [], mt);
    var isInList = state.myList.some(function(l){return l.id===item.id && l.type===mt;});
    var match = item.vote_average ? Math.min(99, Math.floor(item.vote_average*10 + Math.random()*5)) : '';
    var st = title.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    var sp = poster.replace(/'/g,"\\'");

    var badge = '';
    if (rank) badge = '<span class="card-top-number">'+rank+'</span>';
    else if (item.vote_average >= 8) badge = '<span class="card-badge top">TOP</span>';
    else if (year >= String(new Date().getFullYear()-1)) badge = '<span class="card-badge new">NEW</span>';

    var rb = rating ? '<span class="card-rating"><i class="fas fa-star"></i> '+rating+'</span>' : '';
    var pe = poster
        ? '<img src="'+poster+'" alt="'+st+'" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"><div class="card-poster-placeholder" style="display:none">'+st+'</div>'
        : '<div class="card-poster-placeholder">'+st+'</div>';

    var playAction = mt === 'movie'
        ? 'playMedia(\'movie\','+item.id+')'
        : 'openDetail(\'tv\','+item.id+',true)';

    return '<div class="content-card" onclick="openDetail(\''+mt+'\','+item.id+')">'
        + '<div class="card-poster">'+pe+badge+rb+'</div>'
        + '<div class="card-hover-info">'
        + '<div class="hover-btn-row">'
        + '<button class="hover-btn play" onclick="event.stopPropagation();'+playAction+'" title="Play"><i class="fas fa-play"></i></button>'
        + '<button class="hover-btn '+(isInList?'active':'')+'" onclick="event.stopPropagation();toggleMyList('+item.id+',\''+mt+'\',\''+st+'\',\''+sp+'\','+(item.vote_average||0)+')" title="List"><i class="fas '+(isInList?'fa-check':'fa-plus')+'"></i></button>'
        + '<div class="hover-btn-spacer"></div>'
        + '<button class="hover-btn" onclick="event.stopPropagation();openDetail(\''+mt+'\','+item.id+')" title="Info"><i class="fas fa-chevron-down"></i></button>'
        + '</div>'
        + '<div class="hover-card-title">'+title+'</div>'
        + '<div class="hover-card-meta">'+(match?'<span class="match">'+match+'%</span>':'')+'<span class="quality">HD</span><span>'+year+'</span></div>'
        + '<div class="hover-card-genres">'+genres.slice(0,3).join(' • ')+'</div>'
        + '</div></div>';
}

// ============================================
// SLIDER
// ============================================
function slideRow(btn, dir) {
    var slider = btn.parentElement.querySelector('.slider');
    if (!slider) return;
    var card = slider.querySelector('.content-card,.card-skeleton');
    if (!card) return;
    var w = card.offsetWidth + 8;
    var vis = Math.max(Math.floor(slider.offsetWidth / w), 2);
    slider.scrollBy({ left: dir * w * vis, behavior: 'smooth' });
}

// ============================================
// SCROLL EVENTS
// ============================================
function setupScrollEvents() {
    window.addEventListener('scroll', function() {
        var p = state.currentPage;
        if (p !== 'movies' && p !== 'series' && p !== 'anime' && p !== 'arabic') return;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000) {
            loadMorePage(p);
        }
    });
}

// ============================================
// PROFILE & MOBILE
// ============================================
function toggleProfileMenu() { document.getElementById('profileDropdown').classList.toggle('active'); }
function closeProfileDropdown() { var d = document.getElementById('profileDropdown'); if(d) d.classList.remove('active'); }
function toggleMobileMenu() {
    var m = document.getElementById('mobileMenu');
    var o = document.getElementById('mobileOverlay');
    var open = m.classList.contains('active');
    m.classList.toggle('active');
    o.classList.toggle('active');
    document.body.classList.toggle('no-scroll', !open);
}

// ============================================
// TOAST
// ============================================
function showToast(msg, type) {
    type = type || 'info';
    var c = document.getElementById('toastContainer');
    if (!c) return;
    var icons = { success:'fa-check-circle', info:'fa-info-circle', warning:'fa-exclamation-triangle', error:'fa-times-circle' };
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = '<i class="fas '+icons[type]+' toast-icon"></i><span class="toast-message">'+msg+'</span><button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>';
    c.appendChild(t);
    setTimeout(function() {
        if (t.parentElement) { t.classList.add('removing'); setTimeout(function(){t.remove();}, 350); }
    }, CONFIG.TOAST_DURATION);
}