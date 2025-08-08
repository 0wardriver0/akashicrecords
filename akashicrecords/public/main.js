// Global variables
let books = [];
let currentUser = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function () {
    // Check if user is already logged in
    checkAuthStatus();

    // Form submissions
    document.getElementById('loginForm')?.addEventListener('submit', function (e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        login(username, password);
    });

    document.getElementById('registerForm')?.addEventListener('submit', function (e) {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (password !== confirmPassword) {
            showAuthMessage('Passwords do not match', 'error');
            return;
        }

        register(username, email, password);
    });

    document.getElementById('uploadForm')?.addEventListener('submit', function (e) {
        e.preventDefault();
        uploadBook();
    });

    // File input handlers
    document.getElementById('coverImage')?.addEventListener('change', function (e) {
        const file = e.target.files[0];
        const selectedDiv = document.getElementById('coverSelected');
        if (!selectedDiv) return;
        selectedDiv.textContent = file ? `Selected: ${file.name}` : '';
        selectedDiv.style.display = file ? 'block' : 'none';
    });

    document.getElementById('resourceFile')?.addEventListener('change', function (e) {
        const file = e.target.files[0];
        const selectedDiv = document.getElementById('fileSelected');
        if (!selectedDiv) return;
        selectedDiv.textContent = file ? `Selected: ${file.name}` : '';
        selectedDiv.style.display = file ? 'block' : 'none';
    });

    // Event delegation for dynamic buttons
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('delete-btn')) {
            e.stopPropagation();
            const id = e.target.dataset.id;
            confirmDeleteBook(id);
        }

        if (e.target.classList.contains('promote')) {
            const id = e.target.dataset.id;
            promoteUser(id);
        }

        if (e.target.classList.contains('delete-user')) {
            const id = e.target.dataset.id;
            confirmDeleteUser(id);
        }

        const card = e.target.closest('.book-card');
        if (card) {
            const bookId = card.dataset.id;
            const book = books.find(b => b.id == bookId);
            if (book) openFileViewer(book);
        }
    });
});

// UI Functions
function switchTab(tab) {
    const loginTab = document.querySelector('.auth-tabs button:nth-child(1)');
    const registerTab = document.querySelector('.auth-tabs button:nth-child(2)');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (tab === 'login') {
        loginTab?.classList.add('active');
        registerTab?.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginTab?.classList.remove('active');
        registerTab?.classList.add('active');
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }

    document.getElementById('authMessage').innerHTML = '';
}

function showAuthMessage(message, type) {
    const authMessage = document.getElementById('authMessage');
    if (authMessage) {
        authMessage.innerHTML = `<div class="alert ${type}">${message}</div>`;
    }
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `alert ${type}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

function showAuthScreen() {
    document.getElementById('authScreen')?.style.setProperty('display', 'flex');
    document.getElementById('mainContent')?.style.setProperty('display', 'none');
    document.getElementById('adminPanel')?.style.setProperty('display', 'none');
}

function showMainContent() {
    document.getElementById('authScreen')?.style.setProperty('display', 'none');
    document.getElementById('mainContent')?.style.setProperty('display', 'block');
    document.getElementById('adminPanel')?.style.setProperty('display', 'none');

    document.getElementById('currentUser').textContent = currentUser.username;
    document.getElementById('userRole').textContent = currentUser.role;

    document.getElementById('adminBtn').style.display = currentUser.role === 'admin' ? 'block' : 'none';
    document.getElementById('uploadBtn').style.display = 'block';

    loadBooks();
}

function openAdminPanel() {
    document.getElementById('mainContent')?.style.setProperty('display', 'none');
    document.getElementById('adminPanel')?.style.setProperty('display', 'block');
    loadUsers();
}

function closeAdminPanel() {
    document.getElementById('mainContent')?.style.setProperty('display', 'block');
    document.getElementById('adminPanel')?.style.setProperty('display', 'none');
}

function openUploadModal() {
    document.getElementById('uploadModal')?.style.setProperty('display', 'block');
}

function closeUploadModal() {
    document.getElementById('uploadModal')?.style.setProperty('display', 'none');
    document.getElementById('uploadForm')?.reset();
    document.getElementById('coverSelected')?.style.setProperty('display', 'none');
    document.getElementById('fileSelected')?.style.setProperty('display', 'none');
}

function openFileViewer(book) {
    const viewer = document.getElementById('fileViewer');
    const content = document.getElementById('fileViewerContent');
    const title = document.getElementById('fileTitle');

    if (!viewer || !content || !title) return;

    title.textContent = book.title;
    content.innerHTML = '';

    const fileExtension = book.file_path?.split('.').pop()?.toLowerCase() || '';

    if (['pdf'].includes(fileExtension)) {
        content.innerHTML = `<iframe src="/${book.file_path}"></iframe>`;
    } else if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExtension)) {
        content.innerHTML = `<img src="/${book.file_path}" alt="${book.title}">`;
    } else if (['mp4', 'mov', 'avi'].includes(fileExtension)) {
        content.innerHTML = `<video controls autoplay><source src="/${book.file_path}" type="video/${fileExtension}"></video>`;
    } else if (['txt'].includes(fileExtension)) {
        fetch(`/${book.file_path}`)
            .then(response => response.text())
            .then(text => {
                content.innerHTML = `<div class="text-content">${text}</div>`;
            });
    } else {
        content.innerHTML = `<p>This file type cannot be previewed. <a href="/${book.file_path}" download>Download instead</a></p>`;
    }

    viewer.style.display = 'block';
}

function closeFileViewer() {
    document.getElementById('fileViewer')?.style.setProperty('display', 'none');
}

function displayBooks() {
    const booksGrid = document.getElementById('booksGrid');
    const emptyState = document.getElementById('emptyState');
    if (!booksGrid || !emptyState) return;

    if (books.length === 0) {
        emptyState.style.display = 'block';
        booksGrid.innerHTML = '';
        return;
    }

    emptyState.style.display = 'none';
    booksGrid.innerHTML = books.map(book => `
        <div class="book-card" data-id="${book.id}">
            <div class="book-cover">
                ${book.cover_image_path ?
            `<img src="/${book.cover_image_path}" alt="${book.title}">` :
            `<div class="placeholder">📖</div>`}
                ${(currentUser.role === 'admin' || currentUser.id === book.user_id) ?
            `<button class="delete-btn" data-id="${book.id}">✕</button>` : ''}
            </div>
            <div class="book-info">
                <div class="book-title">${book.title}</div>
                <div class="book-type">${book.type}</div>
            </div>
        </div>
    `).join('');
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>${new Date(user.join_date).toLocaleDateString()}</td>
            <td>
                ${user.role !== 'admin' ?
            `<button class="action-btn promote" data-id="${user.id}">Promote</button>` : ''}
                ${user.id !== currentUser.id ?
            `<button class="action-btn delete-user" data-id="${user.id}">Delete</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function confirmDeleteBook(bookId) {
    if (confirm('Are you sure you want to delete this resource?')) {
        deleteBook(bookId);
    }
}

function confirmDeleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        deleteUser(userId);
    }
}

// API Functions
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showMainContent();
        } else {
            showAuthScreen();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showAuthScreen();
    }
}

async function login(username, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showMainContent();
            showToast(`Welcome back, ${data.user.username}!`, 'success');
        } else {
            const error = await response.json();
            showAuthMessage(error.error || 'Invalid username or password', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAuthMessage('Login failed. Please try again.', 'error');
    }
}

async function register(username, email, password) {
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        if (response.ok) {
            showAuthMessage('Account created successfully! Please login.', 'success');
            document.getElementById('registerForm')?.reset();
            switchTab('login');
        } else {
            const error = await response.json();
            showAuthMessage(error.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showAuthMessage('Registration failed. Please try again.', 'error');
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        showAuthScreen();
        showToast('Logged out successfully', 'info');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Logout failed', 'error');
    }
}

async function uploadBook() {
    const title = document.getElementById('bookTitle').value;
    const type = document.getElementById('bookType').value;
    const coverImage = document.getElementById('coverImage').files[0];
    const resourceFile = document.getElementById('resourceFile').files[0];

    if (!resourceFile) {
        showToast('Please select a file to upload', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('type', type);
    formData.append('resourceFile', resourceFile);
    if (coverImage) formData.append('coverImage', coverImage);

    const submitBtn = document.getElementById('submitBtn');
    const submitText = document.getElementById('submitText');
    const submitSpinner = document.getElementById('submitSpinner');

    submitText.textContent = 'Uploading...';
    submitSpinner.style.display = 'inline-block';
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            showToast('Resource added successfully!', 'success');
            loadBooks();
            closeUploadModal();
        } else {
            const error = await response.json();
            showToast(error.error || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed', 'error');
    } finally {
        submitText.textContent = 'Add to Library';
        submitSpinner.style.display = 'none';
        submitBtn.disabled = false;
    }
}

async function loadBooks() {
    try {
        const response = await fetch('/api/books');
        if (response.ok) {
            books = await response.json();
            displayBooks();
        } else {
            console.error('Failed to load books');
        }
    } catch (error) {
        console.error('Error loading books:', error);
    }
}

async function deleteBook(bookId) {
    try {
        const response = await fetch(`/api/books/${bookId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Resource deleted successfully', 'success');
            loadBooks();
        } else {
            const error = await response.json();
            showToast(error.error || 'Delete failed', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Delete failed', 'error');
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        if (response.ok) {
            const users = await response.json();
            displayUsers(users);
        } else {
            console.error('Failed to load users');
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function deleteUser(userId) {
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('User deleted successfully', 'success');
            loadUsers();
        } else {
            const error = await response.json();
            showToast(error.error || 'Delete failed', 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showToast('Delete failed', 'error');
    }
}

async function promoteUser(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/promote`, {
            method: 'PUT'
        });

        if (response.ok) {
            showToast('User promoted to admin', 'success');
            loadUsers();
        } else {
            const error = await response.json();
            showToast(error.error || 'Promotion failed', 'error');
        }
    } catch (error) {
        console.error('Promote user error:', error);
        showToast('Promotion failed', 'error');
    }
}
