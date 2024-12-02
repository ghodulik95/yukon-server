import getSocketAddress from '@objects/user/getSocketAddress'
import UserFactory from '@objects/user/UserFactory'

import RateLimiterFlexible from 'rate-limiter-flexible'


export default class Server {

    constructor(id, users, db, handler, config) {
		this.id = id
        this.users = users
        this.db = db
        this.handler = handler
        this.config = config

        let io = this.createIo(config.socketio, {
            cors: {
                origin: config.cors.origin,
                methods: ['GET', 'POST']
            },
            path: '/'
        })

        if (config.rateLimit.enabled) {
            this.connectionLimiter = this.createLimiter(config.rateLimit.addressConnectsPerSecond)
            this.addressLimiter = this.createLimiter(config.rateLimit.addressEventsPerSecond)
            this.userLimiter = this.createLimiter(config.rateLimit.userEventsPerSecond)
        }

        this.server = io.listen(config.worlds[id].port)
        this.server.on('connection', this.onConnection.bind(this))
    }

    createLimiter(points, duration = 1) {
        return new RateLimiterFlexible.RateLimiterMemory({
            points: points,
            duration: duration
        })
    }

    createIo(config, options) {
        let server = (config.https)
            ? this.httpsServer(config.ssl)
            : this.httpServer()

        return require('socket.io')(server, options)
    }
    
    fedServer() {
        if (!this.config.federation.enabled) {
            console.error("Fed server setup called even though federation is not enabled.")
            return
        }
        
        const WebSocket = require('ws');

        const server = new WebSocket.Server({ port: this.config.federation.listen_to_port });

        server.on('connection', (ws) => {
            console.log('Client connected')
            ws.on('message', (message) => {
                const parsedMessage = JSON.parse(message)
                this.onFedMessage(parsedMessage.data)
            });
        });
    }

    httpServer() {
        return require('http').createServer()
    }

    httpsServer(ssl) {
        let fs = require('fs')
        let loaded = {}

        // Loads ssl files
        for (let key in ssl) {
            loaded[key] = fs.readFileSync(ssl[key]).toString()
        }

        return require('https').createServer(loaded)
    }

    onConnection(socket) {
        if (!this.config.rateLimit.enabled) {
            this.initUser(socket)
            return
        }

        let address = getSocketAddress(socket, this.config)

        this.connectionLimiter.consume(address)
            .then(() => {
                this.initUser(socket)
            })
            .catch(() => {
                socket.disconnect(true)
            })
    }

    initUser(socket) {
        let user = UserFactory(this, socket)

        this.users[socket.id] = user

        console.log(`[${this.id}] Connection from: ${socket.id} ${user.address}`)

        socket.on('message', (message) => this.onMessage(message, user))
        socket.on('disconnect', () => this.onDisconnect(user))
    }
    
    
    sendMessageToHttpServer(message) {
        const port = this.config.federation.emit_to_port
        const url = 'http://localhost:' + port
		fetch(url, {
    		method: 'POST', // Change to GET, PUT, DELETE as needed
    		headers: {
        		'Content-Type': 'application/json',
    		},
    		body: JSON.stringify(message),
		})
    	.then((response) => "Got response") // Parse JSON response
    	.then((data) => {
        	console.log('Successfully emitted federated event');
    	})
    	.catch((error) => {
        	console.error('Unable to emit federated event:', error);
    	});
	}

    onFedMessage(message) {
        this.handler.handle({action: message.action, args: message.args, isFederated: true}, message.user)
   }

    onMessage(message, user) {
        if (!this.config.rateLimit.enabled) {
            if (this.config.federation.enabled) {
                const serverMessages = ['login', 'token_login', 'join_server', 'game_auth', 'load_player', 'join_room']
                const supportedFedMessages = [
                    'join_room', 
                    'send_message', 
                    'send_safe', 
                    'send_emote', 
                    'snowball', 
                    'send_position',
                    'send_frame']
                
                const sendToServer = serverMessages.includes(message.action) || !supportedFedMessages.includes(message.action)
                const sendToFed = supportedFedMessages.includes(message.action)
                
                if (sendToServer) {
                    this.handler.handle(message, user)
                }
                if (sendToFed) {
                    this.sendMessageToHttpServer({ action: message.action, args: message.args, user: user.toJSON() })
                }
            } else {
                this.handler.handle(message, user)
            }
            return
        }

        this.addressLimiter.consume(user.address)
            .then(() => {

                let id = user.getId()

                this.userLimiter.consume(id)
                    .then(() => {
                        this.handler.handle(message, user)
                    })
                    .catch(() => {
                        // Blocked user
                    })

            })
            .catch(() => {
                // Blocked address
            })
    }

    onDisconnect(user) {
        console.log(`[${this.id}] Disconnect from: ${user.socket.id} ${user.address}`)
        this.handler.close(user)
    }

}
