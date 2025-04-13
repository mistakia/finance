import secure_config from '@tsmx/secure-config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const current_file_path = fileURLToPath(import.meta.url)
const current_dir = dirname(current_file_path)
const config_dir = join(current_dir)

console.log({ config_dir })

const config = secure_config({ directory: config_dir })

export default config
