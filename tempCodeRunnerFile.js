const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Enable CORS for all routes - IMPORTANT for frontend communication
app.use(cors({
    origin: '*', // Allow all origins for simplicity in development.
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
}));

// Middleware to parse JSON bodies
app.use(express.json());

// --- Static Files Serving ---
// Serve static files from the current directory (where server.js resides)
// This will make index.html, signup.html, login.html, and the 'assets' folder accessible
app.use(express.static(__dirname));

// Optional: Fallback for the root URL to serve index.html
// This ensures that when you go to http://44.200.157.50:3000, index.html is served.
// This line is often redundant if index.html is in the served static directory
// and is the default file, but it doesn't hurt.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Database setup
const dbPath = path.join(__dirname, 'blog_data.db'); // Renamed database for clarity
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create users table if it doesn't exist (from your original server.js)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fullName TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )`, (createErr) => {
            if (createErr) {
                console.error('Error creating users table:', createErr.message);
            } else {
                console.log('Users table ensured.');
            }
        });

        // NEW: Create posts table if it doesn't exist
        // Added 'username' column to store the user's display name from the frontend
        // Added 'createdAt' to track creation time for sorting
        // ✅ ADDED 'imageUrl' column for specific post images
        db.run(`CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            author TEXT NOT NULL,
            username TEXT,
            imageUrl TEXT, -- ✅ New column for storing the specific image URL for a post
            status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP -- New column for creation timestamp
        )`, (createErr) => {
            if (createErr) {
                console.error('Error creating posts table:', createErr.message);
            } else {
                console.log('Posts table ensured.');
            }
        });
    }
});

// --- API Endpoints ---

// 1. Signup Endpoint
app.post('/api/signup', async (req, res) => {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (fullName, email, password) VALUES (?, ?, ?)',
            [fullName, email, hashedPassword],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed: users.email')) {
                        return res.status(409).json({ message: 'Email already registered.' });
                    }
                    console.error('Database insert error:', err.message);
                    return res.status(500).json({ message: 'Error registering user.' });
                }
                console.log(`User registered with ID: ${this.lastID}`);
                res.status(201).json({ message: 'User registered successfully!' });
            }
        );
    } catch (hashError) {
        console.error('Password hashing error:', hashError.message);
        res.status(500).json({ message: 'Internal server error during password hashing.' });
    }
});

// 2. Login Endpoint
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ message: 'Error logging in.' });
        }

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        try {
            const isMatch = await bcrypt.compare(password, user.password);

            if (isMatch) {
                res.status(200).json({ message: 'Login successful!', user: { id: user.id, fullName: user.fullName, email: user.email } });
            } else {
                res.status(401).json({ message: 'Invalid credentials.' });
            }
        } catch (compareError) {
            console.error('Password comparison error:', compareError.message);
            res.status(500).json({ message: 'Internal server error during password comparison.' });
        }
    });
});

// 3. Create Post Endpoint
app.post('/api/posts', (req, res) => {
    // ✅ Include imageUrl in destructuring
    const { title, content, author, username, imageUrl } = req.body;

    if (!title || !content || !author || !username) {
        // imageUrl is optional, so not included in this check
        return res.status(400).json({ message: 'Title, content, author, and username are required.' });
    }

    const status = 'pending'; // New posts start as pending

    // ✅ Include imageUrl in the INSERT statement
    db.run('INSERT INTO posts (title, content, author, username, imageUrl, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [title, content, author, username, imageUrl || '', status], // Use '' if imageUrl is not provided
        function (err) {
            if (err) {
                console.error('Database insert error for post:', err.message);
                return res.status(500).json({ message: 'Error creating post.' });
            }
            console.log(`Post created with ID: ${this.lastID}`);
            res.status(201).json({ message: 'Post created successfully!', postId: this.lastID });
        }
    );
});

// 4. Get Pending Posts Endpoint (still useful for admin view)
// ✅ Include imageUrl in the SELECT statement
app.get('/api/posts/pending', (req, res) => {
    db.all("SELECT id, title, content, author, username, imageUrl, status, createdAt FROM posts WHERE status = 'pending'", [], (err, rows) => {
        if (err) {
            console.error('Database query error for pending posts:', err.message);
            return res.status(500).json({ message: 'Error fetching pending posts.' });
        }
        res.status(200).json(rows);
    });
});

// NEW: 5. Get ALL Posts Endpoint (for public blog page and general review)
// ✅ Include imageUrl in the SELECT statement
app.get('/api/posts', (req, res) => {
    db.all("SELECT id, title, content, author, username, imageUrl, status, createdAt FROM posts", [], (err, rows) => {
        if (err) {
            console.error('Database query error for all posts:', err.message);
            return res.status(500).json({ message: 'Error fetching all posts.' });
        }
        res.status(200).json(rows);
    });
});

// 6. Approve Post Endpoint
// This endpoint also needs to be able to set imageUrl if needed, or simply pass it through.
// For now, we'll assume imageUrl is set on creation, but a PUT route for updates would also need it.
app.put('/api/posts/:id/approve', (req, res) => {
    const postId = req.params.id;

    db.run('UPDATE posts SET status = ? WHERE id = ?', ['approved', postId], function (err) {
        if (err) {
            console.error(`Database update error for approving post ${postId}:`, err.message);
            return res.status(500).json({ message: 'Error approving post.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Post not found or already approved.' });
        }
        console.log(`Post ${postId} approved.`);
        res.status(200).json({ message: 'Post approved successfully!' });
    });
});

// 7. Reject Post Endpoint
app.put('/api/posts/:id/reject', (req, res) => {
    const postId = req.params.id;

    db.run('UPDATE posts SET status = ? WHERE id = ?', ['rejected', postId], function (err) {
        if (err) {
            console.error(`Database update error for rejecting post ${postId}:`, err.message);
            return res.status(500).json({ message: 'Error rejecting post.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Post not found or already rejected.' });
        }
        console.log(`Post ${postId} rejected.`);
        res.status(200).json({ message: 'Post rejected successfully!' });
    });
});

// NEW: 8. Delete Post Endpoint (for removing rejected posts or any other deletion)
app.delete('/api/posts/:id', (req, res) => {
    const postId = req.params.id;

    db.run('DELETE FROM posts WHERE id = ?', [postId], function (err) {
        if (err) {
            console.error(`Database delete error for post ${postId}:`, err.message);
            return res.status(500).json({ message: 'Error deleting post.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Post not found.' });
        }
        console.log(`Post ${postId} deleted.`);
        res.status(200).json({ message: 'Post deleted successfully!' });
    });
});

// ✅ NEW: Get Approved Posts Endpoint (for blogs.html public view)
// ✅ Include imageUrl in the SELECT statement
app.get('/api/posts/approved', (req, res) => {
    db.all("SELECT id, title, content, author, username, imageUrl, createdAt FROM posts WHERE status = 'approved'", [], (err, rows) => {
        if (err) {
            console.error('Database query error for approved posts:', err.message);
            return res.status(500).json({ message: 'Error fetching approved posts.' });
        }
        res.status(200).json(rows);
    });
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://44.200.157.50:${PORT}`);
});