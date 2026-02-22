import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const docker_exec = async (host, args) => {
  const env = { ...process.env, DOCKER_HOST: `ssh://${host}` }
  const { stdout } = await execFileAsync('docker', args, { env })
  return stdout
}

export const start_docker_container = async ({ host, port, id }) => {
  await docker_exec(host, ['start', id])
  return 204
}

export const stop_docker_container = async ({ host, port, id }) => {
  await docker_exec(host, ['stop', id])
  return 204
}

export const get_docker_containers = async ({ host, port }) => {
  const stdout = await docker_exec(host, [
    'ps',
    '-a',
    '--format',
    '{{json .}}'
  ])

  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const c = JSON.parse(line)
      return {
        Id: c.ID,
        Names: c.Names ? c.Names.split(',').map((n) => `/${n}`) : [],
        Image: c.Image,
        State: c.State.toLowerCase(),
        Status: c.Status
      }
    })
}
