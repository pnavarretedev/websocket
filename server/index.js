import express from 'express';
import logger from 'morgan';
import dotenv from 'dotenv';
import {createClient } from '@libsql/client';


import { Server } from 'socket.io';
import { createServer } from 'node:http';
import { dot } from 'node:test/reporters';
import { AsyncResource } from 'node:async_hooks';

dotenv.config();

const port = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 10000, // Tiempo máximo de reconexión en milisegundos
    minValidTime: 5000, // Tiempo mínimo para considerar una conexión válida
  },
});

const db = createClient({
  url: process.env.DB_URL,
  authToken: process.env.DB_TOKEN,
});

await db.execute(
    'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT)'
);

io.on('connection', async (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  socket.on('chat message', async (msg) => {
    console.log('Mensaje recibido:', msg);
    let result;
    try {
      result = await db.execute('INSERT INTO messages (content) VALUES (?)', [msg]);
      console.log('Mensaje guardado en la base de datos');
    } catch (error) {
      console.error('Error al guardar el mensaje:', error);
      return; // Si hay un error, no emitimos el mensaje
    }
    io.emit('chat message', msg, result.lastInsertRowid.toString()); // Emite el mensaje a todos los clientes conectados broadcast
  });

  console.log("auth data:", socket.handshake.auth);
  
  if (!socket.recovered) {
    try {
      const messages = await db.execute('SELECT * FROM messages WHERE id > (?)', [socket.handshake.auth.serverOffset] || 0);
      messages.rows.forEach(row => {
        socket.emit('chat message', row.content, row.id.toString());
      });
      
    } catch (error) {
      console.error('Error al recuperar mensajes anteriores:', error);
    }
  }



});

app.use(logger('dev'));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html');
});

httpServer.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
