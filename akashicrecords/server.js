const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

// Initialize SQLite database
const db = new sqlite3.Database('library.db');

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user',
        join_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        type TEXT,
        file_name TEXT,
        file_path TEXT,
        cover_image_path TEXT,
        user_id INTEGER,
        date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
    
    // Create default admin user
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, email, password, role) 
            VALUES ('admin', 'admin@library.com', ?, 'admin')`, [adminPassword]);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// File upload configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = file.fieldname === 'coverImage' ? 'uploads/covers/' : 'uploads/files/';
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1000 * 1024 * 1024 } // 1GB limit
});

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    db.get('SELECT role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    });
}

// Routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        req.session.userId = user.id;
        res.json({ user: { id: user.id, username: user.username, role: user.role } });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

app.get('/api/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    db.get('SELECT id, username, role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'User not found' });
        }
        res.json({ user });
    });
});

app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
           [username, email, hashedPassword], function(err) {
        if (err) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        res.json({ message: 'User created successfully' });
    });
});

app.post('/api/upload', requireAuth, upload.fields([
    { name: 'resourceFile', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
]), (req, res) => {
    const { title, type } = req.body;
    const resourceFile = req.files['resourceFile'][0];
    const coverImage = req.files['coverImage'] ? req.files['coverImage'][0] : null;
    
    db.run(`INSERT INTO books (title, type, file_name, file_path, cover_image_path, user_id) 
            VALUES (?, ?, ?, ?, ?, ?)`,
           [title, type, resourceFile.originalname, resourceFile.path, 
            coverImage ? coverImage.path : null, req.session.userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to save book' });
        }
        res.json({ message: 'Book uploaded successfully', id: this.lastID });
    });
});

app.get('/api/books', (req, res) => {
    db.all('SELECT * FROM books ORDER BY date_added DESC', (err, books) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch books' });
        }
        res.json(books);
    });
});

app.delete('/api/books/:id', requireAuth, (req, res) => {
    const bookId = req.params.id;
    
    // First check if the book belongs to the user or if user is admin
    db.get('SELECT user_id FROM books WHERE id = ?', [bookId], (err, book) => {
        if (err || !book) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        db.get('SELECT role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            
            // Only allow delete if user is admin or owns the book
            if (user.role !== 'admin' && book.user_id !== req.session.userId) {
                return res.status(403).json({ error: 'Not authorized to delete this book' });
            }
            
            // Get file paths to delete files
            db.get('SELECT file_path, cover_image_path FROM books WHERE id = ?', [bookId], (err, book) => {
                if (err || !book) {
                    return res.status(404).json({ error: 'Book not found' });
                }
                
                // Delete files
                if (fs.existsSync(book.file_path)) fs.unlinkSync(book.file_path);
                if (book.cover_image_path && fs.existsSync(book.cover_image_path)) {
                    fs.unlinkSync(book.cover_image_path);
                }
                
                // Delete from database
                db.run('DELETE FROM books WHERE id = ?', [bookId], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to delete book' });
                    }
                    res.json({ message: 'Book deleted successfully' });
                });
            });
        });
    });
});

app.get('/api/users', requireAdmin, (req, res) => {
    db.all('SELECT id, username, email, role, join_date FROM users', (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch users' });
        }
        res.json(users);
    });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const userId = req.params.id;
    
    // Prevent deleting yourself
    if (userId == req.session.userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to delete user' });
        }
        res.json({ message: 'User deleted successfully' });
    });
});

app.put('/api/users/:id/promote', requireAdmin, (req, res) => {
    const userId = req.params.id;
    
    db.run('UPDATE users SET role = "admin" WHERE id = ?', [userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to promote user' });
        }
        res.json({ message: 'User promoted to admin' });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});