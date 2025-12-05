const express = require('express');
const path = require('path');
const mysql = require('mysql');
const session = require('express-session');
const bodyParser = require('body-parser');
const db = require('./connection');
const app = express();
const PORT = 3000;

const cors = require('cors');
app.use(cors({
  origin: 'http://127.0.0.1:5501',
  credentials: true,
}));

// Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Debug middleware
app.use((req, res, next) => {
  console.log('Session ID:', req.sessionID);
  console.log('Session user:', req.session.user);
  next();
});

// Serve login.html as root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login endpoint
app.post('/login', (req, res) => {
  const { email, password, role } = req.body;
  console.log('Login attempt:', { email, password, role });

  if (email && password && role) {
    db.query(
      'SELECT * FROM users WHERE email = ? AND password = ? AND role = ?',
      [email, password, role],
      (err, results) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (results.length > 0) {
          const user = results[0];
          req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.Department
          };
          
          console.log('Session created for user:', req.session.user);
          
          res.json({ 
            success: true, 
            message: 'Login successful',
            role: user.role 
          });
        } else {
          console.log('Invalid credentials for:', email);
          res.status(401).json({ 
            success: false, 
            error: 'Invalid credentials or role mismatch' 
          });
        }
      }
    );
  } else {
    res.status(400).json({ 
      success: false, 
      error: 'Email, password and role are required' 
    });
  }
});

// Session check endpoint
app.get('/api/session-check', (req, res) => {
  res.json({ 
    session: req.session,
    sessionID: req.sessionID 
  });
});

// Logout endpoint
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.user) {
    console.log('User authenticated:', req.session.user.email);
    next();
  } else {
    console.log('No session user - redirecting to login');
    res.status(401).json({ error: 'Not authenticated' });
  }
}

// Protected routes
app.get('/admindesk.html', requireAuth, (req, res) => {
  if (req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'admindesk.html'));
});

app.get('/Empdesk.html', requireAuth, (req, res) => {
  if (req.session.user.role !== 'Employee') {
    return res.status(403).json({ error: 'Access denied. Employee role required.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'Empdesk.html'));
});

// Protected API routes
app.get('/api/tasks', requireAuth, (req, res) => {
  const sql = `
    SELECT 
      tasks.*, 
      users.Department AS Department 
    FROM tasks 
    JOIN users ON tasks.name = users.name;
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/users', requireAuth, (req, res) => {
  const query = "SELECT id, name, role, email, Department FROM users";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching users:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

app.get('/api/settings', requireAuth, (req, res) => {
  db.query('SELECT * FROM settings LIMIT 1', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results[0]);
  });
});

app.post('/api/settings', requireAuth, (req, res) => {
  const { company_name, company_email, timezone, ip_address } = req.body;
  db.query('UPDATE settings SET company_name = ?, company_email = ?, timezone = ?, ip_address = ? WHERE id = 1',
    [company_name, company_email, timezone, ip_address],
    (err, result) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Settings updated' });
    });
});

app.get('/api/calendar-tasks', requireAuth, (req, res) => {
  const sql = `
    SELECT 
      task_id, task_name, assigned_date, due_date ,name
    FROM tasks 
    WHERE assigned_date IS NOT NULL OR due_date IS NOT NULL
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching calendar tasks:', err);
      return res.status(500).json({ error: 'Failed to fetch tasks' });
    }

    const events = [];
    results.forEach(task => {
      if (task.assigned_date) {
        events.push({
          title: `[Assigned] ${task.task_name}`,
          AssignedTo: `[Assigned To] ${task.name}`,
          start: task.assigned_date,
          color: '#0d6efd'
        });
      }
      if (task.due_date) {
        events.push({
          title: `[Due] ${task.task_name}`,
          AssignedTo: `[Assigned To] ${task.name}`,
          start: task.due_date,
          color: '#dc3545'
        });
      }
    });
    res.json(events);
  });
});

app.post('/api/tasks', requireAuth, (req, res) => {
  const { task_name, task_description, assignee_name, due_date, status } = req.body;
  const assigned_date = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const employee_email = null;

  const query = `
    INSERT INTO tasks 
      (task_name, task_description, name, employee_email, assigned_date, due_date, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.query(
    query,
    [task_name, task_description, assignee_name, employee_email, assigned_date, due_date, status],
    (err, result) => {
      if (err) {
        console.error('Error inserting task:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, insertId: result.insertId });
    }
  );
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const taskId = req.params.id;
  const sql = 'DELETE FROM tasks WHERE task_id = ?';
  db.query(sql, [taskId], (err, result) => {
    if (err) {
      console.error('Error deleting task:', err);
      return res.status(500).json({ message: 'Failed to delete task' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully' });
  });
});

app.get('/api/task-completion-rate', requireAuth, (req, res) => {
  const sql = `
    SELECT assigned_date, 
      COUNT(*) as total, 
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed 
    FROM tasks 
    GROUP BY assigned_date 
    ORDER BY assigned_date DESC LIMIT 7
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});

app.get('/api/task-distribution-by-department', requireAuth, (req, res) => {
  const sql = `
    SELECT u.Department, COUNT(*) as count 
    FROM tasks t 
    JOIN users u ON t.employee_email = u.email 
    GROUP BY u.Department
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});

app.get("/get-tasks-by-name", requireAuth, (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ error: "Employee name is required." });
  }
  const query = "SELECT * FROM tasks WHERE name = ?";
  db.query(query, [name], (err, results) => {
    if (err) {
      console.error("Error fetching tasks by name:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});