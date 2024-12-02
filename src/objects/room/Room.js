export default class Room {
    static allRooms = {}

    constructor(data) {
        Object.assign(this, data)

        this.users = {}

        this.tables = {}
        this.waddles = {}
        
        Room.allRooms[data.id] = this
    }

    get userValues() {
        return Object.values(this.users)
    }

    get isFull() {
        return Object.keys(this.users).length >= this.maxUsers
    }

    add(user, isFederated=false) {
        if (!isFederated) {
            this.users[user.socket.id] = user
        }

        if (!isFederated && this.game) {
            return user.send('join_game_room', { game: this.id })
        }
        
        if (!isFederated) {
            user.send('join_room', { room: this.id, users: this.userValues })
        }
        this.send(user, 'add_player', { user: user })
    }

    remove(user, isFederated=false) {
        if (!this.game) {
            this.send(user, 'remove_player', { user: user.id })
        }

        if (this.matchmaker && this.matchmaker.includes(user)) {
            this.matchmaker.remove(user)
        }

        if (!isFederated) {
            delete this.users[user.socket.id]
        }
    }

    /**
     * Sends a packet to all users in the room, by default the client is excluded.
     *
     * @param {User} user - Client User object
     * @param {string} action - Packet name
     * @param {object} args - Packet arguments
     * @param {Array} filter - Users to exclude
     * @param {boolean} checkIgnore - Whether or not to exclude users who have user added to their ignore list
     */
    send(user, action, args = {}, filter = [user], checkIgnore = false) {
        let users = this.userValues.filter(u => !filter.includes(u))
        users = users.filter(u => u.id != user.id)

        for (let u of users) {
            if (checkIgnore && u.ignores.includes(user.id)) {
                continue
            }

            u.send(action, args)
        }
    }

}
