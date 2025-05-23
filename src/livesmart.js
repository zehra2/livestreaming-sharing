'use strict';

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const https = require('httpolyglot');
const mediasoup = require('mediasoup');
const config = require('./config');
const path = require('path');
const fs = require('fs');
const Room = require('./Room');
const Peer = require('./Peer');
const url = require('url');
const yamlJS = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = yamlJS.load(path.join(__dirname + '/api/swagger.yaml'));
const fetch = require('node-fetch');
const callTools = require('./callTools')

const app = express();

const options = {
    key: fs.readFileSync(config.sslKey, 'utf-8'),
    cert: fs.readFileSync(config.sslCrt, 'utf-8'),
};

const httpsServer = https.createServer(options, app);
const io = require('socket.io')(httpsServer, {
    cors: {
        origin: config.cors,
        methods: ["GET", "POST"]
    }
});

const hostCfg = {
    protected: config.hostProtected,
    username: config.hostUsername,
    password: config.hostPassword,
    authenticated: !config.hostProtected,
    shortUrl: config.shortUrl
};

const apiBasePath = '/api';

// all mediasoup workers
let workers = [];
let nextMediasoupWorkerIdx = 0;

// all Room lists
let roomList = new Map();

let chatGPT;
if (config.chatGPT.enabled) {
    if (config.chatGPT.apiKey) {
        const { OpenAI } = require('openai');
        const configuration = {
            basePath: config.chatGPT.basePath,
            apiKey: config.chatGPT.apiKey,
        };
        chatGPT = new OpenAI(configuration);
    }
}

app.use(cors());
app.use(compression());
app.use(express.static(path.join(__dirname, '../', config.publicFolder)));

// Remove trailing slashes in url handle bad requests
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).send({ status: 404, message: err.message }); // Bad request
    }
    if (req.path.substr(-1) === '/' && req.path.length > 1) {
        let query = req.url.slice(req.path.length);
        res.redirect(301, req.path.slice(0, -1) + query);
    } else {
        next();
    }
});

// all start from here
app.get(['/'], (req, res) => {
    res.sendFile(path.join(__dirname, '../', config.publicFolder + '/pages/index.html'));
});

// if not allow video/audio
app.get(['/permission'], (req, res) => {
    res.sendFile(path.join(__dirname, '../', config.publicFolder + '/pages/error.html'));
});

app.post(['/upload'], (req, res) => {
    const query = new URLSearchParams(req.url);
    const fileName = config.publicFolder + '/server/recordings/' + query.get('/upload?fileName');

    req.on('data', chunk => {
        fs.appendFileSync(fileName, chunk); // append to a file on the disk
    })
    return res.end();
});

// Api parse body data as json
app.use(express.json());

// request meeting list
app.get([apiBasePath  + '/meetings'], (req, res) => {
    // check if user was authorized for the api call
    let host = req.headers.host;
    let authorization = req.headers.authorization;
    let api = new ServerApi(host, authorization);
    if (!api.isAuthorized()) {
        return res.status(403).json({ error: 'Unauthorized!' });
    }

    let roomListRet = [];
    roomList.forEach((room) => {
        let roomObj = {};
        let peers = [];
        roomObj.id = room.id;
        roomObj.peers = {};
        room.peers.forEach((peer) => {
            let pr = {};
            pr.name = peer.peer_info.peer_name;
            pr.admin = peer.peer_info.peer_admin;
            pr.video = peer.peer_info.peer_video;
            pr.audio = peer.peer_info.peer_audio;
            pr.screen = peer.peer_info.peer_screen;
            pr.hand = peer.peer_info.peer_hand;
            pr.os = (peer.peer_info.os_name) ? peer.peer_info.os_name + ' ' + peer.peer_info.os_version : '';
            pr.browser = (peer.peer_info.browser_name) ? peer.peer_info.browser_name + ' ' + peer.peer_info.browser_version : '';
            peers.push(pr);
        });
        roomObj.peers = peers;
        roomListRet.push(roomObj);
    });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ meetings: roomListRet }));
});


// api docs
app.use(apiBasePath + '/doc', swaggerUi.serve);
app.get([apiBasePath + '/doc'], swaggerUi.setup(swaggerDocument));

// request meeting room endpoint
app.post([apiBasePath + '/meeting'], (req, res) => {
    // check if user was authorized for the api call
    let host = req.headers.host;
    let authorization = req.headers.authorization;
    let api = new ServerApi(host, authorization);
    if (!api.isAuthorized()) {
        return res.status(403).json({ error: 'Unauthorized!' });
    }
    // setup meeting URL
    let meetingURL = api.getMeetingURL(req.body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ meetingAgent: meetingURL[1], meetingAttendee: meetingURL[0] }));
});

// request join room endpoint
app.post([apiBasePath  + '/join'], (req, res) => {
    // check if user was authorized for the api call
    let host = req.headers.host;
    let authorization = req.headers.authorization;
    let api = new ServerApi(host, authorization);
    if (!api.isAuthorized()) {
        return res.status(403).json({ error: 'Unauthorized!' });
    }
    // setup Join URL
    let joinURL = api.getJoinURL(req.body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ join: joinURL }));
});

// save a chat endpoint

app.post([apiBasePath + '/addchat'], (req, resp) => {

    const postData = JSON.stringify({
        type: 'addchat',
        roomId: req.body.roomId,
        message: req.body.message,
        agent: req.body.agentName,
        agentId: req.body.agentId,
        from: req.body.from,
        to: req.body.to,
        system: '',
        avatar: '',
        datetime: req.body.datetime
    });
    const response = sendApiCall(postData, req, resp);
});

// join to room

app.get('/:anyname', (req, res) => {
    if (hostCfg.authenticated) {
        // process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
        let query = url.parse(req.url, true).query;
        if (Object.keys(req.query).length > 0) {
            if (!query.p) {
                res.redirect(url.parse(req.url).pathname);
            } else {
                res.sendFile(path.join(__dirname, '../', config.publicFolder + '/pages/r.html'));
            }
        } else {
            if (hostCfg.shortUrl) {
                const postData = JSON.stringify({
                    type: 'getroombyshort',
                    shortUrl: url.parse(req.url).pathname
                });
                sendApiCall(postData, req, res, 'redirect');
            } else {
                res.sendFile(path.join(__dirname, '../', config.publicFolder + '/pages/r.html'));
            }
        }
    } else {
        res.sendFile(path.join(__dirname, '../', config.publicFolder + '/pages/index.html'));
    }
});

// not match any of page before, so 404 not found
app.get('/:anyname', function (req, res) {
    res.sendFile(path.join(__dirname, '../', config.publicFolder + '/pages/404.html'));
});

// ####################################################
// START SERVER
// ####################################################

httpsServer.listen(config.listenPort, () => {
//started listenting on port 9002
});

// ####################################################
// WORKERS
// ####################################################

(async () => {
    await createWorkers();
})();

async function createWorkers() {
    const { numWorkers } = config.mediasoup;

    for (let i = 0; i < numWorkers; i++) {
        let worker = await mediasoup.createWorker({
            logLevel: config.mediasoup.worker.logLevel,
            logTags: config.mediasoup.worker.logTags,
            rtcMinPort: config.mediasoup.worker.rtcMinPort,
            rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
        });
        worker.on('died', () => {
            setTimeout(() => process.exit(1), 2000);
        });
        workers.push(worker);
    }
}

async function getMediasoupWorker() {
    const worker = workers[nextMediasoupWorkerIdx];
    if (++nextMediasoupWorkerIdx === workers.length) nextMediasoupWorkerIdx = 0;
    return worker;
}

async function sendApiCall(postData, req, resp, type) {
    // process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const SERVER_URL = 'https://' + req.headers.host + '/server/script.php';
    async function getResponse() {
        return await fetch(SERVER_URL, {
            method: 'POST',
            body: postData,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    getResponse()
    .then(res => {
        res.text().then(function (text) {
            if (type && type == 'redirect') {
                if (text) {
                    if (text == '404') {
                        resp.sendFile(path.join(__dirname, '../', config.publicFolder + '/pages/r.html'));
                    } else {
                        resp.redirect(301, text);
                    }
                } else {
                    resp.redirect('/');
                }
            } else {
                resp.end(JSON.stringify({ code: text }));
            }
        })
    })
    .catch(err => console.log(err));
}

// ####################################################
// SOCKET IO
// ####################################################

io.on('connection', (socket) => {
    socket.on('createRoom', async ({ room_id }, callback) => {
        socket.room_id = room_id;

        if (roomList.has(socket.room_id)) {
            callback({ error: 'already exists' });
        } else {
            let worker = await getMediasoupWorker();
            roomList.set(socket.room_id, new Room(socket.room_id, worker, io));
            callback({ room_id: socket.room_id });
        }
    });

    socket.on('getPeerCounts', async ({}, callback) => {
        if (!roomList.has(socket.room_id)) return;

        let peerCounts = roomList.get(socket.room_id).getPeersCount();
        callback({ peerCounts: peerCounts });
    });

    socket.on('room', (data) => {
        if (!roomList.has(socket.room_id)) return;
        switch (data.action) {
            case 'lock':
                roomList.get(socket.room_id).setLocked(true, data.password);
                roomList.get(socket.room_id).broadCast(socket.id, 'room', data.action);
                break;
            case 'checkPassword':
                let roomData = {
                    room: null,
                    password: 'KO',
                };
                if (data.password == roomList.get(socket.room_id).getPassword()) {
                    roomData.room = roomList.get(socket.room_id).toJson();
                    roomData.password = 'OK';
                    roomList.get(socket.room_id).sendTo(socket.id, 'roomPassword', roomData);
                } else {
                    roomList.get(socket.room_id).sendTo(socket.id, 'roomPassword', roomData);
                }
                break;
            case 'unlock':
                roomList.get(socket.room_id).setLocked(false);
                roomList.get(socket.room_id).broadCast(socket.id, 'room', data.action);
                break;
            case 'admitOn':
                roomList.get(socket.room_id).setWaitingRoomEnabled(true);
                roomList.get(socket.room_id).broadCast(socket.id, 'room', data.action);
                break;
            case 'admitOff':
                roomList.get(socket.room_id).setWaitingRoomEnabled(false);
                roomList.get(socket.room_id).broadCast(socket.id, 'room', data.action);
                break;
            case 'breakoutOn':
                roomList.get(socket.room_id).setBreakout(true);
                roomList.get(socket.room_id).broadCast(socket.id, 'room', data.action);
                break;
            case 'breakoutOff':
                roomList.get(socket.room_id).setBreakout(false);
                roomList.get(socket.room_id).broadCast(socket.id, 'room', data.action);
                if (data.rooms) {
                    const rooms = JSON.parse(data.rooms);
                    rooms.forEach((room) => {
                        if (room && roomList.has(room[0])) {
                            roomList.get(room[0]).broadCast(socket.id, 'room', data.action);
                        };
                    });
                }
                break;
        }
    });

    socket.on('roomAdmit', (data) => {
        if (!roomList.has(socket.room_id)) return;

        data.room = roomList.get(socket.room_id).toJson();

        if (data.peers_id && data.broadcast) {
            for (let peer_id in data.peers_id) {
                roomList.get(socket.room_id).sendTo(data.peers_id[peer_id], 'roomAdmit', data);
            }
        } else {
            roomList.get(socket.room_id).sendTo(data.peer_id, 'roomAdmit', data);
        }
    });

    socket.on('peer', (data) => {
        if (!roomList.has(socket.room_id)) return;

        data.broadcast
            ? roomList.get(socket.room_id).broadCast(data.peer_id, 'peer', data)
            : roomList.get(socket.room_id).sendTo(data.peer_id, 'peer', data);
    });

    socket.on('setPeer', (data) => {
        // peer_info hand raise Or lower
        // roomList.get(socket.room_id).getPeers().get(socket.id).setPeer(data);
        // roomList.get(socket.room_id).broadCast(socket.id, 'setPeer', data);

        roomList.get(socket.room_id).getPeer(socket.id).setPeer(data);

        if (data.broadcast) {
            roomList.get(socket.room_id).broadCast(socket.id, 'setPeer', data);
        }
    });

    socket.on('fileInfo', (data) => {
        if (!roomList.has(socket.room_id)) return;
        if (data.broadcast) {
            roomList.get(socket.room_id).broadCast(socket.id, 'fileInfo', data);
        } else {
            roomList.get(socket.room_id).sendTo(data.peer_id, 'fileInfo', data);
        }
    });

    socket.on('file', (data) => {
        if (!roomList.has(socket.room_id)) return;

        if (data.broadcast) {
            roomList.get(socket.room_id).broadCast(socket.id, 'file', data);
        } else {
            roomList.get(socket.room_id).sendTo(data.peer_id, 'file', data);
        }
    });

    socket.on('fileAbort', (data) => {
        if (!roomList.has(socket.room_id)) return;

        roomList.get(socket.room_id).broadCast(socket.id, 'fileAbort', data);
    });

    socket.on('startRecording', (data) => {
        roomList.get(socket.room_id).broadCast(socket.id, 'startRecording', data);
    });

    socket.on('shareMedia', (data) => {
        if (!roomList.has(socket.room_id)) return;

        if (data.peer_id == 'all') {
            roomList.get(socket.room_id).broadCast(socket.id, 'shareMedia', data);
        } else {
            roomList.get(socket.room_id).sendTo(data.peer_id, 'shareMedia', data);
        }
    });

    socket.on('whiteboardData', (data) => {
        if (!roomList.has(socket.room_id)) return;

        // let objLength = bytesToSize(Object.keys(data).length);
        roomList.get(socket.room_id).broadCast(socket.id, 'whiteboardData', data);
    });

    socket.on('whiteboard', (data) => {
        if (!roomList.has(socket.room_id)) return;
        roomList.get(socket.room_id).broadCast(socket.id, 'whiteboard', data);
    });

    socket.on('removeVideo', (data) => {
        if (!roomList.has(socket.room_id)) return;
        roomList.get(socket.room_id).broadCast(socket.id, 'removeVideo', data);
    });

    socket.on('checkPresence', (data, cb) => {
        if (data.room_id) {
            var ret = [];
            let rooms = data.room_id.split(',');
            rooms.forEach((room) => {
                let rom = room.split('|');
                if (room && roomList.has(rom[0])) {
                    ret.push(rom[0]);
                };
            });
            return cb(ret)
        } else if (roomList.size > 0) {
            roomList.forEach((room) => {
                return cb(room.id);
            });
        }

        return cb(false);
    });

    socket.on('requestSession', (data) => {
        if (roomList.get(data.room_id)) {
            roomList.get(data.room_id).broadCast(socket.id, 'requestSession', data);
        }
    });

    socket.on('join', async (data, cb) => {
        if (!roomList.has(socket.room_id)) {
            return cb({
                error: 'Room does not exist',
            });
        }

        const { peer_name, peer_id, peer_uuid, os_name, os_version, browser_name, browser_version } =
            data.peer_info;

        roomList.get(socket.room_id).addPeer(new Peer(socket.id, data));

        if (roomList.get(socket.room_id).isLocked() && !data.peer_info.peer_admin) {
            return cb('isLocked');
        }

        if (roomList.get(socket.room_id).isWaitingRoomEnabled() && !data.peer_info.peer_admin) {
            roomList.get(socket.room_id).broadCast(socket.id, 'roomAdmit', {
                peer_id: data.peer_info.peer_id,
                peer_name: data.peer_info.peer_name,
                waiting_status: 'waiting',
            });
            return cb('isAdmit');
        }
        if (roomList.get(socket.room_id).isBreakoutEnabled() && !data.peer_info.peer_admin) {
            roomList.get(socket.room_id).broadCast(socket.id, 'roomBreakout', {
                peer_id: data.peer_info.peer_id,
                peer_name: data.peer_info.peer_name
            });
            return cb('isBreakout');
        }
        cb(roomList.get(socket.room_id).toJson());
    });

    socket.on('getRouterRtpCapabilities', (_, callback) => {
        if (!roomList.has(socket.room_id)) {
            return callback({ error: 'Room not found' });
        }

        try {
            const getRouterRtpCapabilities = roomList.get(socket.room_id).getRtpCapabilities();
            callback(getRouterRtpCapabilities);
        } catch (err) {
            callback({
                error: err.message,
            });
        }
    });

    socket.on('getProducers', () => {
        if (!roomList.has(socket.room_id)) return;

        // send all the current producer to newly joined member
        let producerList = roomList.get(socket.room_id).getProducerListForPeer();

        socket.emit('newProducers', producerList);
    });

    socket.on('createWebRtcTransport', async (_, callback) => {
        if (!roomList.has(socket.room_id)) {
            return callback({ error: 'Room not found' });
        }

        try {
            const createWebRtcTransport = await roomList.get(socket.room_id).createWebRtcTransport(socket.id);
            callback(createWebRtcTransport);
        } catch (err) {
            callback({
                error: err.message,
            });
        }
    });

    socket.on('connectTransport', async ({ transport_id, dtlsParameters }, callback) => {
        if (!roomList.has(socket.room_id)) {
            return callback({ error: 'Room not found' });
        }

        try {
            const connectTransport = await  roomList.get(socket.room_id).connectPeerTransport(socket.id, transport_id, dtlsParameters);

            callback(connectTransport);
        } catch (err) {
            callback({
                error: err.message,
            });
        }
    });

    socket.on('restartIce', async ({ transport_id }, callback) => {
        if (!roomList.has(socket.room_id)) {
            return callback({ error: 'Room not found' });
        }

        try {
            const transport = roomList.get(socket.room_id).getPeer(socket.id).getTransport(transport_id);

            if (!transport) throw new Error(`Restart ICE, transport with id "${transport_id}" not found`);

            const iceParameters = await transport.restartIce();

            callback(iceParameters);
        } catch (err) {
            callback({
                error: err.message,
            });
        }
    });

    socket.on('produce', async ({ producerTransportId, kind, appData, rtpParameters }, callback, errback) => {
        if (!roomList.has(socket.room_id)) {
            return callback({ error: 'Room not found' });
        }

        const room = roomList.get(socket.room_id);
        const peer_name = getAttendeeName(room, false);
        const data = {
            room_id: room.id,
            peer_name: peer_name,
            peer_id: socket.id,
            kind: kind,
            type: appData.mediaType,
            status: true,
        };

        const peer = room.getPeer(socket.id);

        peer.setPeer(data);

        try {
            const producer_id = await room.produce(
                socket.id,
                producerTransportId,
                rtpParameters,
                kind,
                appData.mediaType,
            );

            // add & monitor producer audio level
            if (kind === 'audio') {
                room.addProducerToAudioLevelObserver({ producerId: producer_id });
            }

            callback({
                producer_id,
            });
        } catch (err) {
            callback({
                error: err.message,
            });
        }
    });

    socket.on('consume', async ({ consumerTransportId, producerId, rtpCapabilities }, callback) => {
        if (!roomList.has(socket.room_id)) {
            return callback({ error: 'Room not found' });
        }

        const room = roomList.get(socket.room_id);

        const peer_name = getAttendeeName(room, false);

        try {
            const params = await room.consume(socket.id, consumerTransportId, producerId, rtpCapabilities);
            callback(params);
        } catch (err) {
            callback({
                error: err.message,
            });
        }
    });

    socket.on('producerClosed', (data) => {
        if (!roomList.has(socket.room_id)) return;

        roomList.get(socket.room_id).getPeer(socket.id).setPeer(data); // peer_info.audio OR video OFF

        roomList.get(socket.room_id).closeProducer(socket.id, data.producer_id);
        if (roomList.get(socket.room_id).getPeers().size === 0) {
            roomList.delete(socket.room_id);
        }
    });

    socket.on('pauseProducer', async ({ producer_id }, callback) => {
        if (!roomList.has(socket.room_id)) return;

        if (!roomList.get(socket.room_id).getPeer(socket.id)) {
            return callback({
                error: `peer with ID: ${socket.id} for producer with id "${producer_id}" not found`,
            });
        }

        const producer = roomList.get(socket.room_id).getPeer(socket.id).getProducer(producer_id);

        if (!producer) {
            return callback({ error: `producer with id "${producer_id}" not found` });
        }

        try {
            await producer.pause();
        } catch (error) {
            return callback({ error: error.message });
        }

        callback('successfully');
    });

    socket.on('resumeProducer', async ({ producer_id }, callback) => {
        if (!roomList.has(socket.room_id)) return;

        if (!roomList.get(socket.room_id).getPeer(socket.id)) {
            return callback({
                error: `peer with ID: "${socket.id}" for producer with id "${producer_id}" not found`,
            });
        }

        const producer = roomList.get(socket.room_id).getPeer(socket.id).getProducer(producer_id);

        if (!producer) {
            return callback({ error: `producer with id "${producer_id}" not found` });
        }

        try {
            await producer.resume();
        } catch (error) {
            return callback({ error: error.message });
        }

        callback('successfully');
    });

    socket.on('resume', async (_, callback) => {
        await consumer.resume();
        callback();
    });

    socket.on('getRoomInfo', (_, cb) => {
        if (!roomList.has(socket.room_id)) return;
        cb(roomList.get(socket.room_id).toJson());
    });

    socket.on('getAttendeesCount', () => {
        if (!roomList.has(socket.room_id)) return;

        let data = {
            room_id: socket.room_id,
            peer_counts: roomList.get(socket.room_id).getPeers().size,
        };
        roomList.get(socket.room_id).broadCast(socket.id, 'getAttendeesCount', data);
    });

    socket.on('message', (data) => {
        if (!roomList.has(socket.room_id)) return;

        if (data.to_peer_id == 'all') {
            roomList.get(socket.room_id).broadCast(socket.id, 'message', data);
        } else {
            roomList.get(socket.room_id).sendTo(data.to_peer_id, 'message', data);
        }
    });

    socket.on('transcript', (data) => {
        if (data.to_peer_id == 'all') {
            roomList.get(socket.room_id).broadCast(socket.id, 'transcript', data);
        } else {
            roomList.get(socket.room_id).sendTo(data.to_peer_id, 'transcript', data);
        }
    });

    socket.on('disconnect', () => {
        if (!roomList.has(socket.room_id)) return;

        roomList.get(socket.room_id).removePeer(socket.id);

        if (roomList.get(socket.room_id).getPeers().size === 0) {
            if (roomList.get(socket.room_id).isLocked()) {
                roomList.get(socket.room_id).setLocked(false);
            }
            if (roomList.get(socket.room_id).isWaitingRoomEnabled()) {
                roomList.get(socket.room_id).setWaitingRoomEnabled(false);
            }
        }

        roomList.get(socket.room_id).broadCast(socket.id, 'removeMe', removeMeData());
        if (roomList.get(socket.room_id).getPeers().size === 0) {
            roomList.delete(socket.room_id);
        }
    });

    socket.on('exitRoom', async (_, callback) => {
        if (!roomList.has(socket.room_id)) {
            return callback({
                error: 'Not currently in a room',
            });
        }

        // close transports
        await roomList.get(socket.room_id).removePeer(socket.id);

        roomList.get(socket.room_id).broadCast(socket.id, 'removeMe', removeMeData());

        if (roomList.get(socket.room_id).getPeers().size === 0) {
            roomList.delete(socket.room_id);
        }

        socket.room_id = null;

        callback('Successfully exited room');
    });

    socket.on('exitRoomAll', async (_, callback) => {
        if (!roomList.has(socket.room_id)) {
            return callback({
                error: 'Not currently in a room',
            });
        }
        let data = {
            peer_id: socket.id,
            action: 'eject',
            broadcast: true
        };
        roomList.get(socket.room_id).broadCast(socket.id, 'peer', data);
        // close transports
        await roomList.get(socket.room_id).removePeer(socket.id);

        roomList.get(socket.room_id).broadCast(socket.id, 'removeMe', removeMeData());


        if (roomList.get(socket.room_id).getPeers().size === 0) {
            roomList.delete(socket.room_id);
        }

        socket.room_id = null;

        callback('Successfully exited room');
    });

    // common
    function getAttendeeName(room, json = true) {
        try {
            const peer_name = (room && room.getPeers()?.get(socket.id)?.peer_info?.peer_name) || 'undefined';

            if (json) {
                return {
                    peer_name: peer_name,
                };
            }
            return peer_name;
        } catch (err) {
            return json ? { peer_name: 'undefined' } : 'undefined';
        }
    }

    socket.on('startNewVideoAi', async ({ quality, avatar_name, voice_id, system }, cb) => {
        if (!roomList.has(socket.room_id)) return;
        if (!config.videoAi.enabled && !config.videoAi.apiKeyStream) return cb({'error': 'Video AI seems disabled, try later!'});
        try {
            if (system) {
                config.videoAi.systemLimit = system;
            }
            const response = await fetch(`${config.videoAi.serverUrl}/v1/streaming.new`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': config.videoAi.apiKeyStream,
                },
                body: JSON.stringify({
                    quality,
                    avatar_name,
                    voice: {
                        voice_id: voice_id,
                    },
                }),
            });
            if (response.status === 500) {
                cb({'error': 'server error'});
            } else {
                const data = await response.json();
                cb({'response': data});
            }
        } catch ({ name, message }) {
            cb({'error': message});
        }
    });

    socket.on('startSessionAi', async ({ session_id, sdp }, cb) => {
        if (!roomList.has(socket.room_id)) return;
        if (!config.videoAi.enabled && !config.videoAi.apiKeyStream) return cb({'error': 'Video AI seems disabled, try later!'});
        try {

            const response = await fetch(`${config.videoAi.serverUrl}/v1/streaming.start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': config.videoAi.apiKeyStream,
                },
                body: JSON.stringify({ session_id, sdp }),
            });
            if (response.status === 500) {
                cb({'error': 'server error'});
            } else {
                const data = await response.json();
                cb({'response': data.data});
            }
        } catch ({ name, message }) {
            cb({'error': message});
        }
    });

    socket.on('sendToVideoAi', async ({ session_id, text }, cb) => {
        if (!roomList.has(socket.room_id)) return;
        if (!config.videoAi.enabled && !config.videoAi.apiKeyStream) return cb({'error': 'Video AI seems disabled, try later!'});
        try {
            const response = await fetch(`${config.videoAi.serverUrl}/v1/streaming.task`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': config.videoAi.apiKeyStream,
                },
                body: JSON.stringify({ session_id, text }),
            });
            if (response.status === 500) {
                cb({'error': 'server error'});
            } else {
                const data = await response.json();
                cb({'response': data});
            }
        } catch ({ name, message }) {
            cb({'error': message});
        }
    });

    socket.on('talkToOpenAi', async ({ text, context, system, tools, is_context }, cb) => {

        if (!roomList.has(socket.room_id)) return;
        if (!config.videoAi.enabled && !config.videoAi.apiKeyStream) return cb({'error': 'Video AI seems disabled, try later!'});
        try {

            // const systemSetup = "you are a demo streaming avatar from HeyGen, an industry-leading AI generation product that specialize in AI avatars and videos.\nYou are here to showcase how a HeyGen streaming avatar looks and talks.\nPlease note you are not equipped with any specific expertise or industry knowledge yet, which is to be provided when deployed to a real customer's use case.\nAudience will try to have a conversation with you, please try answer the questions or respond their comments naturally, and concisely. - please try your best to response with short answers, limit to one sentence per response, and only answer the last question."
            const systemSetup = system || config.videoAi.systemLimit;
            if (is_context) {
                var arr = {
                    messages: [
                        ...context,
                        { role: 'system', content: systemSetup},
                        { role: 'user', content: text }
                    ],
                    max_tokens: config.chatGPT.max_tokens,
                    model: config.chatGPT.model || 'gpt-3.5-turbo',
                };
            } else {
                arr = {
                    messages: [
                        { role: 'system', content: systemSetup},
                        { role: 'user', content: text }
                    ],
                    max_tokens: config.chatGPT.max_tokens,
                    model: config.chatGPT.model || 'gpt-3.5-turbo',
                };
            }

            if (tools) {
                const arrToolParam = tools.split('|');
                const toolsNames = arrToolParam[0].split('~');
                const toolsDesciption = arrToolParam[1].split('~');
                const toolsParams = arrToolParam[2].split('~');
                arr.tools = [];
                for (let i = 0; i < toolsNames.length; i++) {
                    if (toolsNames[i]) {
                        const arrParams = toolsParams[i].split(',');
                        let par = {};
                        arrParams.forEach((param) => {
                            par[param] = {};
                            par[param].type = 'string';
                        });

                        let callToolsParam = {
                            type: 'function',
                            function: {
                                name: toolsNames[i],
                                description: toolsDesciption[i],
                                parameters: {
                                    type: 'object',
                                    properties: par,
                                    required : [arrParams[0]],
                                },
                            },
                        };
                        arr.tools.push(callToolsParam);
                    }
                }
            }

            const chatCompletion = await chatGPT.chat.completions.create(arr);
            let chatText = chatCompletion.choices[0].message.content;
            let background = '', url = '';
            if (chatCompletion.choices[0].message.tool_calls && chatCompletion.choices[0].message.tool_calls.length > 0) {
                var functionName = chatCompletion.choices[0].message.tool_calls[0].function.name;
                var params = chatCompletion.choices[0].message.tool_calls[0].function.arguments;
                let resp = await callTools.callFunction(functionName, params);
                chatText = resp.text;
                if (resp.background) {
                    background = resp.background;
                }
                if (resp.url) {
                    url = resp.url;
                }
            }
            if (is_context) {
                context.push({ role: 'system', content: chatText });
                context.push({ role: 'assistant', content: chatText });
            }
            cb({'response': chatText, 'background': background, 'url': url, 'context': context});
        } catch ({ name, message }) {
            cb({'error': message});
        }
    });

    socket.on('sendAssistant', async ({ text, assistantId }, cb) => {

        if (!roomList.has(socket.room_id)) return;
        if (!config.videoAi.enabled && !config.videoAi.apiKeyStream) return cb({'error': 'Video AI seems disabled, try later!'});
        try {

            const thread = await chatGPT.beta.threads.create({})

            const message = await chatGPT.beta.threads.messages.create(thread.id, {
                role: 'user',
                content: text
            });

            const run = await chatGPT.beta.threads.runs.create(thread.id, {
                assistant_id: assistantId,
            });

            const checkRun = async () => {
                return new Promise((resolve, reject) => {
                    const interval = setInterval(async () => {
                        const retrieveRun = await chatGPT.beta.threads.runs.retrieve(
                            thread.id,
                            run.id
                        );
                        if (retrieveRun.status === 'completed') {
                            clearInterval(interval)
                            resolve(retrieveRun)
                        }
                    }, 3000);
                })
            }
            await checkRun();
            const messages = await chatGPT.beta.threads.messages.list(thread.id)
            const answer = (messages.data ?? []).find((m) => m?.role === 'assistant')?.content?.[0];

            let chatText = answer.text.value;
            cb({'response': chatText});
        } catch ({ name, message }) {
            cb({'error': message});
        }
    });

    socket.on('handleIce', async ({ session_id, candidate }, cb) => {
        if (!roomList.has(socket.room_id)) return;
        if (!config.videoAi.enabled && !config.videoAi.apiKeyStream) return cb({'error': 'Video AI seems disabled, try later!'});
        try {

            const response = await fetch(`${config.videoAi.serverUrl}/v1/streaming.ice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': config.videoAi.apiKeyStream,
                },
                body: JSON.stringify({ session_id, candidate }),
            });
            if (response.status === 500) {
                cb({'error': 'server error'});
            } else {
                const data = await response.json();
                cb({'response': data});
            }
        } catch (error) {
            cb({'error': 'error'});
        }
    });

    socket.on('stopAiSession', async ({ session_id }, cb) => {
        if (!roomList.has(socket.room_id)) return;
        if (!config.videoAi.enabled && !config.videoAi.apiKeyStream) return cb({'error': 'Video AI seems disabled, try later!'});
        try {

            const response = await fetch(`${config.videoAi.serverUrl}/v1/streaming.stop`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': config.videoAi.apiKeyStream,
                },
                body: JSON.stringify({ session_id }),
            });
            if (response.status === 500) {
                cb({'error': 'server error'});
            } else {
                const data = await response.json();
                cb({'response': data});
            }
        } catch (error) {
            cb({'error': 'error'});
        }
    });

    socket.on('getAiAvatars', async ({}, cb) => {
        if (!config.videoAi.enabled && !config.videoAi.apiKey) return cb({'error': 'Video AI seems disabled, try later!'});
        try {
            const response = await fetch(`${config.videoAi.serverUrl}/v1/avatar.list`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': config.videoAi.apiKey,
                }
            });
            if (response.status === 500) {
                cb({'error': 'server error'});
            } else {
                const data = await response.json();
                cb({'response': data.data});
            }
        } catch (error) {
            cb({'error': 'error'});
        }
    });

    socket.on('getAiVoices', async ({}, cb) => {
        if (!config.videoAi.enabled && !config.videoAi.apiKey) return cb({'error': 'Video AI seems disabled, try later!'});
        try {
            const response = await fetch(`${config.videoAi.serverUrl}/v1/voice.list`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': config.videoAi.apiKey,
                }
            });
            if (response.status === 500) {
                cb({'error': 'server error'});
            } else {
                const data = await response.json();
                cb({'response': data.data});
            }
        } catch (error) {
            cb({'error': 'error'});
        }
    });

    socket.on('getAssistants', async ({}, cb) => {
        if (!config.videoAi.enabled && !config.videoAi.apiKeyStream) return cb({'error': 'Video AI seems disabled, try later!'});
        try {
            const response = await chatGPT.beta.assistants.list();
            if (response.data) {
                cb({'response': response.data});
            } else {
                cb({'error': 'server error'});
            }
        } catch (error) {
            cb({'error': error});
        }
    });

    socket.on('getChatGPT', async ({ time, room, name, prompt, context }, cb) => {
        if (!roomList.has(socket.room_id)) return;
        if (!config.chatGPT.enabled) return cb('ChatGPT seems disabled, try later!');
        try {
            // https://platform.openai.com/docs/api-reference/completions/create

            const message = prompt;
            const completion = await chatGPT.chat.completions.create({
                model: config.chatGPT.model || 'gpt-3.5-turbo',
                messages: [
                        ...context,
                        {role: 'user', content: `${message}`},
                    ],
                    max_tokens: config.chatGPT.max_tokens,
                    temperature: config.chatGPT.temperature,
              });
            context.push({ role: 'system', content: prompt });
            var response = completion.choices[0].message.content.trim();
            response = response.replace(/(```html|```css|```javascript|```php|```python)(.*?)/gs, '$2');
            response = response.replace(/```/g, "");
            context.push({ role: 'assistant', content: response });
            cb({'response': response, 'context': context});
        } catch (error) {
            if (error.response) {
                cb({'response': error.response.data.error.message, 'context': context});
            } else {
                cb({'response': error.message, 'context': context});
            }
        }
    });

    function removeMeData() {
        return {
            room_id: roomList.get(socket.room_id) && socket.room_id,
            peer_id: socket.id,
            peer_counts: roomList.get(socket.room_id) && roomList.get(socket.room_id).getPeers().size,
        };
    }

    function bytesToSize(bytes) {
        let sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes == 0) return '0 Byte';
        let i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    }
});


class ServerApi {
    constructor(host = null, authorization = null) {
        this._host = host;
        this._authorization = authorization;
        this._api_key_secret = config.apiKeySecret;
    }

    isAuthorized() {
        if (this._authorization != this._api_key_secret) return false;
        return true;
    }

    getMeetingURL(data) {
        const url = 'https://' +
        this._host +
        '/' +
        data.room;
        delete data.room;
        let roomObject = url;
        if (Object.keys(data).length > 0) {
            roomObject += '?p=' + Buffer.from(unescape(encodeURIComponent(JSON.stringify(data)))).toString('base64');
        }

        data.admin = 1;
        let roomObjectAgent = url + '?p=' + Buffer.from(unescape(encodeURIComponent(JSON.stringify(data)))).toString('base64');
        return new Array(roomObject, roomObjectAgent);
    }

    getJoinURL(data) {
        const url = 'https://' +
        this._host +
        '/' +
        data.room;
        delete data.room;
        let roomObject = '?p=' + Buffer.from(unescape(encodeURIComponent(JSON.stringify(data)))).toString('base64');
        return (
            url + roomObject
        );
    }
};
