import Plugin from '../Plugin'

import { hasProps, isNumber } from '../../utils/validation'


export default class Get extends Plugin {

    constructor(users, rooms) {
        super(users, rooms)

        this.events = {
            'get_player': this.getPlayer
        }
    }

    async getPlayer(args, user) {
        if (!hasProps(args, 'id')) {
            return
        }

        if (!isNumber(args.id)) {
            return
        }

        if (args.id in this.usersById) {
            return user.send('get_player', { penguin: this.usersById[args.id].string })
        }

        let userData = await this.db.getUserById(args.id)

        if (userData) {
            let { banned, coins, loginKey, password, rank, permaBan, ...penguin } = userData.dataValues

            user.send('get_player', { penguin: penguin })
        }
    }

}
