import BaseHandler from './BaseHandler'

import OpenIgloos from '@objects/room/OpenIgloos'
import Room from '@objects/room/Room'
import TableFactory from '@objects/room/table/TableFactory'

import data from '@data/data'


export default class GameHandler extends BaseHandler {

    constructor(id, users, db, config) {
        super(id, users, db, config)

        this.usersById = {}
        this.maxUsers = config.worlds[id].maxUsers

        this.openIgloos = new OpenIgloos()

        this.init()
    }

    async init() {
        this.crumbs = {
            items: await this.db.getItems(),
            igloos: await this.db.getIgloos(),
            furnitures: await this.db.getFurnitures(),
            floorings: await this.db.getFloorings()
        }

        this.rooms = await this.setRooms()
        await this.setTables()

        this.startPlugins('/game')

        this.updateWorldPopulation()
    }

    async setRooms() {
        let roomsData = await this.db.getRooms()
        let rooms = {}

        for (let room of roomsData) {
            rooms[room.id] = new Room(room)
        }

        return rooms
    }

    setTables() {
        for (let [id, table] of Object.entries(data.tables)) {
            let room = this.rooms[table.roomId]

            room.tables[id] = TableFactory.createTable(id, table, room)
        }
    }

    handleGuard(message, user) {
        return !user.authenticated && message.action != 'game_auth'
    }

    close(user) {
        if (!user) {
            return
        }

        if (!user.authenticated) {
            return this.closeAndUpdatePopulation(user)
        }

        if (user.room) {
            user.room.remove(user)
        }

        if (user.buddy) {
            user.buddy.sendOffline()
        }

        if (user.minigameRoom) {
            user.minigameRoom.remove(user)
        }

        if (user.data && user.data.id && user.data.id in this.usersById) {
            delete this.usersById[user.data.id]
        }

        if (user.data && user.data.id) {
            this.openIgloos.remove(user)
        }

        this.closeAndUpdatePopulation(user)
    }

    get population() {
        return Object.keys(this.users).length
    }

    closeAndUpdatePopulation(user) {
        super.close(user)

        this.updateWorldPopulation()
    }

    async updateWorldPopulation() {
        this.db.worlds.update({ population: this.population }, { where: { id: this.id }})
    }

}
