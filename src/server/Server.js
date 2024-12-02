import getSocketAddress from '@objects/user/getSocketAddress'
import UserFactory from '@objects/user/UserFactory'

import RateLimiterFlexible from 'rate-limiter-flexible'


export default class Server {
    static timesConstructed = 0

    constructor(id, users, db, handler, config) {
        Server.timesConstructed++
        //if (Server.instance) {
		//	return Server.instance;
		//}
		console.log("CONSTRUCTING SERVER");
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
        
        if (Server.timesConstructed > 1) {
            
            const WebSocket = require('ws');

            const server = new WebSocket.Server({ port: 3001 });

            server.on('connection', (ws) => {
                console.log('Client connected');
                ws.on('message', (message) => {
                    console.log('Received:', JSON.parse(message));
                    const parsedMessage = JSON.parse(message)
                    //ws.send('Echo: ' + message);
                    this.onFedMessage(parsedMessage.data)
                });
            });

            console.log('WebSocket server listening on ws://localhost:3001');

            /*
            let fedIO = this.createIo({
                https: false,
                cors: {
                    origin: '*',
                    methods: ['GET', 'POST']
                },
                path: '/federated',
                
                transports: ['websocket'] // Disable polling
            })
            this.fedServer = fedIO.listen(3001)
            this.fedServer.on('connection', (socket) => {
                console.log(`Client connected: ${socket.id}`);
                socket.on('message', (message) => this.onFedMessage(message))
            });
            //this.fedServer.on('message', (message) => this.onFedMessage(message))
            */
        }
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
		const payload = message
        console.log("Building Payload for server")
        //console.log(payload)
        //console.log(JSON.stringify(payload))

		fetch('http://localhost:3000/emit-federated', {
    		method: 'POST', // Change to GET, PUT, DELETE as needed
    		headers: {
        		'Content-Type': 'application/json',
    		},
    		body: JSON.stringify(payload),
		})
    	.then((response) => "Got response") // Parse JSON response
    	.then((data) => {
        	console.log('Payload sent successfully:', data);
    	})
    	.catch((error) => {
        	console.error('Error:', error);
    	});
	}

    onFedMessage(message) {
        console.log("Received Fed Message", message)
        this.handler.handle({action: message.action, args: message.args, isFederated: true}, message.user)
   }

    onMessage(message, user) {
        console.log("Message")
        if (!this.config.rateLimit.enabled) {
            
            console.log("NoRate")
            const serverMessages = ['login', 'token_login', 'join_server', 'game_auth', 'load_player']
            const sendToServer = serverMessages.includes(message.action)
            
            //debugger;
            console.log("USER")
            //console.log(user.toJSON())
            //console.log("DB")
            //console.log(user.db)
            //console.log("HANDLER")
            //console.log(user.handler)
            //console.log("ADAPTER")
            //console.log(user.adapter)
            if (sendToServer) {
                console.log("Sending nominal")
                this.handler.handle(message, user)
            } else {
                console.log("Sending federated")
                this.sendMessageToHttpServer({ action: message.action, args: message.args, user: user.toJSON() })
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
