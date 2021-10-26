const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const httpServer = require("http").createServer(app);
const io = require("socket.io")(httpServer);
//const { createClient } = require('redis');
//const redisAdapter = require('@socket.io/redis-adapter');

const { ExpressPeerServer } = require("peer");
const peerServer = ExpressPeerServer(httpServer, {
  debug: true,
});

app.use("/peerjs", peerServer);

// const pubClient = createClient({
//     host: process.env.REDIS_ENDPOINT || 'localhost',
//     port: process.env.REDIS_PORT || 6379
// });


// if (process.env.REDIS_PASSWORD) {
//     pubClient.auth(process.env.REDIS_PASSWORD);
// }


// const subClient = pubClient.duplicate();
// io.adapter(redisAdapter(pubClient, subClient));

// //beware
// app.use('/public', express.static('../public'));

// Define paths for Express Config
const publicDirectoryPath = path.join(__dirname,'../public')
 
//Setup static directory to serve
app.use('/public', express.static(publicDirectoryPath))


app.get('/:id', (req, res) => {
    const fileDirectory = path.join(__dirname,'../');
    res.sendFile('index.html', { root: fileDirectory }, (err) => {
        if (err) {
            console.error(err);
            throw (err);
        }
        res.end();
    });
});

app.get('/', (req, res) => {
    //console.log(',,',req)
    let host = process.env.HOST_NAME || 'abc';
    res.redirect(307, '/' + uuidv4() + '?host=' + host);
});


io.on("connection", socket => {
    console.log('socket connected..', socket.id);

    console.log(process.env.HOST_NAME);

    socket.on('content_change', (data) => {
        const room = data.documentId;
        socket.to(room).emit('content_change', data.changes);
    });

    socket.on('register', function (data) {
        const room = data.documentId;
        socket.nickname = data.handle;
        socket.join(room);
        let members = [];
        for (const clientId of io.sockets.adapter.rooms.get(room)) {
            members.push({
                id: clientId,
                name: io.sockets.sockets.get(clientId).nickname
            });
        }
        console.log(members);
        io.in(room).emit('members', members);
        socket.to(room).emit('register', { id: socket.id, name: data.handle });
    });

     socket.on("join-room", (roomId, userId, userName) => {
        socket.join(roomId);
        //socket.to(roomId).broadcast.emit("user-connected", userId);
        socket.broadcast.to(roomId).emit("user-connected", userId);
        // socket.on("message", (message) => {
        // io.to(roomId).emit("createMessage", message, userName);
        // console.log(userName)
        // });
    });

    socket.on("message", (data) => {
        console.log(data);
        io.to(data.id).emit("createMessage", data.message, data.name);
        //console.log(userName)
    });

    socket.on('disconnect', function (data) {
        console.log("Disconnected");
        socket.broadcast.emit('user_left', { id: socket.id });
    });
});


httpServer.listen(process.env.PORT || 3000  , () =>{
    console.log('Server is up on port '+ 3000);
});