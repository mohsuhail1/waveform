const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const app = express();
const port = 8080;

// student ID base path
const BASE_PATH = '/M01033526'; 

// MongoDB setup
const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1 } });
let db;

// using Multer for image uploads:
// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename: timestamp-originalname
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        // Accept images only
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});


// Express middleware 
app.use(express.json()); 


// Session setup
app.use(session({
    secret: '727',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Request logging (for debugging)
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// this tells express to serve files from the frontend directory 
// when the request path starts with the student id base path
app.use(BASE_PATH, express.static(path.join(__dirname, '../frontend')));

app.use('/uploads', express.static(uploadsDir));


// Function to check if the user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required.' });
    }
}

// Connection and server start
async function startServer() {
    try {
        await client.connect();
        db = client.db('waveform_db');
        console.log("Connected to MongoDB");

        implementRoutes();

        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}${BASE_PATH}/`);
        });
    } catch (err) {
        console.error("Failed to connect or start server.", err);
    }
}

// Function to hold web service routes
function implementRoutes() {

    // TEST ROUTE
    app.get(BASE_PATH + '/', (req, res) => {
        res.status(200).json({ message: 'WaveForm server running for M01033526' })
    });

    // ARTIST INFO WEB SCRAPING ROUTE (GET /artist-info)
    app.get(BASE_PATH + '/artist-info', async (req, res) => {
        const artistName = req.query.artist;
        if (!artistName) {
            return res.status(400).json({ error: 'Artist name required' });
        }

        try {
            // formatting the artist name for the Wikipedia URL (spaces to underscores)
            const formattedName = artistName.trim().replace(/\s+/g, '_');
            const wikiUrl = `https://en.wikipedia.org/wiki/${formattedName}`;

            const response = await axios.get(wikiUrl, {
                headers: { 'User-Agent': 'WaveFormStudentProject'}
            });
            const html = response.data;
            const $ = cheerio.load(html);

            // scraping the first paragraph of the main content
            let summary = $('.mw-parser-output > p:not(.mw-empty-elt)').first().text();

            // cleanup: remove citation numbers like [1]
            summary = summary.replace(/\[\d+\]/g, '');

            // for handling empty summary.
            // and also handling a case where a band might not have an uncommon name
            // example: checking artist info for the band Ne Obliviscaris can lead to the
            // wiki page for the latin translation of the band name.
            // so, for now I applied a condition for length and in a future version, we can make the
            // web scraping bot smarter.
            if (!summary || summary.length<100) {
                summary = "Could not find a summary for this artist.";
            }

            res.status(200).json({ 
                artist: artistName, 
                summary: summary, 
                url: wikiUrl 
            });

        } catch (error) {
            console.error('Scraping error:', error.message);
            // Fallback if the page doesn't exist or other error
            res.status(404).json({ error: 'Artist information not found on Wikipedia.' });
        }
    });

    // IMAGE UPLOAD WEB SERVICE ROUTE
    app.post(BASE_PATH + '/upload', isAuthenticated, upload.single('image'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }
            
            // Save path with leading slash for serving
            const imagePath = `/uploads/${req.file.filename}`;
            
            console.log('Image uploaded:', imagePath);
            
            res.status(200).json({ 
                message: 'Image uploaded successfully',
                imagePath: imagePath 
            });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: 'Upload failed: ' + error.message });
        }
    });

    // REGISTRATION WEB SERVICE (POST /users)
    app.post(BASE_PATH + '/users', async (req, res) => {
        console.log('Registration attempt:', req.body);
        const usersCollection = db.collection('users');
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        try {
            const existingUser = await usersCollection.findOne({ 
                $or: [{ username }, { email }] 
            });
            if (existingUser) {
                return res.status(409).json({ error: 'Username or email already exists.' });
            }

            const newUser = {
                username,
                email,
                password: password,
                followers: [],
                following: []
            };

            await usersCollection.insertOne(newUser);
            console.log('User registered:', username);

            res.status(201).json({ message: 'Registration successful. Please log in.' });

        } catch (error) {
            console.error("Registration error:", error);
            res.status(500).json({ error: 'Internal server error during registration.' });
        }
    });



    // LOGIN WEB SERVICE (POST /login)
    app.post(BASE_PATH + '/login', async (req, res) => {
        const usersCollection = db.collection('users');
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        try {
            // Find user in MongoDB by username AND password (unsafe direct comparison)
            const user = await usersCollection.findOne({ 
                username: username,
                password: password
            });

            if (user) {
                // SUCCESS: Session Management
                // Store MongoDB ObjectId as a string in the session
                req.session.userId = user._id.toHexString(); 
                
                // Success Response
                res.status(200).json({ message: 'Login successful' });
            } else {
                // Failure Response
                res.status(401).json({ error: "Invalid credentials" });
            }

        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ error: 'Internal server error during login.' });
        }
    });


    // LOGOUT WEB SERVICE (DELETE /login)
    app.delete(BASE_PATH + '/login', isAuthenticated, (req, res) => {
        // isAuthenticated check ensures only logged-in users can reach here
        req.session.destroy(err => {
            if (err) return res.status(500).json({ error: 'Could not log out' });
            // Confirmation message in JSON format
            res.status(200).json({ message: 'Logout successful' }); 
        });
    });


    // USER SEARCH WEB SERVICE (GET /users)
    app.get(BASE_PATH + '/users', isAuthenticated, async (req, res) => {
        const usersCollection = db.collection('users');
        const searchTerm = req.query.q; // Query parameter 'q' (e.g., /users?q=tom)

        if (!searchTerm) {
            return res.status(400).json({ error: 'Search term (q) is required.' });
        }

        try {
            // Case-insensitive search on username
            const query = { username: { $regex: searchTerm, $options: 'i' } };

            // Find users, exclude the password field
            const users = await usersCollection.find(query, { projection: { password: 0 } }).toArray();

            // Return results in JSON format
            res.status(200).json({ users });
        } catch (error) {
            console.error("User search error:", error);
            res.status(500).json({ error: 'Internal server error during search.' });
        }
    });
    

    // CONTENT POSTING WEB SERVICE (POST /contents)
    app.post(BASE_PATH + '/contents', isAuthenticated, async (req, res) => {
    console.log('Content posting attempt:', req.body);
    const contentsCollection = db.collection('contents');
    const usersCollection = db.collection('users');
    const { title, text, imagePath, artistName } = req.body;
    
    const userId = req.session.userId;

    if (!title || !text) {
        return res.status(400).json({ error: 'Title and content are required.' });
    }

    try {
        // getting username from database
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Create the content document
        const newContent = {
            userId: new ObjectId(userId), // MongoDB ObjectId
            username: user.username,      // Get username from database
            title: title,
            artistName: artistName || null,
            text: text,
            timestamp: new Date(),
            imagePath: imagePath || null 
        };

        // Insert into the 'contents' collection
        const result = await contentsCollection.insertOne(newContent);
        console.log('Content posted successfully by:', user.username);

        // Success Response
        res.status(201).json({ message: 'Content posted successfully.' });

    } catch (error) {
        console.error("Content posting error:", error);
        res.status(500).json({ error: 'Internal server error during content posting.' });
    }
    });

    // CONTENT SEARCH (GET /contents)
    app.get(BASE_PATH + '/contents', isAuthenticated, async (req, res) => {
    const contentsCollection = db.collection('contents');
    const searchTerm = req.query.q;

    if (!searchTerm) {
        return res.status(400).json({ error: 'Search term (q) is required.' });
    }

    try {
        const query = {
            $or: [
                { title: { $regex: searchTerm, $options: 'i' } },
                { text: { $regex: searchTerm, $options: 'i' } }
            ]
        };

        const contents = await contentsCollection.find(query).toArray();

        res.status(200).json({ contents });
    } catch (error) {
        console.error("Content search error:", error);
        res.status(500).json({ error: 'Internal server error during search.' });
    }
    });

    // FOLLOW USER (POST /follow)
    app.post(BASE_PATH + '/follow/:username', isAuthenticated, async (req, res) => {
    const usersCollection = db.collection('users');
    const currentUserId = req.session.userId;
    const usernameToFollow = req.params.username;

    try {
        // Get current user
        const currentUser = await usersCollection.findOne({ _id: new ObjectId(currentUserId) });
        
        // Get user to follow
        const userToFollow = await usersCollection.findOne({ username: usernameToFollow });

        if (!userToFollow) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // preventing user from following themselves
        if (currentUser.username === usernameToFollow) {
            return res.status(400).json({ error: 'You cannot follow yourself.' });
        }

        // Check if already following
        if (currentUser.following && currentUser.following.includes(usernameToFollow)) {
            return res.status(400).json({ error: 'Already following this user.' });
        }

        // Update current user's following list
        await usersCollection.updateOne(
            { _id: new ObjectId(currentUserId) },
            { $addToSet: { following: usernameToFollow } }
        );

        // Update followed user's followers list
        await usersCollection.updateOne(
            { username: usernameToFollow },
            { $addToSet: { followers: currentUser.username } }
        );

        console.log(`${currentUser.username} is now following ${usernameToFollow}`);
        res.status(200).json({ message: `You are now following ${usernameToFollow}` });

    } catch (error) {
        console.error("Follow error:", error);
        res.status(500).json({ error: 'Internal server error during follow.' });
    }
    });

    // UNFOLLOW USER (DELETE /follow)
    app.delete(BASE_PATH + '/follow/:username', isAuthenticated, async (req, res) => {
    // debug log
    console.log('Unfollow route hit for:', req.params.username);
    const usersCollection = db.collection('users');
    const currentUserId = req.session.userId;
    const usernameToUnfollow = req.params.username;

    try {
        // Get current user
        const currentUser = await usersCollection.findOne({ _id: new ObjectId(currentUserId) });
        console.log('Current user following list:', currentUser.following);
        console.log('Trying to unfollow:', usernameToUnfollow);
        
        // Get user to unfollow
        const userToUnfollow = await usersCollection.findOne({ username: usernameToUnfollow });

        if (!userToUnfollow) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Check if actually following
        if (!currentUser.following || !currentUser.following.includes(usernameToUnfollow)) {
            return res.status(400).json({ error: 'You are not following this user.' });
        }

        // Remove from current user's following list
        await usersCollection.updateOne(
            { _id: new ObjectId(currentUserId) },
            { $pull: { following: usernameToUnfollow } }
        );

        // Remove from unfollowed user's followers list
        await usersCollection.updateOne(
            { username: usernameToUnfollow },
            { $pull: { followers: currentUser.username } }
        );

        console.log(`${currentUser.username} unfollowed ${usernameToUnfollow}`);
        res.status(200).json({ message: `You have unfollowed ${usernameToUnfollow}` });

    } catch (error) {
        console.error("Unfollow error:", error);
        res.status(500).json({ error: 'Internal server error during unfollow.' });
    }
    });

    // GET FEED (GET /feed)
    app.get(BASE_PATH + '/feed', isAuthenticated, async (req, res) => {
        const usersCollection = db.collection('users');
        const contentsCollection = db.collection('contents');
        const currentUserId = req.session.userId;

        try {
            const currentUser = await usersCollection.findOne({ _id: new ObjectId(currentUserId) });
            console.log('Current user:', currentUser.username);
            console.log('Following:', currentUser.following);

            // Check if user is following anyone
            if (!currentUser.following || currentUser.following.length === 0) {
                console.log('User is not following anyone');
                return res.status(200).json({ feed: [], message: 'You are not following anyone yet.' });
            }

            // Get users that current user is following
            const followedUsers = await usersCollection.find(
                { username: { $in: currentUser.following } }
            ).toArray();
            
            console.log('Followed users:', followedUsers.map(u => u.username));

            const followedUserIds = followedUsers.map(user => user._id);
            console.log('Followed user IDs:', followedUserIds);

            // Get contents ONLY from followed users 
            const feed = await contentsCollection.find(
                { userId: { $in: followedUserIds } }
            ).sort({ timestamp: -1 }).toArray();
            
            console.log('Feed contents found:', feed.length);

            res.status(200).json({ feed });

        } catch (error) {
            console.error("Feed error:", error);
            res.status(500).json({ error: 'Internal server error retrieving feed.' });
        }
    });
    
    // get login status (GET /login)
    app.get(BASE_PATH + '/login', (req, res) => {
    if (req.session.userId) {
        res.status(200).json({ 
            loggedIn: true, 
            userId: req.session.userId 
        });
    } else {
        res.status(200).json({ 
            loggedIn: false 
        });
    }
    });
}

startServer();