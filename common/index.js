import { fileURLToPath } from 'url'

export const isMain = () => process.argv[1] === fileURLToPath(import.meta.url)
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const average = (array) => array.reduce((a, b) => a + b) / array.length
export const median = (arr) => {
  const middle = Math.floor(arr.length / 2)
  arr = [...arr].sort((a, b) => a - b)
  return arr.length % 2 !== 0
    ? arr[middle]
    : (arr[middle - 1] + arr[middle]) / 2
}
