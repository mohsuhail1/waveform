// A simple object to track application state (like login status)
const appState = {
    isLoggedIn: false,
    currentView: 'login-view',
    userId: null
};

// *** 1. CONFIGURATION ***
const BASE_PATH = '/M01033526'; 

// GENERIC AJAX HELPER FUNCTION

/**
 * Sends data to the web service and returns the parsed JSON result.
 */
async function sendRequest(path, method, data = null) {
    const url = BASE_PATH + path;
    
    try {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include' // Ensures session cookies are sent/received
        };
        if (data) {
            options.body = JSON.stringify(data);
        }

        // Fetching the resource from the server
        const response = await fetch(url, options);

        // All client/server exchange must be JSON formatted (except file uploads)
        const result = await response.json(); 

        if (!response.ok) {
            // If the response status is not 2xx, throw an error
            const errorMessage = result.error || `Server responded with status: ${response.status}`;
            throw new Error(errorMessage);
        }
        
        return result; // Successful JSON result
    } catch (error) {
        // Network errors or errors thrown above are caught here
        console.error('AJAX Error:', error.message);
        throw error; 
    }
}

// CORE VIEW MANAGEMENT

function showView(viewId) {
    // Hiding all sections with class 'app-view'
    document.querySelectorAll('.app-view').forEach(section => {
        section.classList.add('hidden');
    });

    // Show the requested section
    document.getElementById(viewId).classList.remove('hidden');

    // Clear messages when switching views
    document.querySelectorAll('.error-message, .success-message').forEach(el => {
        el.classList.add('hidden');
    });

    appState.currentView = viewId;
    updateNavigation();
}

// NAVIGATION MANAGEMENT

function updateNavigation() {
    const loggedInElements = document.querySelectorAll('.logged-in-nav');
    // CRITICAL FIX: Added '.' to select the class correctly
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
        // Successful login establishes a session on the server side
        await sendRequest('/login', 'POST', loginData); 
        
        // Success: Update state and switch to feed view
        appState.isLoggedIn = true;
        appState.userId = username; 
        showView('feed-view');
        
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
    console.log('Attempting to log out...');
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


// INITIALIZATION AND EVENT LISTENERS

document.addEventListener('DOMContentLoaded', () => {

    // Set initial navigation state (runs first)
    updateNavigation();

    // Attach submit listeners to the main forms
    document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
    document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
    
    // Attach listener for the logout button
    document.getElementById('logout-button').addEventListener('click', handleLogout);

    // Ensure the correct starting view is shown (login-view)
    showView(appState.currentView);

    // Attach submit listener to the post content form
    document.getElementById('post-content-form').addEventListener('submit', handlePostContentSubmit);
});



// Handles Post Content form submission (POST /contents)
async function handlePostContentSubmit(event) {
    event.preventDefault();
    const errorMessageEl = document.getElementById('post-error-message');
    errorMessageEl.classList.add('hidden'); // Clear previous error

    // Extracting data
    const title = document.getElementById('post-title').value;
    const text = document.getElementById('post-text').value;

    const postData = { title, text, username: appState.userId }; // Using userId as temp username

    try {
        // AJAX POST request to the web service path /contents
        const result = await sendRequest('/contents', 'POST', postData); 
        
        // Success: Clear form, switch to feed, and display success message
        document.getElementById('post-content-form').reset();
        showView('feed-view');

        displayMessage(
            'feed-view', // Assuming you have a message element in the feed view
            result.message || 'Review posted successfully!',
            true 
        );

    } catch (error) {
        // Result or error message displayed to the user
        displayMessage(
            'post-error-message', 
            `Post failed: ${error.message}`, 
            false
        );
    }
}