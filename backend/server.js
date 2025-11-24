const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const session = require('express-session');
const app = express();
const port = 8080;

// student ID base path
const BASE_PATH = '/M01033526'; 

// MongoDB setup
// Default MongoDB port is 27017
const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1 } });
let db;

// Express middleware
app.use(express.json()); 

// Simple session setup
app.use(session({
    secret: '727',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Function to check if the user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next(); // User is authenticated, proceed to the route handler
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

    // -----------------------------------------------------
    // 1. REGISTRATION WEB SERVICE (POST /users)
    // -----------------------------------------------------
    app.post(BASE_PATH + '/users', async (req, res) => {
        const usersCollection = db.collection('users');
        const { username, email, password } = req.body;

        // 1. Basic Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        try {
            // 2. Check for existing user (uniqueness check)
            const existingUser = await usersCollection.findOne({ 
                $or: [{ username }, { email }] 
            });
            if (existingUser) {
                return res.status(409).json({ error: 'Username or email already exists.' });
            }

            // 3. Create new user document
            const newUser = {
                username,
                email,
                password: password,
                followers: [],
                following: []
            };

            // 4. Insert into MongoDB
            await usersCollection.insertOne(newUser);

            // 5. Success Response
            res.status(201).json({ message: 'Registration successful. Please log in.' });

        } catch (error) {
            console.error("Registration error:", error);
            res.status(500).json({ error: 'Internal server error during registration.' });
        }
    });

    // -----------------------------------------------------
    // 2. LOGIN WEB SERVICE (POST /login)
    // -----------------------------------------------------
    app.post(BASE_PATH + '/login', async (req, res) => {
        const usersCollection = db.collection('users');
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        try {
            // 1. Find user in MongoDB by username AND password (unsafe direct comparison)
            const user = await usersCollection.findOne({ 
                username: username,
                password: password
            });

            if (user) {
                // 2. SUCCESS: Session Management
                // Store MongoDB ObjectId as a string in the session
                req.session.userId = user._id.toHexString(); 
                
                // 3. Success Response
                res.status(200).json({ message: 'Login successful' });
            } else {
                // 4. Failure Response
                res.status(401).json({ error: "Invalid credentials" });
            }

        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ error: 'Internal server error during login.' });
        }
    });

    // -----------------------------------------------------
    // 3. LOGOUT WEB SERVICE (DELETE /login)
    // -----------------------------------------------------
    app.delete(BASE_PATH + '/login', isAuthenticated, (req, res) => {
        // isAuthenticated check ensures only logged-in users can reach here
        req.session.destroy(err => {
            if (err) return res.status(500).json({ error: 'Could not log out' });
            // Confirmation message in JSON format
            res.status(200).json({ message: 'Logout successful' }); 
        });
    });

    // -----------------------------------------------------
    // 4. USER SEARCH WEB SERVICE (GET /users)
    // -----------------------------------------------------
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
    
    // -----------------------------------------------------
    // 5. CONTENT POSTING WEB SERVICE (POST /contents)
    // -----------------------------------------------------
    app.post(BASE_PATH + '/contents', isAuthenticated, async (req, res) => {
        const contentsCollection = db.collection('contents');
        const { title, text } = req.body;
        
        // The user ID comes from the established session
        const userId = req.session.userId;

        if (!title || !text) {
            return res.status(400).json({ error: 'Title and content are required.' });
        }

        try {
            // Create the content document
            const newContent = {
                userId: new ObjectId(userId), // Convert string ID back to ObjectId for MongoDB
                username: req.body.username,
                title: title,
                text: text,
                timestamp: new Date(),
                // Placeholder for image file path (to be added with file upload logic later)
                imagePath: null 
            };

            // Insert into the 'contents' collection
            await contentsCollection.insertOne(newContent);

            // Success Response
            res.status(201).json({ message: 'Content posted successfully.' });

        } catch (error) {
            console.error("Content posting error:", error);
            res.status(500).json({ error: 'Internal server error during content posting.' });
        }
    });
}

startServer();