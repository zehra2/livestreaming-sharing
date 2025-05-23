'use strict';

const config = require('./config');

module.exports = class Room {
    constructor(room_id, worker, io) {
        this.id = room_id;
        this.worker = worker;
        this.router = null;
        this.audioLevelObserver = null;
        this.audioLevelObserverEnabled = config.audioLevelObserverEnabled;
        this.audioLastUpdateTime = 0;
        this.io = io;
        this._isLocked = false;
        this._isWaitingRoomEnabled = false;
        this._isBreakoutEnabled = false;
        this._roomPassword = null;
        this.peers = new Map();
        this.webRtcTransport = config.mediasoup.webRtcTransport;
        this.routerSettings = config.mediasoup.router;
        this.createTheRouter();
    }

    // ####################################################
    // ROOM INFO
    // ####################################################

    toJson() {
        return {
            id: this.id,
            config: {
                isLocked: this._isLocked,
                isWaitingRoomEnabled: this._isWaitingRoomEnabled,
                hostOnlyRecording: this._hostOnlyRecording,
            },
            peers: JSON.stringify([...this.peers]),
        };
    }

    // ####################################################
    // ROUTER
    // ####################################################

    createTheRouter() {
        const { mediaCodecs } = this.routerSettings;
        this.worker
            .createRouter({
                mediaCodecs,
            })
            .then((router) => {
                this.router = router;
                if (this.audioLevelObserverEnabled) {
                    this.startAudioLevelObservation();
                }
                this.router.observer.on('close', () => {
                    //
                });
            });
    }

    closeRouter() {
        this.router.close();
    }

    // ####################################################
    // PRODUCER AUDIO LEVEL OBSERVER
    // ####################################################

    async startAudioLevelObservation(router) {

        this.audioLevelObserver = await this.router.createAudioLevelObserver({
            maxEntries: 1,
            threshold: -70,
            interval: 100,
        });

        this.audioLevelObserver.on('volumes', (volumes) => {
            this.sendActiveSpeakerVolume(volumes);
        });
        this.audioLevelObserver.on('silence', () => {
        });
    }

    sendActiveSpeakerVolume(volumes) {
        try {
            if (!Array.isArray(volumes) || volumes.length === 0) {
                throw new Error('Invalid volumes array');
            }

            if (Date.now() > this.audioLastUpdateTime + 100) {
                this.audioLastUpdateTime = Date.now();

                const { producer, volume } = volumes[0];
                const audioVolume = Math.round(Math.pow(10, volume / 70) * 10); // Scale volume to 1-10

                if (audioVolume > 1) {
                    this.peers.forEach((peer) => {
                        const { id, peer_audio, peer_name } = peer;
                        peer.producers.forEach((peerProducer) => {
                            if (peerProducer.id === producer.id && peerProducer.kind === 'audio' && peer_audio) {
                                const data = {
                                    peer_id: id,
                                    peer_name: peer_name,
                                    audioVolume: audioVolume,
                                };
                                this.sendToAll('audioVolume', data);
                            }
                        });
                    });
                }
            }
        } catch (error) {
            //
        }
    }

    addProducerToAudioLevelObserver(producer) {
        if (this.audioLevelObserverEnabled) {
            this.audioLevelObserver.addProducer(producer);
        }
    }

    getRtpCapabilities() {
        return this.router.rtpCapabilities;
    }

    // ####################################################
    // PEERS
    // ####################################################

    addPeer(peer) {
        this.peers.set(peer.id, peer);
    }

    getPeer(socket_id) {
        //
        if (!this.peers.has(socket_id)) {
            return null;
        }

        const peer = this.peers.get(socket_id);

        return peer;
    }

    getPeers() {
        return this.peers;
    }

    getPeersCount() {
        return this.peers.size;
    }

    getProducerListForPeer() {
        const producerList = [];
        this.peers.forEach((peer) => {
            const { peer_name, peer_info } = peer;
            peer.producers.forEach((producer) => {
                producerList.push({
                    producer_id: producer.id,
                    peer_name: peer_name,
                    peer_info: peer_info,
                    type: producer.appData.mediaType,
                });
            });
        });
        return producerList;
    }

    async removePeer(socket_id) {
        const peer = this.getPeer(socket_id);

        if (!peer || typeof peer !== 'object') {
            return;
        }

        const { id, peer_name } = peer;

        peer.close();

        this.peers.delete(socket_id);

        if (this.getPeers().size === 0) {
            this.closeRouter();
        }

        const peerTransports = peer.getTransports();
        const peerProducers = peer.getProducers();
        const peerConsumers = peer.getConsumers();
    }

    // ####################################################
    // WEBRTC TRANSPORT
    // ####################################################

    async createWebRtcTransport(socket_id) {
        const { maxIncomingBitrate, initialAvailableOutgoingBitrate, listenInfos, listenIps } = this.webRtcTransport;

        const webRtcTransportOptions = {
            ...(this.webRtcServerActive ? { webRtcServer: this.webRtcServer } : listenInfos ? { listenInfos: listenInfos} : { listenIps: listenIps }),
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            iceConsentTimeout: 20,
            initialAvailableOutgoingBitrate,
        };

        const transport = await this.router.createWebRtcTransport(webRtcTransportOptions);

        if (!transport) {
            return this.callback('[Room|createWebRtcTransport] Failed to create WebRTC transport');
        }

        const { id, iceParameters, iceCandidates, dtlsParameters } = transport;

        if (maxIncomingBitrate) {
            try {
                await transport.setMaxIncomingBitrate(maxIncomingBitrate);
            } catch (error) {
                //
            }
        }

        const peer = this.getPeer(socket_id);

        if (!peer || typeof peer !== 'object') {
            return this.callback(`[Room|createWebRtcTransport] Peer object not found for socket ID: ${socket_id}`);
        }

        const { peer_name } = peer;

        transport.on('icestatechange', (iceState) => {
            if (iceState === 'disconnected' || iceState === 'closed') {
                transport.close();
            }
        });

        transport.on('sctpstatechange', (sctpState) => {
            //
        });

        transport.on('dtlsstatechange', (dtlsState) => {
            if (dtlsState === 'failed' || dtlsState === 'closed') {
                transport.close();
            }
        });

        transport.on('close', () => {
            //
        });

        peer.addTransport(transport);

        return {
            id: id,
            iceParameters: iceParameters,
            iceCandidates: iceCandidates,
            dtlsParameters: dtlsParameters,
        };
    }

    async connectPeerTransport(socket_id, transport_id, dtlsParameters) {
        try {
            if (!socket_id || !transport_id || !dtlsParameters) {
                return this.callback('[Room|connectPeerTransport] Invalid input parameters');
            }

            const peer = this.getPeer(socket_id);

            if (!peer || typeof peer !== 'object') {
                return this.callback(`[Room|connectPeerTransport] Peer object not found for socket ID: ${socket_id}`);
            }

            const connectTransport = await peer.connectTransport(transport_id, dtlsParameters);

            if (!connectTransport) {
                return this.callback(`[Room|connectPeerTransport] error: Transport with ID ${transport_id} not found`);
            }

            return '[Room|connectPeerTransport] done';
        } catch (error) {
            return this.callback(`[Room|connectPeerTransport] error: ${error.message}`);
        }
    }

    // ####################################################
    // PRODUCE
    // ####################################################

    async produce(socket_id, producerTransportId, rtpParameters, kind, type) {
        if (!socket_id || !producerTransportId || !rtpParameters || !kind || !type) {
            return this.callback('[Room|produce] Invalid input parameters');
        }

        const peer = this.getPeer(socket_id);

        if (!peer || typeof peer !== 'object') {
            return this.callback(`[Room|produce] Peer object not found for socket ID: ${socket_id}`);
        }

        const peerProducer = await peer.createProducer(producerTransportId, rtpParameters, kind, type);

        if (!peerProducer || !peerProducer.id) {
            return this.callback(`[Room|produce] Peer producer error: '${peerProducer}'`);
        }

        const { id } = peerProducer;

        const { peer_name, peer_info } = peer;

        this.broadCast(socket_id, 'newProducers', [
            {
                producer_id: id,
                producer_socket_id: socket_id,
                peer_name: peer_name,
                peer_info: peer_info,
                type: type,
            },
        ]);

        return id;
    }

    closeProducer(socket_id, producer_id) {
        if (!socket_id || !producer_id) return;

        const peer = this.getPeer(socket_id);

        if (!peer || typeof peer !== 'object') {
            return;
        }

        peer.closeProducer(producer_id);
    }

    // ####################################################
    // CONSUME
    // ####################################################

    async consume(socket_id, consumer_transport_id, producer_id, rtpCapabilities) {
        try {
            if (!socket_id || !consumer_transport_id || !producer_id || !rtpCapabilities) {
                return this.callback('[Room|consume] Invalid input parameters');
            }

            if (!this.router.canConsume({ producerId: producer_id, rtpCapabilities })) {
                return this.callback(`[Room|consume] Room router cannot consume producer_id: '${producer_id}'`);
            }

            const peer = this.getPeer(socket_id);

            if (!peer || typeof peer !== 'object') {
                return this.callback(`[Room|consume] Peer object not found for socket ID: ${socket_id}`);
            }

            const peerConsumer = await peer.createConsumer(consumer_transport_id, producer_id, rtpCapabilities);

            if (!peerConsumer || !peerConsumer.consumer || !peerConsumer.params) {
                return this.callback(`[Room|consume] peerConsumer error: '${peerConsumer}'`);
            }

            const { consumer, params } = peerConsumer;

            const { id, kind } = consumer;

            consumer.on('producerclose', () => {
                peer.removeConsumer(id);

                // Notify the client that consumer is closed
                this.send(socket_id, 'consumerClosed', {
                    consumer_id: id,
                    consumer_kind: kind,
                });
            });

            return params;
        } catch (error) {
            return this.callback(`[Room|consume] ${error.message}`);
        }
    }

    closeProducer(socket_id, producer_id) {
        this.peers.get(socket_id).closeProducer(producer_id);
    }

    // ####################################################
    // ROOM STATUS
    // ####################################################

    getPassword() {
        return this._roomPassword;
    }
    isLocked() {
        return this._isLocked;
    }
    isWaitingRoomEnabled() {
        return this._isWaitingRoomEnabled;
    }
    setLocked(status, password) {
        this._isLocked = status;
        this._roomPassword = password;
    }
    setWaitingRoomEnabled(status) {
        this._isWaitingRoomEnabled = status;
    }
    setBreakout(status) {
        this._isBreakoutEnabled = status;
    }
    isBreakoutEnabled() {
        return this._isBreakoutEnabled;
    }

    // ####################################################
    // ERRORS
    // ####################################################

    callback(message) {
        return { error: message };
    }

    // ####################################################
    // SENDER
    // ####################################################

    broadCast(socket_id, action, data) {
        for (let otherID of Array.from(this.peers.keys()).filter((id) => id !== socket_id)) {
            this.send(otherID, action, data);
        }
    }

    sendTo(socket_id, action, data) {
        for (let peer_id of Array.from(this.peers.keys()).filter((id) => id === socket_id)) {
            this.send(peer_id, action, data);
        }
    }

    sendToAll(action, data) {
        for (let peer_id of Array.from(this.peers.keys())) {
            this.send(peer_id, action, data);
        }
    }

    send(socket_id, action, data) {
        this.io.to(socket_id).emit(action, data);
    }
};
