import Knex from 'knex'
import config from '../config.js'

const mysql = Knex(config.mysql)

export default mysql
