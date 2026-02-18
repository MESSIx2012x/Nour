/* ============================================
   FREEFLIX - script.js
   Details, Episodes (with watched tracking),
   My List, Search, Filters, Page Grids
   + Arabic Content Support
   ============================================ */

// ============================================
// DETAIL MODAL
// ============================================
async function openDetail(type, id, autoPlay) {
    var modal = document.getElementById('detailModal');
    var body = document.getElementById('modalBody');
    var heroImg = document.getElementById('modalHeroImg');
    var heroContent = document.getElementById('modalHeroContent');

    modal.classList.add('active');
    document.body.classList.add('no-scroll');

    heroImg.style.backgroundImage = 'none';
    heroContent.innerHTML = '';
    body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;padding:80px 20px"><div class="spinner"></div></div>';

    try {
        var data;
        if (type === 'movie') {
            data = await getMovieDetails(id);
        } else {
            data = await getTVDetails(id);
        }

        if (!data || !data.id) {
            showToast('Failed to load details', 'error');
            closeModal();
            return;
        }

        renderFullModal(data, type, !!autoPlay);
    } catch (err) {
        showToast('Connection error', 'error');
        closeModal();
    }
}

function renderFullModal(data, type, autoPlay) {
    var heroImg = document.getElementById('modalHeroImg');
    var heroContent = document.getElementById('modalHeroContent');
    var body = document.getElementById('modalBody');

    var title = data.title || data.name || 'Unknown';
    var st = title.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    var year = (data.release_date || data.first_air_date || '').substring(0,4);
    var rating = data.vote_average ? data.vote_average.toFixed(1) : '—';
    var match = Math.min(99, Math.floor((data.vote_average||7)*10+Math.random()*5));
    var overview = data.overview || 'No description available.';
    var genres = (data.genres || []).map(function(g){return g.name;});
    var isInList = state.myList.some(function(l){return l.id===data.id && l.type===type;});
    var poster = data.poster_path ? CONFIG.IMG_W500 + data.poster_path : '';
    var sp = poster.replace(/'/g,"\\'");

    var runtime = '';
    if (type === 'movie' && data.runtime) {
        var h = Math.floor(data.runtime/60), m = data.runtime%60;
        runtime = h > 0 ? h+'h '+m+'m' : m+'m';
    } else if (type === 'tv' && data.number_of_seasons) {
        runtime = data.number_of_seasons + ' Season' + (data.number_of_seasons>1?'s':'');
        if (data.number_of_episodes) runtime += ' • ' + data.number_of_episodes + ' Ep';
    }

    var castList = (data.credits && data.credits.cast) ? data.credits.cast.slice(0,10) : [];
    var castText = castList.map(function(c){return c.name;}).join(', ') || 'N/A';

    var leadLabel = type === 'movie' ? 'Director' : 'Creator';
    var leadName = 'N/A';
    if (type === 'movie') {
        var dir = (data.credits && data.credits.crew) ? data.credits.crew.find(function(c){return c.job==='Director';}) : null;
        if (dir) leadName = dir.name;
    } else {
        if (data.created_by && data.created_by.length) {
            leadName = data.created_by.map(function(c){return c.name;}).join(', ');
        }
    }

    var backdrop = data.backdrop_path ? CONFIG.IMG_ORIGINAL + data.backdrop_path : '';
    heroImg.style.backgroundImage = backdrop ? 'url('+backdrop+')' : 'none';

    var playAction = type === 'movie'
        ? 'playMedia(\'movie\','+data.id+')'
        : 'playFirstUnwatched('+data.id+')';

    heroContent.innerHTML = '<h1 class="hero-title">'+title+'</h1>'
        + '<div class="hero-buttons" style="margin-top:14px">'
        + '<button class="btn-play" onclick="'+playAction+'"><i class="fas fa-play"></i> Play</button>'
        + '<button class="btn-info" id="modalListBtn" onclick="toggleMyList('+data.id+',\''+type+'\',\''+st+'\',\''+sp+'\','+(data.vote_average||0)+');updateModalListBtn('+data.id+',\''+type+'\')">'
        + '<i class="fas '+(isInList?'fa-check':'fa-plus')+'"></i> '+(isInList?'In List':'My List')
        + '</button>'
        + '<button class="btn-trailer" onclick="playTrailer(\''+type+'\','+data.id+')"><i class="fas fa-video"></i> Trailer</button>'
        + '</div>';

    var episodesHTML = '';
    if (type === 'tv' && data.number_of_seasons > 0) {
        var opts = '';
        for (var s = 1; s <= data.number_of_seasons; s++) {
            opts += '<option value="'+s+'">Season '+s+'</option>';
        }
        episodesHTML = '<div class="modal-section">'
            + '<div class="modal-section-header"><h3>Episodes</h3>'
            + '<select id="seasonSelect" onchange="loadSeasonEpisodes('+data.id+',parseInt(this.value))">'+opts+'</select></div>'
            + '<div id="episodeList" class="episode-list"><div class="episode-loading-state"><div class="spinner"></div><p>Loading episodes...</p></div></div>'
            + '</div>';
    }

    var allSim = [].concat(
        (data.recommendations && data.recommendations.results) || [],
        (data.similar && data.similar.results) || []
    );
    var seen = {};
    var uniq = [];
    for (var i = 0; i < allSim.length; i++) {
        if (!seen[allSim[i].id] && (allSim[i].poster_path || allSim[i].backdrop_path)) {
            seen[allSim[i].id] = true;
            uniq.push(allSim[i]);
        }
    }
    var simItems = uniq.slice(0,9);

    var simHTML = '';
    if (simItems.length) {
        var simCards = simItems.map(function(s) {
            var sType = s.media_type || type;
            var sTitle = (s.title || s.name || '').replace(/"/g,'&quot;');
            var sYear = (s.release_date || s.first_air_date || '').substring(0,4);
            var sMatch = Math.min(99, Math.floor((s.vote_average||7)*10+Math.random()*5));
            var sImg = s.backdrop_path ? CONFIG.IMG_W300+s.backdrop_path : (s.poster_path ? CONFIG.IMG_W500+s.poster_path : '');
            return '<div class="similar-card" onclick="openDetail(\''+sType+'\','+s.id+')">'
                + '<div class="similar-card-img">'+(sImg?'<img src="'+sImg+'" alt="'+sTitle+'" loading="lazy">':'')+'</div>'
                + '<div class="similar-card-body"><h4>'+sTitle+'</h4><div class="meta-line"><span class="match">'+sMatch+'%</span><span class="year">'+sYear+'</span></div></div></div>';
        }).join('');
        simHTML = '<div class="modal-section"><div class="modal-section-header"><h3>More Like This</h3></div><div class="similar-grid">'+simCards+'</div></div>';
    }

    body.innerHTML = '<div class="modal-info-row"><div class="modal-main-info">'
        + '<div class="modal-meta-row"><span class="modal-match">'+match+'% Match</span><span class="modal-year">'+year+'</span>'
        + (runtime ? '<span class="modal-duration">'+runtime+'</span>' : '')
        + '<span class="modal-quality-badge">HD</span></div>'
        + '<p class="modal-description">'+overview+'</p></div>'
        + '<div class="modal-side-info">'
        + '<p class="modal-detail-item"><span class="label">Cast: </span><span class="value">'+castText+'</span></p>'
        + '<p class="modal-detail-item"><span class="label">Genres: </span><span class="value">'+(genres.join(', ')||'N/A')+'</span></p>'
        + '<p class="modal-detail-item"><span class="label">'+leadLabel+': </span><span class="value">'+leadName+'</span></p>'
        + '<p class="modal-detail-item"><span class="label">Rating: </span><span class="value">⭐ '+rating+'/10</span></p>'
        + '</div></div>'
        + episodesHTML + simHTML;

    if (type === 'tv' && data.number_of_seasons > 0) {
        loadSeasonEpisodes(data.id, 1);
    }

    if (autoPlay && type === 'tv') {
        setTimeout(function() {
            var epSection = document.getElementById('episodeList');
            if (epSection) epSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500);
    }
}

function playFirstUnwatched(tvId) {
    var sel = document.getElementById('seasonSelect');
    var season = sel ? parseInt(sel.value) : 1;
    var epList = document.getElementById('episodeList');
    if (!epList) {
        playMedia('tv', tvId, 1, 1);
        return;
    }
    var items = epList.querySelectorAll('.episode-item');
    for (var i = 0; i < items.length; i++) {
        if (!items[i].classList.contains('watched')) {
            var epNum = parseInt(items[i].dataset.episode) || (i+1);
            playMedia('tv', tvId, season, epNum);
            return;
        }
    }
    playMedia('tv', tvId, season, 1);
}

function updateModalListBtn(id, type) {
    var btn = document.getElementById('modalListBtn');
    if (!btn) return;
    var isIn = state.myList.some(function(l){return l.id===id && l.type===type;});
    btn.innerHTML = '<i class="fas '+(isIn?'fa-check':'fa-plus')+'"></i> '+(isIn?'In List':'My List');
}

// ============================================
// EPISODES
// ============================================
async function loadSeasonEpisodes(tvId, seasonNum) {
    var listEl = document.getElementById('episodeList');
    if (!listEl) return;

    listEl.innerHTML = '<div class="episode-loading-state"><div class="spinner"></div><p>Loading Season ' + seasonNum + '...</p></div>';

    try {
        var data = await getTVSeason(tvId, seasonNum);

        if (!data || !data.episodes || !data.episodes.length) {
            listEl.innerHTML = '<div class="episode-empty-state">'
                + '<i class="fas fa-film" style="font-size:2rem;color:var(--text-muted);margin-bottom:10px"></i>'
                + '<p>No episodes found for Season ' + seasonNum + '</p></div>';
            return;
        }

        var html = '';
        for (var i = 0; i < data.episodes.length; i++) {
            var ep = data.episodes[i];
            var num = ep.episode_number;
            var name = ep.name || 'Episode ' + num;
            var desc = ep.overview || 'No description available.';
            var dur = ep.runtime ? ep.runtime + 'm' : '';
            var still = ep.still_path ? CONFIG.IMG_W300 + ep.still_path : '';
            var epRating = ep.vote_average ? ep.vote_average.toFixed(1) : '';
            var watched = isWatched(tvId, seasonNum, num);
            var airDate = ep.air_date || '';

            html += '<div class="episode-item' + (watched ? ' watched' : '') + '" '
                + 'data-episode="' + num + '" '
                + 'onclick="playMedia(\'tv\',' + tvId + ',' + seasonNum + ',' + num + ')">'
                + '<div class="episode-num-badge">'
                + (watched 
                    ? '<i class="fas fa-check-circle episode-watched-icon"></i>' 
                    : '<span class="episode-number-text">' + num + '</span>')
                + '</div>'
                + '<div class="episode-thumb">'
                + (still 
                    ? '<img src="' + still + '" alt="S' + seasonNum + 'E' + num + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
                      + '<div class="episode-thumb-fallback" style="display:none"><span>E' + num + '</span></div>'
                    : '<div class="episode-thumb-fallback"><span>E' + num + '</span></div>')
                + '<div class="episode-thumb-overlay">'
                + '<div class="episode-play-circle"><i class="fas fa-play"></i></div>'
                + '</div>'
                + '<div class="episode-num-on-thumb">E' + num + '</div>'
                + '</div>'
                + '<div class="episode-info">'
                + '<div class="episode-info-header">'
                + '<h4 class="episode-title-text">'
                + '<span class="episode-num-inline">E' + num + '</span> '
                + name
                + '</h4>'
                + '</div>'
                + '<div class="episode-meta-row">'
                + (dur ? '<span class="episode-dur"><i class="fas fa-clock"></i> ' + dur + '</span>' : '')
                + (epRating ? '<span class="episode-rating"><i class="fas fa-star"></i> ' + epRating + '</span>' : '')
                + (airDate ? '<span class="episode-air">' + airDate + '</span>' : '')
                + (watched ? '<span class="episode-watched-badge"><i class="fas fa-eye"></i> Watched</span>' : '')
                + '</div>'
                + '<p class="episode-desc">' + desc + '</p>'
                + '</div>'
                + '</div>';
        }

        listEl.innerHTML = html;

    } catch (err) {
        listEl.innerHTML = '<div class="episode-empty-state">'
            + '<i class="fas fa-exclamation-triangle" style="font-size:2rem;color:var(--text-muted);margin-bottom:10px"></i>'
            + '<p>Failed to load episodes. '
            + '<button onclick="loadSeasonEpisodes(' + tvId + ',' + seasonNum + ')" '
            + 'style="color:var(--accent);background:none;border:none;cursor:pointer;text-decoration:underline">Retry</button></p></div>';
    }
}

function closeModal() {
    var m = document.getElementById('detailModal');
    if (m) m.classList.remove('active');
    document.body.classList.remove('no-scroll');
}

// ============================================
// MY LIST
// ============================================
function toggleMyList(id, type, title, poster, rating) {
    var idx = -1;
    for (var i = 0; i < state.myList.length; i++) {
        if (state.myList[i].id === id && state.myList[i].type === type) { idx = i; break; }
    }
    if (idx > -1) {
        state.myList.splice(idx, 1);
        showToast('Removed from My List', 'info');
    } else {
        state.myList.push({ id:id, type:type, title:title, poster:poster, rating:rating||0 });
        showToast('"'+title+'" added to My List', 'success');
    }
    localStorage.setItem('freeflix_mylist', JSON.stringify(state.myList));
    if (state.currentPage === 'mylist') renderMyList();
}

function renderMyList() {
    var grid = document.getElementById('myListGrid');
    var empty = document.getElementById('emptyList');
    var count = document.getElementById('mylistCount');
    if (!grid) return;

    if (!state.myList.length) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        count.textContent = '0 titles';
        return;
    }
    grid.style.display = 'grid';
    empty.style.display = 'none';
    count.textContent = state.myList.length + ' title' + (state.myList.length>1?'s':'');
    grid.innerHTML = state.myList.map(function(item) {
        return makeCardHTML({
            id:item.id, title:item.title, name:item.title,
            poster_path: item.poster ? item.poster.replace(CONFIG.IMG_W500,'') : null,
            vote_average:item.rating||0, media_type:item.type, genre_ids:[],
            release_date:'', first_air_date: item.type==='tv'?' ':''
        });
    }).join('');
}

// ============================================
// SEARCH
// ============================================
function setupSearch() {
    var input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', function(e) {
        clearTimeout(state.searchTimer);
        var q = e.target.value.trim();
        if (q.length < 2) { closeSearchOverlay(); return; }
        state.searchTimer = setTimeout(function(){doSearch(q);}, CONFIG.SEARCH_DELAY);
    });
    input.addEventListener('keydown', function(e) {
        if (e.key==='Enter') { clearTimeout(state.searchTimer); var q=input.value.trim(); if(q.length>=2) doSearch(q); }
        if (e.key==='Escape') closeSearch();
    });
}

async function doSearch(query) {
    state.searchQuery = query;
    var overlay = document.getElementById('searchOverlay');
    var results = document.getElementById('searchResults');
    var loading = document.getElementById('searchLoading');
    var noRes = document.getElementById('noResults');
    var titleEl = document.getElementById('searchTitle');

    overlay.classList.add('active');
    results.style.display = 'none';
    noRes.style.display = 'none';
    loading.style.display = 'flex';

    try {
        var data = await searchMulti(query);
        loading.style.display = 'none';
        if (state.searchQuery !== query) return;
        if (data && data.results) {
            var filtered = data.results.filter(function(i){return (i.media_type==='movie'||i.media_type==='tv') && i.poster_path;});
            if (filtered.length) {
                titleEl.textContent = 'Results for "'+query+'" ('+filtered.length+')';
                results.innerHTML = filtered.map(function(i){return makeCardHTML(i);}).join('');
                results.style.display = 'grid';
            } else { noRes.style.display = 'block'; }
        } else { noRes.style.display = 'block'; }
    } catch(e) { loading.style.display='none'; noRes.style.display='block'; }
}

function toggleSearch() {
    var c = document.getElementById('searchContainer');
    var inp = document.getElementById('searchInput');
    c.classList.toggle('active');
    if (c.classList.contains('active')) inp.focus(); else closeSearch();
}
function closeSearch() {
    document.getElementById('searchContainer').classList.remove('active');
    document.getElementById('searchInput').value = '';
    closeSearchOverlay();
}
function closeSearchOverlay() { document.getElementById('searchOverlay').classList.remove('active'); }

// ============================================
// PAGE GRIDS (Updated with Arabic support)
// ============================================
async function loadPageData(type) {
    var ps = state.pages[type];
    if (ps.loading) return;
    ps.loading = true;
    showGridLoading(type, true);
    try {
        var data;
        if (type === 'movies') {
            data = await discoverMovies({
                sort_by: getVal('movieSortFilter') || 'popularity.desc',
                with_genres: getVal('movieGenreFilter') || undefined,
                page: ps.page
            });
        } else if (type === 'series') {
            data = await discoverTV({
                sort_by: getVal('seriesSortFilter') || 'popularity.desc',
                with_genres: getVal('seriesGenreFilter') || undefined,
                page: ps.page
            });
        } else if (type === 'anime') {
            data = await getAnime({
                sort_by: getVal('animeSortFilter') || 'popularity.desc',
                page: ps.page
            }, getVal('animeTypeFilter') || 'tv');
        } else if (type === 'arabic') {
            var arabicType = getVal('arabicTypeFilter') || 'all';
            var arabicGenre = getVal('arabicGenreFilter') || undefined;
            var arabicSort = getVal('arabicSortFilter') || 'popularity.desc';

            if (arabicType === 'all') {
                // Fetch both movies and TV
                var movieData = await getArabicMovies({
                    sort_by: arabicSort,
                    with_genres: arabicGenre,
                    page: ps.page
                });
                var tvData = await getArabicTV({
                    sort_by: arabicSort,
                    with_genres: arabicGenre,
                    page: ps.page
                });

                var allResults = [];
                if (movieData && movieData.results) {
                    allResults = allResults.concat(movieData.results.map(function(m) {
                        m.media_type = 'movie';
                        return m;
                    }));
                }
                if (tvData && tvData.results) {
                    allResults = allResults.concat(tvData.results.map(function(t) {
                        t.media_type = 'tv';
                        return t;
                    }));
                }

                // Sort by popularity
                allResults.sort(function(a, b) {
                    return (b.popularity || 0) - (a.popularity || 0);
                });

                data = {
                    results: allResults,
                    total_pages: Math.max(
                        (movieData && movieData.total_pages) || 1,
                        (tvData && tvData.total_pages) || 1
                    )
                };
            } else if (arabicType === 'movie') {
                data = await getArabicMovies({
                    sort_by: arabicSort,
                    with_genres: arabicGenre,
                    page: ps.page
                });
                if (data && data.results) {
                    data.results = data.results.map(function(m) {
                        m.media_type = 'movie';
                        return m;
                    });
                }
            } else {
                data = await getArabicTV({
                    sort_by: arabicSort,
                    with_genres: arabicGenre,
                    page: ps.page
                });
                if (data && data.results) {
                    data.results = data.results.map(function(t) {
                        t.media_type = 'tv';
                        return t;
                    });
                }
            }
        }

        if (data && data.results) {
            var items = data.results.filter(function(i) { return i.poster_path; });
            ps.items = ps.page === 1 ? items : ps.items.concat(items);
            ps.totalPages = Math.min(data.total_pages || 1, 500);
            ps.loaded = true;
            renderGrid(type);
        }
    } catch(e) {
        showToast('Failed to load', 'error');
    }
    showGridLoading(type, false);
    ps.loading = false;
}

function getVal(id) { var el = document.getElementById(id); return el ? el.value : ''; }

function renderGrid(type) {
    var gridId;
    if (type === 'movies') gridId = 'moviesGrid';
    else if (type === 'series') gridId = 'seriesGrid';
    else if (type === 'anime') gridId = 'animeGrid';
    else if (type === 'arabic') gridId = 'arabicGrid';

    var grid = document.getElementById(gridId);
    if (!grid) return;

    var ps = state.pages[type];
    var mt;
    if (type === 'movies') mt = 'movie';
    else if (type === 'series') mt = 'tv';
    else if (type === 'anime') mt = (getVal('animeTypeFilter') === 'movie' ? 'movie' : 'tv');
    else if (type === 'arabic') mt = null; // uses item.media_type

    grid.innerHTML = ps.items.map(function(item) {
        if (mt) item.media_type = item.media_type || mt;
        return makeCardHTML(item);
    }).join('');

    var lm = document.getElementById(type + 'LoadMore');
    if (lm) lm.style.display = ps.page < ps.totalPages ? 'block' : 'none';
}

async function loadMorePage(type) {
    var ps = state.pages[type];
    if (ps.loading || ps.page >= ps.totalPages) return;
    ps.page++;
    await loadPageData(type);
}

function showGridLoading(type, show) {
    var el = document.getElementById(type + 'Loading');
    if (el) el.classList.toggle('active', show);
}

function applyFilters(type) {
    state.pages[type].page = 1;
    state.pages[type].items = [];
    loadPageData(type);
}

function resetFilters(type) {
    if (type === 'movies') {
        document.getElementById('movieGenreFilter').value = '';
        document.getElementById('movieSortFilter').value = 'popularity.desc';
    } else if (type === 'series') {
        document.getElementById('seriesGenreFilter').value = '';
        document.getElementById('seriesSortFilter').value = 'popularity.desc';
    } else if (type === 'anime') {
        document.getElementById('animeTypeFilter').value = 'tv';
        document.getElementById('animeSortFilter').value = 'popularity.desc';
    } else if (type === 'arabic') {
        document.getElementById('arabicTypeFilter').value = 'all';
        document.getElementById('arabicGenreFilter').value = '';
        document.getElementById('arabicSortFilter').value = 'popularity.desc';
    }
    applyFilters(type);
}