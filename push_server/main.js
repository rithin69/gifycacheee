let swReg;
const version = '1.3';

// const serverUrl = 'http://localhost:3333';
const serverUrl = "https://giffybackend.onrender.com";

// Send a message to the Service Worker to load images from the cache
function loadCapturedImages() {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ action: 'loadImages' });
    } else {
        console.error("Service Worker not controlling the page.");
    }
}

// Event Listener for receiving messages from the Service Worker
navigator.serviceWorker.addEventListener('message', function(event) {
    if (event.data.action === 'displayImage') {
        displayCapturedImage(event.data.imageData);
    }
});

// Save Image Directly to Cache via Service Worker
function saveImage(encryptedImageData) {
    console.log('Sending image to Service Worker for caching...');
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            action: 'saveImage',
            imageData: encryptedImageData
        });
    } else {
        console.error("Service Worker not controlling the page.");
    }
}

// Giphy cache clean
function giphyCacheClean(giphys) {
    console.log('Giphys:', giphys);

    const giphyUrls = giphys.filter(url => typeof url === 'string');

    navigator.serviceWorker.getRegistration().then(function(registration) {
        if (registration && registration.active) {
            registration.active.postMessage({ action: 'cleanGiphyCache', giphys: giphyUrls });
        }
    }).catch(err => {
        console.error('Failed to get service worker registration:', err);
    });
}

// Update UI for subscribed status
const setSubscribedStatus = (state) => {
    const subscribeButton = document.getElementById('subscribe-button');

    if (state) {
        // Change the button to "Unsubscribe"
        subscribeButton.textContent = 'Unsubscribe';
        subscribeButton.style.backgroundColor = '#EB3F2F'; // Change to red color for "Unsubscribe"
        subscribeButton.onclick = unsubscribe; // Change click event to unsubscribe
    } else {
        // Change the button to "Subscribe"
        subscribeButton.textContent = 'Subscribe';
        subscribeButton.style.backgroundColor = '#66DE93'; // Change to green color for "Subscribe"
        subscribeButton.onclick = subscribe; // Change click event to subscribe
    }
};

// Progressive Enhancement
if (navigator.serviceWorker) {
    navigator.serviceWorker.register('sw.js').then(registration => {
        swReg = registration;
        swReg.pushManager.getSubscription().then(setSubscribedStatus);
    }).catch(console.error);
}

// Giphy API object
var giphy = {
    url: 'https://api.giphy.com/v1/gifs/trending',
    query: {
        api_key: 'idqcEOAq85ozFyQznamF5TMFi4jSP2k3',
        limit: 12
    }
};

function fetchPostInteractions() {
    return fetch('https://jsonplaceholder.typicode.com/posts')
        .then(response => response.json())
        .then(data => {
            return data.slice(0, 12);  // Limiting to 12 sets of data for 12 GIFs
        })
        .catch(err => console.error('Failed to fetch posts:', err));
}

// Update trending giphys
function update() {
    $('#update .icon').toggleClass('d-none');
    $.get(giphy.url, giphy.query)
        .done(function(res) {
            $('#giphys').empty();
            fetchPostInteractions().then(posts => {
                $.each(res.data, function(i, giphy) {
                    const post = posts[i];
                    const trimmedComment = post.body.split(' ').slice(0, 20).join(' ') + '...';

                    $('#giphys').prepend(
                        `<div class="col-sm-6 col-md-4 col-lg-3 p-1">
                            <img class="w-100 img-fluid" src="${giphy.images.downsized_large.url}">
                            <button class="btn btn-info mt-2" onclick="toggleDetails(${i})">More Details</button>
                            <div id="details-${i}" class="details" style="display: none;">
                                <p>Comment: ${trimmedComment}</p>
                                <p>Likes: ${post.id} | Shares: ${post.userId}</p>
                            </div>
                        </div>`
                    );
                });
            });
        })
        .fail(function() {
            $('.alert').slideDown();
            setTimeout(function() { $('.alert').slideUp(); }, 2000);
        })
        .always(function() {
            $('#update .icon').toggleClass('d-none');
        });
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('#update').addEventListener('click', update);
});

function fetchPostDetails(index) {
    const url = `https://jsonplaceholder.typicode.com/posts/${index + 1}`;
    console.log(`Fetching details from URL: ${url}`);

    return fetch(url)
        .then(networkRes => {
            console.log("Network response received:", networkRes);
            if (!networkRes.ok) {
                throw new Error(`Network response was not ok: ${networkRes.status}`);
            }

            return networkRes.json();  // No caching logic here, just fetching data from network
        })
        .catch(error => {
            console.error("Network request failed, trying cache...", error);
            return caches.match(url).then(cachedRes => {
                if (cachedRes) {
                    console.log("Serving from cache:", cachedRes);
                    return cachedRes.json();
                } else {
                    console.error("No cached data available.");
                    throw new Error("No cached data available.");
                }
            });
        });
}

function displayDetails(index, data) {
    const details = document.getElementById(`details-${index}`);
    const trimmedComment = data.body.split(' ').slice(0, 20).join(' ') + '...';
    details.innerHTML = `<p>Comment: ${trimmedComment}</p>
                         <p>Likes: ${data.id} | Shares: ${data.userId}</p>`;
    details.style.display = 'block';
}

// Function to toggle the details visibility
function toggleDetails(index) {
    const details = document.getElementById(`details-${index}`);
    console.log(`Toggling details for index: ${index}`);

    if (details.style.display === 'none') {
        requestPostDetails(index)
            .then(data => {
                displayDetails(index, data);
            })
            .catch(error => {
                console.error('Failed to fetch or display post details:', error);
            });
    } else {
        details.style.display = 'none';
    }
}

// Manual refresh
$('#update a').click(update);

// Application server key for Push API
const getApplicationServerKey = () => {
    return fetch(`${serverUrl}/key`)
        .then(res => res.arrayBuffer())
        .then(key => new Uint8Array(key));
};

const unsubscribe = () => {
    if (!swReg) return console.error('Service Worker Registration Not Found');
    swReg.pushManager.getSubscription().then(subscription => {
        if (subscription) {
            subscription.unsubscribe().then(() => {
                setSubscribedStatus(false);
            });
        }
    });
};

const subscribe = () => {
    if (!swReg) return console.error('Service Worker Registration Not Found');
    getApplicationServerKey().then(applicationServerKey => {
        swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
            .then(res => res.toJSON())
            .then(subscription => {
                fetch(`${serverUrl}/subscribe`, { method: 'POST', body: JSON.stringify(subscription) })
                    .then(() => setSubscribedStatus(true))
                    .catch(unsubscribe);
            })
            .catch(console.error);
    });
};

// Show Toast Message
function showToast(message) {
    let alertDiv = document.querySelector('.alert-danger');
    alertDiv.textContent = message;
    alertDiv.style.display = 'block';
    setTimeout(() => alertDiv.style.display = 'none', 3000);
}

// Camera Modal Functions
function openCameraModal() {
    let modal = document.getElementById('cameraModal');
    modal.style.display = 'block';

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            let video = document.getElementById('cameraFeed');
            video.srcObject = stream;
        })
        .catch(err => {
            console.error('Error accessing the camera: ', err);
        });
}

function closeCameraModal() {
    let modal = document.getElementById('cameraModal');
    modal.style.display = 'none';

    let video = document.getElementById('cameraFeed');
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop()); // Stop the video stream
    }
}

// Capture Image Functionality
function captureImage() {
    let video = document.getElementById('cameraFeed');
    let canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    let ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let imageData = canvas.toDataURL('image/png');

    // Encrypt the image data
    let encryptedImageData = CryptoJS.AES.encrypt(imageData, 'encryption-key').toString();

    if (navigator.onLine) {
        saveImage(encryptedImageData);  // Save directly to cache and display immediately
        displayCapturedImageFromDataURL(imageData);  // Display decrypted image immediately
    } else {
        saveToIndexedDB(encryptedImageData);  // Save to IndexedDB for later syncing
    }

    video.srcObject.getTracks().forEach(track => track.stop());

    let modal = document.getElementById('cameraModal');
    modal.style.display = 'none';
}

// Save Image Directly to Cache
function saveImage(encryptedImageData) {
    console.log('Saving encrypted image directly to cache...');

    caches.open('image-cache').then(cache => {
        const url = `captured-image-${Date.now()}.txt`;  // Store as a text file
        const response = new Response(encryptedImageData, { headers: { 'Content-Type': 'text/plain' } });
        cache.put(url, response).then(() => {
            console.log('Encrypted image saved to cache.');
            showToast('Image captured and saved.');
        });
    }).catch(err => {
        console.error('Failed to open image cache:', err);
        showToast('Failed to access cache storage.');
    });
}

// Save Image to IndexedDB
function saveToIndexedDB(encryptedImageData) {
    console.log('Attempting to save encrypted image to IndexedDB...');
    let dbRequest = indexedDB.open('imageDB', 1);

    dbRequest.onupgradeneeded = event => {
        let db = event.target.result;
        if (!db.objectStoreNames.contains('images')) {
            db.createObjectStore('images', { autoIncrement: true });
        }
    };

    dbRequest.onsuccess = event => {
        let db = event.target.result;
        let tx = db.transaction('images', 'readwrite');
        let store = tx.objectStore('images');

        store.add({ data: encryptedImageData });
        tx.oncomplete = () => {
            console.log('Encrypted image successfully saved to IndexedDB.');
            showToast('Image saved offline. Will sync when online.');
        };
        tx.onerror = error => {
            console.error('Failed to save encrypted image to IndexedDB:', error);
            showToast('Failed to save image offline.');
        };
    };

    dbRequest.onerror = event => {
        console.error('Failed to open IndexedDB:', event.target.errorCode);
        showToast('Failed to access offline storage.');
    };
}

function requestPostDetails(index) {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        return new Promise((resolve, reject) => {
            const messageChannel = new MessageChannel();
            
            messageChannel.port1.onmessage = function(event) {
                if (event.data.error) {
                    reject(event.data.error);
                } else {
                    resolve(event.data);
                }
            };

            navigator.serviceWorker.controller.postMessage({
                action: 'fetchPostDetails',
                index: index
            }, [messageChannel.port2]);
        });
    } else {
        console.error("Service Worker not controlling the page.");
    }
}

// Sync Images from IndexedDB to Cache
function syncImages() {
    console.log('Attempting to sync encrypted images from IndexedDB to cache...');

    let dbRequest = indexedDB.open('imageDB', 1);

    dbRequest.onsuccess = function() {
        let db = dbRequest.result;
        let tx = db.transaction('images', 'readonly');
        let store = tx.objectStore('images');
        let getAllRequest = store.getAll();

        getAllRequest.onsuccess = function() {
            let images = getAllRequest.result;
            if (images.length === 0) {
                console.log('No images to sync from IndexedDB.');
                return;
            }

            caches.open('image-cache').then(cache => {
                let syncPromises = images.map((image, index) => {
                    // Move the encrypted image data from IndexedDB to cache
                    const encryptedImage = image.data;
                    const url = `captured-image-${Date.now()}-${index}.txt`;
                    const response = new Response(encryptedImage, { headers: { 'Content-Type': 'text/plain' } });

                    return cache.put(url, response).then(() => {
                        console.log(`Encrypted image ${url} moved from IndexedDB to cache.`);

                        // After storing in cache, decrypt and display the image
                        let decryptedImageData = CryptoJS.AES.decrypt(encryptedImage, 'encryption-key').toString(CryptoJS.enc.Utf8);

                        // Convert the decrypted data URL to a Blob for display
                        let blob = dataURLtoBlob(decryptedImageData);
                        if (blob) {
                            displayCapturedImage(URL.createObjectURL(blob));  // Display the decrypted image
                        } else {
                            console.error('Failed to create Blob from decrypted data.');
                        }
                    }).catch(err => {
                        console.error('Failed to store encrypted image in cache:', err);
                    });
                });

                // Once all images are synced, clear the IndexedDB
                Promise.all(syncPromises).then(() => {
                    let clearTx = db.transaction('images', 'readwrite');
                    let clearStore = clearTx.objectStore('images');
                    clearStore.clear().onsuccess = function() {
                        console.log('IndexedDB cleared after moving encrypted images to cache.');
                        showToast('Offline images synced successfully.');
                    };
                });
            });
        };

        getAllRequest.onerror = function() {
            console.error('Failed to retrieve encrypted images from IndexedDB.');
            showToast('Failed to sync offline images.');
        };
    };

    dbRequest.onerror = function(event) {
        console.error('Failed to open IndexedDB:', event.target.errorCode);
        showToast('Failed to access offline images for syncing.');
    };
}

// Load and Decrypt Captured Images from Cache on Page Load
function loadCapturedImages() {
    console.log('Loading encrypted images from cache...');
    caches.open('image-cache').then(cache => {
        cache.keys().then(keys => {
            if (keys.length === 0) {
                console.log('No images found in cache.');
                return;
            }

            keys.forEach(key => {
                cache.match(key).then(response => {
                    if (response) {
                        response.text().then(encryptedImageData => {
                            // Decrypt the image data before displaying it
                            let decryptedImageData = CryptoJS.AES.decrypt(encryptedImageData, 'encryption-key').toString(CryptoJS.enc.Utf8);

                            // Convert decrypted data URL to Blob
                            let blob = dataURLtoBlob(decryptedImageData);

                            // Create an Object URL to display the image
                            let imgURL = URL.createObjectURL(blob);
                            displayCapturedImage(imgURL);  // Display the decrypted image
                        }).catch(err => {
                            console.error('Failed to retrieve encrypted image from cache:', err);
                        });
                    }
                }).catch(err => {
                    console.error('Failed to match cache key:', err);
                });
            });
        }).catch(err => {
            console.error('Failed to retrieve cache keys:', err);
        });
    }).catch(err => {
        console.error('Failed to open image cache:', err);
    });
}
function displayPoisonedCacheMessage() {
    // Find the poisoned-content div
    const poisonDiv = document.getElementById('poisoned-content');
    if (poisonDiv) {
        // Display the div
        poisonDiv.style.display = 'block';
    }
}
// Utility function to convert a data URL to a Blob
function dataURLtoBlob(dataURL) {
    try {
        const byteString = atob(dataURL.split(',')[1]);
        const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
        
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        
        return new Blob([ab], { type: mimeString });
    } catch (error) {
        displayPoisonedCacheMessage();
        console.error("Failed to convert data URL to Blob:", error);
        return null;
    }
}

// Function to display the captured image immediately after decryption
function displayCapturedImageFromDataURL(imageData) {
    let blob = dataURLtoBlob(imageData);
    if (blob) {
        let imgURL = URL.createObjectURL(blob);
        displayCapturedImage(imgURL);
    } else {
        displayPoisonedCacheMessage();
        console.error("Failed to display image: Invalid Blob");
    }
}

// Display Captured Image
function displayCapturedImage(imageData) {
    let imageContainer = document.getElementById('capturedImages');
    let imgElement = document.createElement('img');
    imgElement.src = imageData;  // Set src to the Blob URL
    imgElement.className = 'captured-image'; // Assuming you have CSS to style this class
    imageContainer.prepend(imgElement);
}

// Event Listener for Coming Back Online
window.addEventListener('online', function() {
    console.log('Network status: Online');
    showToast('Back online. Syncing images...');
    syncImages();
});

// Call this function on page load
window.addEventListener('load', function() {
    loadCapturedImages();
});

// Update trending giphys on load
update();