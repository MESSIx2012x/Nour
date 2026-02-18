/* ============================================
   FREEFLIX - helpers.js
   Utilities, Analytics, PWA, Performance
   ============================================ */

// ============================================
// PERFORMANCE MONITOR
// ============================================
(function() {
    // Track page load time
    window.addEventListener('load', function() {
        var loadTime = performance.now();
        console.log('%c Page loaded in ' + Math.round(loadTime) + 'ms',
            'color: #46d369; font-size: 11px;');
    });
})();

// ============================================
// IMAGE LAZY LOADING ENHANCEMENT
// ============================================
(function() {
    if ('IntersectionObserver' in window) {
        var imgObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        img.classList.add('loaded');
                    }
                    imgObserver.unobserve(img);
                }
            });
        }, { rootMargin: '300px' });

        // Observe new images periodically
        setInterval(function() {
            document.querySelectorAll('img[data-src]').forEach(function(img) {
                imgObserver.observe(img);
            });
        }, 2000);
    }
})();

// ============================================
// PRELOAD CRITICAL IMAGES
// ============================================
function preloadImage(url) {
    if (!url) return;
    var img = new Image();
    img.src = url;
}

// ============================================
// NETWORK STATUS
// ============================================
(function() {
    window.addEventListener('online', function() {
        showToast('Back online! 🟢', 'success');
    });

    window.addEventListener('offline', function() {
        showToast('You are offline. Some features may not work.', 'warning');
    });
})();

// ============================================
// KEYBOARD NAVIGATION ENHANCEMENT
// ============================================
(function() {
    document.addEventListener('keydown', function(e) {
        // Don't interfere with player or inputs
        if (document.getElementById('videoPlayer')?.classList.contains('active')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        // "/" to open search
        if (e.key === '/') {
            e.preventDefault();
            toggleSearch();
        }

        // "h" for home
        if (e.key === 'h' || e.key === 'H') {
            if (!e.ctrlKey && !e.metaKey) navigateTo('home');
        }

        // "m" for movies
        if (e.key === 'm' || e.key === 'M') {
            if (!e.ctrlKey && !e.metaKey) navigateTo('movies');
        }
    });
})();

// ============================================
// SCROLL RESTORATION
// ============================================
(function() {
    var scrollPositions = {};

    var originalNavigateTo = window.navigateTo;
    if (typeof originalNavigateTo === 'function') {
        // Save scroll position before navigating
        window.addEventListener('scroll', function() {
            if (typeof state !== 'undefined') {
                scrollPositions[state.currentPage] = window.scrollY;
            }
        });
    }
})();

// ============================================
// LOCAL STORAGE CLEANUP
// ============================================
(function() {
    try {
        // Clean old watched data (older than 90 days)
        var watched = JSON.parse(localStorage.getItem('freeflix_watched') || '{}');
        var cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
        var cleaned = false;

        Object.keys(watched).forEach(function(key) {
            if (watched[key] < cutoff) {
                delete watched[key];
                cleaned = true;
            }
        });

        if (cleaned) {
            localStorage.setItem('freeflix_watched', JSON.stringify(watched));
        }

        // Clean fetch cache periodically
        setInterval(function() {
            if (typeof fetchCache !== 'undefined') {
                var now = Date.now();
                Object.keys(fetchCache).forEach(function(key) {
                    if (now - fetchCache[key].time > 600000) {
                        delete fetchCache[key];
                    }
                });
            }
        }, 300000);

    } catch(e) {}
})();

// ============================================
// SHARE FUNCTIONALITY
// ============================================
function shareContent(title, type, id) {
    var url = window.location.origin + '?type=' + type + '&id=' + id;

    if (navigator.share) {
        navigator.share({
            title: 'Watch "' + title + '" on FreeFlix',
            text: 'Check out "' + title + '" on FreeFlix - Free streaming!',
            url: url
        }).catch(function() {});
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(url).then(function() {
            showToast('Link copied to clipboard!', 'success');
        }).catch(function() {
            showToast('Could not copy link', 'error');
        });
    }
}

// ============================================
// DEEP LINK HANDLER
// ============================================
(function() {
    window.addEventListener('load', function() {
        setTimeout(function() {
            var params = new URLSearchParams(window.location.search);
            var type = params.get('type');
            var id = params.get('id');

            if (type && id) {
                openDetail(type, parseInt(id));
            }
        }, 2500);
    });
})();

// ============================================
// TOUCH GESTURES FOR MOBILE
// ============================================
(function() {
    var touchStartX = 0;
    var touchStartY = 0;

    document.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        var diffX = e.changedTouches[0].screenX - touchStartX;
        var diffY = e.changedTouches[0].screenY - touchStartY;

        // Only horizontal swipes
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 100) {
            // Swipe right to go back on player
            if (diffX > 0) {
                var player = document.getElementById('videoPlayer');
                if (player && player.classList.contains('active')) {
                    closePlayer();
                }
            }
        }
    }, { passive: true });
})();

// ============================================
// CONSOLE BRANDING
// ============================================
console.log('%c FreeFlix ', 'background:#e50914;color:white;font-size:20px;font-weight:900;padding:8px 16px;border-radius:4px;');
console.log('%c Watch Movies, Series & Anime Free ', 'color:#b3b3b3;font-size:11px;');
console.log('%c Keyboard: / Search | H Home | M Movies | F Fullscreen | S Switch Source ', 'color:#4fc3f7;font-size:10px;');