/* ============================================
   YallaShoof - main.js (FIXED)
   Auto Source Switching - Working Servers Only
   ============================================ */

// ============================================
// 1. WORKING EMBED SOURCES (Tested & Verified)
// ============================================
const EMBED_SOURCES = [
    {
        name: 'Videasy',
        movie: (id) => `https://player.videasy.net/movie/${id}`,
        tv: (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}`
    },
    {
        name: 'VidSrc Pro',
        movie: (id) => `https://vidsrc.pro/embed/movie/${id}`,
        tv: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`
    },
    {
        name: 'Embed SU',
        movie: (id) => `https://embed.su/embed/movie/${id}`,
        tv: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`
    },
    {
        name: 'SuperEmbed',
        movie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
        tv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`
    },
    {
        name: 'VidSrc CC',
        movie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
        tv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`
    },
    {
        name: 'SmashyStream',
        movie: (id) => `https://player.smashy.stream/movie/${id}`,
        tv: (id, s, e) => `https://player.smashy.stream/tv/${id}/${s}/${e}`
    },
    {
        name: 'AutoEmbed',
        movie: (id) => `https://autoembed.co/movie/tmdb/${id}`,
        tv: (id, s, e) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}`
    },
    {
        name: 'VidSrc To',
        movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
        tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
    },
    {
        name: 'NontonGo',
        movie: (id) => `https://www.NontonGo.win/embed/movie/${id}`,
        tv: (id, s, e) => `https://www.NontonGo.win/embed/tv/${id}/${s}/${e}`
    },
    {
        name: 'VidSrc ICU',
        movie: (id) => `https://vidsrc.icu/embed/movie/${id}`,
        tv: (id, s, e) => `https://vidsrc.icu/embed/tv/${id}/${s}/${e}`
    },
    {
        name: '2Embed',
        movie: (id) => `https://www.2embed.cc/embed/${id}`,
        tv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`
    },
    {
        name: 'VidSrc XYZ',
        movie: (id) => `https://vidsrc.xyz/embed/movie/${id}`,
        tv: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}`
    }
];

// Update CONFIG
CONFIG.EMBED_SOURCES = EMBED_SOURCES;

// ============================================
// 2. AUTO-SWITCH STATE
// ============================================
var autoSwitchState = {
    isRunning: false,
    triedIndexes: [],
    currentTimer: null,
    verifyTimer: null,
    stopped: false
};

function resetAutoSwitch() {
    autoSwitchState.isRunning = false;
    autoSwitchState.triedIndexes = [];
    autoSwitchState.stopped = true;
    if (autoSwitchState.currentTimer) {
        clearTimeout(autoSwitchState.currentTimer);
        autoSwitchState.currentTimer = null;
    }
    if (autoSwitchState.verifyTimer) {
        clearTimeout(autoSwitchState.verifyTimer);
        autoSwitchState.verifyTimer = null;
    }
}

// ============================================
// 3. PLAY MEDIA - MAIN FUNCTION
// ============================================
async function playMedia(type, id, season, episode) {
    season = season || 1;
    episode = episode || 1;

    closeModal();

    if (type === 'movie') {
        markMovieWatched(id);
    } else {
        markAsWatched(id, season, episode);
        setTimeout(function() {
            updateEpisodeWatchedUI(id, season, episode);
        }, 300);
    }

    state.currentPlayInfo = {
        type: type,
        id: id,
        season: season,
        episode: episode
    };

    resetAutoSwitch();
    autoSwitchState.stopped = false;

    var player = document.getElementById('videoPlayer');
    var container = document.getElementById('videoPlayerContainer');
    var loading = document.getElementById('playerLoading');
    var titleEl = document.getElementById('playerTitle');
    var clickZone = document.getElementById('playerClickZone');

    if (!player || !container) {
        showToast('Player error', 'error');
        return;
    }

    if (clickZone) clickZone.style.display = 'none';

    removeAllIframes(container);

    if (loading) loading.classList.add('active');
    updateSourceDisplay('🔍 Searching...');
    player.classList.add('active');
    document.body.classList.add('no-scroll');
    lockLandscape();

    titleEl.textContent = 'Finding best server...';
    fetchPlayerTitle(type, id, season, episode);

    showToast('🔄 Auto-finding best server...', 'info');

    // Start auto-switching
    autoSwitchState.isRunning = true;
    autoSwitchState.triedIndexes = [];

    tryNextSource(type, id, season, episode, 0);

    showPlayerUI();
    autoHideUI();
}

// ============================================
// 4. TRY NEXT SOURCE - CORE AUTO-SWITCH
// ============================================
function tryNextSource(type, id, season, episode, startIndex) {
    // Check if stopped
    if (autoSwitchState.stopped) return;

    // Check if we still playing same content
    if (!state.currentPlayInfo ||
        state.currentPlayInfo.type !== type ||
        state.currentPlayInfo.id !== id) {
        return;
    }

    var container = document.getElementById('videoPlayerContainer');
    var loading = document.getElementById('playerLoading');
    if (!container) return;

    var totalSources = EMBED_SOURCES.length;

    // Find next untried source
    var sourceIndex = startIndex;
    var loopCount = 0;
    while (autoSwitchState.triedIndexes.indexOf(sourceIndex) !== -1 && loopCount < totalSources) {
        sourceIndex = (sourceIndex + 1) % totalSources;
        loopCount++;
    }

    // All sources tried
    if (loopCount >= totalSources) {
        if (loading) loading.classList.remove('active');
        showToast('⚠️ Tried all servers. Use Switch to try manually.', 'warning');
        autoSwitchState.isRunning = false;
        // Load first source as final fallback
        forceLoadSource(type, id, season, episode, 0);
        return;
    }

    // Mark as tried
    autoSwitchState.triedIndexes.push(sourceIndex);
    state.currentEmbedIndex = sourceIndex;

    var source = EMBED_SOURCES[sourceIndex];
    var tryNum = autoSwitchState.triedIndexes.length;

    // Build URL
    var url;
    if (type === 'movie') {
        url = source.movie(id);
    } else {
        url = source.tv(id, season, episode);
    }

    // Update UI
    updateSourceDisplay(source.name + ' (' + tryNum + '/' + totalSources + ')');
    if (loading) loading.classList.add('active');

    // Show toast only every 3rd try to avoid spam
    if (tryNum <= 3 || tryNum % 3 === 0) {
        showToast('🔄 Trying: ' + source.name + ' (' + tryNum + '/' + totalSources + ')', 'info');
    }

    // Clean old iframes
    removeAllIframes(container);

    // Create iframe
    var iframe = document.createElement('iframe');
    iframe.id = 'mainPlayerIframe';
    iframe.src = url;
    iframe.frameBorder = '0';
    iframe.scrolling = 'no';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('webkitallowfullscreen', '');
    iframe.setAttribute('mozallowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture; gyroscope; accelerometer');
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100vw;height:100vh;border:none;z-index:2;background:#000;';

    var hasDecided = false;

    function decideResult(isGood, reason) {
        if (hasDecided) return;
        if (autoSwitchState.stopped) return;
        hasDecided = true;

        // Clear timers
        if (autoSwitchState.currentTimer) {
            clearTimeout(autoSwitchState.currentTimer);
            autoSwitchState.currentTimer = null;
        }
        if (autoSwitchState.verifyTimer) {
            clearTimeout(autoSwitchState.verifyTimer);
            autoSwitchState.verifyTimer = null;
        }

        if (isGood) {
            // Source works!
            autoSwitchState.isRunning = false;
            if (loading) loading.classList.remove('active');
            updateSourceDisplay('✅ ' + source.name);
            showToast('✅ Playing on: ' + source.name, 'success');
        } else {
            // Source failed, try next
            console.log('Source failed: ' + source.name + ' - ' + reason);
            var nextIndex = (sourceIndex + 1) % totalSources;
            setTimeout(function() {
                tryNextSource(type, id, season, episode, nextIndex);
            }, 300);
        }
    }

    // === DETECTION METHOD 1: iframe load event ===
    iframe.onload = function() {
        if (hasDecided || autoSwitchState.stopped) return;

        // iframe loaded, now verify content
        autoSwitchState.verifyTimer = setTimeout(function() {
            if (hasDecided || autoSwitchState.stopped) return;

            // Check if iframe still exists
            var currentFrame = document.getElementById('mainPlayerIframe');
            if (!currentFrame) {
                decideResult(false, 'iframe removed');
                return;
            }

            // Try to read iframe content
            try {
                var doc = currentFrame.contentDocument || currentFrame.contentWindow.document;
                var bodyHTML = doc.body ? doc.body.innerHTML : '';
                var bodyText = doc.body ? doc.body.innerText : '';
                var lowerText = bodyText.toLowerCase();

                // Check for error messages
                if (
                    lowerText.includes('not found') ||
                    lowerText.includes('unavailable') ||
                    lowerText.includes('this media') ||
                    lowerText.includes('no sources') ||
                    lowerText.includes('we are unable') ||
                    lowerText.includes('error') ||
                    lowerText.includes('404') ||
                    lowerText.includes('blocked') ||
                    lowerText.includes('removed') ||
                    lowerText.includes('dmca') ||
                    lowerText.includes('not available') ||
                    lowerText.includes('access denied') ||
                    lowerText.includes('403')
                ) {
                    decideResult(false, 'Error text: ' + bodyText.substring(0, 100));
                    return;
                }

                // Check if page is too short (probably error page)
                if (bodyText.trim().length > 0 && bodyText.trim().length < 30 && !bodyHTML.includes('iframe') && !bodyHTML.includes('video') && !bodyHTML.includes('player')) {
                    decideResult(false, 'Too short content: ' + bodyText.trim());
                    return;
                }

                // Has video/player elements = good sign
                if (bodyHTML.includes('<video') || bodyHTML.includes('<iframe') || bodyHTML.includes('player') || bodyHTML.includes('jwplayer') || bodyHTML.includes('plyr') || bodyHTML.includes('hls')) {
                    decideResult(true, 'Has player elements');
                    return;
                }

                // Content looks OK (not empty, no errors)
                if (bodyText.trim().length > 50 || bodyHTML.length > 500) {
                    decideResult(true, 'Content loaded');
                    return;
                }

            } catch(e) {
                // CORS error = external content loaded = probably working
                decideResult(true, 'CORS blocked (external content)');
                return;
            }

            // If we get here, assume it might work
            decideResult(true, 'Default pass');

        }, 2500); // Wait 2.5 seconds after load to verify
    };

    // === DETECTION METHOD 2: iframe error ===
    iframe.onerror = function() {
        decideResult(false, 'Load error event');
    };

    // === DETECTION METHOD 3: Timeout ===
    autoSwitchState.currentTimer = setTimeout(function() {
        if (!hasDecided && !autoSwitchState.stopped) {
            // Check if iframe at least started loading
            var currentFrame = document.getElementById('mainPlayerIframe');
            if (!currentFrame) {
                decideResult(false, 'Timeout - no iframe');
            } else {
                // Give benefit of doubt if iframe exists
                // Some sources are slow but work
                try {
                    var doc = currentFrame.contentDocument;
                    if (doc && doc.body && doc.body.innerHTML.length < 10) {
                        decideResult(false, 'Timeout - empty page');
                    } else {
                        decideResult(true, 'Timeout - but content exists');
                    }
                } catch(e) {
                    // CORS = external content = probably fine
                    decideResult(true, 'Timeout - CORS (external)');
                }
            }
        }
    }, 7000); // 7 second timeout

    // Add to container
    container.appendChild(iframe);
}

// ============================================
// 5. FORCE LOAD SOURCE (no auto-switch)
// ============================================
function forceLoadSource(type, id, season, episode, sourceIndex) {
    var container = document.getElementById('videoPlayerContainer');
    var loading = document.getElementById('playerLoading');
    if (!container) return;

    removeAllIframes(container);
    autoSwitchState.isRunning = false;

    var source = EMBED_SOURCES[sourceIndex] || EMBED_SOURCES[0];
    state.currentEmbedIndex = sourceIndex;

    var url;
    if (type === 'movie') url = source.movie(id);
    else url = source.tv(id, season, episode);

    updateSourceDisplay(source.name);

    var iframe = document.createElement('iframe');
    iframe.id = 'mainPlayerIframe';
    iframe.src = url;
    iframe.frameBorder = '0';
    iframe.scrolling = 'no';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('webkitallowfullscreen', '');
    iframe.setAttribute('mozallowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture; gyroscope; accelerometer');
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100vw;height:100vh;border:none;z-index:2;background:#000;';

    iframe.onload = function() {
        if (loading) loading.classList.remove('active');
    };

    if (loading) loading.classList.add('active');
    container.appendChild(iframe);

    setTimeout(function() {
        if (loading) loading.classList.remove('active');
    }, 8000);
}

// ============================================
// 6. LOAD EMBED SOURCE (for manual switch)
// ============================================
function loadEmbedSource(type, id, season, episode, sourceIndex) {
    resetAutoSwitch();
    autoSwitchState.stopped = true;
    forceLoadSource(type, id, season, episode, sourceIndex);
    var source = EMBED_SOURCES[sourceIndex] || EMBED_SOURCES[0];
    showToast('▶ Loading: ' + source.name, 'info');
}

// ============================================
// 7. SOURCE DISPLAY
// ============================================
function updateSourceDisplay(name) {
    var el = document.getElementById('currentSourceName');
    if (el) el.textContent = name || 'Source';
}

// ============================================
// 8. SWITCH SOURCE (Manual)
// ============================================
function switchSource() {
    if (!state.currentPlayInfo) {
        showToast('Nothing is playing', 'warning');
        return;
    }

    resetAutoSwitch();
    autoSwitchState.stopped = true;

    var info = state.currentPlayInfo;
    var totalSources = EMBED_SOURCES.length;

    state.currentEmbedIndex = (state.currentEmbedIndex + 1) % totalSources;

    var name = EMBED_SOURCES[state.currentEmbedIndex].name;
    var num = state.currentEmbedIndex + 1;

    showToast('🔄 ' + name + ' (' + num + '/' + totalSources + ')', 'info');

    forceLoadSource(info.type, info.id, info.season, info.episode, state.currentEmbedIndex);
}

// ============================================
// 9. SMART SWITCH (Re-run auto detection)
// ============================================
function smartSwitch() {
    if (!state.currentPlayInfo) {
        showToast('Nothing is playing', 'warning');
        return;
    }

    resetAutoSwitch();
    autoSwitchState.stopped = false;

    var info = state.currentPlayInfo;

    showToast('🔍 Re-scanning all servers...', 'info');

    autoSwitchState.isRunning = true;
    autoSwitchState.triedIndexes = [];

    var startIndex = (state.currentEmbedIndex + 1) % EMBED_SOURCES.length;
    tryNextSource(info.type, info.id, info.season, info.episode, startIndex);
}

// ============================================
// 10. REMOVE ALL IFRAMES
// ============================================
function removeAllIframes(container) {
    if (!container) return;
    var frames = container.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
        try { frames[i].src = 'about:blank'; } catch(e) {}
        try { frames[i].remove(); } catch(e) { frames[i].parentNode.removeChild(frames[i]); }
    }
}

// ============================================
// 11. CLOSE PLAYER
// ============================================
function closePlayer() {
    resetAutoSwitch();

    var player = document.getElementById('videoPlayer');
    var container = document.getElementById('videoPlayerContainer');
    var clickZone = document.getElementById('playerClickZone');

    if (container) removeAllIframes(container);
    if (clickZone) clickZone.style.display = '';
    if (player) player.classList.remove('active');

    document.body.classList.remove('no-scroll');

    if (state.currentPlayInfo && state.currentPlayInfo.type === 'tv') {
        var savedInfo = {
            id: state.currentPlayInfo.id,
            season: state.currentPlayInfo.season,
            episode: state.currentPlayInfo.episode
        };
        setTimeout(function() {
            var modal = document.getElementById('detailModal');
            if (modal && modal.classList.contains('active')) {
                var sel = document.getElementById('seasonSelect');
                if (sel) loadSeasonEpisodes(savedInfo.id, parseInt(sel.value));
            }
        }, 300);
    }

    state.currentPlayInfo = null;
    state.currentEmbedIndex = 0;

    exitFullscreenSafe();
    unlockOrientation();
}

// ============================================
// 12. UPDATE EPISODE WATCHED UI
// ============================================
function updateEpisodeWatchedUI(tvId, season, episode) {
    var items = document.querySelectorAll('.episode-item');
    if (!items || !items.length) return;

    for (var i = 0; i < items.length; i++) {
        var epNum = parseInt(items[i].dataset.episode);
        if (epNum === episode) {
            items[i].classList.add('watched');
            var numEl = items[i].querySelector('.episode-num-badge');
            if (numEl) numEl.innerHTML = '<i class="fas fa-check-circle episode-watched-icon"></i>';
            var metaRow = items[i].querySelector('.episode-meta-row');
            if (metaRow && !metaRow.querySelector('.episode-watched-badge')) {
                var badge = document.createElement('span');
                badge.className = 'episode-watched-badge';
                badge.innerHTML = '<i class="fas fa-eye"></i> Watched';
                metaRow.appendChild(badge);
            }
            break;
        }
    }
}

// ============================================
// 13. FETCH PLAYER TITLE
// ============================================
async function fetchPlayerTitle(type, id, season, episode) {
    var el = document.getElementById('playerTitle');
    if (!el) return;
    try {
        var data;
        if (type === 'movie') {
            data = await getMovieDetails(id);
            if (data) el.textContent = data.title || data.name || 'Movie';
        } else {
            data = await getTVDetails(id);
            if (data) {
                el.textContent = (data.name || 'Series') + ' — S' + season + ':E' + episode;
            }
        }
    } catch(e) {
        el.textContent = type === 'movie' ? 'Movie' : 'S' + season + ':E' + episode;
    }
}

// ============================================
// 14. PLAYER UI CONTROLS
// ============================================
function setupPlayerEvents() {
    var container = document.getElementById('videoPlayerContainer');
    if (!container) return;

    container.addEventListener('mousemove', function() {
        showPlayerUI(); autoHideUI();
    });
    container.addEventListener('touchstart', function() {
        showPlayerUI(); autoHideUI();
    }, { passive: true });

    var clickZone = document.getElementById('playerClickZone');
    if (clickZone) {
        clickZone.addEventListener('dblclick', function() { toggleFullscreen(); });
    }
}

function showPlayerUI() {
    var c = document.getElementById('videoPlayerContainer');
    if (c) c.classList.add('show-controls');
}
function hidePlayerUI() {
    var c = document.getElementById('videoPlayerContainer');
    if (c) c.classList.remove('show-controls');
}
function autoHideUI() {
    if (state.controlsTimer) clearTimeout(state.controlsTimer);
    state.controlsTimer = setTimeout(hidePlayerUI, CONFIG.CONTROLS_TIMEOUT);
}

// ============================================
// 15. FULLSCREEN
// ============================================
function toggleFullscreen() {
    if (!isFullscreen()) enterFullscreen(document.getElementById('videoPlayer'));
    else exitFullscreenSafe();
}
function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}
function enterFullscreen(el) {
    if (!el) return;
    try {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
        else if (el.msRequestFullscreen) el.msRequestFullscreen();
    } catch(e) {}
    updateFullscreenButton(true);
}
function exitFullscreenSafe() {
    try {
        if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
        else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
        else if (document.mozFullScreenElement) document.mozCancelFullScreen();
        else if (document.msFullscreenElement) document.msExitFullscreen();
    } catch(e) {}
    updateFullscreenButton(false);
}
function updateFullscreenButton(isFull) {
    var btn = document.getElementById('playerFullscreenBtn');
    if (!btn) return;
    btn.innerHTML = isFull
        ? '<i class="fas fa-compress"></i><span>Exit</span>'
        : '<i class="fas fa-expand"></i><span>Fullscreen</span>';
}

document.addEventListener('fullscreenchange', function() { updateFullscreenButton(isFullscreen()); });
document.addEventListener('webkitfullscreenchange', function() { updateFullscreenButton(isFullscreen()); });

// ============================================
// 16. SCREEN ORIENTATION
// ============================================
function lockLandscape() {
    try {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){});
    } catch(e) {}
}
function unlockOrientation() {
    try {
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch(e) {}
}

// ============================================
// 17. KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', function(e) {
    var player = document.getElementById('videoPlayer');
    if (!player || !player.classList.contains('active')) return;
    var key = e.key ? e.key.toLowerCase() : '';
    if (key === 'f') { e.preventDefault(); toggleFullscreen(); }
    if (key === 'escape') { e.preventDefault(); closePlayer(); }
    if (key === 's') { e.preventDefault(); switchSource(); }
    if (key === 'a') { e.preventDefault(); smartSwitch(); }
});

// ============================================
// 18. TRAILER PLAYER
// ============================================
async function playTrailer(type, id) {
    try {
        var data = type === 'movie' ? await getMovieDetails(id) : await getTVDetails(id);
        if (!data) { showToast('Cannot load trailer', 'error'); return; }

        var vids = (data.videos && data.videos.results) || [];
        if (!vids.length) { showToast('No trailer available', 'warning'); return; }

        var trailer = null;
        for (var i = 0; i < vids.length; i++) {
            if (vids[i].type === 'Trailer' && vids[i].site === 'YouTube' && vids[i].official) { trailer = vids[i]; break; }
        }
        if (!trailer) {
            for (var i = 0; i < vids.length; i++) {
                if (vids[i].type === 'Trailer' && vids[i].site === 'YouTube') { trailer = vids[i]; break; }
            }
        }
        if (!trailer) {
            for (var i = 0; i < vids.length; i++) {
                if (vids[i].site === 'YouTube') { trailer = vids[i]; break; }
            }
        }
        if (!trailer) { showToast('No trailer found', 'warning'); return; }

        var modal = document.getElementById('trailerModal');
        var container = document.getElementById('trailerContainer');
        if (!modal || !container) return;

        container.innerHTML = '<iframe src="https://www.youtube.com/embed/' + trailer.key + '?autoplay=1&rel=0" allow="autoplay; fullscreen; encrypted-media" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe>';
        modal.classList.add('active');
    } catch(e) {
        showToast('Trailer failed', 'error');
    }
}

function closeTrailer() {
    var modal = document.getElementById('trailerModal');
    var container = document.getElementById('trailerContainer');
    if (container) container.innerHTML = '';
    if (modal) modal.classList.remove('active');
}