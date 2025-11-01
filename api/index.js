const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const serverless = require('serverless-http');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || 'https://todo-api-henna.vercel.app',
    credentials: true
}));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || '9848f73fd23c98fba6e4b4d3e32fa968cdffb8e2366f34679427223a5b1e3afc',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('connected to mongoDB'))
    .catch(err => console.error('connected to mongoDB:',err));

const todoSchema = new mongoose.Schema({
    title: {type: String, required: true},
    completed: {type: Boolean, default: false},
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'Users'}
});

const usersSchema = new mongoose.Schema({
    email: {type: String, required: true, unique: true},
    name: {type: String, required: true},
    googleId: {type: String, unique: true, sparse: true},
    picture: {type: String}
});

const Todo = mongoose.model('Todo', todoSchema);
const Users = mongoose.model('Users', usersSchema);

// Configure Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await Users.findOne({ googleId: profile.id });
        
        if (!user) {
            user = await Users.create({
                googleId: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                picture: profile.photos[0]?.value
            });
        }
        
        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await Users.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};

// Auth routes
app.get('/api/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        res.redirect(process.env.CLIENT_URL || 'https://todo-api-henna.vercel.app');
    }
);

app.get('/api/auth/user', isAuthenticated, (req, res) => {
    res.json(req.user);
});

app.get('/api/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ message: 'Logout failed' });
        res.json({ message: 'Logged out successfully' });
    });
});

// Protected Todo routes
app.get('/api/todos', isAuthenticated, async (req,res) => {
    const todos = await Todo.find({ userId: req.user._id });
    res.json(todos);
});

app.post('/api/todos', isAuthenticated, async (req, res) => {
    const {title} = req.body;
    if (!title){
        return res.status(400).json({message: 'Title is required'});
    }
    const existingTodo = await Todo.findOne({title, userId: req.user._id});
    if (existingTodo)
        return res.status(409).json({message: 'A todo with title already exists'});

    const newTodo = new Todo({
        ...req.body,
        userId: req.user._id
    });
    await newTodo.save();

    res.status(201).json(newTodo);
});

app.put('/api/todos/:id', isAuthenticated, async (req,res) => {
    const update = await Todo.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        req.body,
        { new: true }
    );
    res.json(update);
});

app.delete('/api/todos/:id', isAuthenticated, async (req,res) => {
    await Todo.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({message: 'Todo delete'});
});

module.exports = app;
module.exports.handler = serverless(app);