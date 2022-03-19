import Knex from 'knex'
import config from '../config.mjs'

const mysql = Knex(config.mysql)

export default mysql
