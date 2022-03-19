import https from 'https'
import http from 'http'
import fs, { promises as fsPromise } from 'fs'
import url, { fileURLToPath } from 'url'
import path, { dirname } from 'path'

import { WebSocketServer } from 'ws'
import express from 'express'
import morgan from 'morgan-debug'
import extend from 'deep-extend'
import bodyParser from 'body-parser'
import jwt from 'jsonwebtoken'
import expressJwt from 'express-jwt'
import compression from 'compression'
import debug from 'debug'
import serveStatic from 'serve-static'
import cors from 'cors'
import favicon from 'express-favicon'
import robots from 'express-robots-txt'

import config from '../config.mjs'
import routes from './routes/index.mjs'
import cache from './cache.mjs'
import db from '../db/index.mjs'

// import './cron.mjs'
// import sockets from './sockets.mjs'

const logger = debug('api')
const defaults = {}
const options = extend(defaults, config)
const IS_DEV = process.env.NODE_ENV === 'development'
const IS_PROD = process.env.NODE_ENV === 'production'
const __dirname = dirname(fileURLToPath(import.meta.url))

if (IS_DEV) {
  debug.enable('server,api*,knex:*')
} else if (IS_PROD) {
  debug.enable('server,api*')
}

const api = express()

api.locals.db = db
api.locals.logger = logger
api.locals.cache = cache

api.enable('etag')
api.disable('x-powered-by')
api.use(compression())
api.use(morgan('api', 'combined'))
api.use(bodyParser.json())
api.use(
  cors({
    origin: true,
    credentials: true
  })
)

api.use(robots(path.join(__dirname, '..', 'resources', 'robots.txt')))
api.use(favicon(path.join(__dirname, '..', 'resources', 'favicon.ico')))
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, must-revalidate, proxy-revalidate')
  next()
})

const resourcesPath = path.join(__dirname, '..', 'resources')
api.use('/resources', serveStatic(resourcesPath))

api.use('/api/*', expressJwt(config.jwt), (err, req, res, next) => {
  res.set('Expires', '0')
  res.set('Pragma', 'no-cache')
  res.set('Surrogate-Control', 'no-store')
  if (err.code === 'invalid_token') return next()
  return next(err)
})

// unprotected api routes
// api.use('/api/node', routes.node)

// protected api routes
api.use('/api/*', (err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).send({ error: 'invalid token' })
  }
  next()
})

if (IS_DEV) {
  api.get('*', (req, res) => {
    res.redirect(307, `http://localhost:8081${req.path}`)
  })
} else {
  const buildPath = path.join(__dirname, '..', 'build')
  api.use('/', async (req, res, next) => {
    const filepath = req.url.replace(/\/$/, '')
    const filename = `${filepath}/index.html`
    const fullpath = path.join(buildPath, filename)
    try {
      const filestat = await fsPromise.stat(fullpath)
      if (filestat.isFile()) {
        return res.sendFile(fullpath, { cacheControl: false })
      }
      next()
    } catch (error) {
      logger(error)
      next()
    }
  })
  api.use('/', serveStatic(buildPath))
  api.get('*', (req, res) => {
    const notFoundPath = path.join(__dirname, '../', 'build', '404.html')
    res.sendFile(notFoundPath, { cacheControl: false })
  })

  // redirect to ipfs page
  // res.redirect(307, `${config.url}${req.path}`)
}

const createServer = () => {
  if (!options.ssl) {
    return http.createServer(api)
  }

  const sslOptions = {
    key: fs.readFileSync(config.key),
    cert: fs.readFileSync(config.cert)
  }
  return https.createServer(sslOptions, api)
}

const server = createServer()
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', async (request, socket, head) => {
  const parsed = new url.URL(request.url, config.url)
  try {
    const token = parsed.searchParams.get('token')
    const decoded = await jwt.verify(token, config.jwt.secret)
    request.user = decoded
  } catch (error) {
    logger(error)
    return socket.destroy()
  }

  wss.handleUpgrade(request, socket, head, function (ws) {
    ws.userId = request.user.userId
    wss.emit('connection', ws, request)
  })
})

// sockets(wss)

export default server
