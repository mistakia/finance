import { fileURLToPath } from 'url'

export const isMain = () => process.argv[1] === fileURLToPath(import.meta.url)
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
