/* ============================================
   FREEFLIX - main.js (COMPLETE FINAL)
   Video Player with Auto Source Detection
   Mobile Buttons + Desktop Shortcuts
   Trailer + Fullscreen + Orientation
   ============================================ */

// ============================================
// 1. AUTO SOURCE DETECTION SYSTEM
// ============================================
var sourceTestResults = {};
var SOURCE_TEST_TIMEOUT = 5000;

function testEmbedSource(url, timeout) {
    return new Promise(function(resolve) {
        var timer = null;
        var done = false;
        var testFrame = document.createElement('iframe');
        testFrame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px;';
        testFrame.setAttribute('tabindex', '-1');

        function finish(result) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try {
                if (testFrame && testFrame.parentNode) {
                    testFrame.parentNode.removeChild(testFrame);
                }
            } catch(e) {}
            resolve(result);
        }

        timer = setTimeout(function() {
            finish(false);
        }, timeout || SOURCE_TEST_TIMEOUT);

        testFrame.onload = function() {
            try {
                var w = testFrame.contentWindow;
            } catch(e) {}
            finish(true);
        };

        testFrame.onerror = function() {
            finish(false);
        };

        try {
            testFrame.src = url;
            document.body.appendChild(testFrame);
        } catch(e) {
            finish(false);
        }
    });
}

async function findBestSource(type, id, season, episode) {
    var cacheKey = type + '_' + id;

    // Check cache (valid 10 minutes)
    if (sourceTestResults[cacheKey] && (Date.now() - sourceTestResults[cacheKey].time < 600000)) {
        return sourceTestResults[cacheKey].index;
    }

    var sources = CONFIG.EMBED_SOURCES;

    // Test all simultaneously
    var testPromises = [];
    for (var i = 0; i < sources.length; i++) {
        (function(index) {
            var url;
            if (type === 'movie') {
                url = sources[index].movie(id);
            } else {
                url = sources[index].tv(id, season || 1, episode || 1);
            }
            var promise = testEmbedSource(url, SOURCE_TEST_TIMEOUT).then(function(works) {
                return { index: index, works: works, name: sources[index].name };
            });
            testPromises.push(promise);
        })(i);
    }

    return new Promise(function(resolve) {
        var resolved = false;
        var completedCount = 0;
        var totalSources = sources.length;

        for (var i = 0; i < testPromises.length; i++) {
            (function(promise) {
                promise.then(function(result) {
                    completedCount++;

                    if (!resolved && result.works) {
                        resolved = true;
                        sourceTestResults[cacheKey] = { index: result.index, time: Date.now() };
                        resolve(result.index);
                    }

                    if (completedCount === totalSources && !resolved) {
                        resolved = true;
                        resolve(0);
                    }
                });
            })(testPromises[i]);
        }

        // Safety timeout
        setTimeout(function() {
            if (!resolved) {
                resolved = true;
                resolve(0);
            }
        }, SOURCE_TEST_TIMEOUT + 2000);
    });
}

async function quickTestSource(index, type, id, season, episode) {
    var source = CONFIG.EMBED_SOURCES[index];
    if (!source) return false;
    var url;
    if (type === 'movie') {
        url = source.movie(id);
    } else {
        url = source.tv(id, season || 1, episode || 1);
    }
    return await testEmbedSource(url, 4000);
}

// ============================================
// 2. PLAY MEDIA - MAIN FUNCTION
// ============================================
async function playMedia(type, id, season, episode) {
    season = season || 1;
    episode = episode || 1;

    // Close modal if open
    closeModal();

    // Mark as watched
    if (type === 'movie') {
        markMovieWatched(id);
    } else {
        markAsWatched(id, season, episode);
        setTimeout(function() {
            updateEpisodeWatchedUI(id, season, episode);
        }, 300);
    }

    // Save play info
    state.currentPlayInfo = {
        type: type,
        id: id,
        season: season,
        episode: episode
    };

    // Get DOM elements
    var player = document.getElementById('videoPlayer');
    var container = document.getElementById('videoPlayerContainer');
    var loading = document.getElementById('playerLoading');
    var titleEl = document.getElementById('playerTitle');
    var clickZone = document.getElementById('playerClickZone');

    if (!player || !container) {
        showToast('Player error', 'error');
        return;
    }

    // Hide click zone so iframe gets all clicks
    if (clickZone) {
        clickZone.style.display = 'none';
    }

    // Remove any existing iframes
    removeAllIframes(container);

    // Update UI
    titleEl.textContent = 'Finding best source...';
    loading.classList.add('active');
    updateSourceDisplay('Detecting...');

    // Show player overlay
    player.classList.add('active');
    document.body.classList.add('no-scroll');

    // Lock landscape
    lockLandscape();

    // Show toast
    showToast('🔍 Auto-detecting best source...', 'info');

    // Find best working source
    var bestIndex;
    try {
        bestIndex = await findBestSource(type, id, season, episode);
    } catch(e) {
        bestIndex = 0;
    }

    state.currentEmbedIndex = bestIndex;

    // Update title
    var sourceName = CONFIG.EMBED_SOURCES[bestIndex].name;
    titleEl.textContent = 'Loading: ' + sourceName;
    updateSourceDisplay(sourceName);

    // Load the embed
    loadEmbedSource(type, id, season, episode, bestIndex);

    // Fetch real title from API
    fetchPlayerTitle(type, id, season, episode);

    // Show controls then auto-hide
    showPlayerUI();
    autoHideUI();
}

// ============================================
// 3. LOAD EMBED SOURCE INTO PLAYER
// ============================================
function loadEmbedSource(type, id, season, episode, sourceIndex) {
    var container = document.getElementById('videoPlayerContainer');
    var loading = document.getElementById('playerLoading');

    if (!container) return;

    // Clean old iframes
    removeAllIframes(container);

    // Show loading
    if (loading) {
        loading.classList.add('active');
    }

    // Get source
    var totalSources = CONFIG.EMBED_SOURCES.length;
    var safeIndex = sourceIndex % totalSources;
    var source = CONFIG.EMBED_SOURCES[safeIndex];

    // Build URL
    var url;
    if (type === 'movie') {
        url = source.movie(id);
    } else {
        url = source.tv(id, season, episode);
    }

    // Update source name display
    updateSourceDisplay(source.name);

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
    // NO sandbox - it blocks video players completely

    // Force full landscape dimensions
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100vw;height:100vh;border:none;z-index:2;background:#000;';

    // Track load state
    var loaded = false;
    var loadTimer = null;

    // On successful load
    iframe.onload = function() {
        if (loaded) return;
        loaded = true;

        if (loadTimer) {
            clearTimeout(loadTimer);
            loadTimer = null;
        }

        if (loading) {
            loading.classList.remove('active');
        }

        showToast('▶ Playing: ' + source.name, 'success');
    };

    // Auto-retry on timeout (8 seconds)
    loadTimer = setTimeout(function() {
        if (!loaded) {
            loaded = true;

            if (loading) {
                loading.classList.remove('active');
            }

            // Try next source automatically
            var nextIndex = (safeIndex + 1) % totalSources;

            // Don't loop forever
            if (nextIndex !== state.currentEmbedIndex || totalSources === 1) {
                var nextName = CONFIG.EMBED_SOURCES[nextIndex].name;
                showToast('⏳ Trying: ' + nextName + '...', 'warning');
                state.currentEmbedIndex = nextIndex;
                loadEmbedSource(type, id, season, episode, nextIndex);
            } else {
                showToast('Video loaded. If blank, try Switch Source.', 'info');
            }
        }
    }, 8000);

    // Add to container
    container.appendChild(iframe);
}

// ============================================
// 4. SOURCE DISPLAY
// ============================================
function updateSourceDisplay(name) {
    var el = document.getElementById('currentSourceName');
    if (el) {
        el.textContent = name || 'Source';
    }
}

// ============================================
// 5. SWITCH SOURCE (Manual - button click)
// ============================================
function switchSource() {
    if (!state.currentPlayInfo) {
        showToast('Nothing is playing', 'warning');
        return;
    }

    var info = state.currentPlayInfo;
    var totalSources = CONFIG.EMBED_SOURCES.length;

    // Move to next source
    state.currentEmbedIndex = (state.currentEmbedIndex + 1) % totalSources;

    var name = CONFIG.EMBED_SOURCES[state.currentEmbedIndex].name;
    var num = state.currentEmbedIndex + 1;

    showToast('Switching to: ' + name + ' (' + num + '/' + totalSources + ')', 'info');

    // Load it
    loadEmbedSource(info.type, info.id, info.season, info.episode, state.currentEmbedIndex);
}

// ============================================
// 6. SMART SWITCH (Auto find working source)
// ============================================
async function smartSwitch() {
    if (!state.currentPlayInfo) {
        showToast('Nothing is playing', 'warning');
        return;
    }

    var info = state.currentPlayInfo;
    var startIndex = state.currentEmbedIndex;
    var totalSources = CONFIG.EMBED_SOURCES.length;

    showToast('🔍 Searching for working source...', 'info');

    // Test each source (skip current)
    for (var i = 1; i < totalSources; i++) {
        var testIndex = (startIndex + i) % totalSources;
        var testName = CONFIG.EMBED_SOURCES[testIndex].name;

        showToast('Testing: ' + testName + '...', 'info');

        var works = await quickTestSource(
            testIndex,
            info.type,
            info.id,
            info.season,
            info.episode
        );

        if (works) {
            state.currentEmbedIndex = testIndex;
            showToast('✅ Found working: ' + testName, 'success');
            loadEmbedSource(info.type, info.id, info.season, info.episode, testIndex);
            return;
        }
    }

    // None confirmed working, just cycle to next
    showToast('No confirmed source, cycling...', 'warning');
    switchSource();
}

// ============================================
// 7. REMOVE ALL IFRAMES
// ============================================
function removeAllIframes(container) {
    if (!container) return;
    var frames = container.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
        try {
            frames[i].src = 'about:blank';
        } catch(e) {}
        try {
            frames[i].remove();
        } catch(e) {
            frames[i].parentNode.removeChild(frames[i]);
        }
    }
}

// ============================================
// 8. CLOSE PLAYER
// ============================================
function closePlayer() {
    var player = document.getElementById('videoPlayer');
    var container = document.getElementById('videoPlayerContainer');
    var clickZone = document.getElementById('playerClickZone');

    // Remove iframes
    if (container) {
        removeAllIframes(container);
    }

    // Restore click zone
    if (clickZone) {
        clickZone.style.display = '';
    }

    // Hide player
    if (player) {
        player.classList.remove('active');
    }

    // Restore scroll
    document.body.classList.remove('no-scroll');

    // If was watching TV, refresh episodes to show watched state
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
                if (sel) {
                    loadSeasonEpisodes(savedInfo.id, parseInt(sel.value));
                }
            }
        }, 300);
    }

    // Reset state
    state.currentPlayInfo = null;
    state.currentEmbedIndex = 0;

    // Exit fullscreen
    exitFullscreenSafe();

    // Unlock orientation
    unlockOrientation();

    // Stop progress tracking
    if (typeof progressInterval !== 'undefined') {
        clearInterval(progressInterval);
    }
}

// ============================================
// 9. UPDATE EPISODE WATCHED UI
// ============================================
function updateEpisodeWatchedUI(tvId, season, episode) {
    var items = document.querySelectorAll('.episode-item');
    if (!items || !items.length) return;

    for (var i = 0; i < items.length; i++) {
        var epNum = parseInt(items[i].dataset.episode);
        if (epNum === episode) {
            // Add watched class
            items[i].classList.add('watched');

            // Update number badge
            var numEl = items[i].querySelector('.episode-num-badge');
            if (numEl) {
                numEl.innerHTML = '<i class="fas fa-check-circle episode-watched-icon"></i>';
            }

            // Add watched badge to meta row
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
// 10. FETCH PLAYER TITLE FROM API
// ============================================
async function fetchPlayerTitle(type, id, season, episode) {
    var el = document.getElementById('playerTitle');
    if (!el) return;

    try {
        var data;
        if (type === 'movie') {
            data = await getMovieDetails(id);
            if (data) {
                el.textContent = data.title || data.name || 'Movie';
            }
        } else {
            data = await getTVDetails(id);
            if (data) {
                var showName = data.name || data.original_name || 'Series';
                el.textContent = showName + ' — S' + season + ':E' + episode;
            }
        }
    } catch(e) {
        if (type === 'movie') {
            el.textContent = 'Movie';
        } else {
            el.textContent = 'S' + season + ':E' + episode;
        }
    }
}

// ============================================
// 11. PLAYER UI CONTROLS (Show/Hide)
// ============================================
function setupPlayerEvents() {
    var container = document.getElementById('videoPlayerContainer');
    if (!container) return;

    // Mouse move shows controls
    container.addEventListener('mousemove', function() {
        showPlayerUI();
        autoHideUI();
    });

    // Touch shows controls
    container.addEventListener('touchstart', function() {
        showPlayerUI();
        autoHideUI();
    }, { passive: true });

    // Double click/tap for fullscreen
    var clickZone = document.getElementById('playerClickZone');
    if (clickZone) {
        clickZone.addEventListener('dblclick', function() {
            toggleFullscreen();
        });
    }
}

function showPlayerUI() {
    var c = document.getElementById('videoPlayerContainer');
    if (c) {
        c.classList.add('show-controls');
    }
}

function hidePlayerUI() {
    var c = document.getElementById('videoPlayerContainer');
    if (c) {
        c.classList.remove('show-controls');
    }
}

function autoHideUI() {
    if (state.controlsTimer) {
        clearTimeout(state.controlsTimer);
    }
    state.controlsTimer = setTimeout(function() {
        hidePlayerUI();
    }, CONFIG.CONTROLS_TIMEOUT);
}

// ============================================
// 12. FULLSCREEN - ALL BROWSERS
// ============================================
function toggleFullscreen() {
    if (!isFullscreen()) {
        var player = document.getElementById('videoPlayer');
        enterFullscreen(player);
    } else {
        exitFullscreenSafe();
    }
}

function isFullscreen() {
    return !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
    );
}

function enterFullscreen(el) {
    if (!el) return;
    try {
        if (el.requestFullscreen) {
            el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
        } else if (el.mozRequestFullScreen) {
            el.mozRequestFullScreen();
        } else if (el.msRequestFullscreen) {
            el.msRequestFullscreen();
        }
    } catch(e) {}
    updateFullscreenButton(true);
}

function exitFullscreenSafe() {
    try {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(function(){});
        } else if (document.webkitFullscreenElement) {
            document.webkitExitFullscreen();
        } else if (document.mozFullScreenElement) {
            document.mozCancelFullScreen();
        } else if (document.msFullscreenElement) {
            document.msExitFullscreen();
        }
    } catch(e) {}
    updateFullscreenButton(false);
}

function updateFullscreenButton(isFull) {
    var btn = document.getElementById('playerFullscreenBtn');
    if (!btn) return;

    if (isFull) {
        btn.innerHTML = '<i class="fas fa-compress"></i><span>Exit</span>';
    } else {
        btn.innerHTML = '<i class="fas fa-expand"></i><span>Fullscreen</span>';
    }
}

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', function() {
    updateFullscreenButton(isFullscreen());
});

document.addEventListener('webkitfullscreenchange', function() {
    updateFullscreenButton(isFullscreen());
});

document.addEventListener('mozfullscreenchange', function() {
    updateFullscreenButton(isFullscreen());
});

document.addEventListener('MSFullscreenChange', function() {
    updateFullscreenButton(isFullscreen());
});

// ============================================
// 13. SCREEN ORIENTATION LOCK
// ============================================
function lockLandscape() {
    try {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(function(){});
        } else if (screen.lockOrientation) {
            screen.lockOrientation('landscape');
        } else if (screen.mozLockOrientation) {
            screen.mozLockOrientation('landscape');
        } else if (screen.msLockOrientation) {
            screen.msLockOrientation('landscape');
        }
    } catch(e) {}
}

function unlockOrientation() {
    try {
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        } else if (screen.unlockOrientation) {
            screen.unlockOrientation();
        } else if (screen.mozUnlockOrientation) {
            screen.mozUnlockOrientation();
        } else if (screen.msUnlockOrientation) {
            screen.msUnlockOrientation();
        }
    } catch(e) {}
}

// ============================================
// 14. KEYBOARD SHORTCUTS (Desktop)
// ============================================
document.addEventListener('keydown', function(e) {
    var player = document.getElementById('videoPlayer');
    if (!player || !player.classList.contains('active')) return;

    var key = '';
    if (e.key) {
        key = e.key.toLowerCase();
    }

    // F = Fullscreen
    if (key === 'f') {
        e.preventDefault();
        toggleFullscreen();
    }

    // Escape = Close player
    if (key === 'escape') {
        e.preventDefault();
        closePlayer();
    }

    // S = Switch source manually
    if (key === 's') {
        e.preventDefault();
        switchSource();
    }

    // A = Auto find best source
    if (key === 'a') {
        e.preventDefault();
        smartSwitch();
    }
});

// ============================================
// 15. TRAILER PLAYER
// ============================================
async function playTrailer(type, id) {
    try {
        var data;
        if (type === 'movie') {
            data = await getMovieDetails(id);
        } else {
            data = await getTVDetails(id);
        }

        if (!data) {
            showToast('Cannot load trailer info', 'error');
            return;
        }

        var vids = [];
        if (data.videos && data.videos.results) {
            vids = data.videos.results;
        }

        if (vids.length === 0) {
            showToast('No trailer available', 'warning');
            return;
        }

        // Find best trailer in priority order
        var trailer = null;
        var i;

        // 1. Official trailer on YouTube
        for (i = 0; i < vids.length; i++) {
            if (vids[i].type === 'Trailer' && vids[i].site === 'YouTube' && vids[i].official) {
                trailer = vids[i];
                break;
            }
        }

        // 2. Any trailer on YouTube
        if (!trailer) {
            for (i = 0; i < vids.length; i++) {
                if (vids[i].type === 'Trailer' && vids[i].site === 'YouTube') {
                    trailer = vids[i];
                    break;
                }
            }
        }

        // 3. Teaser on YouTube
        if (!trailer) {
            for (i = 0; i < vids.length; i++) {
                if (vids[i].type === 'Teaser' && vids[i].site === 'YouTube') {
                    trailer = vids[i];
                    break;
                }
            }
        }

        // 4. Any clip on YouTube
        if (!trailer) {
            for (i = 0; i < vids.length; i++) {
                if (vids[i].site === 'YouTube') {
                    trailer = vids[i];
                    break;
                }
            }
        }

        if (!trailer) {
            showToast('No YouTube trailer found', 'warning');
            return;
        }

        // Show trailer modal
        var modal = document.getElementById('trailerModal');
        var container = document.getElementById('trailerContainer');

        if (!modal || !container) {
            showToast('Trailer player error', 'error');
            return;
        }

        container.innerHTML = '<iframe '
            + 'src="https://www.youtube.com/embed/' + trailer.key + '?autoplay=1&rel=0&modestbranding=1" '
            + 'allow="autoplay; fullscreen; encrypted-media" '
            + 'allowfullscreen '
            + 'style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;">'
            + '</iframe>';

        modal.classList.add('active');

    } catch(e) {
        showToast('Trailer failed to load', 'error');
    }
}

function closeTrailer() {
    var modal = document.getElementById('trailerModal');
    var container = document.getElementById('trailerContainer');

    if (container) {
        container.innerHTML = '';
    }

    if (modal) {
        modal.classList.remove('active');
    }
}

// ============================================
// 16. PRE-TEST SOURCES ON PAGE LOAD
// ============================================
(function() {
    // Wait 5 seconds after page load, then test all sources in background
    setTimeout(function() {
        var testMovieId = 278; // The Shawshank Redemption

        for (var i = 0; i < CONFIG.EMBED_SOURCES.length; i++) {
            (function(index) {
                var source = CONFIG.EMBED_SOURCES[index];
                var url = source.movie(testMovieId);

                testEmbedSource(url, 6000).then(function(works) {
                    if (!sourceTestResults['pretest']) {
                        sourceTestResults['pretest'] = {};
                    }
                    sourceTestResults['pretest'][index] = works;
                });
            })(i);
        }
    }, 5000);
})();