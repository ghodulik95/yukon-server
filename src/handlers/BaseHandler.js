import PluginManager from '@plugin/PluginManager'

import EventEmitter from 'events'


export default class BaseHandler {

    constructor(id, users, db, config) {
        this.id = id
        this.users = users
        this.db = db
        this.config = config

        this.logging = true

        this.plugins

        this.events = new EventEmitter({ captureRejections: true })

        this.events.on('error', (error) => {
            this.error(error)
        })
    }

    startPlugins(pluginsDir = '') {
        this.plugins = new PluginManager(this, pluginsDir)
    }

    handle(message, user) {
        try {
            if (this.logging) {
                console.log(`[${this.id}] Received: ${message.action} ${JSON.stringify(message.args)}`)
            }

            if (this.handleGuard(message, user)) {
               // return user.close()
            }
            console.log("BaseHendler receiving message " + message.action + " " + user.username)
            
            if (message.isFederated) {
                this.events.emit(message.action, message.args, user)
                return
            }
            //console.log(message)
            //console.log(user)
            //console.log(user.toJSON())
            
            const serverMessages = ['login', 'join_server', 'game_auth', 'load_player']
            const sendToServer = serverMessages.includes(message.action)
            //console.log(message.action + " toServer: " + sendToServer)
			// If related to auth and joining server
            if (sendToServer || true) {
                this.events.emit(message.action, message.args, user)
                
                if (message.action === 'send_position') {
                    this.events.emit('send_message', {message: 'top secret'}, user)
                    user.events.emit('send_message', {message: 'top secret'}, user)
                }
                //console.log(message.action)
                //console.log(message.args)
                //console.log(user)
                //console.log(user.toJSON())
			// Else if related to joining room, moving, probably anythings else ?
			} else {
                // other messages are .. 
                // join_room, send_position, send_message
                this.sendMessageToHttpServer(message, user)
            }
			//console.log("USER:")
			//console.log(user?.toJSON())
			//console.log(":ENDUSER")
            if (user.events) {
                console.log("Also logging as user event")
                user.events.emit(message.action, message.args, user)
            }

        } catch(error) {
            this.error(error)
        }
    }

	sendMessageToHttpServer(message, user) {
		const payload = {
			message: message,
			user: user.toJSON()
		}
        console.log("Building Payload for server")
        console.log(payload)
        console.log(JSON.stringify(payload))

		fetch('http://127.0.0.1:3000/emit-federated', {
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

    handleGuard(message, user) {
        return false
    }

    close(user) {
        delete this.users[user.socket.id]
    }

    error(error) {
        console.error(`[${this.id}] ERROR: ${error.stack}`)
    }

}
