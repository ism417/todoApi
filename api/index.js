const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const serverless = require('serverless-http');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(passport.initialize());

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
    callbackURL: 'https://todo-api-henna.vercel.app/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await Users.findOne({ googleId: profile.id });
        
        if (!user) {
            user = await Users.create({
                googleId: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                picture: profile.photos?.[0]?.value
            });
        }
        
        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));

// Middleware to verify JWT
const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await Users.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// Auth routes
app.get('/api/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/api/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    (req, res) => {
        const token = jwt.sign(
            { userId: req.user._id },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );
        
        const frontendURL = process.env.CLIENT_URL || 'http://localhost:5173';
        res.redirect(`${frontendURL}?token=${token}`);
    }
);

app.get('/api/auth/user', verifyToken, (req, res) => {
    res.json(req.user);
});

// Protected Todo routes
app.get('/api/todos', verifyToken, async (req,res) => {
    const todos = await Todo.find({ userId: req.user._id });
    res.json(todos);
});

app.post('/api/todos', verifyToken, async (req, res) => {
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

app.put('/api/todos/:id', verifyToken, async (req,res) => {
    const update = await Todo.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        req.body,
        { new: true }
    );
    res.json(update);
});

app.delete('/api/todos/:id', verifyToken, async (req,res) => {
    await Todo.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({message: 'Todo delete'});
});

module.exports = app;
module.exports.handler = serverless(app);