// A simple object to track application state (like login status)
const appState = {
    isLoggedIn: false,
    currentView: 'login-view',
    userId: null
};

// 1. CONFIGURATION
const BASE_URL = 'http://localhost:8080';
const BASE_PATH = '/M01033526'; 

// GENERIC AJAX HELPER FUNCTION

/**
 * Sends data to the web service and returns the parsed JSON result.
 */
async function sendRequest(path, method, data = null) {
    const url = BASE_URL + BASE_PATH + path;
    
    try {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        const result = await response.json(); 

        if (!response.ok) {
            const errorMessage = result.error || `Server responded with status: ${response.status}`;
            throw new Error(errorMessage);
        }
        
        return result;
    } catch (error) {
        console.error('AJAX Error:', error.message);
        throw error; 
    }
}

// CORE VIEW MANAGEMENT

function showView(viewId) {
    // these views are hidden for new or logged out users
    const protectedViews = ['feed-view', 'search-view', 'post-view'];
    
    if (protectedViews.includes(viewId) && !appState.isLoggedIn) {
        // Redirect to login if trying to access protected view while not logged in
        viewId = 'login-view';
        displayMessage(
            'login-error-message',
            'Please log in to access this page.',
            false
        );
    }


    // Hiding all sections with class 'app-view'
    document.querySelectorAll('.app-view').forEach(section => {
        section.classList.add('hidden');
    });

    // Show the requested section
    document.getElementById(viewId).classList.remove('hidden');

    // Clear messages when switching views (except login redirect message)
    if (!(viewId === 'login-view' && protectedViews.includes(appState.currentView))) {
        document.querySelectorAll('.error-message, .success-message').forEach(el => {
            el.classList.add('hidden');
        });
    }

    appState.currentView = viewId;
    updateNavigation();
    
    // LOAD FEED AUTOMATICALLY WHEN VIEWING FEED
    if (viewId === 'feed-view' && appState.isLoggedIn) {
        loadFeed();
    }
}

// NAVIGATION MANAGEMENT

function updateNavigation() {
    const loggedInElements = document.querySelectorAll('.logged-in-nav');
    const loggedOutElements = document.querySelectorAll('.logged-out-nav'); 

    if (appState.isLoggedIn) {
        // if user is logged in, hide login/register and show feed/search/logout
        loggedOutElements.forEach(el => el.classList.add('hidden'));
        loggedInElements.forEach(el => el.classList.remove('hidden'));
    } else {
        // else, show login/register buttons and hide logged-in buttons
        loggedInElements.forEach(el => el.classList.add('hidden'));
        loggedOutElements.forEach(el => el.classList.remove('hidden'));
    }
}

// MESSAGE DISPLAY

/**
 * Displays a persistent success or error message within the DOM.
 */
function displayMessage(elementId, message, isSuccess = true) {
    const messageEl = document.getElementById(elementId);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.remove('hidden');
        
        if (isSuccess) {
            messageEl.classList.remove('error-message');
            messageEl.classList.add('success-message');
        } else {
            messageEl.classList.add('error-message');
            messageEl.classList.remove('success-message');
        }
    }
}

// shows a temporary popup notification instead of alerts
function showPopup(message, isSuccess = true, duration = 3000) {
    const popup = document.getElementById('popup-notification');
    const messageEl = document.getElementById('popup-message');

    // set message and styling
    messageEl.textContent = message;
    popup.classList.remove('hidden', 'success', 'error', 'hiding');
    popup.classList.add(isSuccess ? 'success' : 'error');

    // auto dismiss after a set duration
    setTimeout(() => {
        popup.classList.add('hiding');
        setTimeout(() => {
            popup.classList.add('hidden');
        }, 3000);
    }, duration);
}

// FORM HANDLERS (IMPLEMENTED WITH AJAX)

// Handles Registration form submission (POST /users)
async function handleRegisterSubmit(event) {
    event.preventDefault();
    const errorMessageEl = document.getElementById('register-error-message');
    errorMessageEl.classList.add('hidden'); // Clear previous error

    // Extracting data
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    const registerData = { username, email, password };

    try {
        // AJAX POST request to the web service path /users
        const result = await sendRequest('/users', 'POST', registerData); 
        
        // 1. Switch to login view
        showView('login-view');
        
        // 2. Display persistent success message in the login view
        displayMessage(
            'login-success-message',
            result.message || `Success! ${username} is registered. Please log in.`,
            true 
        );
        
        // 3. Clear the registration form (good UX)
        document.getElementById('register-form').reset();

    } catch (error) {
        // Error message displayed to client if registration fails
        displayMessage(
            'register-error-message', 
            `Registration failed: ${error.message}`, 
            false
        );
    }
}


// Handles Login form submission (POST /login)
async function handleLoginSubmit(event) {
    event.preventDefault();

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    const loginData = { username, password };
    
    // Clear any previous error/success messages
    const errorEl = document.getElementById('login-error-message');
    const successEl = document.getElementById('login-success-message');
    errorEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden'); 

    try {
        // AJAX POST request to the web service path /login
        await sendRequest('/login', 'POST', loginData); 
        
        // Success: Update state and switch to feed view
        appState.isLoggedIn = true;
        appState.userId = username; 
        showView('feed-view');
        
        // load feed after successful login
        loadFeed();
        
        // Clear forms on successful login (good UX)
        document.getElementById('login-form').reset();
    } catch (error) {
        // Result or error message displayed to client
        displayMessage(
            'login-error-message', 
            `Login failed: ${error.message}`, 
            false
        );
    }
}


// Handles Logout (DELETE /login)
async function handleLogout() {
    try {
        // AJAX DELETE request to the web service path /login
        await sendRequest('/login', 'DELETE');
        
        // Success: Clear state and return to login view
        appState.isLoggedIn = false;
        appState.userId = null;
        
        // Switch view to force navigation update
        showView('login-view');
        console.log('Logout successful.');
    } catch (error) {
        // If logout fails on the server, try to force client logout anyway
        console.error('Logout error:', error);
        appState.isLoggedIn = false;
        appState.userId = null;
        showView('login-view');
    }
}

// Handles User Search form submission
async function handleUserSearch(event) {
    event.preventDefault();
    const searchTerm = document.getElementById('user-search-term').value;
    const resultsContainer = document.getElementById('user-search-results');
    
    try {
        const result = await sendRequest(`/users?q=${searchTerm}`, 'GET');
        
        resultsContainer.innerHTML = '';
        
        if (result.users.length === 0) {
            resultsContainer.innerHTML = '<p>No users found.</p>';
            return;
        }
        
        result.users.forEach(user => {
            const userCard = document.createElement('div');
            userCard.className = 'user-card';
            // inner html to create user cards with buttons to follow/unfollow
            userCard.innerHTML = `
                <h4>${user.username}</h4>
                <p>${user.email}</p>
                <div class="user-actions">
                    <button class="follow-btn" onclick="handleFollow('${user.username}')">Follow</button>
                    <button class="unfollow-btn" onclick="handleUnfollow('${user.username}')">Unfollow</button>
                </div>
            `;
            resultsContainer.appendChild(userCard);
        });
        
    } catch (error) {
        resultsContainer.innerHTML = `<p class="error-message">Search failed: ${error.message}</p>`;
    }
}

// Handles following a user
async function handleFollow(username) {
    try {
        const result = await sendRequest(`/follow/${username}`, 'POST');
        showPopup(result.message, true);
        
    } catch (error) {
        showPopup(`Follow failed: ${error.message}`, false);
    }
}

// Handles unfollowing a user
async function handleUnfollow(username) {
    try {
        const result = await sendRequest(`/follow/${username}`, 'DELETE');
        showPopup(result.message, true);

    } catch (error) {
        showPopup(`Unfollow failed: ${error.message}`, false);
    }
}

// Handles Content Search form submission
async function handleContentSearch(event) {
    event.preventDefault();
    const searchTerm = document.getElementById('content-search-term').value;
    const resultsContainer = document.getElementById('content-search-results');
    
    try {
        const result = await sendRequest(`/contents?q=${searchTerm}`, 'GET');
        
        resultsContainer.innerHTML = '';
        
        if (result.contents.length === 0) {
            resultsContainer.innerHTML = '<p>No content found.</p>';
            return;
        }
        
        result.contents.forEach(content => {
            const contentCard = document.createElement('article');
            contentCard.className = 'post-card';
            contentCard.innerHTML = `
                <h3 class="post-title">${content.title}</h3>
                <p class="post-meta">Posted by @${content.username}</p>
                <p class="post-content">${content.text}</p>
            `;
            resultsContainer.appendChild(contentCard);
        });
        
    } catch (error) {
        resultsContainer.innerHTML = `<p class="error-message">Search failed: ${error.message}</p>`;
    }
}

// Loads the user's feed
async function loadFeed() {
    const feedContainer = document.getElementById('feed-container');
    
    try {
        const result = await sendRequest('/feed', 'GET');

        //debug logs
        console.log('Full feed result:', result);
        console.log('Number of posts:', result.feed?.length);
        
        feedContainer.innerHTML = '';
        
        if (!result.feed || result.feed.length === 0) {
            feedContainer.innerHTML = '<p>No posts in your feed yet. Follow users to see their content!</p>';
            return;
        }
        
        result.feed.forEach(post => {
            console.log('Processing post:', post.title);
            console.log('Post has imagePath?', post.imagePath);
            console.log('imagePath value:', post.imagePath);

            const postCard = document.createElement('article');
            postCard.className = 'post-card';
            
            // displaying image of each post
            let imageHTML = '';
            if (post.imagePath) {
                imageHTML = `<img src="${BASE_URL}${post.imagePath}" alt="${post.title}" class="post-image">`;
            }
            // buidling html structure for each post in the feed
            postCard.innerHTML = `
                <h3 class="post-title">${post.title}</h3>
                <p class="post-meta">Posted by @${post.username}</p>
                ${imageHTML}
                <p class="post-content">${post.text}</p>
                <p class="post-meta">${new Date(post.timestamp).toLocaleString()}</p>
            `;
            feedContainer.appendChild(postCard);
        });
        
    } catch (error) {
        feedContainer.innerHTML = `<p class="error-message">Failed to load feed: ${error.message}</p>`;
    }
}

// Handles Post Content form submission (POST /contents)
async function handlePostContentSubmit(event) {
    event.preventDefault();
    const errorMessageEl = document.getElementById('post-error-message');
    errorMessageEl.classList.add('hidden');

    const title = document.getElementById('post-title').value;
    const text = document.getElementById('post-text').value;
    const imageFile = document.getElementById('post-image').files[0];

    try {
        // uploading image if selected
        if (imageFile) {
            const formData = new FormData();
            formData.append('image', imageFile);

            const uploadResponse = await fetch(BASE_URL + BASE_PATH + '/upload', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
        

            if (!uploadResponse.ok) {
                throw new error('Image upload failed');
            }

            const uploadResult = await uploadResponse.json();
            imagePath = uploadResult.imagePath;
            console.log('Image uploaded:', imagePath);
        }

        // posting content with image path

        const postData = { title, text, imagePath };
        const result = await sendRequest('/contents', 'POST', postData);

        document.getElementById('post-content-form').reset();
        showView('feed-view');

        // reloading feed to show the new post
        loadFeed();

        // REMINDER!!! ADD SUCCESS MESSAGE

    } catch (error) {
        displayMessage(
            'post-error-message', 
            `Post failed: ${error.message}`, 
            false
        );
    }
}

// handling user clicking the logo in header to show feed or login depending on appState
function handleLogoClick() {
    if (appState.isLoggedIn) {
        showView('feed-view');
    } else {
        showView('login-view');
    }
}


// INITIALIZATION AND EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {

    // Set initial navigation state (runs first)
    updateNavigation();

    // Attach submit listeners to the main forms
    document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
    document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
    
    // Attach listener for the logout button
    document.getElementById('logout-button').addEventListener('click', handleLogout);

    // Attach submit listener to the post content form
    document.getElementById('post-content-form').addEventListener('submit', handlePostContentSubmit);

    // *** ADD THESE NEW LISTENERS ***
    document.getElementById('user-search-form').addEventListener('submit', handleUserSearch);
    document.getElementById('content-search-form').addEventListener('submit', handleContentSearch);

    // Ensure the correct starting view is shown (login-view)
    showView(appState.currentView);
});

