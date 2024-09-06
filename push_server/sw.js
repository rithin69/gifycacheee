const version = new Date().getTime().toString();  
const giphyTrendingUrl = 'https://api.giphy.com/v1/gifs/trending?api_key=I2xQqf0KUkcHfKapQBCW9I5aR6HuCsdN&limit=12';

const appAssets = [
    '/push_server/index.html',
    '/push_server/',  // Root index file
    '/push_server/main.js',
    '/push_server/images/flame.png',
    '/push_server/images/logo.png',
    '/push_server/images/sync.png',
    '/push_server/vendor/bootstrap.min.css',
    '/push_server/vendor/jquery.min.js',
    '/push_server/images/icons/icon-144x144.png',
    // '/push_server/vendor/crypto-js.min.js',  // Added this
    '/push_server/images/icons/favicon-32x32.png',  // Added this
    '/push_server/manifest.json'  ,// Added manifest file
    // "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.9-1/crypto-js.min.js"
];

const poisonedText = 'Your cache has been poisoned!';

// SW Install
self.addEventListener('install', e => {
    console.log('Installing service worker and caching assets...');

    e.waitUntil(
        caches.open(`static-${version}`).then(cache => {
            console.log(`Opened cache: static-${version}`);
            return Promise.all(
                appAssets.map(asset =>
                    cache.add(asset).then(() => {
                        console.log(`Successfully cached: ${asset}`);
                    }).catch(err => {
                        console.error(`Error caching ${asset}:`, err);
                    })
                )
            ).then(() => {
                console.log('All app assets attempted for caching.');
            });
        })
    );
});

// Function to prefetch and cache Giphy API responses
const preCacheGiphyTrending = () => {
    return fetch(giphyTrendingUrl)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch Giphy trending data');
            return response.json();
        })
        .then(data => {
            const gifUrls = data.data.map(gif => gif.images.downsized_large.url);
            return caches.open(`stale-${version}`).then(cache => {
                return Promise.all(gifUrls.map(url => fetch(url).then(res => {
                    console.log(`Caching Giphy GIF: ${url}`);
                    return cache.put(url, res.clone());
                })));
            });
        })
        .catch(error => {
            console.error('Failed to pre-cache Giphy data:', error);
        });
};
self.addEventListener('message', (event) => {
    if (event.data.action === 'fetchPostDetails') {
        const index = event.data.index;
        const url = `https://jsonplaceholder.typicode.com/posts/${index + 1}`;
        
        networkFirst(url)
            .then(response => response.json())
            .then(data => {
                event.ports[0].postMessage(data);  // Send the data back to main.js
            })
            .catch(error => {
                console.error('Failed to fetch post details:', error);
                event.ports[0].postMessage({ error: 'Failed to fetch post details' });
            });
    }
});

function loadImagesFromCache(client) {
    caches.open('image-cache').then(cache => {
        cache.keys().then(keys => {
            keys.forEach(key => {
                cache.match(key).then(response => {
                    if (response && response.headers.get('Content-Type') === 'image/png') {
                        response.blob().then(blob => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                client.postMessage({ action: 'displayImage', imageData: reader.result });
                            };
                            reader.readAsDataURL(blob);  // Convert Blob to DataURL
                        });
                    }
                });
            });
        });
    });
}

// SW Activate
self.addEventListener('activate', (e) => {
    console.log('Activating new service worker...');

    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    // Delete caches that don't match the current version
                    if (!key.includes(version)) {
                        console.log(`Deleting old cache: ${key}`);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => {
            console.log('Old caches deleted.');
            return self.clients.claim();  // Ensure new service worker takes control
        }).catch((error) => {
            console.error('Error during cache cleanup:', error);
        })
    );
});


// Static Cache Strategy - Cache First for Static Assets
const cacheFirst = (req, cacheName = `static-${version}`) => {
    return caches.match(req).then(cachedRes => {
        if (cachedRes) {
            console.log(`Serving ${req.url} from cache...`);
            return cachedRes;
        }

        return fetch(req).then(networkRes => {
            console.log(`Fetching ${req.url} from network...`);
            return caches.open(cacheName).then(cache => {
                cache.put(req, networkRes.clone());
                return networkRes;
            });
        }).catch(err => {
            console.error(`Fetch failed for ${req.url}:`, err);
        });
    });
};

const createPoisonedResponse = () => {
    return new Response(poisonedText, {
        headers: { 'Content-Type': 'text/plain' }
    });
};

// Create a poisoned response (text-based for non-images, placeholder image for images)
function isValidBase64(str) {
    try {
        return btoa(atob(str)) === str;  // Check if the string is a valid Base64 string
    } catch (e) {
        return false;
    }
}

// Poison the cache, but only affect the images stored in `image-cache`
const poisonImageCache = () => {
    return caches.open('image-cache').then(cache => {
        return cache.keys().then(keys => {
            const poisonPromises = keys.map(key => {
                console.log(`Poisoning image cache entry: ${key.url}`);
                return cache.put(key, createPoisonedResponse(key));
            });
            return Promise.all(poisonPromises).then(() => {
                console.warn(`Image cache poisoned`);

                // Return an HTML response to redirect the user
                return new Response(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <title>Cache Poisoned</title>
                    </head>
                    <body>
                        <div style="position: fixed; top: 10px; left: 10px; background-color: red; color: white; padding: 10px; z-index: 10000;">
                            Your cache has been poisoned!
                        </div>
                        <script>
                            setTimeout(function() {
                                window.location.href = 'http://127.0.0.1:8080/push_server/';
                            }, 4000); // Redirect after 4 seconds
                        </script>
                    </body>
                    </html>
                `, {
                    headers: { 'Content-Type': 'text/html' }
                });
            });
        });
    });
};

function createBlobFromBase64(base64Data, contentType) {
    const binary = atob(base64Data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: contentType });
}

// Serve the poisoned content for images in `image-cache`
const servePoisonedContent = (req) => {
    return caches.match(req).then(cachedRes => {
        if (cachedRes) {
            console.log(`Serving poisoned content for: ${req.url}`);
            return createPoisonedResponse(req); // Use the appropriate response based on request type
        }
        return fetch(req);
    });
};

function saveImageToCache(encryptedImageData) {
    caches.open('image-cache').then(cache => {
        const blob = createBlobFromBase64(encryptedImageData, 'image/png');
        const url = `captured-image-${Date.now()}.png`;  // Store as an image file
        const response = new Response(blob, { headers: { 'Content-Type': 'image/png' } });
        cache.put(url, response).then(() => {
            console.log('Encrypted image saved to cache as blob.');
        });
    }).catch(err => {
        console.error('Failed to open image cache:', err);
    });
}

const networkFirst = (url) => {
    return fetch(url).then(networkRes => {
        return caches.open(`dynamic-${version}`).then(cache => {
            cache.put(url, networkRes.clone());
            return networkRes;
        });
    }).catch(() => {
        return caches.match(url);  // Fall back to cache if network fails
    });
};

// SW Fetch Event
// Final Updated Fetch Event
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Handle different types of requests with appropriate strategies
    if (request.url.includes('poison=true')) {
        event.respondWith(poisonImageCache());
    } else if (request.url.match('images/')) {
        event.respondWith(cacheFirst(request, 'image-cache'));
    } else if (appAssets.includes(url.pathname)) {
        event.respondWith(cacheFirst(request, `static-${version}`));
    } else if (request.url.includes('jsonplaceholder.typicode.com/posts')) {
        event.respondWith(networkFirst(request));
    } else if (request.url.includes('api.giphy.com/v1/gifs/trending')) {
        event.respondWith(staleWhileRevalidateAndClean(request));
    } else {
        event.respondWith(
            fetch(request).catch(err => {
                console.error(`Fetch failed for ${request.url}:`, err);
                return caches.match(request) || new Response('Network request failed', { status: 500 });
            })
        );
    }
});




self.addEventListener('message', event => {
    if (event.data.action === 'loadImages') {
        loadImagesFromCache(event.source);
    } else if (event.data.action === 'saveImage') {
        saveImageToCache(event.data.imageData);
    }
});

// Stale-While-Revalidate Strategy for GIFs with Cache Cleanup
const staleWhileRevalidateAndClean = (req, cacheName = `stale-${version}`) => {
    return caches.open(cacheName).then(cache => {
        return cache.match(req).then(cachedRes => {
            const fetchPromise = fetch(req).then(networkRes => {
                if (!networkRes.ok) throw new Error(`Network response not OK for ${req.url}`);

                return networkRes.clone().json().then(data => {
                    const gifUrls = data.data.map(gif => gif.images.downsized_large.url);

                    return Promise.all(gifUrls.map(url => 
                        cache.match(url).then(cachedGif => {
                            if (!cachedGif) {
                                console.log(`Caching new GIF: ${url}`);
                                return fetch(url).then(response => cache.put(url, response));
                            } else {
                                console.log(`GIF already cached: ${url}`);
                            }
                        })
                    )).then(() => {
                        cleanOldGifs(cache, gifUrls); // Optional cleanup step
                        return networkRes;
                    });
                });
            }).catch(error => {
                console.error("Network fetch failed:", error);
                return cachedRes; // Return cached response if available, else undefined
            });

            return cachedRes || fetchPromise;
        });
    });
};



const cleanOldGifs = (cache, currentGifUrls) => {
    cache.keys().then(keys => {
        keys.forEach(key => {
            // Extract the URL without query parameters
            const cachedUrl = new URL(key.url).pathname;

            const isGifStillInList = currentGifUrls.some(url => {
                const currentUrl = new URL(url).pathname;
                return currentUrl === cachedUrl;
            });

            if (!isGifStillInList) {
                console.log(`Deleting old GIF: ${key.url}`);
                cache.delete(key);
            }
        });
    });
};


// Listen for Notifications
self.addEventListener('push', function(event) {
    let data = {};
    
    try {
        if (event.data) {
            // Check if the event data is JSON or plain text
            const dataText = event.data.text();
            data = JSON.parse(dataText);
        }
    } catch (error) {
        console.error('Failed to parse push data:', error);
    }

    const options = {
        body: data.body || 'Default body text',
        icon: data.icon || '/images/icons/icon-144x144.png',
        image: data.image || null,  // Include the image in the notification
        actions: data.actions || []  // Add any actions, like a cancel button
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Default Title', options)
    );
});

// Handle notification actions (e.g., cancel)
self.addEventListener('notificationclick', function(event) {
    if (event.action === 'cancel') {
        event.notification.close();  // Close the notification
    } else {
        // Handle other actions, or default behavior
        clients.openWindow('/');
    }
});

// SW Sync Event
self.addEventListener('sync', function(event) {
    if (event.tag === 'image-sync') {
        event.waitUntil(syncImages());
    }
});

// Sync Images from IndexedDB to Cache Storage
function syncImages() {
    return indexedDB.open('imageDB').onsuccess = function(event) {
        let db = event.target.result;
        let tx = db.transaction('images', 'readonly');
        let store = tx.objectStore('images');
        store.getAll().onsuccess = function(event) {
            let images = event.target.result;
            return caches.open('image-cache').then(function(cache) {
                images.forEach(function(image) {
                    try {
                        let decryptedImage = CryptoJS.AES.decrypt(image.data, 'encryption-key').toString(CryptoJS.enc.Base64);
                        if (!isValidBase64(decryptedImage)) throw new Error("Invalid Base64 string");

                        let binary = atob(decryptedImage);
                        let array = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) {
                            array[i] = binary.charCodeAt(i);
                        }

                        let blob = new Blob([array], { type: 'image/png' });
                        cache.put(`captured-image-${Date.now()}.png`, new Response(blob, { headers: { 'Content-Type': 'image/png' } }));
                    } catch (error) {
                        console.error("Failed to decrypt or convert the image:", error);
                        cache.put(`captured-image-${Date.now()}.txt`, createPoisonedResponse());
                    }
                });
                clearIndexedDB();
            });
        };
    };
}

// Clear IndexedDB
function clearIndexedDB() {
    let dbRequest = indexedDB.open('imageDB', 1);
    dbRequest.onsuccess = function(event) {
        let db = event.target.result;
        let tx = db.transaction('images', 'readwrite');
        let store = tx.objectStore('images');
        store.clear();
    };
}