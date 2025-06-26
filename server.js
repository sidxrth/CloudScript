require('dotenv').config();

const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const AWS = require('aws-sdk');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
}));
app.use(express.json());
app.use(express.static(__dirname));

// AWS S3 config
// Ensure these environment variables are correctly set in your .env file
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const s3 = new AWS.S3({ apiVersion: '2006-03-01' });
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const URL_EXPIRATION_SECONDS = 300; // 5 minutes

// SQLite3 DB
const db = new sqlite3.Database('./blog.sqlite', (err) => {
    if (err) return console.error('DB connection error:', err.message);
    console.log('Connected to SQLite DB');
});

// Initialize tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fullName TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            author TEXT NOT NULL,
            username TEXT,
            imageUrl TEXT,
            category TEXT DEFAULT 'uncategorized',
            status TEXT DEFAULT 'pending',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Signup
app.post('/api/signup', async (req, res) => {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) return res.status(400).json({ message: 'All fields required.' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const stmt = db.prepare('INSERT INTO users (fullName, email, password) VALUES (?, ?, ?)');
        stmt.run(fullName, email, hashedPassword, function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(409).json({ message: 'Email already exists.' });
                return res.status(500).json({ message: 'Error creating user.' });
            }
            res.status(201).json({ message: 'User registered successfully!' });
        });
    } catch (err) {
        res.status(500).json({ message: 'Hashing error.' });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required.' });

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ message: 'DB error.' });
        if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

        const match = await bcrypt.compare(password, user.password);
        if (match) {
            res.status(200).json({ message: 'Login successful!', user: { id: user.id, fullName: user.fullName, email: user.email } });
        } else {
            res.status(401).json({ message: 'Invalid credentials.' });
        }
    });
});

// Create Post
app.post('/api/posts', (req, res) => {
    const { title, content, author, username, imageUrl, category } = req.body;
    if (!title || !content || !author || !username || !category) return res.status(400).json({ message: 'Missing fields.' });

    const stmt = db.prepare(`
        INSERT INTO posts (title, content, author, username, imageUrl, category, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `);

    stmt.run(title, content, author, username, imageUrl || null, category, function (err) {
        if (err) return res.status(500).json({ message: 'Error creating post.' });
        res.status(201).json({ message: 'Post created successfully.' });
    });
});

// Get all posts
app.get('/api/posts', (req, res) => {
    db.all('SELECT * FROM posts ORDER BY createdAt DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Error fetching posts.' });
        res.status(200).json(rows);
    });
});

// Get approved posts
app.get('/api/posts/approved', (req, res) => {
    db.all("SELECT * FROM posts WHERE status = 'approved' ORDER BY createdAt DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Error fetching posts.' });
        res.status(200).json(rows);
    });
});

// Get pending posts
app.get('/api/posts/pending', (req, res) => {
    db.all("SELECT * FROM posts WHERE status = 'pending' ORDER BY createdAt DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Error fetching posts.' });
        res.status(200).json(rows);
    });
});

// Approve post
app.put('/api/posts/:id/approve', (req, res) => {
    db.run("UPDATE posts SET status = 'approved' WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ message: 'Error approving post.' });
        if (this.changes === 0) return res.status(404).json({ message: 'Post not found.' });
        res.status(200).json({ message: 'Post approved.' });
    });
});

// Reject post
app.put('/api/posts/:id/reject', (req, res) => {
    db.run("UPDATE posts SET status = 'rejected' WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ message: 'Error rejecting post.' });
        if (this.changes === 0) return res.status(404).json({ message: 'Post not found.' });
        res.status(200).json({ message: 'Post rejected.' });
    });
});

// Delete post
app.delete('/api/posts/:id', (req, res) => {
    db.run("DELETE FROM posts WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ message: 'Error deleting post.' });
        if (this.changes === 0) return res.status(404).json({ message: 'Post not found.' });
        res.status(200).json({ message: 'Post deleted.' });
    });
});

// Get single post
app.get('/api/posts/:id', (req, res) => {
    db.get("SELECT * FROM posts WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ message: 'Error fetching post.' });
        if (!row) return res.status(404).json({ message: 'Post not found.' });
        res.status(200).json(row);
    });
});

// S3 upload URL
app.post('/api/s3-presigned-url', (req, res) => {
    const { fileName, fileType } = req.body;
    if (!fileName || !fileType) return res.status(400).json({ message: 'Missing file info.' });

    // Sanitize filename for S3 key (replace spaces with underscores, etc.)
    const s3Key = `posts/${Date.now()}-${fileName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')}`;

    const params = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Expires: URL_EXPIRATION_SECONDS,
        ContentType: fileType
        // Removed ACL: 'public-read' as the bucket policy might not allow it.
        // Ensure your S3 bucket policy grants public read access to objects if needed.
    };

    s3.getSignedUrl('putObject', params, (err, uploadUrl) => {
        if (err) {
            console.error('S3 getSignedUrl Error:', err);
            return res.status(500).json({ message: `S3 URL generation failed. Details: ${err.message || 'Unknown S3 error'}` });
        }
        const fileUrl = `https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
        res.status(200).json({ uploadUrl, fileUrl });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
