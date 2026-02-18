/* ============================================
   FREEFLIX - analytics.js
   Watch History, Continue Watching,
   Smart Recommendations, User Stats,
   Data Management
   ============================================ */

// ============================================
// 1. WATCH HISTORY SYSTEM
// ============================================
const WatchHistory = {
    KEY: 'freeflix_history',
    MAX_ITEMS: 200,

    getAll: function() {
        try {
            return JSON.parse(localStorage.getItem(this.KEY) || '[]');
        } catch(e) { return []; }
    },

    save: function(data) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(data));
        } catch(e) {
            // Storage full - remove oldest items
            var items = this.getAll();
            items.splice(0, 50);
            localStorage.setItem(this.KEY, JSON.stringify(items));
        }
    },

    add: function(item) {
        var history = this.getAll();

        // Remove duplicate if exists
        history = history.filter(function(h) {
            if (item.type === 'movie') {
                return !(h.id === item.id && h.type === 'movie');
            }
            return !(h.id === item.id && h.type === item.type && h.season === item.season && h.episode === item.episode);
        });

        // Add to beginning
        history.unshift({
            id: item.id,
            type: item.type,
            title: item.title || '',
            poster: item.poster || '',
            backdrop: item.backdrop || '',
            season: item.season || null,
            episode: item.episode || null,
            episodeName: item.episodeName || '',
            rating: item.rating || 0,
            genres: item.genres || [],
            progress: item.progress || 0,
            duration: item.duration || 0,
            timestamp: Date.now()
        });

        // Trim to max
        if (history.length > this.MAX_ITEMS) {
            history = history.slice(0, this.MAX_ITEMS);
        }

        this.save(history);
    },

    updateProgress: function(id, type, season, episode, progress, duration) {
        var history = this.getAll();
        for (var i = 0; i < history.length; i++) {
            var h = history[i];
            var match = false;
            if (type === 'movie' && h.id === id && h.type === 'movie') {
                match = true;
            } else if (h.id === id && h.type === type && h.season === season && h.episode === episode) {
                match = true;
            }
            if (match) {
                history[i].progress = progress;
                history[i].duration = duration;
                history[i].timestamp = Date.now();
                break;
            }
        }
        this.save(history);
    },

    remove: function(id, type, season, episode) {
        var history = this.getAll();
        history = history.filter(function(h) {
            if (type === 'movie') return !(h.id === id && h.type === 'movie');
            return !(h.id === id && h.type === type && h.season === season && h.episode === episode);
        });
        this.save(history);
    },

    clearAll: function() {
        localStorage.removeItem(this.KEY);
    },

    getRecent: function(limit) {
        return this.getAll().slice(0, limit || 20);
    },

    getContinueWatching: function() {
        return this.getAll().filter(function(h) {
            // Has progress but not finished (less than 90%)
            if (h.duration && h.progress) {
                var percent = (h.progress / h.duration) * 100;
                return percent > 5 && percent < 90;
            }
            return false;
        }).slice(0, 15);
    },

    getRecentlyFinished: function() {
        return this.getAll().filter(function(h) {
            if (h.duration && h.progress) {
                return (h.progress / h.duration) * 100 >= 90;
            }
            return false;
        }).slice(0, 10);
    },

    getByType: function(type) {
        return this.getAll().filter(function(h) { return h.type === type; });
    },

    getTotalWatchTime: function() {
        var total = 0;
        this.getAll().forEach(function(h) {
            if (h.progress) total += h.progress;
        });
        return total;
    }
};

// ============================================
// 2. SMART RECOMMENDATIONS ENGINE
// ============================================
const Recommendations = {

    // Get user's favorite genres based on watch history
    getFavoriteGenres: function() {
        var history = WatchHistory.getAll();
        var genreCount = {};

        history.forEach(function(h) {
            if (h.genres && h.genres.length) {
                h.genres.forEach(function(g) {
                    genreCount[g] = (genreCount[g] || 0) + 1;
                });
            }
        });

        // Sort by count
        var sorted = Object.keys(genreCount).sort(function(a, b) {
            return genreCount[b] - genreCount[a];
        });

        return sorted.slice(0, 5);
    },

    // Get personalized recommendations based on watch history
    getPersonalizedRow: async function() {
        var favGenres = this.getFavoriteGenres();
        if (favGenres.length === 0) return null;

        // Map genre names to IDs
        var genreIds = [];
        var allGenres = Object.assign({}, state.movieGenres, state.tvGenres);
        var reverseMap = {};

        Object.keys(allGenres).forEach(function(id) {
            reverseMap[allGenres[id]] = id;
        });

        favGenres.forEach(function(name) {
            if (reverseMap[name]) genreIds.push(reverseMap[name]);
        });

        if (genreIds.length === 0) return null;

        // Fetch movies from top 2 favorite genres
        var topGenreIds = genreIds.slice(0, 2).join(',');
        var data = await discoverMovies({
            with_genres: topGenreIds,
            sort_by: 'popularity.desc',
            page: 1
        });

        if (!data || !data.results) return null;

        // Filter out already watched
        var watchedIds = new Set(WatchHistory.getAll().map(function(h) { return h.id; }));
        var items = data.results.filter(function(item) {
            return item.poster_path && !watchedIds.has(item.id);
        });

        return items.length > 0 ? items : null;
    },

    // Get "Because you watched X" recommendations
    getBecauseYouWatched: async function() {
        var recent = WatchHistory.getRecent(5);
        if (recent.length === 0) return null;

        // Pick a random recent watch
        var pick = recent[Math.floor(Math.random() * Math.min(recent.length, 3))];

        var data;
        if (pick.type === 'movie') {
            data = await getMovieDetails(pick.id);
        } else {
            data = await getTVDetails(pick.id);
        }

        if (!data || !data.recommendations || !data.recommendations.results) return null;

        var items = data.recommendations.results.filter(function(i) { return i.poster_path; });
        if (items.length === 0) return null;

        return {
            title: '💡 Because you watched "' + pick.title + '"',
            items: items
        };
    }
};

// ============================================
// 3. USER STATISTICS
// ============================================
const UserStats = {

    getStats: function() {
        var history = WatchHistory.getAll();
        var myList = state.myList || [];
        var watched = state.watched || {};

        var totalTime = WatchHistory.getTotalWatchTime();
        var hours = Math.floor(totalTime / 3600);
        var minutes = Math.floor((totalTime % 3600) / 60);

        var movieCount = history.filter(function(h) { return h.type === 'movie'; }).length;
        var tvCount = history.filter(function(h) { return h.type === 'tv'; }).length;

        var favGenres = Recommendations.getFavoriteGenres();

        return {
            totalWatched: history.length,
            moviesWatched: movieCount,
            showsWatched: tvCount,
            episodesWatched: Object.keys(watched).filter(function(k) { return !k.startsWith('movie_'); }).length,
            watchTimeHours: hours,
            watchTimeMinutes: minutes,
            myListCount: myList.length,
            favoriteGenres: favGenres,
            continueWatching: WatchHistory.getContinueWatching().length
        };
    },

    renderStatsModal: function() {
        var stats = this.getStats();

        var html = '<div class="stats-modal-content">'
            + '<h2><i class="fas fa-chart-bar"></i> Your Stats</h2>'
            + '<div class="stats-grid">'

            + '<div class="stat-card"><div class="stat-number">' + stats.totalWatched + '</div><div class="stat-label">Total Watched</div></div>'
            + '<div class="stat-card"><div class="stat-number">' + stats.moviesWatched + '</div><div class="stat-label">Movies</div></div>'
            + '<div class="stat-card"><div class="stat-number">' + stats.episodesWatched + '</div><div class="stat-label">Episodes</div></div>'
            + '<div class="stat-card"><div class="stat-number">' + stats.watchTimeHours + 'h ' + stats.watchTimeMinutes + 'm</div><div class="stat-label">Watch Time</div></div>'
            + '<div class="stat-card"><div class="stat-number">' + stats.myListCount + '</div><div class="stat-label">In My List</div></div>'
            + '<div class="stat-card"><div class="stat-number">' + stats.continueWatching + '</div><div class="stat-label">Continue Watching</div></div>'

            + '</div>';

        if (stats.favoriteGenres.length > 0) {
            html += '<div class="stats-genres"><h3>Favorite Genres</h3><div class="genre-tags">'
                + stats.favoriteGenres.map(function(g) {
                    return '<span class="genre-tag">' + g + '</span>';
                }).join('')
                + '</div></div>';
        }

        html += '<div class="stats-actions">'
            + '<button class="btn-stats-action" onclick="exportData()"><i class="fas fa-download"></i> Export Data</button>'
            + '<button class="btn-stats-action danger" onclick="clearAllData()"><i class="fas fa-trash"></i> Clear All Data</button>'
            + '</div></div>';

        return html;
    }
};

// ============================================
// 4. DATA EXPORT / IMPORT
// ============================================
function exportData() {
    var data = {
        myList: state.myList,
        watched: state.watched,
        history: WatchHistory.getAll(),
        exportDate: new Date().toISOString(),
        version: '1.0'
    };

    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'freeflix-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully!', 'success');
}

function importData(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            if (data.myList) {
                state.myList = data.myList;
                localStorage.setItem('freeflix_mylist', JSON.stringify(data.myList));
            }
            if (data.watched) {
                state.watched = data.watched;
                localStorage.setItem('freeflix_watched', JSON.stringify(data.watched));
            }
            if (data.history) {
                localStorage.setItem('freeflix_history', JSON.stringify(data.history));
            }
            showToast('Data imported successfully!', 'success');
            if (state.currentPage === 'mylist') renderMyList();
        } catch(err) {
            showToast('Invalid backup file', 'error');
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    if (confirm('Are you sure? This will delete all your watch history, list, and preferences.')) {
        localStorage.removeItem('freeflix_mylist');
        localStorage.removeItem('freeflix_watched');
        localStorage.removeItem('freeflix_history');
        state.myList = [];
        state.watched = {};
        showToast('All data cleared', 'info');
        if (state.currentPage === 'mylist') renderMyList();
    }
}

// ============================================
// 5. ENHANCED HOME PAGE WITH HISTORY ROWS
// ============================================
async function addHistoryRows() {
    var container = document.getElementById('homeContent');
    if (!container) return;

    // Continue Watching row
    var continueItems = WatchHistory.getContinueWatching();
    if (continueItems.length > 0) {
        var continueCards = continueItems.map(function(item) {
            var progressPercent = item.duration ? Math.floor((item.progress / item.duration) * 100) : 0;
            var poster = item.poster || '';
            var title = item.title || 'Unknown';
            var mt = item.type || 'movie';
            var safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            var playAction = mt === 'movie'
                ? "playMedia('movie'," + item.id + ")"
                : "playMedia('tv'," + item.id + "," + (item.season||1) + "," + (item.episode||1) + ")";

            var subText = mt === 'movie' ? '' : 'S' + (item.season||1) + ':E' + (item.episode||1);

            return '<div class="content-card continue-card" onclick="' + playAction + '">'
                + '<div class="card-poster">'
                + (poster ? '<img src="' + poster + '" alt="' + safeTitle + '" loading="lazy">' : '<div class="card-poster-placeholder">' + safeTitle + '</div>')
                + '<div class="continue-overlay">'
                + '<div class="continue-play-icon"><i class="fas fa-play"></i></div>'
                + (subText ? '<div class="continue-ep">' + subText + '</div>' : '')
                + '</div>'
                + '<div class="continue-progress-bar"><div class="continue-progress-fill" style="width:' + progressPercent + '%"></div></div>'
                + '</div>'
                + '<div class="card-hover-info" style="opacity:1;transform:none;padding:8px 10px 6px;background:var(--bg-card)">'
                + '<div class="hover-card-title">' + title + '</div>'
                + '<div class="hover-card-meta"><span class="quality">' + progressPercent + '% watched</span></div>'
                + '</div></div>';
        }).join('');

        var continueRow = document.createElement('div');
        continueRow.className = 'content-row fade-in';
        continueRow.innerHTML = '<div class="row-header"><h2 class="row-title">▶️ Continue Watching</h2></div>'
            + '<div class="slider-wrapper">'
            + '<button class="slider-btn left" onclick="slideRow(this,-1)"><i class="fas fa-chevron-left"></i></button>'
            + '<div class="slider">' + continueCards + '</div>'
            + '<button class="slider-btn right" onclick="slideRow(this,1)"><i class="fas fa-chevron-right"></i></button>'
            + '</div>';

        // Insert at top
        container.insertBefore(continueRow, container.firstChild);
    }

    // Watch History row
    var recentHistory = WatchHistory.getRecent(15);
    if (recentHistory.length > 3) {
        var historyCards = recentHistory.map(function(item) {
            var poster = item.poster || '';
            var title = item.title || 'Unknown';
            var mt = item.type || 'movie';
            var safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            return '<div class="content-card" onclick="openDetail(\'' + mt + '\',' + item.id + ')">'
                + '<div class="card-poster">'
                + (poster ? '<img src="' + poster + '" alt="' + safeTitle + '" loading="lazy">' : '<div class="card-poster-placeholder">' + safeTitle + '</div>')
                + '</div>'
                + '<div class="card-hover-info">'
                + '<div class="hover-card-title">' + title + '</div>'
                + '</div></div>';
        }).join('');

        var historyRow = document.createElement('div');
        historyRow.className = 'content-row fade-in';
        historyRow.innerHTML = '<div class="row-header"><h2 class="row-title">🕐 Watch History</h2></div>'
            + '<div class="slider-wrapper">'
            + '<button class="slider-btn left" onclick="slideRow(this,-1)"><i class="fas fa-chevron-left"></i></button>'
            + '<div class="slider">' + historyCards + '</div>'
            + '<button class="slider-btn right" onclick="slideRow(this,1)"><i class="fas fa-chevron-right"></i></button>'
            + '</div>';

        var insertAfter = container.firstChild ? container.firstChild.nextSibling : null;
        if (insertAfter) container.insertBefore(historyRow, insertAfter);
        else container.appendChild(historyRow);
    }

    // "Because you watched" row
    try {
        var byw = await Recommendations.getBecauseYouWatched();
        if (byw && byw.items && byw.items.length > 3) {
            var bywRow = makeContentRow(byw.title, byw.items, 99);
            container.appendChild(bywRow);
        }
    } catch(e) {}

    // Personalized row
    try {
        var personal = await Recommendations.getPersonalizedRow();
        if (personal && personal.length > 3) {
            var favGenres = Recommendations.getFavoriteGenres();
            var personalTitle = '✨ Recommended: ' + (favGenres[0] || 'For You');
            var personalRow = makeContentRow(personalTitle, personal, 98);
            container.appendChild(personalRow);
        }
    } catch(e) {}
}

// ============================================
// 6. HOOK INTO PLAY FUNCTION
// ============================================
(function() {
    // Override playMedia to track history
    var originalPlayMedia = window.playMedia;

    window.playMedia = async function(type, id, season, episode) {
        season = season || 1;
        episode = episode || 1;

        // Get details for history
        try {
            var data;
            if (type === 'movie') {
                data = await getMovieDetails(id);
            } else {
                data = await getTVDetails(id);
            }

            if (data) {
                WatchHistory.add({
                    id: id,
                    type: type,
                    title: data.title || data.name || 'Unknown',
                    poster: data.poster_path ? CONFIG.IMG_W500 + data.poster_path : '',
                    backdrop: data.backdrop_path ? CONFIG.IMG_W300 + data.backdrop_path : '',
                    season: type === 'tv' ? season : null,
                    episode: type === 'tv' ? episode : null,
                    rating: data.vote_average || 0,
                    genres: (data.genres || []).map(function(g) { return g.name; }),
                    progress: 0,
                    duration: type === 'movie' ? (data.runtime || 120) * 60 : 2700
                });
            }
        } catch(e) {}

        // Simulate progress tracking
        startProgressTracking(id, type, season, episode);

        // Call original function
        if (typeof originalPlayMedia === 'function') {
            originalPlayMedia(type, id, season, episode);
        }
    };
})();

// ============================================
// 7. PROGRESS SIMULATION
// ============================================
var progressInterval = null;

function startProgressTracking(id, type, season, episode) {
    clearInterval(progressInterval);

    var elapsed = 0;
    var duration = type === 'movie' ? 7200 : 2700; // seconds

    progressInterval = setInterval(function() {
        var player = document.getElementById('videoPlayer');
        if (!player || !player.classList.contains('active')) {
            clearInterval(progressInterval);
            return;
        }

        elapsed += 30;
        WatchHistory.updateProgress(id, type, season, episode, elapsed, duration);

    }, 30000); // Update every 30 seconds
}

// Stop tracking when player closes
(function() {
    var originalClosePlayer = window.closePlayer;
    window.closePlayer = function() {
        clearInterval(progressInterval);
        if (typeof originalClosePlayer === 'function') {
            originalClosePlayer();
        }
    };
})();

// ============================================
// 8. INITIALIZE ON HOME LOAD
// ============================================
(function() {
    // Wait for home content to load, then add history rows
    var checkHome = setInterval(function() {
        var container = document.getElementById('homeContent');
        if (container && container.children.length > 3) {
            clearInterval(checkHome);
            setTimeout(function() {
                addHistoryRows();
            }, 1000);
        }
    }, 500);

    // Stop checking after 15 seconds
    setTimeout(function() { clearInterval(checkHome); }, 15000);
})();

// ============================================
// 9. CLEANUP OLD DATA
// ============================================
(function() {
    try {
        var watched = JSON.parse(localStorage.getItem('freeflix_watched') || '{}');
        var cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
        var changed = false;
        Object.keys(watched).forEach(function(k) {
            if (watched[k] < cutoff) { delete watched[k]; changed = true; }
        });
        if (changed) localStorage.setItem('freeflix_watched', JSON.stringify(watched));
    } catch(e) {}
})();