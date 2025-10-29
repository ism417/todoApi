const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const serverless = require('serverless-http');

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('connected to mongoDB'))
    .catch(err => console.error('connected to mongoDB:',err));

const todoSchema = new mongoose.Schema({
    title: {type: String, required: true},
    completed: {type: Boolean, default: false}
});

const Todo = mongoose.model('Todo', todoSchema);

app.get('/api/todos', async (req,res) => {
    const todos = await Todo.find();
    res.json(todos);
});

app.post('/api/todos', async (req, res) => {
    const {title} = req.body;
    if (!title){
        return res.status(400).json({message: 'Title is required'});
    }
    const existingTodo = await Todo.findOne({title});
    if (existingTodo)
        return res.status(409).json({message: 'A todo with title already exists'});

    const newTodo = new Todo(req.body);
    await newTodo.save();

    res.status(201).json(newTodo);
});

app.put('/api/todos/:id', async (req,res) => {
    const update = await Todo.findByIdAndUpdate(req.params.id, req.body,{ new: true });
    res.json(update);
});

app.delete('/api/todos/:id', async (req,res) => {
    await Todo.findByIdAndDelete(req.params.id);
    res.json({message: 'Todo delete'});
});

// app.listen(3000, () => console.log('is up on http://localhost:3000'));
module.exports = app;
module.exports.handler = serverless(app);