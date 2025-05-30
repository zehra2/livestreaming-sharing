'use strict';

module.exports = class Peer {
    constructor(socket_id, data) {
        const { peer_info } = data;

        const { peer_name, peer_presenter, peer_audio, peer_video, peer_video_privacy, peer_recording, peer_hand } =
            peer_info;

        this.id = socket_id;
        this.peer_info = data.peer_info;
        this.peer_name = data.peer_info.peer_name;
        this.peer_presenter = data.peer_info.peer_presenter;
        this.peer_audio = data.peer_info.peer_audio;
        this.peer_video = data.peer_info.peer_video;
        this.peer_video_privacy = data.peer_video_privacy;
        this.peer_hand = data.peer_info.peer_hand;
        this.transports = new Map();
        this.consumers = new Map();
        this.producers = new Map();
    }

    // ####################################################
    // UPDATE PEER INFO
    // ####################################################

    setPeer(data) {
        switch (data.type) {
            case 'audio':
            case 'audioType':
                this.peer_info.peer_audio = data.status;
                this.peer_audio = data.status;
                break;
            case 'video':
            case 'videoType':
                this.peer_info.peer_video = data.status;
                this.peer_video = data.status;
                if (data.status == false) {
                    this.peer_info.peer_video_privacy = data.status;
                    this.peer_video_privacy = data.status;
                }
                break;
            case 'screen':
            case 'screenType':
                this.peer_info.peer_screen = data.status;
                break;
            case 'hand':
                this.peer_info.peer_hand = data.status;
                this.peer_hand = data.status;
                break;
            case 'privacy':
                this.peer_info.peer_video_privacy = data.status;
                this.peer_video_privacy = data.status;
                break;
            case 'presenter':
                this.peer_info.peer_presenter = data.status;
                this.peer_presenter = data.status;
                break;
            case 'waiting':
                this.peer_info.peer_waiting = data.status;
                this.peer_waiting = data.status;
                break;
            default:
                break;
        }
    }

    // ####################################################
    // TRANSPORT
    // ####################################################

    getTransports() {
        return JSON.parse(JSON.stringify([...this.transports]));
    }

    getTransport(transport_id) {
        return this.transports.get(transport_id);
    }

    delTransport(transport_id) {
        this.transports.delete(transport_id);
    }

    addTransport(transport) {
        this.transports.set(transport.id, transport);
    }

    addTransport(transport) {
        this.transports.set(transport.id, transport);
    }

    async connectTransport(transport_id, dtlsParameters) {
        if (!this.transports.has(transport_id)) {
            return false;
        }

        await this.transports.get(transport_id).connect({
            dtlsParameters: dtlsParameters,
        });

        return true;
    }

    close() {
        this.transports.forEach((transport, transport_id) => {
            transport.close();
            this.delTransport(transport_id);
        });
    }

    // ####################################################
    // PRODUCER
    // ####################################################

    getProducers() {
        return JSON.parse(JSON.stringify([...this.producers]));
    }

    getProducer(producer_id) {
        return this.producers.get(producer_id);
    }

    delProducer(producer_id) {
        this.producers.delete(producer_id);
    }

    async createProducer(producerTransportId, producer_rtpParameters, producer_kind, producer_type) {
        try {
            if (!producerTransportId) {
                return 'Invalid producer transport ID';
            }

            const producerTransport = this.transports.get(producerTransportId);

            if (!producerTransport) {
                return `Producer transport with ID ${producerTransportId} not found`;
            }

            const producer = await producerTransport.produce({
                kind: producer_kind,
                rtpParameters: producer_rtpParameters,
            });

            if (!producer) {
                return `Producer type: ${producer_type} kind: ${producer_kind} not found`;
            }

            const { id, appData, type, kind, rtpParameters } = producer;

            appData.mediaType = producer_type;

            this.producers.set(id, producer);

            producer.on('transportclose', () => {
                this.closeProducer(id);
            });

            return producer;
        } catch (error) {
            return error.message;
        }
    }

    closeProducer(producer_id) {
        if (!this.producers.has(producer_id)) return;

        const producer = this.getProducer(producer_id);
        const { id, kind, type, appData } = producer;

        try {
            producer.close();
        } catch (error) {
            //
        }

        this.delProducer(producer_id);
    }

    // ####################################################
    // CONSUMER
    // ####################################################
    getConsumers() {
        return JSON.parse(JSON.stringify([...this.consumers]));
    }

    getConsumer(consumer_id) {
        return this.consumers.get(consumer_id);
    }

    delConsumer(consumer_id) {
        this.consumers.delete(consumer_id);
    }

    async createConsumer(consumer_transport_id, producer_id, rtpCapabilities) {
        try {
            if (!consumer_transport_id) {
                return 'Invalid consumer transport ID';
            }

            const consumerTransport = this.transports.get(consumer_transport_id);

            if (!consumerTransport) {
                return `Consumer transport with id ${consumer_transport_id} not found`;
            }

            const consumer = await consumerTransport.consume({
                producerId: producer_id,
                rtpCapabilities,
                enableRtx: true, // Enable NACK for OPUS.
                paused: false,
            });

            if (!consumer) {
                return `Consumer for producer ID ${producer_id} not found`;
            }

            const { id, type, kind, rtpParameters, producerPaused } = consumer;

            this.consumers.set(id, consumer);

            if (['simulcast', 'svc'].includes(type)) {
                // simulcast - L1T3/L2T3/L3T3 | svc - L3T3
                const { scalabilityMode } = rtpParameters.encodings[0];
                const spatialLayer = parseInt(scalabilityMode.substring(1, 2)); // 1/2/3
                const temporalLayer = parseInt(scalabilityMode.substring(3, 4)); // 1/2/3
                try {
                    await consumer.setPreferredLayers({
                        spatialLayer: spatialLayer,
                        temporalLayer: temporalLayer,
                    });
                } catch (error) {
                    return `Error to set Consumer preferred layers: ${error.message}`;
                }
            } else {
                //
            }

            consumer.on('transportclose', () => {
                this.removeConsumer(id);
            });

            return {
                consumer: consumer,
                params: {
                    producerId: producer_id,
                    id: id,
                    kind: kind,
                    rtpParameters: rtpParameters,
                    type: type,
                    producerPaused: producerPaused,
                },
            };
        } catch (error) {
            return error.message;
        }
    }

    removeConsumer(consumer_id) {
        if (!this.consumers.has(consumer_id)) return;

        const consumer = this.getConsumer(consumer_id);
        const { id, kind, type } = consumer;

        try {
            consumer.close();
        } catch (error) {
            //
        }

        this.delConsumer(consumer_id);
    }
};
